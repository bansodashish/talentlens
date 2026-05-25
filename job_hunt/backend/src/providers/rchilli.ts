/**
 * providers/rchilli.ts — RChilli resume parsing + optional oneMatch scoring.
 * When oneMatch is disabled, parsed text is scored by the local engine.
 */
import {
  localMatch,
  ratingFromScore,
  recommendationFromRating,
  MatchResult,
} from "../scoring.js";
import { ResumeFile } from "../parsers.js";
import { ProviderError, requireEnv, httpJson } from "../utils.js";

/** Walk an RChilli parsed response and collect all string values as text. */
function extractText(parsed: unknown): string {
  const parts: string[] = [];
  function walk(v: unknown) {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as object).forEach(walk);
  }
  const root = parsed as Record<string, unknown>;
  walk(root?.ResumeParserData ?? root?.JDParserData ?? parsed);
  return parts.join(" ");
}

export async function rchilliMatch(
  resumeFile: ResumeFile | null,
  resumeText: string,
  jobDescription: string,
  targetRole = ""
): Promise<MatchResult> {
  const userKey = requireEnv("RCHILLI_USER_KEY");
  const subUserId = requireEnv("RCHILLI_SUB_USER_ID");
  const version = process.env.RCHILLI_VERSION ?? "8.0.0";
  const resumeUrl =
    process.env.RCHILLI_RESUME_PARSE_URL ??
    "https://rest.rchilli.com/RChilliParser/Rchilli/parseResumeBinary";
  const jdUrl =
    process.env.RCHILLI_JD_PARSE_URL ??
    "https://jdrest.rchilli.com/JDParser/RChilli/ParseJDText";

  const resumeBytes = resumeFile
    ? resumeFile.content
    : Buffer.from(resumeText ?? "", "utf-8");
  const resumeName = resumeFile?.filename ?? "resume.txt";

  const authHeaders = { "Content-Type": "application/json", Accept: "application/json" };

  const resumePayload = {
    filedata: resumeBytes.toString("base64"),
    filename: resumeName,
    userkey: userKey,
    version,
    subuserid: subUserId,
  };
  const jdPayload = {
    filedata: Buffer.from(jobDescription, "utf-8").toString("base64"),
    filename: "job-description.txt",
    userkey: userKey,
    version,
    subuserid: subUserId,
  };

  const [resumeResponse, jdResponse] = await Promise.all([
    httpJson(resumeUrl, { headers: authHeaders, body: resumePayload }),
    httpJson(jdUrl, { headers: authHeaders, body: jdPayload }),
  ]);

  // Optional one-to-one match
  if (process.env.RCHILLI_USE_ONEMATCH?.toLowerCase() === "true") {
    const oneMatchUrl =
      process.env.RCHILLI_ONEMATCH_URL ??
      "https://searchengine.rchilli.com/RChilliSearchEngineAPI/RChilli/v4/oneMatch";
    const oneMatchPayload = {
      userkey: userKey,
      version,
      subuserid: subUserId,
      resume: (resumeResponse as Record<string, unknown>).ResumeParserData ?? resumeResponse,
      job: (jdResponse as Record<string, unknown>).JDParserData ?? jdResponse,
    };
    const matchResponse = await httpJson(oneMatchUrl, {
      headers: authHeaders,
      body: oneMatchPayload,
    });
    const rawScore = [
      "score", "Score", "matchScore", "MatchScore",
    ].reduce<number | null>((acc, k) => {
      if (acc !== null) return acc;
      const v = (matchResponse as Record<string, unknown>)[k];
      return v !== undefined ? parseFloat(String(v)) : null;
    }, null);

    if (rawScore !== null) {
      const score = rawScore > 1 ? rawScore / 100 : rawScore;
      const [rating, label] = ratingFromScore(score);
      return {
        provider: "rchilli",
        score: Math.round(score * 100) / 100,
        rating,
        label,
        recommendation: recommendationFromRating(rating),
        strengths: ["RChilli one-to-one match completed"],
        gaps: ["Review provider details for field-level gaps"],
        details: {
          skills: 0, experience: 0, title: 0, keywords: 0, roleFamily: 0,
          targetRole, resumeRoleFamily: "", jobRoleFamily: "",
          resumeRoleEvidence: 0, jobRoleEvidence: 0,
          matchedSkills: [], missingSkills: [], explanations: [],
          ...(matchResponse as object),
        },
        raw: { resume: resumeResponse, jobDescription: jdResponse, match: matchResponse },
      };
    }
  }

  // Fallback: use local scorer with RChilli-extracted text
  const result = localMatch(
    extractText(resumeResponse),
    extractText(jdResponse) || jobDescription,
    "rchilli",
    { resume: resumeResponse, jobDescription: jdResponse },
    targetRole
  );
  result.details.providerMode = "RChilli parsing + local weighted scorer";
  return result;
}
