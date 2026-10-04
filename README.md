# 🚀 Asteroids Demoscene

A modern tribute to the classic Asteroids arcade game, infused with demoscene aesthetics and retro computing vibes. Built with React, TypeScript, and Canvas rendering, featuring CRT visual effects, multiple game modes, and a global leaderboard system.

**Current version: 0.4.1** — see [CHANGELOG.md](./CHANGELOG.md) for history and what is coming next.

## ✨ Features

### Game Modes
- **Solo Mode** - Classic single-player survival gameplay with progressive difficulty waves
- **Duel Mode** - Local 2-player competitive mode on keyboard/mouse devices (P1: Cyan ship, P2: Orange ship)
- **Co-op Mode** - Local cooperative play
- **Online Duel** - Online competitive multiplayer
- **Online Co-op** - Cooperative multiplayer with room codes

### Gameplay
- **Classic Mechanics** - Navigate your ship, shoot asteroids, and avoid collisions
- **Asteroids** - Large, medium, and small variants with increasing speed and points
- **Enemies** - UFOs plus four alien types: Brown chasers, Green gunners, Blue sentinels (teleport + burst fire) and Purple swarms (flocking)
- **Boss Battles** - Epic boss fights every 5 waves featuring:
  - Amiga Ball (wave 5)
  - Flying Saucer (wave 10)
  - Tentacle Boss (wave 15)
  - Borg Cube (wave 20)
- **Hyperspace** - Emergency teleportation with charge-up mechanic
- **Difficulty Scaling** - Speed increases by 5% per wave
- **Combo chain** - consecutive kills within 2 s raise a score multiplier (+10% per link, up to x5)
- **Extra lives** - every 10,000 points, plus rare power-up drops
- **Run summary** - time, wave, accuracy, best chain and personal best after every solo run
- **Mobile play** - compact touch controls, safe-area aware layout

### Visuals & Audio
- **CRT Effects** - Authentic scanlines and vignette for retro aesthetics
- **Dynamic Color Themes** - Themes cycle every 5 waves
- **Particle Effects** - Explosions, debris, and floating score text
- **Nectarine Demoscene Radio** - Integrated streaming demoscene music

### Leaderboard System
- **Hall of Fame** - Top 3 all-time scores displayed on main menu
- **Global Highscores** - cloud leaderboard with local fallback; retry button if a cloud save fails
- **Secure Submissions** - session tokens, HMAC signatures, proof-of-work, heartbeat checks and admin review of rejected scores (see SECURITY.md)
- **Trainer Mode** - Practice without affecting leaderboards

## 🎮 Controls

### Keyboard (Solo)
| Action | Key |
|--------|-----|
| Rotate Left | ← |
| Rotate Right | → |
| Thrust | ↑ |
| Fire | Space |
| Hyperspace | Ctrl (Left/Right) |
| Pause | Esc |

### Keyboard (Duel)
| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Rotate Left | ← | A |
| Rotate Right | → | D |
| Thrust | ↑ | W |
| Fire | Space | E |

### Touch
| Action | Control |
|--------|---------|
| Rotate | ◀ ▶ |
| Thrust | ▲ |
| Fire | ◎ |
| Hyperspace | HYPERSPACE button |
| Pause | Pause button |
| Main menu | Two taps |

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
│   │   └── Game.tsx          # Main game component (~7,000 lines)
│   │                          # - Game state management
│   │                          # - Canvas rendering
│   │                          # - Input handling
│   │                          # - Collision detection
│   │                          # - UI overlays
│   ├── workers/
│   │   ├── gameWorker.ts     # WebWorker for multiplayer game logic
│   │                          # - Fixed 60Hz timestep updates
│   │                          # - Physics simulation
│   │                          # - State synchronization
│   │   └── coopWorker.ts     # WebWorker for cooperative game logic
│   ├── components/           # Reusable UI components (shadcn/ui)
│   │   ├── GameOverPanel.tsx
│   │   └── AdminMonitor.tsx
│   ├── integrations/         # Supabase client configuration
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utility libraries
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Helper functions
│   └── constants/            # Game constants and configuration
├── supabase/
│   ├── functions/            # Edge Functions for score submission
│   │   └── submit/           # Unified secure highscore Edge Function
│   │       │                 #   POST /start-session  — issue session token + PoW challenge
│   │       │                 #   POST /heartbeat      — validate & record gameplay state
│   │       │                 #   POST /submit         — validate & accept final score
│   │       │                 #   GET  /admin-data     — admin leaderboard view
│   │       │                 #   POST /admin-delete   — admin score removal
│   │       │                 #   POST /admin-approve  — approve a rejected score
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
| **Security** | HMAC-SHA-256 signatures, PoW, session tokens, server-authoritative state |

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
    ├─[1]─► POST /start-session → Edge Function
    │         Receives: session token, session nonce (HMAC key),
    │                   PoW challenge + difficulty
    │         Client begins solving PoW in background
    │
    ├─[2]─► Play Game
    │         Every ~30 s: POST /heartbeat
    │           Carries: token, score, level, asteroidsDestroyed,
    │                    bulletsFired, seq (monotonically increasing), HMAC
    │           Server validates HMAC, seq, delta rates, timing, CAS updates
    │
    ├─[3]─► POST /submit → Edge Function
    │         Carries: token, final score, initials, level,
    │                  PoW nonce, HMAC, seq, game metrics
    │         Server runs all 22 validation layers (see SECURITY.md)
    │         → insert_score_with_audit() RPC (atomic)
    │
    └─[4]─► Success / Error Response
```

For a complete description of every security layer see [SECURITY.md](./SECURITY.md).

## 📊 Scoring

| Target | Points |
|--------|--------|
| Large Asteroid | 20 |
| Medium Asteroid | 50 |
| Small Asteroid | 100 |
| Large UFO | 200 |
| Small UFO | 1,000 |
| Brown | 300 |
| Green | 500 |
| Blue | 600 |
| Purple | 100 |
| Boss | 2,000 + 200 per wave |
| Chain multiplier | x1.0 → x5.0 |
| Score multiplier power-up | x2 for 15 s |

## 🔭 Coming next

### Game balance
- **Fewer extra lives**: later and rarer 1UPs, a cap on total lives, and no extra-life drops from plain asteroids
- **Fewer, fairer enemies**: new enemy types arrive later, fewer are alive at once, and spawns have more breathing room
- **Green aliens**: slower, shorter-range and less precise shots, with a visible warning just before they fire
- **Blue teleporters**: teleport less often, never land on top of you, and show a marker where they will appear

### Game feel
- Screen shake and a brief hit-stop on big impacts (respects reduced-motion settings)
- A short wave-clear pause with a bonus tally

### Polish
- Sound-effects mute / volume control
- Hyperspace cooldown indicator on the touch button
- Accessibility labels for all buttons

### Under consideration
- Landscape layout for phones
- Difficulty-curve tuning based on in-game telemetry
- Splitting the rendering code out of `Game.tsx`

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
