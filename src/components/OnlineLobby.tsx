import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { SessionMode, ChatMessage } from "@/types/multiplayer";
import LobbyChat from "@/components/LobbyChat";

interface OnlineLobbyProps {
  onCreateRoom: () => string;
  onJoinRoom: (code: string) => void;
  onBack: () => void;
  onStartGame: (mode: SessionMode, playerCount?: number) => void;
  onInitialsSet?: (initials: string) => void;
  roomCode: string;
  isHost: boolean;
  isConnected: boolean;
  opponentConnected: boolean;
  guestCount?: number;
  chatMessages?: ChatMessage[];
  onSendChatMessage?: (text: string) => void;
}

const COOP_COLOR = "#44FF88";
const MAX_PLAYERS = 8;

const OnlineLobby = ({
  onCreateRoom,
  onJoinRoom,
  onBack,
  onStartGame,
  onInitialsSet,
  roomCode,
  isHost,
  isConnected,
  opponentConnected,
  guestCount = 0,
  chatMessages = [],
  onSendChatMessage,
}: OnlineLobbyProps) => {
  const [joinCode, setJoinCode] = useState("");
  const [phase, setPhase] = useState<"initials" | "choose" | "hosting" | "joining">("initials");
  const [sessionMode, setSessionMode] = useState<SessionMode>("duel");
  const [initials, setInitials] = useState("");
  const [initialsError, setInitialsError] = useState("");
  const initialsInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the initials input when the phase is "initials"
  useEffect(() => {
    if (phase === "initials" && initialsInputRef.current) {
      initialsInputRef.current.focus();
    }
  }, [phase]);

  const handleInitialsConfirm = () => {
    const trimmed = initials.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (trimmed.length < 1) {
      setInitialsError("Enter 1–3 letters");
      return;
    }
    setInitialsError("");
    onInitialsSet?.(trimmed);
    setPhase("choose");
  };

  const handleCreate = () => {
    onCreateRoom();
    setPhase("hosting");
  };

  const handleJoin = () => {
    if (joinCode.length === 4) {
      onJoinRoom(joinCode.toUpperCase());
      setPhase("joining");
    }
  };

  // Total players = host + guests
  const totalPlayers = guestCount + 1;
  const canStart = isConnected && opponentConnected && isHost && totalPlayers >= 2;
  const atMaxPlayers = sessionMode === "coop" && totalPlayers >= MAX_PLAYERS;

  return (
    <div className="flex flex-col items-center gap-6">

      {/* ── Step 0: Enter initials ── */}
      {phase === "initials" && (
        <>
          <div
            className="text-4xl font-mono text-[hsl(var(--game-foreground))] tracking-wider mb-4"
            style={{ textShadow: "0 0 20px hsl(var(--game-foreground))" }}
          >
            ONLINE PLAY
          </div>
          <div className="text-sm font-mono text-[hsl(var(--game-foreground))] opacity-60 tracking-wide">
            ENTER YOUR INITIALS
          </div>
          <div className="flex flex-col items-center gap-2">
            <input
              ref={initialsInputRef}
              type="text"
              maxLength={3}
              value={initials}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                setInitials(v);
                if (v.length > 0) setInitialsError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInitialsConfirm();
                e.stopPropagation();
              }}
              placeholder="___"
              className="w-28 text-center text-4xl font-mono bg-transparent border-2 border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))] p-2 uppercase tracking-[0.5em] focus:outline-none focus:border-[hsl(var(--game-glow))]"
            />
            {initialsError && (
              <div className="text-xs font-mono text-[hsl(var(--game-danger))] animate-pulse">{initialsError}</div>
            )}
          </div>
          <div className="text-xs font-mono text-[hsl(var(--game-foreground))] opacity-30 text-center max-w-xs">
            1–3 letters — shown above your ship
          </div>
          <Button
            onClick={handleInitialsConfirm}
            disabled={initials.length === 0}
            className="text-xl px-10 py-5 font-mono tracking-wider bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] disabled:opacity-30"
          >
            CONFIRM
          </Button>
          <Button
            onClick={onBack}
            variant="outline"
            className="border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))]/60 font-mono hover:bg-[hsl(var(--game-foreground))]/10"
          >
            ← BACK TO MENU
          </Button>
        </>
      )}

      {/* ── Step 1: Duel or Co-op ── */}
      {phase === "choose" && (
        <>
          <div
            className="text-4xl font-mono text-[hsl(var(--game-foreground))] tracking-wider mb-4"
            style={{ textShadow: "0 0 20px hsl(var(--game-foreground))" }}
          >
            ONLINE PLAY
          </div>

          {initials && (
            <div className="text-sm font-mono tracking-wider" style={{ color: COOP_COLOR }}>
              PLAYING AS: <span className="text-white">{initials}</span>
            </div>
          )}

          {/* Mode selector */}
          <div className="flex gap-4">
            <Button
              onClick={() => setSessionMode("duel")}
              className={`text-lg px-8 py-4 font-mono tracking-wider border-2 transition-all ${
                sessionMode === "duel"
                  ? "border-[#FF8844] text-[#FF8844] bg-[rgba(255,136,68,0.15)] shadow-[0_0_16px_rgba(255,136,68,0.5)]"
                  : "border-[#FF8844]/40 text-[#FF8844]/60 bg-transparent"
              }`}
            >
              ⚔ DUEL
            </Button>
            <Button
              onClick={() => setSessionMode("coop")}
              className={`text-lg px-8 py-4 font-mono tracking-wider border-2 transition-all ${
                sessionMode === "coop"
                  ? "border-[#44FF88] text-[#44FF88] bg-[rgba(68,255,136,0.15)] shadow-[0_0_16px_rgba(68,255,136,0.5)]"
                  : "border-[#44FF88]/40 text-[#44FF88]/60 bg-transparent"
              }`}
            >
              🤝 CO-OP
            </Button>
          </div>

          <div className="text-xs font-mono text-[hsl(var(--game-foreground))] opacity-40 text-center max-w-xs">
            {sessionMode === "duel"
              ? "Fight against each other in an asteroid arena."
              : `Team up against waves of asteroids, bosses and enemies. Up to ${MAX_PLAYERS} players!`}
          </div>

          {/* Room actions */}
          <Button
            onClick={handleCreate}
            className="text-xl px-10 py-5 font-mono tracking-wider bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))]"
          >
            CREATE ROOM
          </Button>
          <div className="text-[hsl(var(--game-foreground))] font-mono opacity-40">— OR —</div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
                e.stopPropagation();
              }}
              placeholder="CODE"
              className="w-28 text-center text-2xl font-mono bg-transparent border-2 border-[hsl(var(--game-foreground))] text-[hsl(var(--game-foreground))] p-2 uppercase tracking-widest focus:outline-none focus:border-[hsl(var(--game-glow))]"
            />
            <Button
              onClick={handleJoin}
              disabled={joinCode.length !== 4}
              className="text-lg px-6 py-4 font-mono bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] disabled:opacity-30"
            >
              JOIN
            </Button>
          </div>
          <Button
            onClick={() => setPhase("initials")}
            variant="outline"
            className="mt-6 border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))]/60 font-mono hover:bg-[hsl(var(--game-foreground))]/10"
          >
            ← BACK
          </Button>
          <Button
            onClick={onBack}
            variant="ghost"
            className="text-xs border-0 text-[hsl(var(--game-foreground))]/30 font-mono hover:text-[hsl(var(--game-foreground))]/60"
          >
            EXIT TO MENU
          </Button>
        </>
      )}

      {/* ── Step 2: Waiting / ready ── */}
      {(phase === "hosting" || phase === "joining") && (
        <>
          <div className="text-3xl font-mono text-[hsl(var(--game-foreground))] tracking-wider">
            {phase === "hosting" ? "ROOM CREATED" : "JOINING ROOM"}
          </div>

          {initials && (
            <div className="text-sm font-mono tracking-wider" style={{ color: COOP_COLOR }}>
              PLAYING AS: <span className="text-white">{initials}</span>
            </div>
          )}

          {/* Mode badge */}
          <div
            className="text-sm font-mono px-4 py-1 border rounded tracking-wider"
            style={{
              color: sessionMode === "coop" ? COOP_COLOR : "#FF8844",
              borderColor: sessionMode === "coop" ? COOP_COLOR : "#FF8844",
              background: sessionMode === "coop" ? "rgba(68,255,136,0.1)" : "rgba(255,136,68,0.1)",
            }}
          >
            {sessionMode === "coop" ? `🤝 CO-OP MODE (up to ${MAX_PLAYERS}P)` : "⚔ DUEL MODE"}
          </div>

          {roomCode && (
            <div
              className="text-6xl font-mono text-[hsl(var(--game-foreground))] tracking-[0.5em] my-4"
              style={{ textShadow: "0 0 30px hsl(var(--game-foreground))" }}
            >
              {roomCode}
            </div>
          )}

          {/* Player count display for coop */}
          {sessionMode === "coop" && isConnected && (
            <div className="flex items-center gap-2 text-sm font-mono" style={{ color: COOP_COLOR }}>
              <span>👥 Players in room: {totalPlayers} / {MAX_PLAYERS}</span>
              {atMaxPlayers && <span className="text-[#FF8844]">(MAX)</span>}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm font-mono">
            <div
              className={`w-3 h-3 rounded-full ${
                !isConnected
                  ? "bg-[hsl(var(--game-danger))]"
                  : opponentConnected
                  ? "bg-[hsl(var(--game-glow))]"
                  : "bg-[hsl(var(--game-foreground))] animate-pulse"
              }`}
            />
            <span className="text-[hsl(var(--game-foreground))] opacity-70">
              {!isConnected && "Connecting..."}
              {isConnected && !opponentConnected && (phase === "hosting"
                ? `Share the code — waiting for players... (${sessionMode === "coop" ? `min 2 needed` : "1 needed"})`
                : "Connecting to host...")}
              {isConnected && opponentConnected && (sessionMode === "coop"
                ? `${totalPlayers} player${totalPlayers > 1 ? "s" : ""} ready!`
                : "Opponent connected!")}
            </span>
          </div>
          {canStart && (
            <Button
              onClick={() => onStartGame(sessionMode, totalPlayers)}
              className="text-2xl px-12 py-6 font-mono tracking-wider text-[hsl(var(--game-background))] hover:brightness-110 animate-pulse mt-4"
              style={{
                background: sessionMode === "coop" ? COOP_COLOR : "hsl(var(--game-glow))",
                textShadow: "0 0 10px currentColor",
              }}
            >
              ▸ START GAME ({totalPlayers}P)
            </Button>
          )}
          {isConnected && opponentConnected && !isHost && (
            <div
              className="text-lg font-mono animate-pulse mt-4"
              style={{ color: sessionMode === "coop" ? COOP_COLOR : "hsl(var(--game-glow))" }}
            >
              Waiting for host to start...
            </div>
          )}
          <Button
            onClick={onBack}
            variant="outline"
            className="mt-6 border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))]/60 font-mono hover:bg-[hsl(var(--game-foreground))]/10"
          >
            ← CANCEL
          </Button>

          {/* Chat panel — visible once connected to a room */}
          {isConnected && onSendChatMessage && (
            <LobbyChat
              messages={chatMessages}
              onSend={onSendChatMessage}
            />
          )}
        </>
      )}
    </div>
  );
};

export default OnlineLobby;
