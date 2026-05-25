# CV Match AI — TypeScript/Node.js + React AI Agent

A recruiter-ready screening assistant for matching a CV/resume against a job description and returning a 1-5 fit rating, strengths, gaps, scoring explanations, role-family evidence, and exportable results.

The app supports four modes:

- `local`: weighted role-library scoring with no API keys.
- `openai`: AI-powered matching using OpenAI GPT-4 for intelligent resume analysis.
- `affinda`: uploads the resume and JD to Affinda, calls Search & Match, and normalizes the result to 1-5.
- `rchilli`: parses the resume and JD with RChilli and scores the structured output locally. Optional one-to-one match support can be enabled when your RChilli account payload is confirmed.

## Role Matching Strategy

Do not score only by common skills. Some roles overlap heavily:

- SRE, Platform Engineer, and DevOps Engineer often share Kubernetes, CI/CD, cloud, Linux, Terraform, and observability.
- Java Developer and Python Developer may share backend, SQL, REST, microservices, and cloud skills.
- Data Engineer and Data Analyst may share SQL, Python, dashboards, and data terminology.

The local scorer therefore checks:

- Skill match: what tools and technologies overlap.
- Role family match: whether the CV and JD belong to the same kind of role.
- Target role: a recruiter can choose a role library to score against explicit role expectations.
- Dynamic requirements: important JD terms are extracted even when they are not already in the built-in skill database.
- Scoring explanations: output includes the main score drivers and gaps for recruiter review.

Current role families and keyword coverage:

- `sre`: SLO/SLA, observability, incident management, on-call, Prometheus, Grafana, Kubernetes, cloud, Linux, automation.
- `platform_engineer`: Kubernetes platforms, Terraform, Helm, Backstage/internal developer portals, GitOps, self-service, service mesh, CI/CD.
- `devops_engineer`: CI/CD, Jenkins, GitLab, GitHub Actions, Azure DevOps, Docker, Kubernetes, Terraform, Ansible, cloud, artifact tooling.
- `java_developer`: Java, Spring Boot, Hibernate/JPA, microservices, REST, SQL, JUnit, Maven/Gradle, Kafka, cloud.
- `python_developer`: Python, Django, Flask, FastAPI, REST APIs, SQL, pytest, Celery, Pandas, Redis, Docker, cloud.
- `data_engineer`: Python, SQL, Spark/PySpark, Airflow, ETL/ELT, Snowflake, Databricks, dbt, Kafka, data lakes, warehouses.
- `data_analyst`: SQL, Excel, Power BI, Tableau, Looker, dashboards, reporting, statistics, KPIs, data cleaning, visualization.
- `ai_engineer`: Python, ML/deep learning, LLMs, GenAI, RAG, prompt engineering, LangChain, vector databases, PyTorch/TensorFlow, MLOps.
- `mainframe_engineer`: COBOL, JCL, DB2, CICS, VSAM, z/OS, TSO/ISPF, Endeavor/ChangeMan, REXX, batch scheduling.
- `dotnet_engineer`: C#, .NET/.NET Core, ASP.NET Core, Web API, Entity Framework, SQL Server, Azure, Azure DevOps, LINQ, testing.
- `qa_automation`: Selenium, Playwright, Cypress, API testing, Postman, pytest, TestNG/JUnit, Java/Python, CI/CD, Jira.

For a paid product, let customers customize role-family skill weights per company, because one company's "Platform Engineer" may be another company's "DevOps Engineer."

## Run Locally

```bash
python3 -m pip install -r requirements.txt
python3 app.py
```

Open:

```text
http://127.0.0.1:8000
```

Use a different port when needed:

```bash
PORT=8010 python3 app.py
```

## Environment

The app loads `.env` first, then `.env.example` for convenience. For real customer use, keep secrets in `.env` and leave `.env.example` as a template.

### Basic Auth

Basic auth is enabled by default.

```bash
export RECRUITER_USERNAME="recruiter"
export RECRUITER_PASSWORD="use-a-real-password"
```

For local development only:

```bash
export BASIC_AUTH_ENABLED=false
```

If no credentials are set, the fallback login is `recruiter` / `change-me`.

### CV Parsing

Local mode can extract text from `.txt`, `.rtf`, `.html`, `.docx`, and `.pdf` files. PDF support uses `pypdf` from `requirements.txt`. Affinda and RChilli can still be used for richer commercial resume parsing.

### OpenAI

Use OpenAI GPT-4 for intelligent CV matching and analysis:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-4"  # or "gpt-4-turbo", "gpt-3.5-turbo"
```

Get your API key from: https://platform.openai.com/api-keys

Benefits:
- AI-powered resume analysis
- Contextual skill matching
- Natural language explanations
- Flexible prompt-based scoring

Cost: Pay per token used (GPT-4 is ~$0.01-0.03 per 1K tokens)

### Affinda

```bash
export AFFINDA_API_KEY="aff_..."
export AFFINDA_REGION="api"
export AFFINDA_SSL_VERIFY="true"
```

Optional:

```bash
export AFFINDA_RESUME_UPLOAD_PATH="/v2/resumes"
export AFFINDA_JD_UPLOAD_PATH="/v2/job_descriptions"
export AFFINDA_MATCH_PATH="/v3/resume_search/match"
```

### SSL Certificate Troubleshooting

If Python raises `CERTIFICATE_VERIFY_FAILED` on macOS:

```bash
python3 -m pip install --upgrade certifi
```

Restart the app and check the startup line:

```text
HTTPS certificates: using CA bundle ...
```

If you are on a company network with SSL inspection, set your company CA bundle:

```bash
export SSL_CERT_FILE="/path/to/company-ca.pem"
```

For local testing only, you can temporarily bypass SSL verification:

```bash
export AFFINDA_SSL_VERIFY=false
i 
```

Do not use SSL bypass for customer demos or production.

### RChilli

```bash
export RCHILLI_USER_KEY="..."
export RCHILLI_SUB_USER_ID="your-company"
export RCHILLI_VERSION="8.0.0"
```

Optional:

```bash
export RCHILLI_RESUME_PARSE_URL="https://rest.rchilli.com/RChilliParser/Rchilli/parseResumeBinary"
export RCHILLI_JD_PARSE_URL="https://jdrest.rchilli.com/JDParser/RChilli/ParseJDText"
export RCHILLI_ONEMATCH_URL="https://searchengine.rchilli.com/RChilliSearchEngineAPI/RChilli/v4/oneMatch"
export RCHILLI_USE_ONEMATCH="false"
```

## API

`POST /api/match`

Multipart form fields:

- `provider`: `local`, `affinda`, or `rchilli`
- `target_role`: optional role-family id such as `devops_engineer`, `ai_engineer`, or `dotnet_engineer`
- `job_description`: plain text job description
- `resume`: uploaded CV file, or
- `resume_text`: pasted CV text

`GET /api/roles` returns the built-in recruiter role library used by the UI.

`POST /api/batch-match`

Supported request formats:

- `application/json`
- `multipart/form-data` with a CSV or XLSX file

JSON body:

- `provider`: `local`, `affinda`, or `rchilli`
- `target_role`: optional role-family id such as `devops_engineer` or `python_developer`
- `job_description`: plain text job description applied to the whole batch
- `shortlist_threshold`: optional rating threshold, defaults to `4`
- `candidates`: array of candidate objects

Each candidate object currently supports:

- `candidate_id`: optional external id
- `name`: optional display name
- `email`: optional email
- `job_description`: optional per-candidate JD override
- `resume_text`: required parsed or pasted CV text
- `shortlist_threshold`: optional per-candidate override

Multipart form fields for spreadsheet upload:

- `provider`: `local`, `affinda`, or `rchilli`
- `target_role`: optional role-family id
- `job_description`: plain text job description applied to the whole batch
- `shortlist_threshold`: optional rating threshold, defaults to `4`
- `batch_file`: CSV or XLSX file containing candidates

Spreadsheet columns currently supported:

- `candidate_id`
- `name`
- `email`
- `job_description`
- `resume_text`
- `skills`
- `experience`
- `location`
- `shortlist_threshold`

If `job_description` is present in a spreadsheet row, it overrides the common JD entered in the batch form for that candidate.

Example files:

- `/Users/bansoash/Downloads/job_hunt/examples/sample_batch_candidates.csv`
- `/Users/bansoash/Downloads/job_hunt/examples/backend_engineer_acquire_jd.txt`
- `/Users/bansoash/Downloads/job_hunt/examples/sample_backend_engineer_acquire_batch.csv`
- `/Users/bansoash/Downloads/job_hunt/examples/sample_backend_engineer_acquire_batch.xlsx`
- `/Users/bansoash/Downloads/job_hunt/examples/qa_automation_jd.txt`
- `/Users/bansoash/Downloads/job_hunt/examples/sample_qa_automation_batch.csv`

For XLSX uploads, install dependencies from `requirements.txt` so `openpyxl` is available.

Example batch request:

```json
{
  "provider": "local",
  "target_role": "python_developer",
  "job_description": "We need a Python backend engineer with FastAPI, SQL, Docker, and AWS.",
  "shortlist_threshold": 4,
  "candidates": [
    {
      "candidate_id": "cand-001",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "resume_text": "Python developer with FastAPI, PostgreSQL, Docker, and AWS experience."
    },
    {
      "candidate_id": "cand-002",
      "name": "John Smith",
      "email": "john@example.com",
      "resume_text": "Backend engineer with Django, Redis, and Azure exposure."
    }
  ]
}
```

Example batch response:

```json
{
  "provider": "local",
  "targetRole": "python_developer",
  "processedCandidates": 2,
  "matchedCandidates": 2,
  "shortlistedCandidates": 1,
  "errorCandidates": 0,
  "results": [
    {
      "candidateId": "cand-001",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "score": 0.81,
      "rating": 5,
      "label": "Excellent match",
      "recommendation": "Prioritize for recruiter review",
      "shortlisted": true,
      "strengths": ["Matched required skills: python, fastapi, docker"],
      "gaps": [],
      "details": {}
    }
  ]
}
```

Example response:

```json
{
  "provider": "local",
  "score": 0.74,
  "rating": 4,
  "label": "Strong match",
  "recommendation": "Shortlist for recruiter review",
  "strengths": ["Matched required skills: python, selenium"],
  "gaps": ["Missing or unclear skills: playwright"],
  "details": {
    "skills": 0.7,
    "experience": 0.8,
    "title": 0.6,
    "explanations": [
      "Skill coverage matched 12 of 18 detected role/JD requirements."
    ]
  }
}
```

## Customer-Ready Notes

For production, add:

- Customer workspaces and per-customer role-library customization.
- Encrypted storage or no-storage processing.
- Audit logs for every match decision.
- Bias controls: PII redaction, explainable scoring, and human-review-only positioning.
- Billing limits per customer.
- Vendor fallback: if Affinda/RChilli is down, queue the request or use local scoring as a draft.
