import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InputState, DuelNetState, CoopNetState, SessionMode, ChatMessage } from "@/types/multiplayer";

interface PresenceInfo {
  role: "host" | "guest";
  playerIdx?: number;
  initials?: string;
  gameInProgress?: boolean;
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
  const gameInProgressRef = useRef(false);
  // Ref-copy of guestCount for event-handler access without stale closures
  const guestCountRef = useRef(0);
  // Callback invoked when the host adds waiting players mid-game
  const onPlayersAddedRef = useRef<((newPlayerCount: number) => void) | null>(null);

  // Direct state callbacks – called immediately on message receipt, bypassing the
  // 16 ms setInterval polling that was the main source of guest-side lag.
  const onRemoteStateRef = useRef<((state: DuelNetState) => void) | null>(null);
  const onRemoteCoopStateRef = useRef<((state: CoopNetState) => void) | null>(null);

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
        }
        // Recount guests in presence state
        const state = channel.presenceState() as PresenceState;
        const allGuests = Object.values(state).flat().filter((p: PresenceInfo) => p.role === "guest");
        guestCountRef.current = allGuests.length;
        setGuestCount(allGuests.length);
        rebuildInitialsMap(channel);
      })
      .on("presence", { event: "leave" }, ({ leftPresences: _leftPresences }) => {
        const state = channel.presenceState() as PresenceState;
        const allGuests = Object.values(state).flat().filter((p: PresenceInfo) => p.role === "guest");
        guestCountRef.current = allGuests.length;
        setGuestCount(allGuests.length);
        if (allGuests.length === 0) {
          setOpponentConnected(false);
        }
        rebuildInitialsMap(channel);
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role: "host", playerIdx: 0, initials: localInitialsRef.current });
          setIsConnected(true);
          rebuildInitialsMap(channel);
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Determine player index: use max(existingGuestIdx)+1 to avoid collisions
          // when guests leave and indices become non-contiguous
          const state = channel.presenceState() as PresenceState;
          const allPresent = Object.values(state).flat();
          const existingGuests = allPresent.filter((p: PresenceInfo) => p.role === "guest");
          const maxGuestIdx = existingGuests.reduce((max, p) => {
            return typeof p.playerIdx === "number" && p.playerIdx > max ? p.playerIdx : max;
          }, 0);
          const assignedIdx = maxGuestIdx + 1; // host=0, guests start at 1
          if (assignedIdx > 7) {
            console.warn("[coop] Room is full (max 8 players); cannot join.");
            return;
          }
          playerIdxRef.current = assignedIdx;
          await channel.track({ role: "guest", playerIdx: assignedIdx, initials: localInitialsRef.current });
          setIsConnected(true);
          rebuildInitialsMap(channel);
          // Check if host is already present and whether game is in progress
          const allPresent2 = Object.values(state).flat() as PresenceInfo[];
          for (const p of allPresent2) {
            if (p.role === "host") {
              setOpponentConnected(true);
              if (p.gameInProgress) {
                setGameInProgressState(true);
                gameInProgressRef.current = true;
              }
              break;
            }
          }
          // guestCount = number of guest presences; join event for self will update it after track
          guestCountRef.current = existingGuests.length;
          setGuestCount(existingGuests.length);
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
  const sendGameRestart = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    const playerCount = 1 + guestCountRef.current;
    channel.send({
      type: "broadcast",
      event: "game_restart",
      payload: { playerCount },
    }).catch(() => {});
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
    setGuestCount(0);
    guestCountRef.current = 0;
    setPlayerInitialsMap(new Map());
    setChatMessages([]);
    chatHistoryRef.current = [];
    setGameInProgressState(false);
    gameInProgressRef.current = false;
    localInitialsRef.current = "";
    setHostDisconnected(false);
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
    hostDisconnected,
    createRoom,
    joinRoom,
    sendState,
    sendCoopState,
    sendInputs,
    startGame,
    sendChatMessage,
    sendGameRestart,
    disconnect,
    setLocalInitials,
    setGameInProgress,
    sendPlayersAdded,
    getWaitingPlayerCount,
  };
}
