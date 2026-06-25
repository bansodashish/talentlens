# TalentLens 🎯

**Find & screen top talent — worldwide, powered by AI.**

TalentLens is a self-hosted recruitment SaaS that combines:

- 🔎 **LinkedIn search** via Apify's `harvestapi/linkedin-profile-search` actor
- 🤖 **AI resume screening** powered by Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- 🔒 **OpenClaw local model mode** (privacy-first, runs on your VPS)
- ⚡ **Local keyword scoring** — free offline alternative with zero API costs
- 👥 **Candidate CRM** with statuses, HR notes, filters and side-panel profiles
- ⬇️ **CSV / Excel export** for shortlists and hand-offs

---

## 1 · Install & run locally

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- macOS / Linux / WSL (Windows works via WSL)

### Clone & install

```bash
git clone <your-fork-url> talentlens
cd talentlens

# Backend
cd server
npm install
cp .env.example .env       # then fill in the values (see §3)
cd ..

# Frontend
cd client
npm install --legacy-peer-deps
cd ..
```

### Start the dev servers

In two terminals:

```bash
# Terminal 1 — API on http://localhost:5001
cd server
npm run dev

# Terminal 2 — UI on http://localhost:3000
cd client
npm start
```

The first time the API boots, SQLite migrations create:

- `db/talentlens.db` (database file)
- `db/uploads/` (resume uploads)

Open <http://localhost:3000>, click **Start Free Trial**, register your first user and walk through the 4-step onboarding.

### Production build

```bash
cd client && npm run build       # outputs to client/build
cd ../server && NODE_ENV=production npm start
```

You can serve `client/build` from any static host (nginx, Vercel) and point the `proxy` setting / `REACT_APP_API_URL` at your API.

---

## 2 · API keys

TalentLens uses two third-party services. Each user can save their own keys in **Profile → API Keys**, or you can set workspace-wide fallbacks in `server/.env`.

### Apify (LinkedIn sourcing)

1. Create a free account at <https://apify.com>
2. Go to <https://console.apify.com/account/integrations>
3. Copy your **Personal API token** (format: `apify_api_…`)
4. Paste it in **TalentLens → Onboarding → Step 2** *or* set:
   ```env
   APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Claude (Resume screening)

1. Create an Anthropic account at <https://console.anthropic.com>
2. Go to <https://console.anthropic.com/settings/keys> and create a key (format: `sk-ant-…`)
3. Make sure your account has billing enabled — Claude is **not free**
4. Paste it in **TalentLens → Onboarding → Step 3** *or* set:
   ```env
   CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

> 💡 **Bring-your-own-key** is the recommended model: each recruiter pays Apify/Anthropic directly for usage, and TalentLens only charges for the workspace seat.

---

## 3 · `server/.env` reference

```env
# ── API ──────────────────────────────────────────────────────
PORT=5001
NODE_ENV=development

# ── Auth ─────────────────────────────────────────────────────
JWT_SECRET=replace-me-with-a-long-random-string
JWT_EXPIRES_IN=7d

# Used to encrypt per-user Apify / Claude keys at rest (AES-256-CBC).
# Generate one: `openssl rand -hex 32`
ENCRYPTION_KEY=replace-me-with-a-64-char-hex-string

# ── DB ───────────────────────────────────────────────────────
DB_PATH=../db/talentlens.db

# ── Workspace fallbacks (optional) ───────────────────────────
APIFY_TOKEN=
CLAUDE_API_KEY=

# ── Local model mode (optional) ──────────────────────────────
# OpenAI-compatible local endpoint (OpenClaw/Ollama/vLLM)
OPENCLAW_LOCAL_BASE_URL=http://127.0.0.1:11434/v1
OPENCLAW_LOCAL_MODEL=qwen2.5:7b-instruct
OPENCLAW_LOCAL_API_KEY=local-dev-key
OPENCLAW_LOCAL_TIMEOUT_MS=180000
OPENCLAW_LOCAL_MAX_TOKENS=2048
```

---

## 4 · First user & admin setup

The very first account you register through the UI becomes a **recruiter**. To promote it to **admin**, run:

```bash
cd server
node -e "require('./db').prepare(\"UPDATE users SET role='admin' WHERE id=1\").run(); console.log('done')"
```

Then sign out and back in — the **Admin** menu will appear, giving you access to:

- `/admin` — user management, role + plan assignment
- `/admin` — invite additional team members

To create more users without the UI, use the API:

```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane","email":"jane@acme.com","password":"strong-pass-123","market":"UK"}'
```

---

## 5 · Plans & usage limits

Stored on `users.plan`. Limits are enforced per calendar month directly from the `searches` and `screenings` tables — no separate counter table.

| Plan       | LinkedIn searches / mo | Resume screens / mo |
| ---------- | ---------------------- | ------------------- |
| Starter    | 100                    | 50                  |
| Growth     | 500                    | 200                 |
| Enterprise | Unlimited              | Unlimited           |

When a user hits a limit, the API returns `429` with `code: "PLAN_LIMIT_REACHED"` and the UI prompts an upgrade.

To change a user's plan from SQLite:

```bash
node -e "require('./db').prepare(\"UPDATE users SET plan='growth' WHERE email=?\").run('jane@acme.com')"
```

---

## 6 · Project layout

```
talentlens/
├── client/                  # React 18 + Tailwind (Create React App)
│   └── src/pages/           # Landing, Onboarding, Dashboard, Search, Screen, History…
├── server/                  # Node.js + Express + better-sqlite3
│   ├── routes/              # auth, search, screen, candidates, history, dashboard…
│   ├── services/            # linkedinSearchService, claudeScreener, cvParser…
│   ├── middleware/          # auth, planLimits
│   └── utils/               # encryption (AES-256-CBC)
├── db/
│   ├── schema.sql           # initial schema
│   ├── talentlens.db        # SQLite database (gitignored)
│   └── uploads/             # uploaded CVs
└── README.md
```

---

## 7 · Troubleshooting

| Symptom                                           | Fix                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Invalid Apify API key`                           | Re-copy from <https://console.apify.com/account/integrations>. The whole token starts with `apify_api_`. |
| `Invalid Claude API key`                          | Generate a new key at <https://console.anthropic.com/settings/keys> and ensure billing is enabled. |
| `Monthly limit reached on the starter plan`       | Upgrade the user's plan in `users.plan` (see §5).                                              |
| `EADDRINUSE: 5001`                                | Another nodemon is running. Kill with `lsof -ti:5001 \| xargs kill -9`.                        |
| Client won't start / `react-scripts not found`    | `cd client && npm install --legacy-peer-deps`                                                  |
| `Cannot find module 'ajv/dist/compile/codegen'`   | `cd client && npm install ajv@^8 --legacy-peer-deps`                                           |
| Resume parsed but "Email not available"           | Claude couldn't extract it — the candidate is still saved; add manually in the side panel.     |

---

## 8 · License

Proprietary — &copy; TalentLens. Contact the maintainer for licensing.
