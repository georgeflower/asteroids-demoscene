import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InputState, DuelNetState, CoopNetState, SessionMode, ChatMessage } from "@/types/multiplayer";

interface PresenceInfo {
  role: "host" | "guest";
  playerIdx?: number;
  initials?: string;
  gameInProgress?: boolean;
  clientId?: string;
}

interface PresenceState {
  [key: string]: PresenceInfo[];
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** How often (ms) the host broadcasts a ping to measure guest latency. */
const PING_INTERVAL_MS = 3000;

export function useMultiplayer() {
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [gameInProgress, setGameInProgressState] = useState(false);
  // Map from playerIdx → initials for all players in the room
  const [playerInitialsMap, setPlayerInitialsMap] = useState<Map<number, string>>(new Map());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const remoteStateRef = useRef<DuelNetState | null>(null);
  const remoteCoopStateRef = useRef<CoopNetState | null>(null);
  const remoteInputRef = useRef<InputState>({ left: false, right: false, up: false, fire: false });
  // Map from playerIdx to latest InputState (for N-player coop)
  const remoteInputsRef = useRef<Map<number, InputState>>(new Map());
  const onGameStartRef = useRef<((mode: SessionMode, playerCount?: number) => void) | null>(null);
  // Callback invoked when host broadcasts a game restart
  const onGameRestartRef = useRef<((playerCount?: number, deadline?: number) => void) | null>(null);
  // Own player index assigned when joining (0 = host, 1+ = guests)
  const playerIdxRef = useRef<number>(0);
  // Local player's initials
  const localInitialsRef = useRef<string>("");
  // Ref-copy of chatMessages so presence handlers always see latest history
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  // Ref-copy of gameInProgress for async/event-handler access
  const [pingMap, setPingMap] = useState<Map<number, number>>(new Map());
  const pingMapRef = useRef<Map<number, number>>(new Map());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Host: tracks clientId → assigned playerIdx for host-authoritative index assignment
  const assignedIndicesRef = useRef<Map<string, number>>(new Map());
  // Guest: unique session clientId used to receive the host-assigned playerIdx
  const clientIdRef = useRef<string>("");
  const gameInProgressRef = useRef(false);
  // Ref-copy of guestCount for event-handler access without stale closures
  const guestCountRef = useRef(0);
  // Callback invoked when the host adds waiting players mid-game
  const onPlayersAddedRef = useRef<((newPlayerCount: number) => void) | null>(null);

  // Direct state callbacks – called immediately on message receipt, bypassing the
  // 16 ms setInterval polling that was the main source of guest-side lag.
  const onRemoteStateRef = useRef<((state: DuelNetState) => void) | null>(null);
  const onRemoteCoopStateRef = useRef<((state: CoopNetState) => void) | null>(null);
  // Callback invoked on host when a guest signals they are ready to restart
  const onPlayerReadyRef = useRef<((playerIdx: number) => void) | null>(null);
  // Callback invoked on the host when a guest leaves the room
  const onPlayerLeaveRef = useRef<((playerIdx: number) => void) | null>(null);
  // Callback invoked on the host when a new guest joins the channel
  const onGuestJoinedRef = useRef<(() => void) | null>(null);

  /** Rebuild the playerIdx→initials map from the current presence state */
  const rebuildInitialsMap = useCallback((channel: ReturnType<typeof supabase.channel>) => {
    const state = channel.presenceState() as PresenceState;
    const map = new Map<number, string>();
    for (const presences of Object.values(state)) {
      for (const p of presences) {
        if (p.playerIdx != null && p.initials) {
          map.set(p.playerIdx, p.initials);
        }
      }
    }
    setPlayerInitialsMap(new Map(map));
  }, []);

  const createRoom = useCallback(() => {
    const code = generateRoomCode();
    setRoomCode(code);
    setIsHost(true);
    playerIdxRef.current = 0;

    const channel = supabase.channel(`game-${code}`, {
      // ack: false skips the server acknowledgement round-trip → lower latency
      config: { broadcast: { self: false, ack: false } },
    });

    channel
      .on("presence", { event: "join" }, ({ newPresences }) => {
        const guests = newPresences.filter((p: any) => p.role === "guest");
        if (guests.length > 0) {
          setOpponentConnected(true);
          // Send current chat history to all (new joiners will merge and deduplicate)
          if (chatHistoryRef.current.length > 0 && channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "chat_history",
              payload: { messages: chatHistoryRef.current },
            }).catch(() => {});
          }
          // Notify game that a new guest joined (so it can re-broadcast pending restart state)
          onGuestJoinedRef.current?.();
        }
        // Recount guests in presence state
        const state = channel.presenceState() as PresenceState;
        const allGuests = Object.values(state).flat().filter((p: PresenceInfo) => p.role === "guest");
        guestCountRef.current = allGuests.length;
        setGuestCount(allGuests.length);
        rebuildInitialsMap(channel);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        const state = channel.presenceState() as PresenceState;
        const allGuests = Object.values(state).flat().filter((p: PresenceInfo) => p.role === "guest");
        guestCountRef.current = allGuests.length;
        setGuestCount(allGuests.length);
        if (allGuests.length === 0) {
          setOpponentConnected(false);
        }
        rebuildInitialsMap(channel);
        // Notify the game about which guest indices left (so it can adjust ready tracking)
        // and clean up host-side assignment tracking
        for (const p of leftPresences as PresenceInfo[]) {
          if (p.role === "guest") {
            if (p.clientId) {
              assignedIndicesRef.current.delete(p.clientId);
            }
            if (typeof p.playerIdx === "number") {
              onPlayerLeaveRef.current?.(p.playerIdx);
            }
          }
        }
      })
      .on("broadcast", { event: "player_input" }, ({ payload }) => {
        const { playerIdx, ...inp } = payload as InputState & { playerIdx?: number };
        if (playerIdx != null) {
          remoteInputsRef.current.set(playerIdx, inp as InputState);
        } else {
          // Legacy: treat as P2
          remoteInputRef.current = inp as InputState;
          remoteInputsRef.current.set(1, inp as InputState);
        }
      })
      .on("broadcast", { event: "chat_message" }, ({ payload }) => {
        const msg = payload as ChatMessage;
        setChatMessages((prev) => {
          const next = [...prev, msg];
          chatHistoryRef.current = next;
          return next;
        });
      })
      .on("broadcast", { event: "player_ready" }, ({ payload }) => {
        const { playerIdx } = (payload ?? {}) as { playerIdx?: number };
        if (typeof playerIdx === "number") {
          onPlayerReadyRef.current?.(playerIdx);
        }
      })
      // Host-authoritative player index assignment: guest sends request, host assigns
      .on("broadcast", { event: "request_index" }, ({ payload }) => {
        const { clientId } = payload as { clientId?: string };
        if (!clientId) return;
        // Idempotent: ignore if already assigned
        if (assignedIndicesRef.current.has(clientId)) return;
        // Find the next free playerIdx (host is always 0)
        const takenIndices = new Set([0, ...assignedIndicesRef.current.values()]);
        let nextIdx = 1;
        while (takenIndices.has(nextIdx)) nextIdx++;
        if (nextIdx > 7) {
          console.warn("[coop] Room is full (max 8 players); ignoring join request.");
          return;
        }
        assignedIndicesRef.current.set(clientId, nextIdx);
        channel.send({
          type: "broadcast",
          event: "assign_index",
          payload: { clientId, playerIdx: nextIdx },
        }).catch(() => {});
      })
      // Host: receive pong from guest, measure RTT and broadcast ping_update to all
      .on("broadcast", { event: "pong" }, ({ payload }) => {
        const { ts, playerIdx } = payload as { ts?: number; playerIdx?: number };
        if (typeof ts !== "number" || typeof playerIdx !== "number") return;
        const rtt = Date.now() - ts;
        const next = new Map(pingMapRef.current);
        next.set(playerIdx, rtt);
        pingMapRef.current = next;
        setPingMap(new Map(next));
        channel.send({
          type: "broadcast",
          event: "ping_update",
          payload: { pings: Object.fromEntries(next) },
        }).catch(() => {});
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role: "host", playerIdx: 0, initials: localInitialsRef.current });
          setIsConnected(true);
          rebuildInitialsMap(channel);
          // Host latency is always 0 (local)
          const initialPings = new Map<number, number>([[0, 0]]);
          pingMapRef.current = initialPings;
          setPingMap(new Map(initialPings));
          // Periodically broadcast ping so guests can measure RTT.
          // Also reconcile assignedIndicesRef against presence state to release
          // slots for guests that requested an index but disconnected before tracking.
          pingIntervalRef.current = setInterval(() => {
            // Reconcile: remove entries whose clientId is no longer in presence state
            const currentState = channel.presenceState() as PresenceState;
            const trackedClientIds = new Set(
              Object.values(currentState)
                .flat()
                .map((p: PresenceInfo) => p.clientId)
                .filter(Boolean),
            );
            for (const clientId of assignedIndicesRef.current.keys()) {
              if (!trackedClientIds.has(clientId)) {
                assignedIndicesRef.current.delete(clientId);
              }
            }
            channel.send({
              type: "broadcast",
              event: "ping",
              payload: { ts: Date.now() },
            }).catch(() => {});
          }, PING_INTERVAL_MS);
        }
      });

    channelRef.current = channel;
    return code;
  }, [rebuildInitialsMap]);

  const joinRoom = useCallback((code: string) => {
    setRoomCode(code.toUpperCase());
    setIsHost(false);

    const channel = supabase.channel(`game-${code.toUpperCase()}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel
      .on("presence", { event: "join" }, ({ newPresences }) => {
        if (newPresences.some((p: any) => p.role === "host")) {
          setOpponentConnected(true);
          setHostDisconnected(false);
          // If the host's presence shows game is in progress, update state so the
          // spectator transition effect in Game.tsx fires (handles re-track timing).
          const hostPresence = newPresences.find((p: any) => p.role === "host");
          if (hostPresence?.gameInProgress && !gameInProgressRef.current) {
            setGameInProgressState(true);
            gameInProgressRef.current = true;
          }
        }
        const state = channel.presenceState() as PresenceState;
        const allGuests = Object.values(state).flat().filter((p: PresenceInfo) => p.role === "guest");
        guestCountRef.current = allGuests.length;
        setGuestCount(allGuests.length);
        rebuildInitialsMap(channel);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        if (leftPresences.some((p: any) => p.role === "host")) {
          // Check if host is still present (re-track causes a leave+join pair)
          const currentState = channel.presenceState() as PresenceState;
          const hostStillPresent = Object.values(currentState)
            .flat()
            .some((p: PresenceInfo) => p.role === "host");
          if (!hostStillPresent) {
            setOpponentConnected(false);
            setHostDisconnected(true);
          }
        }
        const state = channel.presenceState() as PresenceState;
        const allGuests = Object.values(state).flat().filter((p: PresenceInfo) => p.role === "guest");
        guestCountRef.current = allGuests.length;
        setGuestCount(allGuests.length);
        rebuildInitialsMap(channel);
      })
      .on("broadcast", { event: "game_state" }, ({ payload }) => {
        // Invoke direct callback if registered (zero-polling path); fall back to ref.
        if (onRemoteStateRef.current) {
          onRemoteStateRef.current(payload as DuelNetState);
        } else {
          remoteStateRef.current = payload as DuelNetState;
        }
      })
      .on("broadcast", { event: "coop_state" }, ({ payload }) => {
        if (onRemoteCoopStateRef.current) {
          onRemoteCoopStateRef.current(payload as CoopNetState);
        } else {
          remoteCoopStateRef.current = payload as CoopNetState;
        }
      })
      .on("broadcast", { event: "game_start" }, ({ payload }) => {
        const raw = payload as { mode?: string; playerCount?: number } | null;
        const mode: SessionMode = (raw?.mode === "coop" || raw?.mode === "duel") ? raw.mode : "duel";
        const pc = raw?.playerCount ?? 2;
        onGameStartRef.current?.(mode, pc);
      })
      .on("broadcast", { event: "chat_message" }, ({ payload }) => {
        const msg = payload as ChatMessage;
        setChatMessages((prev) => {
          const next = [...prev, msg];
          chatHistoryRef.current = next;
          return next;
        });
      })
      .on("broadcast", { event: "chat_history" }, ({ payload }) => {
        // Merge incoming history with existing messages, deduplicating by id
        const { messages } = payload as { messages: ChatMessage[] };
        if (!messages?.length) return;
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = messages.filter((m) => !existingIds.has(m.id));
          if (newMsgs.length === 0) return prev;
          const merged = [...newMsgs, ...prev].sort((a, b) => a.timestamp - b.timestamp);
          chatHistoryRef.current = merged;
          return merged;
        });
      })
      .on("broadcast", { event: "players_added" }, ({ payload }) => {
        const { newPlayerCount } = payload as { newPlayerCount: number };
        onPlayersAddedRef.current?.(newPlayerCount);
      })
      .on("broadcast", { event: "game_restart" }, ({ payload }) => {
        const { playerCount, deadline } = (payload ?? {}) as { playerCount?: number; deadline?: number };
        onGameRestartRef.current?.(playerCount, deadline);
      })
      // Host-authoritative index: receive assigned playerIdx and start tracking with it
      .on("broadcast", { event: "assign_index" }, async ({ payload }) => {
        const { clientId, playerIdx } = payload as { clientId?: string; playerIdx?: number };
        if (typeof playerIdx !== "number" || clientId !== clientIdRef.current) return;
        playerIdxRef.current = playerIdx;
        try {
          await channel.track({
            role: "guest",
            playerIdx,
            initials: localInitialsRef.current,
            clientId,
          });
          rebuildInitialsMap(channel);
        } catch (error) {
          console.error("[coop] Failed to track guest presence after index assignment", error);
        }
      })
      // Guest: reply to host ping with a pong (enables RTT measurement).
      // Only reply once a valid guest index has been assigned (playerIdx > 0) to avoid
      // pongs being attributed to player 0 (host) before assign_index arrives.
      .on("broadcast", { event: "ping" }, ({ payload }) => {
        const { ts } = payload as { ts?: number };
        if (typeof ts !== "number" || playerIdxRef.current === 0) return;
        channelRef.current?.send({
          type: "broadcast",
          event: "pong",
          payload: { ts, playerIdx: playerIdxRef.current },
        }).catch(() => {});
      })
      // Guest: receive updated ping values from host
      .on("broadcast", { event: "ping_update" }, ({ payload }) => {
        const { pings } = payload as { pings?: Record<string, number> };
        if (!pings) return;
        const next = new Map<number, number>();
        for (const [k, v] of Object.entries(pings)) {
          next.set(Number(k), v);
        }
        pingMapRef.current = next;
        setPingMap(new Map(next));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Generate a unique clientId and request host-authoritative player index assignment.
          // This avoids the race condition where two guests compute the same playerIdx from
          // stale presence state.
          clientIdRef.current = crypto.randomUUID();
          const myClientId = clientIdRef.current;

          // Send request_index with up to 3 attempts and backoff so transient failures
          // don't silently leave the guest without a playerIdx.
          const MAX_ATTEMPTS = 3;
          const SEND_TIMEOUT_MS = 5000;
          let sent = false;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS && !sent; attempt++) {
            try {
              let timeoutId: ReturnType<typeof setTimeout>;
              const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("request_index timed out")), SEND_TIMEOUT_MS);
              });
              const sendPromise = channel.send({
                type: "broadcast",
                event: "request_index",
                payload: { clientId: myClientId, initials: localInitialsRef.current },
              });
              await Promise.race([sendPromise, timeoutPromise]);
              clearTimeout(timeoutId!);
              sent = true;
            } catch (err) {
              if (attempt >= MAX_ATTEMPTS) {
                console.error("[coop] Failed to send request_index after retries; disconnecting.", err);
                try { await channel.unsubscribe(); } catch (unsubErr) {
                  console.error("[coop] Failed to unsubscribe after request_index failure.", unsubErr);
                }
                setIsConnected(false);
                return;
              }
              await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
            }
          }

          setIsConnected(true);
          // Check if host is already present and whether game is in progress
          const state = channel.presenceState() as PresenceState;
          const allPresent = Object.values(state).flat() as PresenceInfo[];
          for (const p of allPresent) {
            if (p.role === "host") {
              setOpponentConnected(true);
              if (p.gameInProgress) {
                setGameInProgressState(true);
                gameInProgressRef.current = true;
              }
              break;
            }
          }
          const existingGuests = allPresent.filter((p: PresenceInfo) => p.role === "guest");
          guestCountRef.current = existingGuests.length;
          setGuestCount(existingGuests.length);

          // Detect if assign_index never arrives (e.g. host didn't receive request_index).
          // If we are still untracked after the timeout, log a warning.
          const ASSIGN_INDEX_TIMEOUT_MS = 10000;
          setTimeout(() => {
            try {
              const currentState = channel.presenceState() as PresenceState;
              const allPresences = Object.values(currentState).flat() as PresenceInfo[];
              const selfPresent = allPresences.some(
                (p) => p.role === "guest" && p.clientId === myClientId,
              );
              if (!selfPresent && channelRef.current === channel) {
                console.warn("[coop] Timed out waiting for assign_index; guest may be invisible. Try rejoining.");
              }
            } catch { /* ignore */ }
          }, ASSIGN_INDEX_TIMEOUT_MS);
        }
      });

    channelRef.current = channel;
  }, [rebuildInitialsMap]);

  const sendState = useCallback((state: DuelNetState) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "game_state",
      payload: state,
    });
  }, []);

  const sendCoopState = useCallback((state: CoopNetState) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "coop_state",
      payload: state,
    });
  }, []);

  const sendInputs = useCallback((inputs: InputState, playerIdx?: number) => {
    const idx = playerIdx ?? playerIdxRef.current;
    channelRef.current?.send({
      type: "broadcast",
      event: "player_input",
      payload: { ...inputs, playerIdx: idx },
    });
  }, []);

  const startGame = useCallback((mode: SessionMode = "duel", playerCount = 2) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "game_start",
      payload: { mode, playerCount },
    });
  }, []);

  const MAX_CHAT_MESSAGE_LENGTH = 200;
  const CHAT_RATE_LIMIT_MS = 500;
  const lastChatSentRef = useRef<number>(0);
  const chatMsgCounterRef = useRef<number>(0);

  const sendChatMessage = useCallback((text: string) => {
    const trimmed = text.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!trimmed || !channelRef.current) return;
    const now = Date.now();
    if (now - lastChatSentRef.current < CHAT_RATE_LIMIT_MS) return;
    lastChatSentRef.current = now;
    const msg: ChatMessage = {
      id: `${now}-${++chatMsgCounterRef.current}`,
      sender: localInitialsRef.current || "???",
      text: trimmed,
      timestamp: now,
    };
    // Add to own messages immediately (channel has self: false)
    setChatMessages((prev) => {
      const next = [...prev, msg];
      chatHistoryRef.current = next;
      return next;
    });
    channelRef.current.send({
      type: "broadcast",
      event: "chat_message",
      payload: msg,
    }).catch((err: unknown) => {
      console.warn("[chat] Failed to send message:", err);
    });
  }, []);

  /** Host: broadcast a game restart event to all guests */
  const sendGameRestart = useCallback((deadline?: number) => {
    const channel = channelRef.current;
    if (!channel) return;
    const playerCount = 1 + guestCountRef.current;
    channel.send({
      type: "broadcast",
      event: "game_restart",
      payload: { playerCount, deadline },
    }).catch(() => {});
  }, []);

  /** Guest: signal to host that this player is ready to start after a restart */
  const sendPlayerReady = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "player_ready",
      payload: { playerIdx: playerIdxRef.current },
    }).catch(() => {});
  }, []);

  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
    setOpponentConnected(false);
    setRoomCode("");
    setIsHost(false);
    setGuestCount(0);
    guestCountRef.current = 0;
    setPlayerInitialsMap(new Map());
    setChatMessages([]);
    chatHistoryRef.current = [];
    setGameInProgressState(false);
    gameInProgressRef.current = false;
    localInitialsRef.current = "";
    setHostDisconnected(false);
    pingMapRef.current = new Map();
    setPingMap(new Map());
    assignedIndicesRef.current = new Map();
    clientIdRef.current = "";
  }, []);

  /** Call this before createRoom/joinRoom to set the player's own initials */
  const setLocalInitials = useCallback((initials: string) => {
    localInitialsRef.current = initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  }, []);

  /** Host: mark game as in-progress (reflected in presence so late joiners can detect it) */
  const setGameInProgress = useCallback((inProgress: boolean) => {
    gameInProgressRef.current = inProgress;
    setGameInProgressState(inProgress);
    channelRef.current?.track({
      role: "host",
      playerIdx: 0,
      initials: localInitialsRef.current,
      gameInProgress: inProgress,
    });
  }, []);

  /** Host: broadcast that new players have been added mid-game */
  const sendPlayersAdded = useCallback((newPlayerCount: number) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "players_added",
      payload: { newPlayerCount },
    }).catch(() => {});
  }, []);

  /**
   * Host: count guests whose playerIdx is >= currentPlayerCount.
   * These are "waiting" players who joined after the game started.
   */
  const getWaitingPlayerCount = useCallback((currentPlayerCount: number): number => {
    if (!channelRef.current) return 0;
    const state = channelRef.current.presenceState() as PresenceState;
    const allPresences = Object.values(state).flat() as PresenceInfo[];
    return allPresences.filter(
      (p) => p.role === "guest" && typeof p.playerIdx === "number" && p.playerIdx >= currentPlayerCount
    ).length;
  }, []);

  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  return {
    roomCode,
    isHost,
    isConnected,
    opponentConnected,
    guestCount,
    guestCountRef,
    gameInProgress,
    playerInitialsMap,
    pingMap,
    chatMessages,
    localInitialsRef,
    remoteStateRef,
    remoteCoopStateRef,
    remoteInputRef,
    remoteInputsRef,
    playerIdxRef,
    onGameStartRef,
    onGameRestartRef,
    onRemoteStateRef,
    onRemoteCoopStateRef,
    onPlayersAddedRef,
    onPlayerReadyRef,
    onPlayerLeaveRef,
    onGuestJoinedRef,
    hostDisconnected,
    createRoom,
    joinRoom,
    sendState,
    sendCoopState,
    sendInputs,
    startGame,
    sendChatMessage,
    sendGameRestart,
    sendPlayerReady,
    disconnect,
    setLocalInitials,
    setGameInProgress,
    sendPlayersAdded,
    getWaitingPlayerCount,
  };
}
