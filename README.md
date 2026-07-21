# BOTC AI Storyteller Assistant

> AI-powered assistant for Blood on the Clocktower storytellers. Manage games, get night action candidates, sync player views — all in your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#)
[![Status](https://img.shields.io/badge/Status-Beta-orange.svg)](#)

**Unofficial fan project.** This tool is not affiliated with, endorsed by, or officially licensed by The Pandemonium Institute. Blood on the Clocktower and its IP belong to their respective owners.

---

## Features

| Storyteller Side | Player Side | Scripts |
|-----------------|------------|---------|
| Grimoire-style night queue | Private role view | Trouble Brewing |
| Night action candidates (AI) | Public info sync | Bad Moon Rising |
| Nomination & voting | Direct messages | Sects & Violets |
| Player seat management | Role confirmation | Catfishing (社区) |
| Game state panel | Mobile-friendly | |

### What It Does

- **Local/LAN multiplayer** — Storyteller and players on the same network or via VPN
- **Night workflow** — AI suggests targets for complex roles; storyteller confirms all actions
- **Player projection** — Each player sees only their own role and public game state
- **Script support** — Official scripts + community JSON scripts via `botcscripts.com`
- **Role logic** — First/other night order, reminders, jinxes, team indicators

### What It Does NOT

- Automatic rule enforcement (all decisions require storyteller confirmation)
- Online hosting (no public server, no cloud deployment in this package)
- Replace the official grimoire (designed as an assistant, not a substitute)

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure (optional)

```bash
cp .env.example .env
# Edit .env to add AI provider keys if you want AI night candidates
```

### 3. Start the game

```bash
npm start
```

### 4. Open in browser

| Page | URL |
|------|-----|
| Storyteller | http://127.0.0.1:3000/storyteller-v2.html |
| Player | http://127.0.0.1:3000/player-v2.html |
| Health check | http://127.0.0.1:3000/healthz |

Players on the same LAN can join via `http://<your-lan-ip>:3000/player-v2.html`

---

## Project Structure

```
├── server.js              # Express + WebSocket server
├── public/
│   ├── storyteller-v2.html # Storyteller UI
│   ├── player-v2.html      # Player UI
│   ├── css/                # Styles
│   ├── js/                 # Frontend logic
│   └── clocktower-assets/  # Role icons, backgrounds
├── modules/
│   ├── mvp/                # Core game logic
│   └── imported-scripts/   # Community script utilities
├── data/
│   └── runtime/
│       ├── official/       # Normalized role & night order data
│       └── scripts/        # Script definitions
└── scripts/
    ├── start-local-game-session.mjs
    └── preflight-public-package.mjs
```

---

## Scripts

```bash
# Verify public package integrity
npm run verify:public-package

# Start a local game session
node scripts/start-local-game-session.mjs
```

---

## License

**MIT License** — covers only this project's source code and documentation.

This license **does NOT** grant rights to:
- Blood on the Clocktower characters, scripts, names, or artwork
- Official rule text and reminders
- Third-party/community script content

See [LICENSE](LICENSE) for full IP notice.

---

## Acknowledgments

- **[Blood on the Clocktower](https://bloodontheclocktower.com/)** — Trademark of Steven Medway and The Pandemonium Institute
- **Night order data** — Sourced from `release.botc.app`
- **Catfishing script** — Community script by [Emily](https://www.botcscripts.com/script/3/11.1.1/download)
- **[bra1n/townsquare](https://github.com/bra1n/townsquare)** — Reference for BOTC tooling

This is an unofficial fan-made tool, provided free of charge.

---

## Contributing

Issues and pull requests are welcome. Please include a brief description of your change and test it locally before submitting.
