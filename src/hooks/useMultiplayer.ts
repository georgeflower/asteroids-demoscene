import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InputState, DuelNetState } from "@/types/multiplayer";

interface PresenceInfo {
  role: "host" | "guest";
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

export function useMultiplayer() {
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const remoteStateRef = useRef<DuelNetState | null>(null);
  const remoteInputRef = useRef<InputState>({ left: false, right: false, up: false, fire: false });
  const onGameStartRef = useRef<(() => void) | null>(null);

  const createRoom = useCallback(() => {
    const code = generateRoomCode();
    setRoomCode(code);
    setIsHost(true);

    const channel = supabase.channel(`game-${code}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("presence", { event: "join" }, ({ newPresences }) => {
        if (newPresences.some((p: any) => p.role === "guest")) {
          setOpponentConnected(true);
        }
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        if (leftPresences.some((p: any) => p.role === "guest")) {
          setOpponentConnected(false);
        }
      })
      .on("broadcast", { event: "player_input" }, ({ payload }) => {
        remoteInputRef.current = payload as InputState;
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role: "host" });
          setIsConnected(true);
        }
      });

    channelRef.current = channel;
    return code;
  }, []);

  const joinRoom = useCallback((code: string) => {
    setRoomCode(code.toUpperCase());
    setIsHost(false);

    const channel = supabase.channel(`game-${code.toUpperCase()}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("presence", { event: "join" }, ({ newPresences }) => {
        if (newPresences.some((p: PresenceInfo) => p.role === "host")) {
          setOpponentConnected(true);
        }
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        if (leftPresences.some((p: PresenceInfo) => p.role === "host")) {
          setOpponentConnected(false);
        }
      })
      .on("broadcast", { event: "game_state" }, ({ payload }) => {
        remoteStateRef.current = payload as DuelNetState;
      })
      .on("broadcast", { event: "game_start" }, () => {
        onGameStartRef.current?.();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role: "guest" });
          setIsConnected(true);
          // Check if host is already present
          const state = channel.presenceState() as PresenceState;
          const keys = Object.keys(state);
          for (const key of keys) {
            if (state[key]?.some?.((p: PresenceInfo) => p.role === "host")) {
              setOpponentConnected(true);
              break;
            }
          }
        }
      });

    channelRef.current = channel;
  }, []);

  const sendState = useCallback((state: DuelNetState) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "game_state",
      payload: state,
    });
  }, []);

  const sendInputs = useCallback((inputs: InputState) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "player_input",
      payload: inputs,
    });
  }, []);

  const startGame = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "game_start",
      payload: {},
    });
  }, []);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
    setOpponentConnected(false);
    setRoomCode("");
    setIsHost(false);
  }, []);

  useEffect(() => {
    return () => {
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
    remoteStateRef,
    remoteInputRef,
    onGameStartRef,
    createRoom,
    joinRoom,
    sendState,
    sendInputs,
    startGame,
    disconnect,
  };
}
