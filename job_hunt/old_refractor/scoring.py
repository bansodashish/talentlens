import re
from collections import Counter


COMMON_SKILLS = {
    ".net", ".net core", "ai", "airflow", "agile", "ansible", "apache spark",
    "api gateway", "api testing", "appium", "asp.net", "asp.net core", "aws",
    "azure", "azure devops", "bash", "bdd", "bigquery", "bitbucket", "c#",
    "cics", "ci/cd", "cloudformation", "cobol", "confluence", "cucumber",
    "cypress", "data analysis", "data modeling", "data warehouse", "databricks",
    "db2", "dbt", "django", "docker", "dynatrace", "ef core", "elt",
    "entity framework", "excel", "fastapi", "flask", "gcp", "git", "github",
    "github actions", "gitlab", "gitops", "grafana", "gradle", "helm",
    "hibernate", "html", "ibm z/os", "incident management", "java",
    "javascript", "jenkins", "jira", "jcl", "jmeter", "junit", "kafka",
    "kubernetes", "langchain", "linux", "llm", "mainframe", "machine learning",
    "maven", "microservices", "mlops", "mongodb", "mysql", "node.js",
    "observability", "openshift", "pandas", "playwright", "postman",
    "postgresql", "power bi", "prometheus", "pyspark", "pytest", "python",
    "rag", "react", "rest", "robot framework", "scrum", "selenium",
    "snowflake", "soap", "spark", "spring", "spring boot", "sql",
    "sql server", "ssis", "statistics", "tableau", "terraform", "testng",
    "typescript", "unit testing", "vector database", "vue", "vsam"
}

ROLE_PROFILES = {
    "sre": {
        "titles": {
            "sre", "site reliability engineer", "reliability engineer",
            "production reliability engineer"
        },
        "skills": {
            "linux", "kubernetes", "docker", "aws", "azure", "gcp", "terraform",
            "prometheus", "grafana", "incident management", "slo", "sla",
            "observability", "ci/cd", "python", "bash", "on-call", "runbooks",
            "pagerduty", "datadog", "new relic", "elk", "splunk", "gitops"
        },
    },
    "platform_engineer": {
        "titles": {
            "platform engineer", "developer platform engineer",
            "internal developer platform engineer", "cloud platform engineer"
        },
        "skills": {
            "kubernetes", "docker", "terraform", "helm", "aws", "azure", "gcp",
            "ci/cd", "gitlab", "github actions", "jenkins", "linux", "python",
            "bash", "observability", "backstage", "idp", "developer portal",
            "self-service", "golden paths", "crossplane", "argocd", "flux",
            "openshift", "istio", "service mesh"
        },
    },
    "devops_engineer": {
        "titles": {
            "devops engineer", "cloud devops engineer", "aws devops engineer",
            "azure devops engineer", "devsecops engineer"
        },
        "skills": {
            "jenkins", "gitlab", "github actions", "ci/cd", "docker",
            "kubernetes", "terraform", "aws", "azure", "gcp", "linux", "bash",
            "python", "ansible", "cloudformation", "azure devops", "git",
            "helm", "prometheus", "grafana", "sonarqube", "nexus", "artifactory"
        },
    },
    "java_developer": {
        "titles": {
            "java developer", "java engineer", "backend java developer",
            "java software engineer", "spring boot developer"
        },
        "skills": {
            "java", "spring", "spring boot", "hibernate", "microservices",
            "rest", "sql", "postgresql", "mysql", "junit", "maven", "gradle",
            "kafka", "jpa", "spring security", "spring cloud", "mockito",
            "oracle", "mongodb", "aws", "azure", "gcp"
        },
    },
    "python_developer": {
        "titles": {
            "python developer", "python engineer", "backend python developer",
            "python software engineer", "django developer"
        },
        "skills": {
            "python", "django", "flask", "fastapi", "rest", "sql",
            "postgresql", "mysql", "pytest", "celery", "pandas", "numpy",
            "sqlalchemy", "redis", "rabbitmq", "asyncio", "api development",
            "docker", "aws", "azure", "gcp"
        },
    },
    "data_engineer": {
        "titles": {
            "data engineer", "big data engineer", "etl developer",
            "analytics engineer", "cloud data engineer"
        },
        "skills": {
            "python", "sql", "spark", "pyspark", "airflow", "etl", "elt",
            "data warehouse", "snowflake", "databricks", "aws", "azure", "gcp",
            "kafka", "dbt", "bigquery", "redshift", "synapse", "data lake",
            "delta lake", "data modeling", "orchestration", "sql server",
            "informatica", "ssis"
        },
    },
    "data_analyst": {
        "titles": {
            "data analyst", "business data analyst", "reporting analyst",
            "business intelligence analyst", "bi analyst"
        },
        "skills": {
            "sql", "excel", "power bi", "tableau", "data analysis", "statistics",
            "dashboard", "reporting", "python", "pandas", "looker", "qlik",
            "data visualization", "data cleaning", "kpi", "metrics", "a/b testing",
            "google analytics", "power query"
        },
    },
    "ai_engineer": {
        "titles": {
            "ai engineer", "machine learning engineer", "ml engineer",
            "generative ai engineer", "llm engineer", "applied ai engineer"
        },
        "skills": {
            "python", "machine learning", "deep learning", "llm", "generative ai",
            "rag", "prompt engineering", "langchain", "llamaindex",
            "vector database", "pinecone", "weaviate", "chromadb", "faiss",
            "pytorch", "tensorflow", "scikit-learn", "hugging face", "mlops",
            "model deployment", "model evaluation", "feature engineering",
            "docker", "kubernetes", "aws", "azure", "gcp"
        },
    },
    "mainframe_engineer": {
        "titles": {
            "mainframe engineer", "mainframe developer", "cobol developer",
            "mainframe programmer", "mainframe analyst"
        },
        "skills": {
            "mainframe", "cobol", "jcl", "db2", "cics", "vsam", "ibm z/os",
            "zos", "tso", "ispf", "endeavor", "changeman", "rexx", "ims",
            "pl/i", "file-aid", "xpeditor", "batch processing", "job scheduling",
            "ca7", "control-m"
        },
    },
    "dotnet_engineer": {
        "titles": {
            ".net engineer", ".net developer", "dotnet engineer",
            "dotnet developer", "c# developer", "c# engineer",
            "asp.net developer"
        },
        "skills": {
            ".net", ".net core", "c#", "asp.net", "asp.net core", "mvc",
            "web api", "rest", "microservices", "entity framework", "ef core",
            "sql server", "azure", "azure devops", "linq", "unit testing",
            "xunit", "nunit", "blazor", "wpf", "windows services", "iis",
            "docker", "kubernetes"
        },
    },
    "qa_automation": {
        "titles": {"automation engineer", "qa automation engineer", "test automation engineer"},
        "skills": {
            "selenium", "playwright", "cypress", "api testing", "postman",
            "pytest", "testng", "junit", "java", "python", "ci/cd", "jira"
        },
    },
}

STOPWORDS = {
    "and", "or", "the", "a", "an", "to", "of", "in", "for", "with", "on",
    "at", "by", "from", "as", "is", "are", "be", "will", "this", "that",
    "you", "we", "our", "your", "candidate", "job", "role", "work", "have",
    "has", "using", "use", "used", "need", "needs", "required", "require",
    "responsible", "experience", "years", "year", "team", "teams", "good",
    "strong", "knowledge", "understanding", "ability", "skills", "skill",
    "developer", "engineer", "backend", "frontend", "fullstack", "senior",
    "junior", "lead", "manager", "analyst", "description", "looking"
}

SKILL_CONTEXT_WORDS = {
    "technology", "technologies", "tool", "tools",
    "framework", "frameworks", "database", "databases",
    "language", "languages", "library", "libraries",
    "stack", "stacks"
}


def normalize_text(text):
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def clean_token(token):
    return token.strip(".,:;!?()[]{}<>\"'").lower()


def contains_term(text, term):
    return re.search(rf"(?<![a-z0-9+#./-]){re.escape(term)}(?![a-z0-9+#./-])", text) is not None


# ── Module-level precomputed structures (built once on import) ─────────────
# Merge all role skills into one set
_ALL_ROLE_SKILLS: set = set()
for _p in ROLE_PROFILES.values():
    _ALL_ROLE_SKILLS |= _p["skills"]
_ALL_KNOWN_SKILLS: set = COMMON_SKILLS | _ALL_ROLE_SKILLS

# One combined regex that finds every known skill in a single pass
_SKILL_RE = re.compile(
    r"(?<![a-z0-9+#./-])(" +
    "|".join(re.escape(s) for s in sorted(_ALL_KNOWN_SKILLS, key=len, reverse=True)) +
    r")(?![a-z0-9+#./-])"
)

# Per-family combined regexes for fast detect_role_family
_FAMILY_RE: dict = {}
for _fam, _prof in ROLE_PROFILES.items():
    _FAMILY_RE[_fam] = (
        re.compile(
            r"(?<![a-z0-9+#./-])(" +
            "|".join(re.escape(t) for t in sorted(_prof["titles"], key=len, reverse=True)) +
            r")(?![a-z0-9+#./-])"
        ),
        re.compile(
            r"(?<![a-z0-9+#./-])(" +
            "|".join(re.escape(s) for s in sorted(_prof["skills"], key=len, reverse=True)) +
            r")(?![a-z0-9+#./-])"
        ),
    )

# Combined regex for all job titles (used in extract_title_hint)
_all_titles: list = []
for _prof in ROLE_PROFILES.values():
    _all_titles.extend(_prof["titles"])
_all_titles += ["automation engineer", "qa engineer", "test engineer",
                "software engineer", "product manager", "business analyst"]
_TITLE_RE = re.compile(
    r"(?<![a-z0-9+#./-])(" +
    "|".join(re.escape(t) for t in sorted(set(_all_titles), key=len, reverse=True)) +
    r")(?![a-z0-9+#./-])"
)


def role_library():
    labels = {
        "ai_engineer": "AI Engineer",
        "dotnet_engineer": ".NET Engineer",
        "qa_automation": "QA Automation",
        "sre": "SRE",
    }
    return [
        {
            "id": family,
            "label": labels.get(family, family.replace("_", " ").title()),
            "titles": sorted(profile["titles"]),
            "skills": sorted(profile["skills"]),
        }
        for family, profile in sorted(ROLE_PROFILES.items())
    ]


def extract_skills(text):
    # Single-pass: find all known skills at once via pre-compiled regex
    found = set(_SKILL_RE.findall(text))
    tokens = [clean_token(token) for token in re.findall(r"[a-z][a-z0-9+#./-]{2,}", text)]
    technical = {
        token for token in tokens
        if token not in STOPWORDS
        and (token in _ALL_KNOWN_SKILLS or any(ch in token for ch in "+#./"))
    }
    return sorted(found | technical)


def extract_dynamic_requirements(text):
    normalized = normalize_text(text)
    role_skills = set()
    for profile in ROLE_PROFILES.values():
        role_skills |= profile["skills"]

    known_terms = {
        skill for skill in (COMMON_SKILLS | role_skills)
        if contains_term(normalized, skill)
    }
    tokens = [
        clean_token(token)
        for token in re.findall(r"[a-z][a-z0-9+#./-]{1,}", normalized)
    ]
    tokens = [token for token in tokens if token]
    candidates = set()

    for index, token in enumerate(tokens):
        if token in STOPWORDS or len(token) < 2:
            continue
        window = tokens[max(0, index - 4): index + 5]
        looks_technical = (
            token in known_terms
            or any(ch in token for ch in "+#./")
            or any(char.isdigit() for char in token)
            or any(context in window for context in SKILL_CONTEXT_WORDS)
        )
        if looks_technical:
            candidates.add(token)

    for phrase in re.findall(r"\b[a-z][a-z0-9+#./-]+(?:\s+[a-z][a-z0-9+#./-]+){1,3}\b", normalized):
        words = phrase.split()
        if any(word in STOPWORDS for word in words):
            continue
        if phrase in known_terms or any(word in SKILL_CONTEXT_WORDS for word in words):
            candidates.add(phrase)

    return sorted(known_terms | candidates)


def extract_location(text):
    """Extract location from text using common patterns."""
    normalized = normalize_text(text)
    
    # Check for remote work indicators
    if re.search(r"\b(remote|work from home|wfh|fully remote|100% remote)\b", normalized):
        return "remote"
    
    # Look for location patterns
    # Pattern: City, State abbreviation (e.g., San Francisco, CA)
    location_patterns = [
        r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b",  # City, ST
        r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z][a-z]+)\b",  # City, State
        r"location(?:\s*:)?\s*([A-Z][a-z]+(?:(?:\s+|,\s*)[A-Z][a-z]+){0,3})",  # Location: City...
        r"based in\s+([A-Z][a-z]+(?:(?:\s+|,\s*)[A-Z][a-z]+){0,3})",  # Based in City
    ]
    
    for pattern in location_patterns:
        match = re.search(pattern, text)
        if match:
            if len(match.groups()) > 1:
                return f"{match.group(1)}, {match.group(2)}".lower()
            return match.group(1).lower()
    
    return None


def extract_years(text):
    normalized = normalize_text(text)
    matches = re.findall(r"(\d{1,2})\+?\s*(?:years|yrs|year)", normalized)
    return max([int(value) for value in matches], default=0)


def extract_title_hint(text):
    m = _TITLE_RE.search(text)
    return m.group(1) if m else ""


def detect_role_family(text):
    best_family = ""
    best_score = 0
    for family, (title_re, skill_re) in _FAMILY_RE.items():
        title_hits = len(title_re.findall(text))
        skill_hits = len(skill_re.findall(text))
        score = title_hits * 4 + skill_hits
        if score > best_score:
            best_family = family
            best_score = score
    return best_family, best_score


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def rating_from_score(score):
    if score <= 0.2:
        return 1, "Poor match"
    if score <= 0.4:
        return 2, "Weak match"
    if score <= 0.6:
        return 3, "Moderate match"
    if score <= 0.8:
        return 4, "Strong match"
    return 5, "Excellent match"


def recommendation_from_rating(rating):
    if rating >= 5:
        return "Prioritize for recruiter review"
    if rating == 4:
        return "Shortlist for recruiter review"
    if rating == 3:
        return "Review manually if the talent pool is limited"
    return "Do not shortlist without additional evidence"


def local_match(resume_text, job_description, provider="local", raw=None, target_role="", jd_cache=None):
    # Truncate to keep regex fast on very large documents
    resume = normalize_text((resume_text or "")[:4000])
    job = normalize_text((job_description or "")[:4000])

    resume_skills = set(extract_skills(resume))

    # Cache JD analysis — same JD is reused across all candidates in a batch
    if jd_cache is not None and "job_skills" in jd_cache:
        job_skills      = jd_cache["job_skills"]
        job_years       = jd_cache["job_years"]
        job_title       = jd_cache["job_title"]
        job_family      = jd_cache["job_family"]
        job_family_hits = jd_cache["job_family_hits"]
        job_terms       = jd_cache["job_terms"]
    else:
        job_skills      = set(extract_skills(job))
        job_years       = extract_years(job)
        job_title       = extract_title_hint(job)
        job_family, job_family_hits = detect_role_family(job)
        job_terms       = Counter(
            token for token in (clean_token(item) for item in re.findall(r"[a-z][a-z0-9+#./-]{2,}", job))
            if token and token not in STOPWORDS
        )
        if jd_cache is not None:
            jd_cache["job_skills"]      = job_skills
            jd_cache["job_years"]       = job_years
            jd_cache["job_title"]       = job_title
            jd_cache["job_family"]      = job_family
            jd_cache["job_family_hits"] = job_family_hits
            jd_cache["job_terms"]       = job_terms

    target_role = (target_role or "").strip()
    if target_role in ROLE_PROFILES:
        job_skills = job_skills | ROLE_PROFILES[target_role]["skills"]
    
    matched_skills = sorted(resume_skills & job_skills)
    missing_skills = sorted(job_skills - resume_skills)
    skill_score = len(matched_skills) / len(job_skills) if job_skills else 0.45

    resume_years = extract_years(resume)
    if job_years:
        experience_score = clamp(resume_years / job_years)
    else:
        experience_score = 0.65 if resume_years else 0.45

    resume_title = extract_title_hint(resume)
    title_score = 0.7 if resume_title and resume_title == job_title else 0.45

    resume_family, resume_family_hits = detect_role_family(resume)
    if target_role in ROLE_PROFILES:
        job_family_used = target_role
        job_family_hits_used = max(job_family_hits, 1)
    else:
        job_family_used = job_family
        job_family_hits_used = job_family_hits
    if job_family_used and resume_family:
        family_score = 1.0 if resume_family == job_family_used else 0.25
    elif job_family_used:
        family_score = 0.35
    else:
        family_score = 0.55

    resume_terms = Counter(
        token for token in (clean_token(item) for item in re.findall(r"[a-z][a-z0-9+#./-]{2,}", resume))
        if token and token not in STOPWORDS
    )
    shared_terms = set(resume_terms) & set(job_terms)
    keyword_score = clamp(len(shared_terms) / max(8, min(35, len(job_terms) or 8)))

    score = (
        skill_score * 0.50
        + keyword_score * 0.30
        + experience_score * 0.08
        + family_score * 0.08
        + title_score * 0.04
    )
    score = round(clamp(score), 2)
    rating, label = rating_from_score(score)

    strengths = []
    gaps = []
    if matched_skills:
        strengths.append("Matched required skills: " + ", ".join(matched_skills[:12]))
    if resume_years and job_years and resume_years >= job_years:
        strengths.append(f"Experience meets requirement: {resume_years}+ years found")
    if resume_title and job_title and resume_title == job_title:
        strengths.append(f"Role alignment found: {resume_title}")
    if resume_family and job_family_used and resume_family == job_family_used:
        strengths.append(f"Role family alignment found: {job_family_used.replace('_', ' ')}")

    if missing_skills:
        gaps.append("Missing or unclear skills: " + ", ".join(missing_skills[:12]))
    if job_years and resume_years < job_years:
        gaps.append(f"Experience gap: JD asks for {job_years}+ years, CV shows {resume_years or 'unclear'}")
    if resume_family and job_family_used and resume_family != job_family_used:
        gaps.append(
            "Role family mismatch: "
            f"CV looks like {resume_family.replace('_', ' ')}, "
            f"JD looks like {job_family_used.replace('_', ' ')}"
        )
    if not strengths:
        strengths.append("Some terminology overlaps with the job description")
    if not gaps:
        gaps.append("No major gaps detected from the available text")

    explanations = [
        f"Skill coverage matched {len(matched_skills)} of {len(job_skills)} detected role/JD requirements.",
        f"Experience score used CV evidence of {resume_years or 'unclear'} years against JD requirement of {job_years or 'unclear'} years.",
        f"Role family comparison: CV={resume_family or 'unclear'}, JD={job_family_used or 'unclear'}.",
        f"Keyword overlap contributed {round(keyword_score, 2)} to the weighted score.",
    ]

    return {
        "provider": provider,
        "score": score,
        "rating": rating,
        "label": label,
        "recommendation": recommendation_from_rating(rating),
        "strengths": strengths,
        "gaps": gaps,
        "details": {
            "skills": round(skill_score, 2),
            "experience": round(experience_score, 2),
            "title": round(title_score, 2),
            "keywords": round(keyword_score, 2),
            "roleFamily": round(family_score, 2),
            "targetRole": target_role,
            "resumeRoleFamily": resume_family,
            "jobRoleFamily": job_family_used,
            "resumeRoleEvidence": resume_family_hits,
            "jobRoleEvidence": job_family_hits_used,
            "matchedSkills": matched_skills,
            "missingSkills": missing_skills,
            "explanations": explanations,
        },
        "raw": raw,
    }
