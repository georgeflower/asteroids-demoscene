import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionMode } from "@/types/multiplayer";

interface OnlineLobbyProps {
  onCreateRoom: () => string;
  onJoinRoom: (code: string) => void;
  onBack: () => void;
  onStartGame: (mode: SessionMode) => void;
  roomCode: string;
  isHost: boolean;
  isConnected: boolean;
  opponentConnected: boolean;
}

const COOP_COLOR = "#44FF88";

const OnlineLobby = ({
  onCreateRoom,
  onJoinRoom,
  onBack,
  onStartGame,
  roomCode,
  isHost,
  isConnected,
  opponentConnected,
}: OnlineLobbyProps) => {
  const [joinCode, setJoinCode] = useState("");
  const [phase, setPhase] = useState<"choose" | "mode" | "hosting" | "joining">("choose");
  const [sessionMode, setSessionMode] = useState<SessionMode>("duel");

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

  return (
    <div className="flex flex-col items-center gap-6">

      {/* ── Step 1: Duel or Co-op ── */}
      {phase === "choose" && (
        <>
          <div
            className="text-4xl font-mono text-[hsl(var(--game-foreground))] tracking-wider mb-4"
            style={{ textShadow: "0 0 20px hsl(var(--game-foreground))" }}
          >
            ONLINE PLAY
          </div>

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
              : "Team up against waves of asteroids and enemies. Share the score!"}
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
            onClick={onBack}
            variant="outline"
            className="mt-6 border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))]/60 font-mono hover:bg-[hsl(var(--game-foreground))]/10"
          >
            ← BACK TO MENU
          </Button>
        </>
      )}

      {/* ── Step 2: Waiting / ready ── */}
      {(phase === "hosting" || phase === "joining") && (
        <>
          <div className="text-3xl font-mono text-[hsl(var(--game-foreground))] tracking-wider">
            {phase === "hosting" ? "ROOM CREATED" : "JOINING ROOM"}
          </div>

          {/* Mode badge */}
          <div
            className="text-sm font-mono px-4 py-1 border rounded tracking-wider"
            style={{
              color: sessionMode === "coop" ? COOP_COLOR : "#FF8844",
              borderColor: sessionMode === "coop" ? COOP_COLOR : "#FF8844",
              background: sessionMode === "coop" ? "rgba(68,255,136,0.1)" : "rgba(255,136,68,0.1)",
            }}
          >
            {sessionMode === "coop" ? "🤝 CO-OP MODE" : "⚔ DUEL MODE"}
          </div>

          {roomCode && (
            <div
              className="text-6xl font-mono text-[hsl(var(--game-foreground))] tracking-[0.5em] my-4"
              style={{ textShadow: "0 0 30px hsl(var(--game-foreground))" }}
            >
              {roomCode}
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
              {isConnected && !opponentConnected && (phase === "hosting" ? "Share the code — waiting for opponent..." : "Connecting to host...")}
              {isConnected && opponentConnected && "Opponent connected!"}
            </span>
          </div>
          {isConnected && opponentConnected && isHost && (
            <Button
              onClick={() => onStartGame(sessionMode)}
              className="text-2xl px-12 py-6 font-mono tracking-wider text-[hsl(var(--game-background))] hover:brightness-110 animate-pulse mt-4"
              style={{
                background: sessionMode === "coop" ? COOP_COLOR : "hsl(var(--game-glow))",
                textShadow: "0 0 10px currentColor",
              }}
            >
              ▸ START GAME
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
        </>
      )}
    </div>
  );
};

export default OnlineLobby;
