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

## What Each User Is Responsible For

| Task | User |
|------|------|
| `pm2` commands | `talentlens` |
| `./deploy.sh` | `talentlens` |
| `git pull`, `npm install` inside `/home/talentlens/` | `talentlens` |
| `systemctl` (nginx, pm2 unit) | `root` |
| `apt install`, SSL certs, nginx config | `root` |
