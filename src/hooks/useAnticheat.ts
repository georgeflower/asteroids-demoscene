/**
 * useAnticheat — manages game session tokens, heartbeats, PoW solving and HMAC signing.
 *
 * All functionality is gated behind HIGH_SCORES_ENABLED so nothing runs in
 * the default (disabled) configuration.
 */
import { useRef, useCallback } from "react";
import type { MutableRefObject } from "react";
import { HIGH_SCORES_ENABLED } from "@/constants/gameConstants";

type GameStateRef = MutableRefObject<{ score: number; wave: number; gameOver: boolean } | null>;

export function useAnticheat(
  gameStateRef: GameStateRef,
  isPausedRef: MutableRefObject<boolean>,
) {
  const gameSessionTokenRef = useRef<string | null>(null);
  const sessionNonceRef = useRef<string | null>(null);
  const gameStatsRef = useRef({ asteroidsDestroyed: 0, bulletsFired: 0 });
  const heartbeatSeqRef = useRef(0);
  const powSolutionRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const solvePoW = useCallback((challenge: string, difficulty: number): Promise<number> => {
    if (HIGH_SCORES_ENABLED && typeof Worker !== "undefined") {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("../workers/powWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (e: MessageEvent<{ nonce: number }>) => {
          resolve(e.data.nonce);
          worker.terminate();
        };
        worker.onerror = (err) => {
          reject(err);
          worker.terminate();
        };
        worker.postMessage({ challenge, difficulty });
      });
    }
    return (async () => {
      let nonce = 0;
      while (true) {
        const data = new TextEncoder().encode(challenge + nonce.toString());
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = new Uint8Array(hashBuffer);
        let zeroBits = 0;
        let found = false;
        for (const byte of hashArray) {
          if (byte === 0) {
            zeroBits += 8;
          } else {
            for (let bit = 7; bit >= 0; bit--) {
              if ((byte & (1 << bit)) === 0) zeroBits++;
              else { found = true; break; }
            }
          }
          if (found || zeroBits >= difficulty) break;
        }
        if (zeroBits >= difficulty) return nonce;
        nonce++;
        if (nonce % 1000 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    })();
  }, []);

  const computeHMAC = useCallback(async (key: string, message: string): Promise<string> => {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }, []);

  const startGameSession = useCallback(async () => {
    if (!HIGH_SCORES_ENABLED) return null;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit/start-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        },
      );
      if (!response.ok) {
        console.error("Failed to start game session");
        return null;
      }
      const data = await response.json();
      gameSessionTokenRef.current = data.sessionToken;
      sessionNonceRef.current = data.sessionNonce || null;
      gameStatsRef.current = { asteroidsDestroyed: 0, bulletsFired: 0 };
      heartbeatSeqRef.current = 0;
      powSolutionRef.current = null;
      if (data.challenge && data.difficulty) {
        solvePoW(data.challenge, data.difficulty).then((nonce) => {
          powSolutionRef.current = nonce;
        });
      }
      return data.sessionToken as string;
    } catch (error) {
      console.error("Error starting game session:", error);
      return null;
    }
  }, [solvePoW]);

  const sendHeartbeat = useCallback(async () => {
    if (!HIGH_SCORES_ENABLED) return;
    const token = gameSessionTokenRef.current;
    const state = gameStateRef.current;
    if (!token || !state || state.gameOver || isPausedRef.current) return;
    try {
      const score = state.score;
      const level = state.wave;
      const { asteroidsDestroyed, bulletsFired } = gameStatsRef.current;
      heartbeatSeqRef.current += 1;
      const seq = heartbeatSeqRef.current;
      let hmac: string | undefined;
      if (sessionNonceRef.current) {
        hmac = await computeHMAC(
          sessionNonceRef.current,
          `${token}|${score}|${level}|${asteroidsDestroyed}|${bulletsFired}|${seq}`,
        );
      }
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ gameSessionToken: token, score, level, asteroidsDestroyed, bulletsFired, hmac, seq }),
      });
    } catch (_) {
      // Non-blocking: heartbeat failure doesn't affect gameplay
    }
  }, [computeHMAC, gameStateRef, isPausedRef]);

  const startHeartbeatInterval = useCallback(() => {
    if (!HIGH_SCORES_ENABLED) return;
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);
  }, [sendHeartbeat]);

  const stopHeartbeatInterval = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  return {
    gameSessionTokenRef,
    sessionNonceRef,
    gameStatsRef,
    heartbeatSeqRef,
    powSolutionRef,
    heartbeatIntervalRef,
    startGameSession,
    sendHeartbeat,
    startHeartbeatInterval,
    stopHeartbeatInterval,
    solvePoW,
    computeHMAC,
  };
}
