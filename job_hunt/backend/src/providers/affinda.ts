/**
 * providers/affinda.ts — Affinda resume parsing + match API.
 * Falls back to local scorer when the search/match endpoint is unavailable
 * (e.g. account doesn't have the index feature enabled).
 */
import {
  localMatch,
  ratingFromScore,
  recommendationFromRating,
  JdCache,
  MatchResult,
} from "../scoring.js";
import { ResumeFile } from "../parsers.js";
import { ProviderError, requireEnv, httpJson, httpMultipart, nestedGet } from "../utils.js";

function affindaBaseUrl(): string {
  const region = (process.env.AFFINDA_REGION ?? "api").trim();
  if (region.startsWith("http")) return region.replace(/\/$/, "");
  if (region === "api") return "https://api.affinda.com";
  return `https://${region}.affinda.com`;
}

async function uploadJd(
  jobDescription: string,
  token: string,
  baseUrl: string
): Promise<string> {
  const jdPath = process.env.AFFINDA_JD_UPLOAD_PATH ?? "/v2/job_descriptions";
  const resumeJdForm = new FormData();
  resumeJdForm.append("wait", "true");
  resumeJdForm.append(
    "file",
    new Blob([jobDescription], { type: "text/plain" }),
    "job-description.txt"
  );
  const response = await httpMultipart(baseUrl + jdPath, token, resumeJdForm);
  const jdId = nestedGet(
    response,
    ["meta", "identifier"],
    ["meta", "id"],
    ["identifier"],
    ["id"]
  );
  if (!jdId) throw new ProviderError("Affinda did not return a job description identifier.");
  return jdId;
}

/** Walk a parsed resume response and extract any string values as text. */
function extractRchilliText(parsed: unknown): string {
  const parts: string[] = [];
  function walk(v: unknown) {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as object).forEach(walk);
  }
  walk((parsed as Record<string, unknown>)?.ResumeParserData ?? parsed);
  return parts.join(" ");
}

function findScore(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const scoreKeys = new Set([
    "score", "matchScore", "match_score", "overallScore", "overall_score",
    "fitScore", "fit_score", "similarity", "confidence",
  ]);
  const stack: unknown[] = [data];
  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      stack.push(...cur);
    } else if (cur && typeof cur === "object") {
      for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
        const norm = k.charAt(0).toLowerCase() + k.slice(1);
        if ((scoreKeys.has(k) || scoreKeys.has(norm)) && (typeof v === "number" || typeof v === "string")) {
          const n = parseFloat(String(v));
          if (!isNaN(n)) return n > 1 ? n / 100 : n;
        }
        if (v && typeof v === "object") stack.push(v);
      }
    }
  }
  return null;
}

export async function affindaMatch(
  resumeFile: ResumeFile | null,
  resumeText: string,
  jobDescription: string,
  targetRole = "",
  jdCache: JdCache | null = null
): Promise<MatchResult> {
  const token = requireEnv("AFFINDA_API_KEY");
  const baseUrl = affindaBaseUrl();
  const resumePath = process.env.AFFINDA_RESUME_UPLOAD_PATH ?? "/v2/resumes";
  const matchPath = process.env.AFFINDA_MATCH_PATH ?? "/v3/resume_search/match";

  const resumeBytes = resumeFile
    ? resumeFile.content
    : Buffer.from(resumeText ?? "", "utf-8");
  const resumeName = resumeFile?.filename ?? "resume.txt";
  const resumeMime = resumeFile?.contentType ?? "text/plain";

  // Upload resume
  const resumeForm = new FormData();
  resumeForm.append("wait", "true");
  resumeForm.append(
    "file",
    new Blob([new Uint8Array(resumeBytes)], { type: resumeMime }),
    resumeName
  );
  const resumeResponse = await httpMultipart(baseUrl + resumePath, token, resumeForm);

  // Upload JD (or reuse from cache)
  let jdId: string | null = null;
  if (jdCache && typeof (jdCache as Record<string, unknown>)[jobDescription] === "string") {
    jdId = (jdCache as Record<string, unknown>)[jobDescription] as string;
  }
  if (!jdId) {
    jdId = await uploadJd(jobDescription, token, baseUrl);
    if (jdCache) (jdCache as Record<string, unknown>)[jobDescription] = jdId;
  }

  const resumeId = nestedGet(
    resumeResponse,
    ["meta", "identifier"],
    ["meta", "id"],
    ["identifier"],
    ["id"]
  );
  if (!resumeId) throw new ProviderError("Affinda did not return a resume identifier.");

  // Request match
  const query = new URLSearchParams({ resume: resumeId, job_description: jdId }).toString();
  let matchResponse: unknown = null;
  let matchError: string | null = null;

  try {
    matchResponse = await httpJson(`${baseUrl}${matchPath}?${query}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (exc) {
    const msg = String(exc);
    if (/404|not.?found/i.test(msg)) {
      matchError =
        "Affinda Search & Match is not available for this account " +
        "(resume not in a search index). Falling back to local skill scorer.";
    } else {
      throw exc;
    }
  }

  // Fallback — score with local engine using Affinda-extracted text
  if (matchError) {
    const parsedText = resumeText || extractRchilliText(resumeResponse);
    const fallback = localMatch(parsedText, jobDescription, "affinda-local-fallback", {
      warning: matchError,
      resumeIdentifier: resumeId,
      jobDescriptionIdentifier: jdId,
    }, targetRole);
    fallback.gaps.unshift(matchError);
    return fallback;
  }

  const score = findScore(matchResponse);
  if (score === null) {
    const fallback = localMatch(
      resumeText || extractRchilliText(resumeResponse),
      jobDescription,
      "affinda-local-fallback",
      { warning: "Affinda did not return a recognisable score field.", match: matchResponse },
      targetRole
    );
    fallback.gaps.unshift("Affinda score field was not found; local weighted scorer was used.");
    return fallback;
  }

  const [rating, label] = ratingFromScore(score);
  const details = (matchResponse as Record<string, unknown>)?.details as Record<string, unknown> ?? {};
  const strengths: string[] = [];
  const gaps: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const itemScore = parseFloat(String(v.score ?? 0));
    const labelText = String(v.label ?? key);
    if (itemScore >= 0.65) strengths.push(`${labelText} is a strong match`);
    else if (itemScore <= 0.4) gaps.push(`${labelText} needs review`);
  }

  return {
    provider: "affinda",
    score: Math.round(score * 100) / 100,
    rating,
    label,
    recommendation: recommendationFromRating(rating),
    strengths: strengths.length ? strengths : ["Affinda returned a positive overall match signal"],
    gaps: gaps.length ? gaps : ["No major provider-level gaps returned"],
    details: {
      skills: 0, experience: 0, title: 0, keywords: 0, roleFamily: 0,
      targetRole, resumeRoleFamily: "", jobRoleFamily: "",
      resumeRoleEvidence: 0, jobRoleEvidence: 0,
      matchedSkills: [], missingSkills: [], explanations: [],
      ...details,
    },
    raw: { resumeIdentifier: resumeId, jobDescriptionIdentifier: jdId, match: matchResponse },
  };
}
