# GitHub Upload Checklist

This folder is the prepared full-runtime upload package.

## Included

- Core server: `server.js`
- Storyteller/player browser UI under `public/`
- Runtime modules under `modules/`
- Official/community runtime data required by current features under `data/runtime/`
- Role-token alias knowledge under `data/knowledge/`
- Minimal runtime/preflight scripts under `scripts/`
- `README.md`, `LICENSE`, `.env.example`, Docker files

## Removed

- `.git/` history
- `.env` and local secrets
- `node_modules/`
- Local logs, room snapshots, generated reports, game records, backups
- `tests/` directory. Runtime data previously stored under `tests/fixtures/` was moved to `data/runtime/` so core features still work.

## Before uploading

1. Create a new GitHub repo.
2. Upload the **contents** of this folder, not the parent `dist/` directory.
3. Keep the repo non-commercial and clearly unofficial.
4. Do not add local `.env`, logs, game records, or generated report folders.

## Quick verification after clone

~~~powershell
npm install
npm run verify:public-package
npm start
~~~

Open:

- Storyteller: http://127.0.0.1:3000/storyteller-v2.html
- Player: http://127.0.0.1:3000/player-v2.html
