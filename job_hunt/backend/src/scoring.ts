/**
 * scoring.ts — Local CV scoring engine.
 *
 * Direct TypeScript port of scoring.py. The algorithm is identical:
 *   score = skill_score×0.50 + keyword_score×0.30 + experience×0.08 + roleFamily×0.08 + title×0.04
 *
 * All skill lists, role profiles, stop-words and pre-compiled regexes are
 * built at module load time for fast repeated scoring.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MatchResult {
  provider: string;
  score: number;
  rating: number;
  label: string;
  recommendation: string;
  strengths: string[];
  gaps: string[];
  details: MatchDetails & Record<string, unknown>;
  raw?: unknown;
}

export interface MatchDetails {
  skills: number;
  experience: number;
  title: number;
  keywords: number;
  roleFamily: number;
  targetRole: string;
  resumeRoleFamily: string;
  jobRoleFamily: string;
  resumeRoleEvidence: number;
  jobRoleEvidence: number;
  matchedSkills: string[];
  missingSkills: string[];
  explanations: string[];
}

/** Shared JD analysis cache — pass the same object across all candidates in a batch. */
export interface JdCache {
  job_skills?: Set<string>;
  job_years?: number;
  job_title?: string;
  job_family?: string;
  job_family_hits?: number;
  job_terms?: Map<string, number>;
}

// ─── Skill taxonomy ───────────────────────────────────────────────────────────

const COMMON_SKILLS = new Set([
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
  "typescript", "unit testing", "vector database", "vue", "vsam",
]);

interface RoleProfile {
  readonly titles: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
}

export const ROLE_PROFILES: Record<string, RoleProfile> = {
  sre: {
    titles: new Set(["sre", "site reliability engineer", "reliability engineer", "production reliability engineer"]),
    skills: new Set(["linux", "kubernetes", "docker", "aws", "azure", "gcp", "terraform", "prometheus", "grafana", "incident management", "slo", "sla", "observability", "ci/cd", "python", "bash", "on-call", "runbooks", "pagerduty", "datadog", "new relic", "elk", "splunk", "gitops"]),
  },
  platform_engineer: {
    titles: new Set(["platform engineer", "developer platform engineer", "internal developer platform engineer", "cloud platform engineer"]),
    skills: new Set(["kubernetes", "docker", "terraform", "helm", "aws", "azure", "gcp", "ci/cd", "gitlab", "github actions", "jenkins", "linux", "python", "bash", "observability", "backstage", "idp", "developer portal", "self-service", "golden paths", "crossplane", "argocd", "flux", "openshift", "istio", "service mesh"]),
  },
  devops_engineer: {
    titles: new Set(["devops engineer", "cloud devops engineer", "aws devops engineer", "azure devops engineer", "devsecops engineer"]),
    skills: new Set(["jenkins", "gitlab", "github actions", "ci/cd", "docker", "kubernetes", "terraform", "aws", "azure", "gcp", "linux", "bash", "python", "ansible", "cloudformation", "azure devops", "git", "helm", "prometheus", "grafana", "sonarqube", "nexus", "artifactory"]),
  },
  java_developer: {
    titles: new Set(["java developer", "java engineer", "backend java developer", "java software engineer", "spring boot developer"]),
    skills: new Set(["java", "spring", "spring boot", "hibernate", "microservices", "rest", "sql", "postgresql", "mysql", "junit", "maven", "gradle", "kafka", "jpa", "spring security", "spring cloud", "mockito", "oracle", "mongodb", "aws", "azure", "gcp"]),
  },
  python_developer: {
    titles: new Set(["python developer", "python engineer", "backend python developer", "python software engineer", "django developer"]),
    skills: new Set(["python", "django", "flask", "fastapi", "rest", "sql", "postgresql", "mysql", "pytest", "celery", "pandas", "numpy", "sqlalchemy", "redis", "rabbitmq", "asyncio", "api development", "docker", "aws", "azure", "gcp"]),
  },
  data_engineer: {
    titles: new Set(["data engineer", "big data engineer", "etl developer", "analytics engineer", "cloud data engineer"]),
    skills: new Set(["python", "sql", "spark", "pyspark", "airflow", "etl", "elt", "data warehouse", "snowflake", "databricks", "aws", "azure", "gcp", "kafka", "dbt", "bigquery", "redshift", "synapse", "data lake", "delta lake", "data modeling", "orchestration", "sql server", "informatica", "ssis"]),
  },
  data_analyst: {
    titles: new Set(["data analyst", "business data analyst", "reporting analyst", "business intelligence analyst", "bi analyst"]),
    skills: new Set(["sql", "excel", "power bi", "tableau", "data analysis", "statistics", "dashboard", "reporting", "python", "pandas", "looker", "qlik", "data visualization", "data cleaning", "kpi", "metrics", "a/b testing", "google analytics", "power query"]),
  },
  ai_engineer: {
    titles: new Set(["ai engineer", "machine learning engineer", "ml engineer", "generative ai engineer", "llm engineer", "applied ai engineer"]),
    skills: new Set(["python", "machine learning", "deep learning", "llm", "generative ai", "rag", "prompt engineering", "langchain", "llamaindex", "vector database", "pinecone", "weaviate", "chromadb", "faiss", "pytorch", "tensorflow", "scikit-learn", "hugging face", "mlops", "model deployment", "model evaluation", "feature engineering", "docker", "kubernetes", "aws", "azure", "gcp"]),
  },
  mainframe_engineer: {
    titles: new Set(["mainframe engineer", "mainframe developer", "cobol developer", "mainframe programmer", "mainframe analyst"]),
    skills: new Set(["mainframe", "cobol", "jcl", "db2", "cics", "vsam", "ibm z/os", "zos", "tso", "ispf", "endeavor", "changeman", "rexx", "ims", "pl/i", "file-aid", "xpeditor", "batch processing", "job scheduling", "ca7", "control-m"]),
  },
  dotnet_engineer: {
    titles: new Set([".net engineer", ".net developer", "dotnet engineer", "dotnet developer", "c# developer", "c# engineer", "asp.net developer"]),
    skills: new Set([".net", ".net core", "c#", "asp.net", "asp.net core", "mvc", "web api", "rest", "microservices", "entity framework", "ef core", "sql server", "azure", "azure devops", "linq", "unit testing", "xunit", "nunit", "blazor", "wpf", "windows services", "iis", "docker", "kubernetes"]),
  },
  qa_automation: {
    titles: new Set(["automation engineer", "qa automation engineer", "test automation engineer"]),
    skills: new Set(["selenium", "playwright", "cypress", "api testing", "postman", "pytest", "testng", "junit", "java", "python", "ci/cd", "jira"]),
  },
};

const STOPWORDS = new Set([
  "and", "or", "the", "a", "an", "to", "of", "in", "for", "with", "on",
  "at", "by", "from", "as", "is", "are", "be", "will", "this", "that",
  "you", "we", "our", "your", "candidate", "job", "role", "work", "have",
  "has", "using", "use", "used", "need", "needs", "required", "require",
  "responsible", "experience", "years", "year", "team", "teams", "good",
  "strong", "knowledge", "understanding", "ability", "skills", "skill",
  "developer", "engineer", "backend", "frontend", "fullstack", "senior",
  "junior", "lead", "manager", "analyst", "description", "looking",
]);

// ─── Pre-compiled regex sources (built once at module load) ───────────────────

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WB = "(?<![a-z0-9+#./-])";
const WA = "(?![a-z0-9+#./-])";

// Union of all known skills across all role profiles
const _ALL_SKILLS: Set<string> = (() => {
  const all = new Set(COMMON_SKILLS);
  for (const p of Object.values(ROLE_PROFILES)) {
    for (const s of p.skills) all.add(s);
  }
  return all;
})();

// One regex that matches any known skill — longest alternatives first to prefer longer matches
const _SKILL_RE_SRC: string = (() => {
  const sorted = [..._ALL_SKILLS].sort((a, b) => b.length - a.length);
  return `${WB}(${sorted.map(esc).join("|")})${WA}`;
})();

// Per-family [titleSrc, skillSrc] for fast detectRoleFamily
const _FAMILY_RE: Record<string, [string, string]> = (() => {
  const out: Record<string, [string, string]> = {};
  for (const [fam, prof] of Object.entries(ROLE_PROFILES)) {
    const ts = [...prof.titles].sort((a, b) => b.length - a.length).map(esc).join("|");
    const ss = [...prof.skills].sort((a, b) => b.length - a.length).map(esc).join("|");
    out[fam] = [`${WB}(${ts})${WA}`, `${WB}(${ss})${WA}`];
  }
  return out;
})();

// Combined title regex for extractTitleHint
const _TITLE_RE_SRC: string = (() => {
  const all: string[] = [
    "automation engineer", "qa engineer", "test engineer",
    "software engineer", "product manager", "business analyst",
  ];
  for (const p of Object.values(ROLE_PROFILES)) {
    for (const t of p.titles) all.push(t);
  }
  const unique = [...new Set(all)].sort((a, b) => b.length - a.length);
  return `${WB}(${unique.map(esc).join("|")})${WA}`;
})();

// ─── Text helpers ─────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanToken(token: string): string {
  return token.replace(/^[.,:;!?()[\]{}<>"']+|[.,:;!?()[\]{}<>"']+$/g, "").toLowerCase();
}

export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  // Single-pass match of all known skills
  const hits = text.match(new RegExp(_SKILL_RE_SRC, "gi")) ?? [];
  for (const h of hits) found.add(h.toLowerCase());
  // Also capture technical tokens that look like skill names (contain +#./)
  const tokens = (text.match(/[a-z][a-z0-9+#./-]{2,}/g) ?? []).map(cleanToken);
  for (const tok of tokens) {
    if (!STOPWORDS.has(tok) && (_ALL_SKILLS.has(tok) || /[+#./]/.test(tok))) {
      found.add(tok);
    }
  }
  return [...found].sort();
}

function extractYears(text: string): number {
  const matches = [...text.matchAll(/(\d{1,2})\+?\s*(?:years|yrs|year)/gi)];
  const nums = matches.map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) : 0;
}

function extractTitleHint(text: string): string {
  const m = text.match(new RegExp(_TITLE_RE_SRC, "i"));
  return m ? m[1].toLowerCase() : "";
}

function detectRoleFamily(text: string): [string, number] {
  let bestFamily = "";
  let bestScore = 0;
  for (const [family, [tSrc, sSrc]] of Object.entries(_FAMILY_RE)) {
    const titleHits = (text.match(new RegExp(tSrc, "gi")) ?? []).length;
    const skillHits = (text.match(new RegExp(sSrc, "gi")) ?? []).length;
    const score = titleHits * 4 + skillHits;
    if (score > bestScore) {
      bestFamily = family;
      bestScore = score;
    }
  }
  return [bestFamily, bestScore];
}

function tokenCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const raw = text.match(/[a-z][a-z0-9+#./-]{2,}/g) ?? [];
  for (const r of raw) {
    const tok = cleanToken(r);
    if (tok && !STOPWORDS.has(tok)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return counts;
}

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Public scoring API ───────────────────────────────────────────────────────

export function ratingFromScore(score: number): [number, string] {
  if (score <= 0.2) return [1, "Poor match"];
  if (score <= 0.4) return [2, "Weak match"];
  if (score <= 0.6) return [3, "Moderate match"];
  if (score <= 0.8) return [4, "Strong match"];
  return [5, "Excellent match"];
}

export function recommendationFromRating(rating: number): string {
  if (rating >= 5) return "Prioritize for recruiter review";
  if (rating === 4) return "Shortlist for recruiter review";
  if (rating === 3) return "Review manually if the talent pool is limited";
  return "Do not shortlist without additional evidence";
}

export function localMatch(
  resumeText: string,
  jobDescription: string,
  provider = "local",
  raw?: unknown,
  targetRole = "",
  jdCache: JdCache | null = null
): MatchResult {
  const resume = normalizeText((resumeText ?? "").slice(0, 4000));
  const job = normalizeText((jobDescription ?? "").slice(0, 4000));

  const resumeSkills = new Set(extractSkills(resume));

  // ── JD analysis (cached across batch calls) ──
  let jobSkills: Set<string>;
  let jobYears: number;
  let jobTitle: string;
  let jobFamily: string;
  let jobFamilyHits: number;
  let jobTerms: Map<string, number>;

  if (jdCache?.job_skills) {
    jobSkills = jdCache.job_skills;
    jobYears = jdCache.job_years!;
    jobTitle = jdCache.job_title!;
    jobFamily = jdCache.job_family!;
    jobFamilyHits = jdCache.job_family_hits!;
    jobTerms = jdCache.job_terms!;
  } else {
    jobSkills = new Set(extractSkills(job));
    jobYears = extractYears(job);
    jobTitle = extractTitleHint(job);
    [jobFamily, jobFamilyHits] = detectRoleFamily(job);
    jobTerms = tokenCounts(job);
    if (jdCache) {
      jdCache.job_skills = jobSkills;
      jdCache.job_years = jobYears;
      jdCache.job_title = jobTitle;
      jdCache.job_family = jobFamily;
      jdCache.job_family_hits = jobFamilyHits;
      jdCache.job_terms = jobTerms;
    }
  }

  // Augment job skills with target role profile if specified
  targetRole = (targetRole ?? "").trim();
  if (targetRole in ROLE_PROFILES) {
    for (const s of ROLE_PROFILES[targetRole].skills) jobSkills.add(s);
  }

  const matchedSkills = [...resumeSkills].filter((s) => jobSkills.has(s)).sort();
  const missingSkills = [...jobSkills].filter((s) => !resumeSkills.has(s)).sort();
  const skillScore = jobSkills.size ? matchedSkills.length / jobSkills.size : 0.45;

  // ── Experience ──
  const resumeYears = extractYears(resume);
  const experienceScore = jobYears
    ? clamp(resumeYears / jobYears)
    : resumeYears
      ? 0.65
      : 0.45;

  // ── Title ──
  const resumeTitle = extractTitleHint(resume);
  const titleScore = resumeTitle && resumeTitle === jobTitle ? 0.7 : 0.45;

  // ── Role family ──
  const [resumeFamily, resumeFamilyHits] = detectRoleFamily(resume);
  let jobFamilyUsed: string;
  let jobFamilyHitsUsed: number;
  if (targetRole in ROLE_PROFILES) {
    jobFamilyUsed = targetRole;
    jobFamilyHitsUsed = Math.max(jobFamilyHits, 1);
  } else {
    jobFamilyUsed = jobFamily;
    jobFamilyHitsUsed = jobFamilyHits;
  }
  const familyScore =
    jobFamilyUsed && resumeFamily
      ? resumeFamily === jobFamilyUsed ? 1.0 : 0.25
      : jobFamilyUsed
        ? 0.35
        : 0.55;

  // ── Keyword overlap ──
  const resumeTerms = tokenCounts(resume);
  const sharedTerms = [...resumeTerms.keys()].filter((t) => jobTerms.has(t));
  const keywordScore = clamp(
    sharedTerms.length / Math.max(8, Math.min(35, jobTerms.size || 8))
  );

  // ── Weighted score ──
  const score = round2(
    clamp(
      skillScore * 0.5 +
      keywordScore * 0.3 +
      experienceScore * 0.08 +
      familyScore * 0.08 +
      titleScore * 0.04
    )
  );
  const [rating, label] = ratingFromScore(score);

  // ── Narrative ──
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (matchedSkills.length) strengths.push(`Matched required skills: ${matchedSkills.slice(0, 12).join(", ")}`);
  if (resumeYears && jobYears && resumeYears >= jobYears) strengths.push(`Experience meets requirement: ${resumeYears}+ years found`);
  if (resumeTitle && jobTitle && resumeTitle === jobTitle) strengths.push(`Role alignment found: ${resumeTitle}`);
  if (resumeFamily && jobFamilyUsed && resumeFamily === jobFamilyUsed) strengths.push(`Role family alignment found: ${jobFamilyUsed.replace(/_/g, " ")}`);

  if (missingSkills.length) gaps.push(`Missing or unclear skills: ${missingSkills.slice(0, 12).join(", ")}`);
  if (jobYears && resumeYears < jobYears) gaps.push(`Experience gap: JD asks for ${jobYears}+ years, CV shows ${resumeYears || "unclear"}`);
  if (resumeFamily && jobFamilyUsed && resumeFamily !== jobFamilyUsed) {
    gaps.push(`Role family mismatch: CV looks like ${resumeFamily.replace(/_/g, " ")}, JD looks like ${jobFamilyUsed.replace(/_/g, " ")}`);
  }

  if (!strengths.length) strengths.push("Some terminology overlaps with the job description");
  if (!gaps.length) gaps.push("No major gaps detected from the available text");

  const explanations = [
    `Skill coverage matched ${matchedSkills.length} of ${jobSkills.size} detected role/JD requirements.`,
    `Experience score used CV evidence of ${resumeYears || "unclear"} years against JD requirement of ${jobYears || "unclear"} years.`,
    `Role family comparison: CV=${resumeFamily || "unclear"}, JD=${jobFamilyUsed || "unclear"}.`,
    `Keyword overlap contributed ${round2(keywordScore)} to the weighted score.`,
  ];

  return {
    provider,
    score,
    rating,
    label,
    recommendation: recommendationFromRating(rating),
    strengths,
    gaps,
    details: {
      skills: round2(skillScore),
      experience: round2(experienceScore),
      title: round2(titleScore),
      keywords: round2(keywordScore),
      roleFamily: round2(familyScore),
      targetRole,
      resumeRoleFamily: resumeFamily,
      jobRoleFamily: jobFamilyUsed,
      resumeRoleEvidence: resumeFamilyHits,
      jobRoleEvidence: jobFamilyHitsUsed,
      matchedSkills,
      missingSkills,
      explanations,
    },
    raw,
  };
}

// ─── Role library (for GET /api/roles) ───────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ai_engineer: "AI Engineer",
  dotnet_engineer: ".NET Engineer",
  qa_automation: "QA Automation",
  sre: "SRE",
};

export function roleLibrary() {
  return Object.entries(ROLE_PROFILES)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, profile]) => ({
      id: family,
      label:
        ROLE_LABELS[family] ??
        family.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      titles: [...profile.titles].sort(),
      skills: [...profile.skills].sort(),
    }));
}
