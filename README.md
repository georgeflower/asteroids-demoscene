# 🚀 Asteroids Demoscene

A modern tribute to the classic Asteroids arcade game, infused with demoscene aesthetics and retro computing vibes. Built with React, TypeScript, and Canvas rendering, featuring CRT visual effects, multiple game modes, and a global leaderboard system.

## ✨ Features

### Game Modes
- **Solo Mode** - Classic single-player survival gameplay with progressive difficulty waves
- **Duel Mode** - Local 2-player competitive mode (P1: Cyan ship, P2: Orange ship)
- **Online Mode** - Multiplayer support with WebWorker-based game logic

### Gameplay
- **Classic Mechanics** - Navigate your ship, shoot asteroids, and avoid collisions
- **Asteroids** - Large, medium, and small variants with increasing speed and points
- **Aliens** - Multiple alien types including UFOs, green men, and purple swarms with flocking AI
- **Boss Battles** - Epic boss fights every 5 waves featuring:
  - Amiga Ball (wave 5)
  - Flying Saucer (wave 10)
  - Tentacle Boss (wave 15)
  - Borg Cube (wave 20)
- **Hyperspace** - Emergency teleportation with charge-up mechanic
- **Difficulty Scaling** - Speed increases by 5% per wave

### Visuals & Audio
- **CRT Effects** - Authentic scanlines and vignette for retro aesthetics
- **Dynamic Color Themes** - Themes cycle every 5 waves
- **Particle Effects** - Explosions, debris, and floating score text
- **Nectarine Demoscene Radio** - Integrated streaming demoscene music

### Leaderboard System
- **Hall of Fame** - Top 3 all-time scores displayed on main menu
- **Global Highscores** - Scrollable top 30 leaderboard
- **Secure Submissions** - HMAC signature verification with session tokens
- **Profanity Filter** - Built-in inappropriate initials detection
- **Trainer Mode** - Practice without affecting leaderboards

## 🎮 Controls

### Keyboard (Solo)
| Action | Key |
|--------|-----|
| Rotate Left | ← |
| Rotate Right | → |
| Thrust | ↑ |
| Fire | Space |
| Hyperspace | H |
| Pause | Esc |

### Keyboard (Duel)
| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Rotate Left | ← | A |
| Rotate Right | → | D |
| Thrust | ↑ | W |
| Fire | Space | E |

### Gamepad
- **Stick/D-pad** - Move
- **A Button** - Fire
- **B Button** - Hyperspace
- **X Button** - Thrust
- **Start** - Pause

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+ or Bun
- npm, yarn, or bun package manager

### Clone the Repository

```bash
git clone https://github.com/georgeflower/asteroids-demoscene.git
cd asteroids-demoscene
```

### Install Dependencies

```bash
# Using npm
npm install

# Using yarn
yarn install

# Using bun
bun install
```

### Environment Setup

Create a `.env` file in the root directory with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

### Run Development Server

```bash
# Using npm
npm run dev

# Using yarn
yarn dev

# Using bun
bun dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## 🏗️ Architecture

```
asteroids-demoscene/
├── src/
│   ├── pages/
│   │   └── Game.tsx          # Main game component (~5000 lines)
│   │                          # - Game state management
│   │                          # - Canvas rendering
│   │                          # - Input handling
│   │                          # - Collision detection
│   │                          # - UI overlays
│   ├── workers/
│   │   └── gameWorker.ts     # WebWorker for multiplayer game logic
│   │                          # - Fixed 60Hz timestep updates
│   │                          # - Physics simulation
│   │                          # - State synchronization
│   ├── components/           # Reusable UI components (shadcn/ui)
│   ├── integrations/         # Supabase client configuration
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utility libraries
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Helper functions
│   └── constants/            # Game constants and configuration
├── supabase/
│   ├── functions/            # Edge Functions for score submission
│   │   ├── submit-score/     # Secure highscore submission
│   │   └── start-session/    # Session token generation
│   └── migrations/           # Database schema migrations
├── scripts/                  # Utility scripts
│   └── check-highscore-legitimacy.mjs
└── public/                   # Static assets
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS, shadcn/ui |
| **State** | React hooks, refs for performance |
| **Rendering** | HTML5 Canvas 2D |
| **Multiplayer** | WebWorkers |
| **Backend** | Supabase (PostgreSQL + Edge Functions) |
| **Security** | HMAC signatures, session tokens |

### Game Loop Architecture

```
┌─────────────────────────────────────────────────┐
│                  Main Thread                     │
├─────────────────────────────────────────────────┤
│  React Component                                │
│  ├── Input Handling (keyboard, gamepad, touch) │
│  ├── Canvas Rendering (60 FPS cap)             │
│  └── UI State Management                       │
└─────────────────┬───────────────────────────────┘
                  │ postMessage
                  ▼
┌─────────────────────────────────────────────────┐
│               Game Worker (Online Mode)         │
├─────────────────────────────────────────────────┤
│  Fixed Timestep (16.666ms / 60Hz)              │
│  ├── Physics Updates                           │
│  ├── Collision Detection                       │
│  ├── Entity Management (ships, bullets, etc.)  │
│  └── State Broadcast                           │
└─────────────────────────────────────────────────┘
```

### Highscore Security Flow

```
Game Client (Browser)
    │
    ├─[1]─► Request Session Token → Edge Function (/start-session)
    │
    ◄─[2]── Receive Session Token ◄─┘
    │
    ├─[3]─► Play Game (score tracked locally)
    │
    ├─[4]─► Submit Score + Token → Edge Function (/submit-score)
    │                              ├── Validate HMAC signature
    │                              ├── Verify session token
    │                              └── Insert via service role
    │
    ◄─[6]── Success/Error Response
```

## 📊 Scoring

| Target | Points |
|--------|--------|
| Large Asteroid | 20 |
| Medium Asteroid | 50 |
| Small Asteroid | 100 |
| Large UFO | 200 |
| Small UFO | 1,000 |
| Aliens | Variable |
| Bosses | Variable (based on wave) |

## 📄 License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.

This means you are free to:
- ✅ Use the software for any purpose
- ✅ Study and modify the source code
- ✅ Distribute copies
- ✅ Distribute modified versions

Under the condition that:
- 📋 Derivative works must also be licensed under GPL-3.0
- 📋 Source code must be made available when distributing
- 📋 Changes must be documented

## 🙏 Acknowledgments

- Original Asteroids by Atari (1979)
- [Nectarine Demoscene Radio](https://scenestream.net/demovibes/) for the music
- The demoscene community for inspiration
- [shadcn/ui](https://ui.shadcn.com/) for UI components
- [Supabase](https://supabase.com/) for backend infrastructure

---

**🎵 Press START to play! 🎵**
