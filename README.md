# BOTC AI Storyteller Assistant

> **Unofficial fan-made tool.** This project is not affiliated with, endorsed by, sponsored by, or officially licensed by The Pandemonium Institute, Steven Medway, or the creators of Blood on the Clocktower. Blood on the Clocktower, its characters, scripts, names, artwork, rule text, and related intellectual property belong to their respective owners.
>
> The MIT License in this package covers only this project's own source code and project documentation. It grants no rights to Blood on the Clocktower official or third-party content.

This is a full runtime package for the Blood on the Clocktower AI storyteller assistant. It includes the storyteller page, player page, room state, script and role data, official-style assets, role logic, and game review surfaces. Test files and local/private artifacts are not included.

## Quick Start

~~~powershell
npm install
npm start
~~~

Open these pages after the server starts:

- Storyteller: http://127.0.0.1:3000/storyteller-v2.html
- Player: http://127.0.0.1:3000/player-v2.html
- Health check: http://127.0.0.1:3000/healthz

## Configuration

Copy `.env.example` to `.env`, then fill in the AI provider settings you want to use. This public package does not include API keys, server passwords, VPS addresses, local paths, or local logs.

## Package Boundary

Included: runtime server, frontend assets, runtime modules, official normalized role and script data, role logic, official-style assets, and a minimal package preflight script.

Excluded: env files, secrets, local logs, browser temp folders, room snapshots, generated reports, test files, VPS deployment snapshots, replay-learning video material, transcription outputs, node_modules, and git history.

## Verification

~~~powershell
npm run verify:public-package
~~~

## License / IP Notice

Code and project documentation are released under the MIT License; see `LICENSE`. The license does not cover Blood on the Clocktower characters, scripts, names, rule text, artwork, translations, or third-party/community script data. Before public redistribution, remove unlicensed official/third-party content or obtain the relevant rights-holder permission.

## Sponsor

This public package does not include personal payment details by default.