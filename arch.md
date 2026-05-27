# TalentLens — Architecture & Integration Flows

---

## 1. System Overview

```mermaid
graph TB
    Browser["🖥️ React Client\n(localhost:3000)"]
    Server["⚙️ Express API\n(localhost:5001)"]
    SQLite[("🗄️ SQLite DB\ntalentlens.db")]

    subgraph External APIs
        Apollo["🚀 Apollo.io\napi.apollo.io/api/v1"]
        Apify["🕷️ Apify\napi.apify.com/v2"]
        Reed["🔴 Reed.co.uk\nreed.co.uk/recruiter/api"]
        Claude["🤖 Anthropic Claude\napi.anthropic.com/v1"]
        OpenAI["🧠 OpenAI\napi.openai.com"]
        Sheets["📊 Google Sheets\nsheets.googleapis.com"]
    end

    Browser -->|"JWT in headers"| Server
    Server <--> SQLite
    Server --> Apollo
    Server --> Apify
    Server --> Reed
    Server --> Claude
    Server --> OpenAI
    Server --> Sheets
```

---

## 2. Authentication & API Key Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express API
    participant DB as SQLite

    U->>S: POST /api/auth/register { name, email, password }
    S->>DB: INSERT users (bcrypt hash)
    S-->>U: { token (JWT 7d), user }

    U->>S: POST /api/auth/login { email, password }
    S->>DB: SELECT user, compare bcrypt
    S-->>U: { token, user (no keys) }

    Note over U,S: Every protected request
    U->>S: Any /api/* + Authorization: Bearer <token>
    S->>S: authMiddleware verifies JWT
    S->>DB: SELECT user row for req.user.id

    Note over U,S: Saving an API key
    U->>S: PUT /api/auth/me { apollo_key, apify_key, claude_key }
    S->>S: AES-256-CBC encrypt(key, SHA256(JWT_SECRET))
    S->>DB: UPDATE users SET apollo_key_enc = ?

    Note over U,S: Reading a key (server-side use)
    S->>DB: SELECT apollo_key_enc FROM users WHERE id=?
    S->>S: decrypt(apollo_key_enc) → raw key
    S->>S: fallback to process.env.APOLLO_API_KEY
```

---

## 3. Candidate Search — Platform Selection Flow

```mermaid
flowchart TD
    UI["Candidate Search Page\n/candidate-search"]
    Pick{Platform selected?}

    UI --> Pick
    Pick -->|Apollo.io| ApolloFlow["Apollo Search Flow"]
    Pick -->|LinkedIn| LinkedInFlow["LinkedIn / Apify Flow"]
    Pick -->|CV-Library| CVLibFlow["CV-Library / Apify Flow"]
    Pick -->|Reed.co.uk| ReedFlow["Reed Search Flow"]

    ApolloFlow --> SaveSearch["POST /api/search/save\n→ candidates table\nsource = 'apollo'"]
    LinkedInFlow --> ImportScraper["POST /api/scraper/import\n→ candidates table\nsource = 'linkedin'"]
    CVLibFlow --> ImportScraper
    ReedFlow --> ImportScraper
```

---

## 4. Apollo.io Search Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express /api/search/apollo
    participant DB as SQLite
    participant A as Apollo API<br/>api.apollo.io/api/v1

    U->>S: POST /search/apollo<br/>{ jobTitle, location, experienceLevel, maxResults }
    S->>S: authMiddleware (JWT check)
    S->>S: limitSearches (plan quota check)
    S->>DB: SELECT apollo_key_enc FROM users WHERE id=?
    S->>S: decrypt(apollo_key_enc) OR env.APOLLO_API_KEY
    alt No key configured
        S-->>U: 503 "Apollo is not configured"
    end
    S->>DB: INSERT searches (status='running', source='apollo')
    S->>A: POST /mixed_people/search<br/>x-api-key: <key><br/>{ person_titles, person_locations, person_seniorities, page, per_page }
    A-->>S: { people: [...] }
    S->>S: normalise each person →<br/>{ name, headline, email, phone, location,<br/>current_title, current_company, skills[],<br/>source:'apollo', apollo_id, profileUrl }
    S->>S: dedupeCandidates() by profileUrl/email
    S->>DB: UPDATE searches SET status='completed', results=JSON
    S->>DB: INSERT activities (type='apollo_search')
    S-->>U: { searchId, count, candidates[] }

    Note over U,S: User clicks "Import to TalentLens"
    U->>S: POST /search/save<br/>{ searchId, candidates[] }
    S->>DB: dedup check linkedin_url / email
    S->>DB: INSERT candidates (source='apollo')
    S-->>U: { inserted, skipped }
```

---

## 5. LinkedIn / Apify Search Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express /api/scraper/search
    participant DB as SQLite
    participant Ap as Apify<br/>api.apify.com/v2

    U->>S: POST /scraper/search<br/>{ query, location, maxItems, platform:'linkedin' }
    S->>S: authMiddleware (JWT check)
    S->>DB: SELECT apify_key_enc FROM users
    S->>S: decrypt OR env.APIFY_TOKEN
    S->>DB: INSERT scraper_sessions (status='pending')
    S->>Ap: POST /acts/<APIFY_LINKEDIN_ACTOR_ID>/runs<br/>?token=&waitForFinish=300<br/>{ searchUrl, maxResults }
    Note over S,Ap: Apify runs LinkedIn actor<br/>(30–120 seconds)
    Ap-->>S: { data: { id, defaultDatasetId, status } }
    loop Poll every 5s (max 2 min)
        S->>Ap: GET /actor-runs/<runId>?token=
        Ap-->>S: { status: RUNNING | SUCCEEDED }
    end
    S->>Ap: GET /datasets/<datasetId>/items?token=&limit=N
    Ap-->>S: [ { name, headline, linkedinUrl, ... } ]
    S->>S: normaliseCandidate() → standard shape
    S->>DB: UPDATE scraper_sessions (status='completed', results=JSON)
    S-->>U: { sessionId, candidates[] }

    Note over U,S: User clicks "Import"
    U->>S: POST /scraper/import { candidates[], sessionId }
    S->>DB: dedup check linkedin_url / email
    S->>DB: INSERT candidates (source='linkedin')
    S->>DB: UPDATE scraper_sessions.imported_count
    S-->>U: { imported, skipped }
```

---

## 6. CV-Library / Apify Search Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express /api/scraper/search
    participant Ap as Apify<br/>api.apify.com/v2

    U->>S: POST /scraper/search<br/>{ query, location, platform:'cvlibrary' }
    S->>Ap: POST /acts/<APIFY_CVLIBRARY_ACTOR_ID>/runs<br/>{ keywords, location, maxItems }
    Note over S,Ap: Same poll loop as LinkedIn
    Ap-->>S: [ { candidateName, jobTitle, location, ... } ]
    S->>S: normalise → standard shape<br/>source = 'cvlibrary'
    S-->>U: { sessionId, candidates[] }
```

---

## 7. Reed.co.uk Search Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express /api/scraper/search
    participant R as Reed Recruiter API<br/>reed.co.uk/recruiter/api/1.0

    U->>S: POST /scraper/search<br/>{ query, location, platform:'reed' }
    S->>S: env.REED_API_KEY → Basic Auth header
    alt No key
        S-->>U: 503 "Reed API key not configured"
    end
    S->>R: GET /cvsearch<br/>Authorization: Basic base64(key:)<br/>?keywords=&location=&distanceFromLocation=25
    R-->>S: { candidateId, firstName, lastName, desiredJobTitle, ... }
    S->>S: normalise → { name, email, phone, skills, source:'reed', ... }
    S-->>U: { sessionId, candidates[] }
```

---

## 8. AI Resume Screener Flow (Claude / Local)

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express /api/screen/resume
    participant DB as SQLite
    participant C as Anthropic API<br/>api.anthropic.com/v1/messages
    participant Loc as Local Scorer<br/>(openaiScorer.js)

    U->>S: POST /screen/resume (multipart)<br/>files: [cv1.pdf, cv2.pdf, ...]<br/>fields: { jobDescription, targetRole }
    S->>S: authMiddleware + limitScreenings
    S->>DB: SELECT claude_key_enc FROM users
    S->>S: decrypt OR env.ANTHROPIC_API_KEY
    S->>S: parseCV(file) → extract plain text<br/>(mammoth for docx, pdf-parse for pdf)
    S->>S: batchId = uuid()

    loop Each uploaded CV
        alt Claude key available
            S->>C: POST /messages<br/>model: claude-sonnet-4-20250514<br/>{ system: recruiter prompt,<br/>  content: [PDF doc + JD text] }
            C-->>S: { supply_chain_score, procurement_score,<br/>logistics_score, technology_score,<br/>overall_score, recommendation, summary }
        else No Claude key
            S->>Loc: scoreCandidate(cvText, jd, role)
            Loc-->>S: { score_pct, strengths, gaps, ... }
            S->>S: map to screening shape (local)
        end
        S->>DB: INSERT screenings (batch_id, scores, summary)
    end

    S->>DB: SELECT screenings WHERE batch_id=? ORDER BY overall_score DESC
    S-->>U: { batchId, results: [...ranked screenings] }
```

---

## 9. CV / Job Match Flow (OpenAI)

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express /api/candidates/:id/match
    participant DB as SQLite
    participant O as OpenAI<br/>api.openai.com/v1

    U->>S: POST /candidates/:id/match { jobId }
    S->>DB: SELECT candidate cv_text, job description
    S->>O: POST /chat/completions<br/>model: gpt-4o-mini<br/>{ cv_text + job_description }
    O-->>S: { score, strengths, gaps, recommendation }
    S->>DB: INSERT cv_matches
    S-->>U: { score, label, details }
```

---

## 10. Google Sheets Export Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Express /api/scraper/export-sheets
    participant G as Google Sheets API

    U->>S: POST /scraper/export-sheets { candidates[] }
    S->>S: load GOOGLE_SERVICE_ACCOUNT_BASE64<br/>→ parse JSON credentials
    S->>G: auth.getClient() → JWT service account
    S->>G: sheets.spreadsheets.values.append<br/>spreadsheetId: env.GOOGLE_SHEET_ID<br/>range: Sheet1!A1
    G-->>S: { updatedRows }
    S-->>U: { exported: N }
```

---

## 11. Plan Limits (Rate Limiting)

```mermaid
flowchart LR
    Req["Incoming Request\n(search or screen)"] --> Mid["limitSearches /\nlimitScreenings\nmiddleware"]
    Mid --> DB[("SQLite\nCOUNT searches/screenings\nthis calendar month")]
    DB --> Check{used >= limit?}
    Check -->|Yes| Reject["429 PLAN_LIMIT_REACHED"]
    Check -->|No| Handler["Route handler continues"]

    subgraph Plan Limits
        S["starter: 100 searches / 50 screenings"]
        G["growth: 500 searches / 200 screenings"]
        E["enterprise: unlimited"]
    end
```

---

## 12. Database Tables & Relationships

```mermaid
erDiagram
    users {
        int id PK
        text name
        text email
        text password
        text role
        text plan
        text market
        text apify_key_enc
        text claude_key_enc
        text apollo_key_enc
        int onboarding_complete
    }
    jobs {
        int id PK
        text title
        text description
        text location
        text market
        text status
        int created_by FK
    }
    candidates {
        int id PK
        text name
        text email
        text phone
        text source
        text source_url
        text linkedin_url
        text cv_path
        text cv_text
        text skills_json
        int search_id FK
        int created_by FK
    }
    searches {
        int id PK
        text job_title
        text location
        text source
        int results_count
        text status
        text results
        int created_by FK
    }
    scraper_sessions {
        int id PK
        text query
        text platform
        int results_count
        int imported_count
        text status
        int created_by FK
    }
    applications {
        int id PK
        int job_id FK
        int candidate_id FK
        text status
        int ai_match_score
    }
    cv_matches {
        int id PK
        int candidate_id FK
        int job_id FK
        text provider
        int score_pct
        text recommendation
    }
    screenings {
        int id PK
        text batch_id
        int overall_score
        text recommendation
        text raw_json
        int created_by FK
    }
    activities {
        int id PK
        text type
        text entity_type
        int entity_id
        int user_id FK
    }

    users ||--o{ jobs : creates
    users ||--o{ candidates : creates
    users ||--o{ searches : runs
    users ||--o{ scraper_sessions : runs
    users ||--o{ screenings : runs
    candidates ||--o{ applications : has
    jobs ||--o{ applications : has
    candidates ||--o{ cv_matches : has
    jobs ||--o{ cv_matches : has
    searches ||--o{ candidates : produces
```

---

## 13. Full API Route Map

| Method | Route | Auth | Service | External Call |
|--------|-------|------|---------|---------------|
| POST | `/api/auth/register` | — | bcrypt | — |
| POST | `/api/auth/login` | — | bcrypt + JWT | — |
| GET | `/api/auth/me` | JWT | — | — |
| GET | `/api/auth/me/keys` | JWT | AES-256 decrypt | — |
| PUT | `/api/auth/me` | JWT | AES-256 encrypt | — |
| GET | `/api/jobs` | JWT | — | — |
| POST | `/api/jobs` | JWT | — | — |
| GET | `/api/candidates` | JWT | — | — |
| POST | `/api/candidates` | JWT | — | — |
| POST | `/api/candidates/:id/match` | JWT | openaiScorer | OpenAI GPT-4o-mini |
| **POST** | **`/api/search/apollo`** | **JWT + plan** | **apolloService** | **Apollo.io** |
| POST | `/api/search/linkedin` | JWT + plan | linkedinSearchService | Apify (harvestapi actor) |
| POST | `/api/search/save` | JWT | — | — |
| GET | `/api/search/history` | JWT | — | — |
| POST | `/api/scraper/search` | JWT | apifyService / reedService | Apify or Reed API |
| POST | `/api/scraper/import` | JWT | — | — |
| POST | `/api/scraper/export-sheets` | JWT | sheetsService | Google Sheets API |
| GET | `/api/scraper/platforms` | JWT | — | — |
| GET | `/api/scraper/test-connection` | JWT | apifyService | Apify |
| POST | `/api/screen/resume` | JWT + plan | claudeScreener / scorer | Anthropic Claude |
| GET | `/api/screen/history` | JWT | — | — |
| GET | `/api/history` | JWT | — | — |
| GET | `/api/dashboard` | JWT | — | — |
| GET | `/api/users` | JWT + admin | — | — |
| GET | `/api/health` | — | — | — |

---

## 14. Environment Variables Reference

| Variable | Required | Used By |
|----------|----------|---------|
| `JWT_SECRET` | ✅ | Auth signing + AES-256 key derivation |
| `APOLLO_API_KEY` | fallback | Apollo search (per-user key takes priority) |
| `APIFY_TOKEN` | fallback | LinkedIn + CV-Library scraper |
| `APIFY_LINKEDIN_ACTOR_ID` | for LinkedIn | Apify actor for LinkedIn profiles |
| `APIFY_CVLIBRARY_ACTOR_ID` | for CV-Lib | Apify actor for CV-Library |
| `REED_API_KEY` | for Reed | Reed Recruiter API |
| `ANTHROPIC_API_KEY` | fallback | Claude resume screener |
| `OPENAI_API_KEY` | optional | CV/job match scoring |
| `GOOGLE_SHEET_ID` | optional | Google Sheets export |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | optional | Google Sheets auth |
| `PORT` | optional | Express port (default 5001) |
| `DB_PATH` | optional | SQLite file path |
