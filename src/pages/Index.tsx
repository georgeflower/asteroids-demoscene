import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--game-background))]">
      <div className="text-center space-y-8">
        <h1 className="text-7xl font-mono font-bold text-[hsl(var(--game-foreground))] animate-pulse">
          ASTEROIDS
        </h1>
        <p className="text-2xl font-mono text-[hsl(var(--game-glow))]">
          A Retro Vector Graphics Arcade Game
        </p>
        <Button
          onClick={() => navigate("/game")}
          size="lg"
          className="bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] text-2xl px-12 py-6 font-mono"
        >
          START GAME
        </Button>
      </div>
    </div>
  );
};

export default Index;
