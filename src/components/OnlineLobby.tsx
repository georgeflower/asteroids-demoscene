import { useState } from "react";
import { Button } from "@/components/ui/button";

interface OnlineLobbyProps {
  onCreateRoom: () => string;
  onJoinRoom: (code: string) => void;
  onBack: () => void;
  onStartGame: () => void;
  roomCode: string;
  isHost: boolean;
  isConnected: boolean;
  opponentConnected: boolean;
}

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
  const [phase, setPhase] = useState<"choose" | "hosting" | "joining">("choose");

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
      {phase === "choose" && (
        <>
          <div
            className="text-4xl font-mono text-[hsl(var(--game-foreground))] tracking-wider mb-4"
            style={{ textShadow: "0 0 20px hsl(var(--game-foreground))" }}
          >
            ONLINE DUEL
          </div>
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

      {(phase === "hosting" || phase === "joining") && (
        <>
          <div className="text-3xl font-mono text-[hsl(var(--game-foreground))] tracking-wider">
            {phase === "hosting" ? "ROOM CREATED" : "JOINING ROOM"}
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
              onClick={onStartGame}
              className="text-2xl px-12 py-6 font-mono tracking-wider bg-[hsl(var(--game-glow))] text-[hsl(var(--game-background))] hover:brightness-110 animate-pulse mt-4"
              style={{ textShadow: "0 0 10px currentColor" }}
            >
              ▸ START GAME
            </Button>
          )}
          {isConnected && opponentConnected && !isHost && (
            <div className="text-lg font-mono text-[hsl(var(--game-glow))] animate-pulse mt-4">
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
