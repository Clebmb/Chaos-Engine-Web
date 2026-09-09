# Run doc — Chaos Engine (Sigil Scribe)

Vite + React 19 single-page app. No backend, no database.

## Reproduce the artifacts

1. Install dependencies with npm (the repo uses `package-lock.json`):

   ```bash
   npm install
   ```

2. No environment files exist or are required — nothing to copy from anywhere.

## Run the server

```bash
npm run dev
```

- Vite dev server, default port **5173** (`http://localhost:5173/`).
- If 5173 is taken, pass another: `npm run dev -- --port 5174`.
- `npm run build` / `npx tsc -b` for typecheck; `npm run preview` serves a production build.

For a detached start on Windows (as Freebuff preview does):

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<log>.out' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

Note: the wrapping shell may hold the pipe until the child exits (30s tool timeout is normal) — the server still starts; verify with the log file and `netstat -ano | findstr 5173`.
