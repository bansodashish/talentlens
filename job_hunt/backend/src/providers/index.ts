/**
 * providers/index.ts — Dispatcher: routes to the right provider and
 * orchestrates resume text extraction before scoring.
 */
import { localMatch, MatchResult, JdCache } from "../scoring.js";
import { extractResumeText, ResumeFile } from "../parsers.js";
import { ProviderError } from "../utils.js";
import { openaiMatch } from "./openai.js";
import { affindaMatch } from "./affinda.js";
import { rchilliMatch } from "./rchilli.js";

export { ProviderError };

export async function buildMatchResult(
  provider: string,
  targetRole: string,
  jobDescription: string,
  resumeText = "",
  resumeFile: ResumeFile | null = null,
  jdCache: JdCache | null = null
): Promise<MatchResult & { details: Record<string, unknown> }> {
  const parsedText = resumeFile ? await extractResumeText(resumeFile) : "";
  const combined = [resumeText, parsedText].filter(Boolean).join("\n");

  if (provider === "local" && resumeFile && !combined) {
    throw new Error(
      "This file type could not be parsed locally. " +
      "Paste resume text, upload .txt/.docx/.pdf, or use Affinda/RChilli."
    );
  }

  const result = await dispatch(provider, resumeFile, combined, jobDescription, targetRole, jdCache);

  const details = (result.details ?? {}) as Record<string, unknown>;
  details.uploadedResume = resumeFile?.filename ?? "";
  details.parsedResumeCharacters = parsedText.length;
  result.details = details as MatchResult["details"];

  return result as MatchResult & { details: Record<string, unknown> };
}

async function dispatch(
  provider: string,
  resumeFile: ResumeFile | null,
  resumeText: string,
  jobDescription: string,
  targetRole: string,
  jdCache: JdCache | null
): Promise<MatchResult> {
  const p = (provider ?? "local").toLowerCase();

  if (p === "affinda") {
    return affindaMatch(resumeFile, resumeText, jobDescription, targetRole, jdCache);
  }

  if (p === "rchilli") {
    return rchilliMatch(resumeFile, resumeText, jobDescription, targetRole);
  }

  if (p === "openai") {
    try {
      // OpenAI receives combined text (already extracted from file above)
      return await openaiMatch(resumeText, jobDescription, targetRole);
    } catch (err) {
      // Graceful degradation: fall back to local scorer and surface the warning
      const fallback = localMatch(resumeText, jobDescription, "openai-local-fallback", undefined, targetRole, jdCache);
      const msg = (err as Error).message;
      fallback.gaps.unshift(`OpenAI unavailable (${msg}); local skill scorer was used.`);
      return fallback;
    }
  }

  // "local" or any unknown provider
  return localMatch(resumeText, jobDescription, "local", undefined, targetRole, jdCache);
}
