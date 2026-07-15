# TalentLenses — PM2 Troubleshooting & Operations Guide

## Architecture Summary

| Component | User | Path |
|-----------|------|------|
| Node.js app (PM2) | `talentlens` | `/home/talentlens/talentlens/server/index.js` |
| PM2 state | `talentlens` | `/home/talentlens/.pm2/` |
| Systemd unit | root (manages it) | `/etc/systemd/system/pm2-talentlens.service` |
| Nginx (reverse proxy) | root | `/etc/nginx/` |

---

## Incident: PM2 `errored` Loop (Resolved — 2026-07-08)

### Symptoms
- `pm2 list` (as root) showed `talentlenses` in **errored** state with restart counter incrementing.
- PM2 logs showed repeated: `Error: listen EADDRINUSE: address already in use :::5001`

### Root Cause
Two PM2 daemons were running simultaneously:
- **`talentlens` user's PM2** — the legitimate daemon, running the app correctly on port 5001.
- **`root` user's PM2** — a duplicate daemon (created by running `pm2` commands as root during previous deploys). It also tried to start the app on port 5001, which was already bound, causing the EADDRINUSE crash loop.

### Diagnosis Steps
```bash
# Check what's holding port 5001
ss -ltnp | grep 5001
# Output showed: pid=89806, user=talentlens — app was already running fine

ps -fp 89806
# Confirmed: node /home/talentlens/talentlens/server/index.js running under talentlens user
```

### Fix Applied
```bash
# 1. Remove root's PM2 startup entry
pm2 unstartup systemd
# Output: Removed '/etc/systemd/system/multi-user.target.wants/pm2-root.service'

# 2. Kill root's PM2 daemon and wipe its state
pm2 kill
rm -rf /root/.pm2

# 3. Set up systemd unit for the talentlens user (run as root, one-time)
env PATH=$PATH:/usr/local/bin pm2 startup systemd -u talentlens --hp /home/talentlens

# 4. Save the talentlens user's running process list
sudo -u talentlens pm2 save

# 5. Verify only one PM2 systemd unit exists
systemctl list-unit-files | grep pm2
# Should show ONLY: pm2-talentlens.service   enabled
```

---

## Day-to-Day Operations

### ⚠️ Rule: Never run `pm2` as root
Running `pm2` as root recreates `/root/.pm2` and can spawn a duplicate daemon that fights for port 5001.

### Switch to the talentlens user (from root)
```bash
sudo -iu talentlens
```

### Common PM2 commands (always as `talentlens` user)
```bash
sudo -iu talentlens          # switch user

pm2 list                     # check status
pm2 logs talentlenses        # live logs
pm2 logs talentlenses --lines 50 --nostream   # last 50 log lines
pm2 restart talentlenses     # restart app
pm2 reload talentlenses      # zero-downtime reload
pm2 stop talentlenses        # stop app
pm2 save                     # persist current process list (run after any change)

exit                         # return to root
```

### One-off commands without switching user
```bash
sudo -u talentlens pm2 list
sudo -u talentlens pm2 restart talentlenses
sudo -u talentlens pm2 logs talentlenses --lines 30 --nostream
```

### Deploy (always as `talentlens` user)
```bash
sudo -iu talentlens
cd ~/talentlens
./deploy.sh
exit
```

---

## Nginx (run as root)
```bash
nginx -t                          # test config
systemctl reload nginx            # apply config changes
systemctl status nginx
```

---

## Verification Checklist After Reboot or Incident

```bash
# 1. Port 5001 held by talentlens user only (single PID)
ss -ltnp | grep 5001

# 2. App is online in PM2
sudo -u talentlens pm2 list

# 3. App responds
curl -sI http://localhost:5001 | head -1

# 4. Only one PM2 systemd unit
systemctl list-unit-files | grep pm2

# 5. No root-owned .pm2 state
ls /root/.pm2 2>&1   # should say: No such file or directory

# 6. DB files owned by talentlens user
ls -la /home/talentlens/talentlens/db/*.db
# Should show: talentlens talentlens  (not root root)
```

---

## Troubleshooting: EADDRINUSE on port 5001

```bash
# Find what owns port 5001
ss -ltnp | grep 5001
# or:
lsof -i :5001

# If a stray node process is holding it (outside PM2):
kill -9 <PID>

# If root's PM2 respawned:
pm2 kill          # as root
rm -rf /root/.pm2
```

---

## Troubleshooting: PM2 won't auto-start after reboot

```bash
# Check the systemd unit
systemctl status pm2-talentlens
systemctl is-enabled pm2-talentlens   # should say: enabled

# If disabled, re-enable:
env PATH=$PATH:/usr/local/bin pm2 startup systemd -u talentlens --hp /home/talentlens
sudo -u talentlens pm2 save
```

---

## Incident: SQLITE_READONLY Errors (Resolved — 2026-07-08)

### Symptoms
- API write operations (CV screening, candidates) failing silently or returning errors.
- PM2 error logs full of: `SqliteError: attempt to write a readonly database` with `code: 'SQLITE_READONLY'`
- App starts fine (`✅ SQLite database ready`) but write routes fail.

### Root Cause
The SQLite database files (`talentlens.db`, `talentlens.db-shm`, `talentlens.db-wal`) were owned by `root` because root's PM2 previously ran the app and created/modified those files. The `talentlens` user's process could read them but not write.

```
-rw-r--r-- 1 root root  talentlens.db       ← owned by root = READONLY for talentlens user
-rw-r--r-- 1 root root  talentlens.db-shm
-rw-r--r-- 1 root root  talentlens.db-wal
```

### Diagnosis
```bash
ls -la /home/talentlens/talentlens/db/
# All .db files showed: owner = root
```

### Fix Applied
```bash
# Fix ownership of entire app directory (catches db files + any other root-owned files)
chown -R talentlens:talentlens /home/talentlens/talentlens

# Restart the app
sudo -u talentlens pm2 restart talentlens-api

# Flush old error logs and verify no new errors
sudo -u talentlens pm2 flush talentlens-api
sleep 3
sudo -u talentlens pm2 logs talentlens-api --lines 20 --nostream
# Error log should be empty

# Confirm health
curl -s http://localhost:5001/api/health
# Should return: {"status":"ok",...}
```

### Prevention
Always run `git pull`, `npm install`, and `pm2` as the `talentlens` user — never root. Root operations inside `/home/talentlens/talentlens/` create root-owned files that break the app.

---

## Troubleshooting: App crashes on startup (not EADDRINUSE)

```bash
# View PM2 logs
sudo -u talentlens pm2 logs talentlenses --lines 50 --nostream

# Run directly to see raw error output
sudo -iu talentlens
cd ~/talentlens
node server/index.js

# Common causes:
# - Missing .env file:           ls -la server/.env
# - Native module mismatch:      cd server && npm rebuild better-sqlite3
# - Missing dependencies:        cd server && npm install
```

---

## Change: Consolidated Screening History into the CRM (2026-07-15)

### Problem
The AI Resume Screener page (`/screen`) had grown its own `Today` / `History` tabs
(day-grouped screening results, backed by `GET /api/screen/daily-lists`), while the
CRM's History page (`/history` → **Resume Screenings** tab) already showed a separate,
batch-grouped view of the same underlying `screenings` table data
(`GET /api/history/screenings`). Having two different "screening history" UIs in two
places was confusing.

### Fix Applied
- **`client/src/pages/Screen.jsx`** — removed the `Today`/`History` tabs and
  `DailyListPanel`. The page is back to a single "run a screening" view with a
  `📋 History` link to the CRM.
- **`client/src/pages/History.jsx`** — the **Resume Screenings** tab is now the single
  canonical place for screening history. It's day-grouped (Date / Candidates / Batches
  / "View list →"), drilling into a per-candidate table (Name / Role / Email / Score /
  Recommendation) via `GET /api/screen/daily-lists` and `GET /api/screen/daily-lists/:date`.
- **`server/routes/history.js`** — removed the now-dead `GET /api/history/screenings`
  batch-aggregate endpoint (confirmed no other consumers before removing).

Deployed via `dev` branch → PR → `git pull` + `./deploy.sh` on the VPS (PM2 reload,
health check passed).

---

## Incident: Screening results lost on navigation + History tab silently empty (Resolved — 2026-07-15)

### Symptoms
1. Navigating from the Resume Screener page to another page (and back) lost the
   currently-entered job description and the just-completed screening results.
2. After running a screening and confirming candidates were scored, the CRM's
   **Resume Screenings** tab showed "No screening batches yet" even though the
   screening had completed successfully.

### Root Cause
1. `Screen.jsx` kept `jobDescription`, `scanMode`, `results`, and `batchId` only in
   local React state, which is destroyed the moment the component unmounts (i.e. on
   any route change via React Router).
2. `ScreeningsTab` (in `History.jsx`) fetched `/api/screen/daily-lists` with a
   `.then().finally()` chain and **no `.catch()`**. Any fetch failure (network error,
   auth issue, etc.) silently left the list empty and `loading` set to `false`,
   rendering the "No screening batches yet" empty state instead of a real error —
   masking whatever the actual problem was. (Screenings themselves are always
   persisted server-side the instant a batch completes — "Save to History" is just a
   confirmation toast, not a separate save step.)

### Fix Applied
- **`client/src/pages/Screen.jsx`** — persists `jobDescription`, `scanMode`, `results`,
  and `batchId` to `sessionStorage` (`tl_screen_state` key) on every change, and
  rehydrates them on mount, so switching pages and coming back restores the last
  screening. (Raw uploaded `File` objects can't be persisted this way — an
  in-progress but not-yet-run file selection is still lost on navigation.)
- **`client/src/pages/History.jsx`** — `ScreeningsTab` now has a proper `.catch()`
  that sets an error message and renders it instead of the misleading empty state.

Pushed to `dev`, merged to `main` (commit `3410c9c`, PR #32), deployed to the VPS.
**Update:** after deploying, the bug persisted in production — see the next incident
below for the real blocker that was masking this fix.

---

## Incident: Duplicate PM2 App Serving Stale Code (`talentlens-api` vs `talentlenses`) (Resolved — 2026-07-15)

### Symptoms
- The fixes above (session persistence + error surfacing) were merged to `main` and
  `deploy.sh` reported `✅ Deploy complete!` every time, yet the live site kept
  showing the exact same bugs indefinitely — the History tab still showed
  "No screening batches yet" with no error message at all.
- `curl` to `/api/screen/daily-lists` **without** a token correctly returned
  `401 {"error":"Access denied. No token provided."}` JSON, but the **same request
  with a valid JWT returned `200 OK` with `Content-Type: text/html`** — the body was
  the React app's `index.html`, not JSON. This is the tell-tale sign of a request
  falling through Express's routers to the SPA catch-all (`app.get('*', ...)`),
  meaning the specific route wasn't registered in whatever code the live process
  was actually running.

### Root Cause
Two separate PM2 processes both existed under the `talentlens` user, both running
the same script (`server/index.js`), but registered under **different PM2 names**:
- `talentlens-api` — created manually outside of `ecosystem.config.js` on
  2026-07-08. It held port 5001 and had been serving all live traffic for 7+ days,
  running old code from before the `/api/screen/daily-lists` route (and other
  recent changes) existed.
- `talentlenses` — the app name actually defined in `ecosystem.config.js`, which
  `deploy.sh` manages via `pm2 startOrReload ecosystem.config.js --env production`.
  Every deploy correctly pulled new code and tried to (re)start this process, but it
  could never bind port 5001 because `talentlens-api` already held it — so it
  crash-looped silently in the background (60 restarts, status `errored`, `0b` mem)
  while nginx kept routing all real traffic to the stale `talentlens-api` process.

In short: **every deploy "succeeded" on paper but never actually took effect**,
because `deploy.sh` only knows how to manage the app named `talentlenses` — it has
no awareness of a differently-named PM2 process squatting on the same port.

### Diagnosis Steps
```bash
# Compare the SAME endpoint with and without auth:
curl -s -D - https://<domain>/api/screen/daily-lists                       # no token -> 401 JSON (proves middleware is live)
curl -s -D - -H "Authorization: Bearer <token>" https://<domain>/api/screen/daily-lists  # -> 200 text/html = SPA fallback = route missing on live process

# On the VPS, list ALL pm2 processes (not just the one you expect):
pm2 list
# Look for MORE THAN ONE app, or restart counts / uptimes that don't match your latest deploy.

pm2 describe talentlens-api
# Confirmed script path was the same server/index.js — just a stale duplicate registration.
```

### Fix Applied
```bash
pm2 delete talentlens-api      # remove the stale duplicate holding port 5001
pm2 delete talentlenses        # clear its crash-loop history
git pull origin main
bash deploy.sh                 # pm2 startOrReload can now bind port 5001 cleanly
pm2 save                       # persist so talentlens-api can't resurface after reboot
pm2 list                       # confirm ONLY talentlenses, status online, 0 restarts
```
Verified afterward with an authenticated curl to `/api/screen/daily-lists` — now
returns real JSON (`{"lists":[...]}`) instead of `index.html`.

### Prevention
- After every deploy, run `pm2 list` and confirm **exactly one** app is listed and
  its name matches `ecosystem.config.js` (`talentlenses`) — don't just check that
  "an" app is online.
- Never start the app manually with a one-off `pm2 start server/index.js --name ...`;
  always use `pm2 startOrReload ecosystem.config.js` (via `deploy.sh`) so the app
  name stays consistent and `pm2 save` reflects the real desired state.
- A `200 OK` response with `Content-Type: text/html` from an API route is a red flag
  in any app that also serves its own SPA via Express — it means the route doesn't
  exist on the running process, not that the request succeeded.

---

## What Each User Is Responsible For

| Task | User |
|------|------|
| `pm2` commands | `talentlens` |
| `./deploy.sh` | `talentlens` |
| `git pull`, `npm install` inside `/home/talentlens/` | `talentlens` |
| `systemctl` (nginx, pm2 unit) | `root` |
| `apt install`, SSL certs, nginx config | `root` |
