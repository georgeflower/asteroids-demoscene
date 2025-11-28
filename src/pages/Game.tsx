import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { soundEffects } from "@/utils/soundEffects";

interface Vector {
  x: number;
  y: number;
}

interface GameObject {
  pos: Vector;
  vel: Vector;
  rotation: number;
}

interface Ship extends GameObject {
  rotationSpeed: number;
  thrust: number;
  isThrusting: boolean;
  invulnerable: boolean;
  invulnerableTime: number;
}

interface Asteroid extends GameObject {
  size: "large" | "medium" | "small";
  points: Vector[];
  rotationSpeed: number;
}

interface Bullet extends GameObject {
  lifetime: number;
}

interface UFO extends GameObject {
  size: "large" | "small";
  shootTimer: number;
  direction: number;
}

interface PowerUp extends GameObject {
  type: "shield" | "rapidFire" | "extraLife" | "multiplier";
  lifetime: number;
}

interface GameState {
  ship: Ship;
  asteroids: Asteroid[];
  bullets: Bullet[];
  ufos: UFO[];
  powerUps: PowerUp[];
  score: number;
  lives: number;
  wave: number;
  gameOver: boolean;
  paused: boolean;
  powerUpActive: {
    shield: number;
    rapidFire: number;
    multiplier: number;
  };
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const SHIP_SIZE = 10;
const BULLET_SPEED = 7;
const BULLET_LIFETIME = 60;
const ASTEROID_SPEEDS = { large: 0.5, medium: 0.8, small: 1.2 };
const ASTEROID_POINTS = {
  large: 20,
  medium: 50,
  small: 100,
};
const UFO_POINTS = { large: 200, small: 1000 };

const Game = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const animationFrameRef = useRef<number>();
  const lastShotRef = useRef(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(3);
  const [displayWave, setDisplayWave] = useState(1);
  const [showGameOver, setShowGameOver] = useState(false);

  const createShip = (): Ship => ({
    pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    rotation: -Math.PI / 2,
    rotationSpeed: 0.1,
    thrust: 0.08,
    isThrusting: false,
    invulnerable: true,
    invulnerableTime: 120,
  });

  const createAsteroid = (x: number, y: number, size: "large" | "medium" | "small"): Asteroid => {
    const points: Vector[] = [];
    const numPoints = 8 + Math.floor(Math.random() * 4);
    const baseRadius = size === "large" ? 40 : size === "medium" ? 25 : 12;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const radius = baseRadius + (Math.random() - 0.5) * baseRadius * 0.4;
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = ASTEROID_SPEEDS[size] * (0.8 + Math.random() * 0.4);

    return {
      pos: { x, y },
      vel: {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      },
      rotation: Math.random() * Math.PI * 2,
      size,
      points,
      rotationSpeed: (Math.random() - 0.5) * 0.04,
    };
  };

  const createUFO = (size: "large" | "small"): UFO => {
    const side = Math.random() < 0.5 ? 0 : CANVAS_WIDTH;
    return {
      pos: { x: side, y: Math.random() * CANVAS_HEIGHT },
      vel: { x: (side === 0 ? 1 : -1) * 1.2, y: 0 },
      rotation: 0,
      size,
      shootTimer: 60 + Math.random() * 60,
      direction: 0,
    };
  };

  const createPowerUp = (x: number, y: number): PowerUp | null => {
    if (Math.random() > 0.15) return null;
    const types: PowerUp["type"][] = ["shield", "rapidFire", "extraLife", "multiplier"];
    const type = types[Math.floor(Math.random() * types.length)];

    return {
      pos: { x, y },
      vel: {
        x: (Math.random() - 0.5) * 0.5,
        y: (Math.random() - 0.5) * 0.5,
      },
      rotation: 0,
      type,
      lifetime: 300,
    };
  };

  const initGame = useCallback(() => {
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * CANVAS_WIDTH;
      const y = Math.random() * CANVAS_HEIGHT;
      const dist = Math.hypot(x - CANVAS_WIDTH / 2, y - CANVAS_HEIGHT / 2);
      if (dist > 100) {
        asteroids.push(createAsteroid(x, y, "large"));
      } else {
        i--;
      }
    }

    gameStateRef.current = {
      ship: createShip(),
      asteroids,
      bullets: [],
      ufos: [],
      powerUps: [],
      score: 0,
      lives: 3,
      wave: 1,
      gameOver: false,
      paused: false,
      powerUpActive: { shield: 0, rapidFire: 0, multiplier: 0 },
    };

    setDisplayScore(0);
    setDisplayLives(3);
    setDisplayWave(1);
    setShowGameOver(false);
    toast.success("Game Started! Use Arrow Keys to move, Space to shoot");
  }, []);

  const nextWave = useCallback(() => {
    if (!gameStateRef.current) return;

    gameStateRef.current.wave++;
    const numAsteroids = 4 + gameStateRef.current.wave * 2;
    const asteroids: Asteroid[] = [];

    for (let i = 0; i < numAsteroids; i++) {
      const x = Math.random() * CANVAS_WIDTH;
      const y = Math.random() * CANVAS_HEIGHT;
      const dist = Math.hypot(x - CANVAS_WIDTH / 2, y - CANVAS_HEIGHT / 2);
      if (dist > 150) {
        asteroids.push(createAsteroid(x, y, "large"));
      } else {
        i--;
      }
    }

    gameStateRef.current.asteroids = asteroids;
    gameStateRef.current.ship = createShip();
    setDisplayWave(gameStateRef.current.wave);

    if (gameStateRef.current.wave % 3 === 0) {
      const size = gameStateRef.current.wave > 10 ? "small" : "large";
      gameStateRef.current.ufos.push(createUFO(size));
    }

    toast.success(`Wave ${gameStateRef.current.wave}!`);
  }, []);

  const wrapPosition = (pos: Vector): Vector => {
    return {
      x: ((pos.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH,
      y: ((pos.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT,
    };
  };

  const checkCollision = (pos1: Vector, radius1: number, pos2: Vector, radius2: number): boolean => {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < radius1 + radius2;
  };

  const shootBullet = useCallback(() => {
    if (!gameStateRef.current || gameStateRef.current.gameOver) return;

    const now = Date.now();
    const fireRate = gameStateRef.current.powerUpActive.rapidFire > 0 ? 100 : 250;

    if (now - lastShotRef.current < fireRate) return;
    lastShotRef.current = now;

    const { ship } = gameStateRef.current;
    const bullet: Bullet = {
      pos: { ...ship.pos },
      vel: {
        x: Math.cos(ship.rotation) * BULLET_SPEED + ship.vel.x,
        y: Math.sin(ship.rotation) * BULLET_SPEED + ship.vel.y,
      },
      rotation: ship.rotation,
      lifetime: BULLET_LIFETIME,
    };

    gameStateRef.current.bullets.push(bullet);
    soundEffects.shoot();
  }, []);

  const hyperspace = useCallback(() => {
    if (!gameStateRef.current || gameStateRef.current.gameOver) return;

    gameStateRef.current.ship.pos = {
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
    };
    gameStateRef.current.ship.vel = { x: 0, y: 0 };

    if (Math.random() < 0.1) {
      gameStateRef.current.lives--;
      setDisplayLives(gameStateRef.current.lives);
      if (gameStateRef.current.lives <= 0) {
        gameStateRef.current.gameOver = true;
        setShowGameOver(true);
      }
      toast.error("Hyperspace malfunction!");
    } else {
      toast.info("Hyperspace jump!");
    }
  }, []);

  const update = useCallback(() => {
    if (!gameStateRef.current || gameStateRef.current.gameOver || gameStateRef.current.paused) return;

    const state = gameStateRef.current;

    // Update ship
    if (keysRef.current["ArrowLeft"]) {
      state.ship.rotation -= state.ship.rotationSpeed;
    }
    if (keysRef.current["ArrowRight"]) {
      state.ship.rotation += state.ship.rotationSpeed;
    }
    if (keysRef.current["ArrowUp"]) {
      if (!state.ship.isThrusting) {
        soundEffects.startThrust();
      }
      state.ship.isThrusting = true;
      state.ship.vel.x += Math.cos(state.ship.rotation) * state.ship.thrust;
      state.ship.vel.y += Math.sin(state.ship.rotation) * state.ship.thrust;
    } else {
      if (state.ship.isThrusting) {
        soundEffects.stopThrust();
      }
      state.ship.isThrusting = false;
    }

    // Limit ship velocity
    const maxSpeed = 8;
    const speed = Math.hypot(state.ship.vel.x, state.ship.vel.y);
    if (speed > maxSpeed) {
      state.ship.vel.x = (state.ship.vel.x / speed) * maxSpeed;
      state.ship.vel.y = (state.ship.vel.y / speed) * maxSpeed;
    }

    // Apply friction
    state.ship.vel.x *= 0.99;
    state.ship.vel.y *= 0.99;

    state.ship.pos.x += state.ship.vel.x;
    state.ship.pos.y += state.ship.vel.y;
    state.ship.pos = wrapPosition(state.ship.pos);

    if (state.ship.invulnerableTime > 0) {
      state.ship.invulnerableTime--;
      if (state.ship.invulnerableTime === 0) {
        state.ship.invulnerable = false;
      }
    }

    // Update asteroids
    state.asteroids.forEach((asteroid) => {
      asteroid.pos.x += asteroid.vel.x;
      asteroid.pos.y += asteroid.vel.y;
      asteroid.pos = wrapPosition(asteroid.pos);
      asteroid.rotation += asteroid.rotationSpeed;
    });

    // Update bullets
    state.bullets = state.bullets.filter((bullet) => {
      bullet.pos.x += bullet.vel.x;
      bullet.pos.y += bullet.vel.y;
      bullet.pos = wrapPosition(bullet.pos);
      bullet.lifetime--;
      return bullet.lifetime > 0;
    });

    // Update UFOs
    state.ufos.forEach((ufo) => {
      ufo.pos.x += ufo.vel.x;
      ufo.pos.y += ufo.vel.y;

      // Simple sine wave movement
      ufo.direction += 0.02;
      ufo.vel.y = Math.sin(ufo.direction) * 0.8;

      ufo.pos = wrapPosition(ufo.pos);

      // UFO beep every second
      if (Math.floor(Date.now() / 1000) % 2 === 0 && Math.floor(Date.now() / 100) % 10 === 0) {
        soundEffects.ufoBeep();
      }

      ufo.shootTimer--;
      if (ufo.shootTimer <= 0) {
        ufo.shootTimer = 60 + Math.random() * 60;
        const angle = ufo.size === "small"
          ? Math.atan2(state.ship.pos.y - ufo.pos.y, state.ship.pos.x - ufo.pos.x)
          : Math.random() * Math.PI * 2;

        const bullet: Bullet = {
          pos: { ...ufo.pos },
          vel: {
            x: Math.cos(angle) * 5,
            y: Math.sin(angle) * 5,
          },
          rotation: angle,
          lifetime: BULLET_LIFETIME,
        };
        state.bullets.push(bullet);
      }
    });

    // Update power-ups
    state.powerUps = state.powerUps.filter((powerUp) => {
      powerUp.pos.x += powerUp.vel.x;
      powerUp.pos.y += powerUp.vel.y;
      powerUp.pos = wrapPosition(powerUp.pos);
      powerUp.rotation += 0.05;
      powerUp.lifetime--;

      // Check collision with ship
      if (checkCollision(powerUp.pos, 15, state.ship.pos, SHIP_SIZE)) {
        const multiplier = state.powerUpActive.multiplier > 0 ? 2 : 1;
        switch (powerUp.type) {
          case "shield":
            state.powerUpActive.shield = 300;
            state.ship.invulnerable = true;
            toast.success("Shield activated!");
            break;
          case "rapidFire":
            state.powerUpActive.rapidFire = 600;
            toast.success("Rapid fire activated!");
            break;
          case "extraLife":
            state.lives++;
            setDisplayLives(state.lives);
            toast.success("Extra life!");
            break;
          case "multiplier":
            state.powerUpActive.multiplier = 900;
            toast.success("2x Score multiplier!");
            break;
        }
        return false;
      }

      return powerUp.lifetime > 0;
    });

    // Update power-up timers
    Object.keys(state.powerUpActive).forEach((key) => {
      const k = key as keyof typeof state.powerUpActive;
      if (state.powerUpActive[k] > 0) {
        state.powerUpActive[k]--;
        if (state.powerUpActive[k] === 0) {
          if (k === "shield") {
            state.ship.invulnerable = false;
            toast.info("Shield deactivated");
          } else if (k === "rapidFire") {
            toast.info("Rapid fire deactivated");
          } else if (k === "multiplier") {
            toast.info("Multiplier deactivated");
          }
        }
      }
    });

    // Collision detection: Bullets vs Asteroids
    const newAsteroids: Asteroid[] = [];
    state.bullets = state.bullets.filter((bullet) => {
      let bulletAlive = true;
      state.asteroids = state.asteroids.filter((asteroid) => {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (checkCollision(bullet.pos, 2, asteroid.pos, radius)) {
          bulletAlive = false;
          const multiplier = state.powerUpActive.multiplier > 0 ? 2 : 1;
          state.score += ASTEROID_POINTS[asteroid.size] * multiplier;
          setDisplayScore(state.score);

          // Check for extra life
          if (Math.floor((state.score - ASTEROID_POINTS[asteroid.size] * multiplier) / 10000) <
              Math.floor(state.score / 10000)) {
            state.lives++;
            setDisplayLives(state.lives);
            toast.success("Extra life earned!");
          }

          // Split asteroid
          if (asteroid.size === "large") {
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium"));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "medium"));
            soundEffects.explode();
          } else if (asteroid.size === "medium") {
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small"));
            newAsteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, "small"));
            soundEffects.explode();
          } else {
            soundEffects.smallExplode();
          }

          // Chance to spawn power-up
          const powerUp = createPowerUp(asteroid.pos.x, asteroid.pos.y);
          if (powerUp) state.powerUps.push(powerUp);

          return false;
        }
        return true;
      });
      return bulletAlive;
    });
    state.asteroids.push(...newAsteroids);

    // Collision detection: Bullets vs UFOs
    state.bullets = state.bullets.filter((bullet) => {
      let bulletAlive = true;
      state.ufos = state.ufos.filter((ufo) => {
        const radius = ufo.size === "large" ? 20 : 10;
        if (checkCollision(bullet.pos, 2, ufo.pos, radius)) {
          bulletAlive = false;
          const multiplier = state.powerUpActive.multiplier > 0 ? 2 : 1;
          state.score += UFO_POINTS[ufo.size] * multiplier;
          setDisplayScore(state.score);
          soundEffects.explode();

          const powerUp = createPowerUp(ufo.pos.x, ufo.pos.y);
          if (powerUp) state.powerUps.push(powerUp);

          return false;
        }
        return true;
      });
      return bulletAlive;
    });

    // Collision detection: Ship vs Asteroids
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      state.asteroids.forEach((asteroid) => {
        const radius = asteroid.size === "large" ? 40 : asteroid.size === "medium" ? 25 : 12;
        if (checkCollision(state.ship.pos, SHIP_SIZE, asteroid.pos, radius)) {
          state.lives--;
          setDisplayLives(state.lives);
          state.ship = createShip();
          soundEffects.explode();
          soundEffects.stopThrust();
          toast.error("Ship destroyed!");

          if (state.lives <= 0) {
            state.gameOver = true;
            setShowGameOver(true);
            toast.error(`Game Over! Final Score: ${state.score}`);
          }
        }
      });
    }

    // Collision detection: Ship vs UFOs
    if (!state.ship.invulnerable && state.powerUpActive.shield === 0) {
      state.ufos.forEach((ufo) => {
        const radius = ufo.size === "large" ? 20 : 10;
        if (checkCollision(state.ship.pos, SHIP_SIZE, ufo.pos, radius)) {
          state.lives--;
          setDisplayLives(state.lives);
          state.ship = createShip();
          soundEffects.explode();
          soundEffects.stopThrust();
          toast.error("Ship destroyed!");

          if (state.lives <= 0) {
            state.gameOver = true;
            setShowGameOver(true);
            toast.error(`Game Over! Final Score: ${state.score}`);
          }
        }
      });
    }

    // Check for wave completion
    if (state.asteroids.length === 0 && state.ufos.length === 0) {
      nextWave();
    }
  }, [nextWave]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameStateRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = gameStateRef.current;

    // Clear canvas
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw ship
    ctx.save();
    ctx.translate(state.ship.pos.x, state.ship.pos.y);
    ctx.rotate(state.ship.rotation);

    // Flicker if invulnerable
    if (!state.ship.invulnerable || Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.strokeStyle = state.powerUpActive.shield > 0
        ? "#7FFF7F"
        : "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = state.powerUpActive.shield > 0
        ? "#7FFF7F"
        : "#FFFFFF";

      ctx.beginPath();
      ctx.moveTo(SHIP_SIZE, 0);
      ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE / 2);
      ctx.lineTo(-SHIP_SIZE / 2, 0);
      ctx.lineTo(-SHIP_SIZE, SHIP_SIZE / 2);
      ctx.closePath();
      ctx.stroke();

      // Draw thrust
      if (state.ship.isThrusting && Math.floor(Date.now() / 50) % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(-SHIP_SIZE / 2, 0);
        ctx.lineTo(-SHIP_SIZE * 1.5, -SHIP_SIZE / 4);
        ctx.lineTo(-SHIP_SIZE * 1.5, SHIP_SIZE / 4);
        ctx.closePath();
        ctx.stroke();
      }
    }

    ctx.restore();

    // Draw asteroids
    state.asteroids.forEach((asteroid) => {
      ctx.save();
      ctx.translate(asteroid.pos.x, asteroid.pos.y);
      ctx.rotate(asteroid.rotation);

      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#FFFFFF";

      ctx.beginPath();
      asteroid.points.forEach((point, i) => {
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    });

    // Draw bullets
    state.bullets.forEach((bullet) => {
      ctx.save();
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(bullet.pos.x, bullet.pos.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw UFOs
    state.ufos.forEach((ufo) => {
      ctx.save();
      ctx.translate(ufo.pos.x, ufo.pos.y);

      ctx.strokeStyle = "#FFFF66";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#FFFF66";

      const radius = ufo.size === "large" ? 20 : 10;

      // Draw UFO body
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius / 2, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Draw UFO dome
      ctx.beginPath();
      ctx.ellipse(0, -radius / 4, radius / 2, radius / 3, 0, 0, Math.PI, true);
      ctx.stroke();

      ctx.restore();
    });

    // Draw power-ups
    state.powerUps.forEach((powerUp) => {
      ctx.save();
      ctx.translate(powerUp.pos.x, powerUp.pos.y);
      ctx.rotate(powerUp.rotation);

      const color = powerUp.type === "shield" ? "#7FFF7F"
        : powerUp.type === "rapidFire" ? "#FF6666"
        : powerUp.type === "multiplier" ? "#FFFF66"
        : "#CC66FF";

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;

      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * 10;
        const y = Math.sin(angle) * 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    });
  }, []);

  const gameLoop = useCallback(() => {
    update();
    draw();
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [update, draw]);

  useEffect(() => {
    initGame();

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (e.key === " ") {
        e.preventDefault();
        shootBullet();
      }
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        hyperspace();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [initGame, shootBullet, hyperspace, gameLoop]);

  return (
    <div className="min-h-screen bg-[hsl(var(--game-background))] flex flex-col items-center justify-center p-4">
      <div className="mb-4 flex gap-8 text-[hsl(var(--game-foreground))] text-xl font-mono">
        <div>SCORE: {displayScore.toString().padStart(8, "0")}</div>
        <div>LIVES: {displayLives}</div>
        <div>WAVE: {displayWave}</div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-2 border-[hsl(var(--game-foreground))] shadow-[0_0_30px_hsl(var(--game-foreground))]"
        />

        {showGameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <div className="text-6xl font-mono text-[hsl(var(--game-danger))] mb-8 animate-pulse">
              GAME OVER
            </div>
            <div className="text-3xl font-mono text-[hsl(var(--game-foreground))] mb-8">
              FINAL SCORE: {displayScore.toString().padStart(8, "0")}
            </div>
            <Button
              onClick={initGame}
              className="bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] text-xl px-8 py-4 font-mono"
            >
              PLAY AGAIN
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 text-[hsl(var(--game-foreground))] font-mono text-sm space-y-2">
        <div className="text-center">CONTROLS:</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1">
          <div>← → : ROTATE</div>
          <div>↑ : THRUST</div>
          <div>SPACE : FIRE</div>
          <div>H : HYPERSPACE</div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 max-w-md">
        <div className="text-[hsl(var(--game-foreground))] font-mono text-sm text-center">
          BACKGROUND MUSIC: NECTARINE RADIO
        </div>
        <audio
          controls
          preload="metadata"
          className="w-full"
          onError={(e) => {
            console.error("Audio loading error:", e);
            toast.error("Failed to load radio stream");
          }}
          onCanPlay={() => console.log("Audio ready to play")}
        >
          <source src="https://necta.burn.net:8000/nectarine" type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      </div>
    </div>
  );
};

export default Game;
