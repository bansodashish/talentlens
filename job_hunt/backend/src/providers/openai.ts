/**
 * providers/openai.ts — OpenAI GPT provider.
 * Uses the official openai npm package (v4+).
 */
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions.js";
import { MatchResult } from "../scoring.js";
import { ProviderError, requireEnv } from "../utils.js";

export async function openaiMatch(
  resumeText: string,
  jobDescription: string,
  targetRole = ""
): Promise<MatchResult> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL ?? "gpt-4-turbo";
  const client = new OpenAI({ apiKey });

  const resumeExcerpt = (resumeText ?? "").slice(0, 4000);
  const jdExcerpt = (jobDescription ?? "").slice(0, 4000);

  const prompt = `You are an expert recruiter. Analyze the match between this resume and job description.

Resume:
${resumeExcerpt}

Job Description:
${jdExcerpt}

Target Role: ${targetRole || "Infer from the job description"}

Instructions:
1. Extract the explicit required skills, tools, and technologies from the JOB DESCRIPTION (e.g. Python, AWS, Kubernetes, SQL, React, Spring Boot).
2. Check the RESUME for each required skill. Treat closely related items (e.g. "Postgres" matches "PostgreSQL") as matched.
3. Compare overall years of experience, seniority, and domain alignment.
4. Return ONLY a JSON object - no commentary, no markdown fences.

JSON schema:
{
  "rating": <integer 1-5>,
  "score": <float 0.0-1.0>,
  "label": "<strong match|good match|fair match|poor match>",
  "recommendation": "<shortlist for interview|schedule interview|consider for future|reject>",
  "strengths": [<short bullet strings>],
  "gaps": [<short bullet strings>],
  "matchedSkills": [<skills present in BOTH resume and JD>],
  "missingSkills": [<skills required by JD but NOT found in resume>],
  "experienceAssessment": "<one-sentence summary of experience fit>"
}`;

  type ChatParams = Parameters<typeof client.chat.completions.create>[0];
  const reqParams: ChatParams = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 800,
  };

  // json_object mode only supported on newer models
  if (/turbo|gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4/i.test(model)) {
    reqParams.response_format = { type: "json_object" };
  }

  let resultText: string;
  try {
    const response = (await client.chat.completions.create({
      ...reqParams,
      stream: false,
    })) as ChatCompletion;
    resultText = response.choices[0].message.content?.trim() ?? "{}";
  } catch (err) {
    throw new ProviderError(`OpenAI API error: ${(err as Error).message}`);
  }

  // Strip markdown fences if present
  resultText = resultText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(resultText) as Record<string, unknown>;
  } catch (e) {
    throw new ProviderError(`OpenAI returned invalid JSON: ${e}`);
  }

  const matchedSkills = (parsed.matchedSkills as string[]) ?? [];
  const missingSkills = (parsed.missingSkills as string[]) ?? [];
  const experienceAssessment = (parsed.experienceAssessment as string) ?? "";

  return {
    provider: "openai",
    rating: (parsed.rating as number) ?? 3,
    score: parseFloat(String(parsed.score ?? "0.5")),
    label: (parsed.label as string) ?? "fair match",
    recommendation: (parsed.recommendation as string) ?? "consider for future",
    strengths: (parsed.strengths as string[]) ?? [],
    gaps: (parsed.gaps as string[]) ?? [],
    details: {
      skills: 0,
      experience: 0,
      title: 0,
      keywords: 0,
      roleFamily: 0,
      targetRole,
      resumeRoleFamily: "",
      jobRoleFamily: "",
      resumeRoleEvidence: 0,
      jobRoleEvidence: 0,
      matchedSkills,
      missingSkills,
      explanations: [
        `Analyzed by OpenAI (${model})`,
        `Matched skills: ${matchedSkills.length}`,
        `Missing skills: ${missingSkills.length}`,
      ],
      providerMode: "OpenAI GPT analysis",
      experienceAssessment,
    },
  };
}
