# Candidate Sourcing Dashboard

React + Express project for HR candidate sourcing workflows using Apify and Google Sheets.

## Feasibility

This is technically feasible for sources and Apify Actors you are allowed to use. It should not be used to bypass LinkedIn, Glassdoor, or other site terms, login walls, robots restrictions, or privacy laws. Candidate email and phone fields should only be stored when the source is authorized, consented, or otherwise lawful for your recruiting process.

Recommended compliant flow:

1. Use Apify for permitted job-board, company career page, public profile, or owned-list enrichment workflows.
2. Store only the candidate fields needed for recruiting.
3. Mark source, consent basis, and scrape timestamp.
4. Let HR review rows before exporting to Google Sheets.

## Data Columns

- Name
- Role
- Company
- Location
- LinkedIn/Profile URL
- Email
- Phone
- Source
- Source URL
- Search query
- Scraped at

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend: http://localhost:5173

Backend: http://localhost:4000

## Environment

Set either `APIFY_ACTOR_ID` or `APIFY_TASK_ID`. Different Apify Actors use different input schemas, so the UI sends a generic payload:

```json
{
  "query": "supply chain manager",
  "location": "United Kingdom",
  "maxItems": 25,
  "sources": ["permitted-public-web"]
}
```

If your chosen Actor needs a different input shape, adjust `buildApifyInput` in `server/src/services/apifyService.js`.

For Google Sheets, create a service account, share the Sheet with the service account email, then set either:

- `GOOGLE_SERVICE_ACCOUNT_BASE64`, or
- `GOOGLE_APPLICATION_CREDENTIALS`

## Deploying

Hostinger can host the React build as static files. The Express API needs a Node-compatible host such as Hostinger VPS, Render, Railway, Fly.io, or a small cloud VM. Keep `.env` secrets on the server only.
