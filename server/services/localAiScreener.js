/**
 * LocalAI Resume Screener Service
 *
 * Calls a self-hosted LocalAI instance (OpenAI-compatible API, typically
 * backed by llama.cpp) to score resumes against a job description, using
 * the same output shape as the other screeners so the rest of the
 * pipeline remains unchanged. Runs alongside — not instead of — the
 * OpenClaw/Ollama local mode.
 */
const { parseCV } = require('./cvParser');
const { extractJson, normalise } = require('./screenerUtils');

const BASE_URL = process.env.LOCALAI_BASE_URL || 'http://127.0.0.1:8081/v1';
const MODEL = process.env.LOCALAI_MODEL || '';
const API_KEY = process.env.LOCALAI_API_KEY || 'local-dev-key';
const MAX_TOKENS = Number(process.env.LOCALAI_MAX_TOKENS || 2048);
const TIMEOUT_MS = Number(process.env.LOCALAI_TIMEOUT_MS || 180000);

// Some LocalAI backends/models don't support strict JSON mode
// (response_format: json_object). Default to omitting it since extractJson()
// already tolerates fenced or plain JSON; set LOCALAI_JSON_MODE=true once
// you've confirmed your backend supports it.
const JSON_MODE = /^true$/i.test(process.env.LOCALAI_JSON_MODE || '');

const SYSTEM_PROMPT =
  'You are an expert recruiter. Evaluate resumes against the provided job description objectively. Respond ONLY in valid JSON.';

function buildUserPrompt({ resumeText, fileName, jobDescription }) {
  return `=== RESUME (${fileName || 'unknown'}) ===
${resumeText}

=== JOB DESCRIPTION ===
${jobDescription}

=== TASK ===
Read the job description above carefully. Identify the 4 most important requirement areas it asks for (e.g. technical skills, domain experience, soft skills, qualifications — whatever the JD emphasises). Score the candidate on each of those 4 areas. Then return ONLY a single JSON object with this exact schema (no markdown, no commentary):

{
  "name": string,
  "email": string,
  "phone": string,
  "currentRole": string,
  "jobTitle": string,
  "yearsExperience": number,
  "keySkills": string[],
  "strengths": string[],
  "gaps": string[],
  "supplyChainScore": number,
  "procurementScore": number,
  "logisticsScore": number,
  "technologyScore": number,
  "overallScore": number,
  "recommendation": "Strong Hire" | "Consider" | "Reject",
  "summary": string
}

- currentRole = the candidate's OWN current/most-recent job title, taken from their résumé.
- jobTitle = the position title being hired for, taken from the JOB DESCRIPTION above (e.g. "Principal DevOps Engineer") — NOT the candidate's résumé.

Score mapping — map the 3 JD requirement areas onto the score fields:
- supplyChainScore = score for JD requirement area 1 (skills match)
- procurementScore = score for JD requirement area 2 (experience)
- logisticsScore   = score for JD requirement area 3 (domain/location fit)
- technologyScore  = always set to 0 (not displayed)

Scoring rules:
- All scores are integers from 0 to 100.
- Base ALL scores solely on how well the candidate matches the job description — ignore any domain not mentioned in the JD.
- overallScore = holistic fit against the JD based on Skills Match, Experience and Domain Fit only.
- technologyScore must always be 0.
- recommendation: >=75 -> "Strong Hire", 55-74 -> "Consider", <55 -> "Reject".
- summary: 2-3 sentences — what makes the candidate a good or poor fit for THIS specific role.
- strengths: list of 3-6 specific skills or qualities the candidate HAS that match the JD requirements (short phrases, e.g. "5 years Terraform", "AWS certified").
- gaps: list of 2-5 specific skills or requirements the JD asks for that the candidate is MISSING or weak on (short phrases, e.g. "No Kubernetes experience", "Missing GCP certification").
- Use "" for unknown strings and 0 for unknown numbers — never invent data.`;
}

async function screenResume({ jobDescription, filePath, plainText, fileName }) {
  if (!jobDescription) throw new Error('jobDescription is required.');

  let resumeText = plainText;
  if (!resumeText && filePath) {
    resumeText = await parseCV(filePath, fileName || '');
  }
  if (!resumeText || resumeText.trim().length < 20) {
    throw new Error('Could not extract readable text from file.');
  }

  const { OpenAI } = require('openai');
  const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS,
  });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ resumeText, fileName, jobDescription }) },
    ],
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    ...(JSON_MODE ? { response_format: { type: 'json_object' } } : {}),
  });

  const text = completion.choices?.[0]?.message?.content || '';
  const parsed = extractJson(text);
  return { result: normalise(parsed), raw: parsed };
}

module.exports = { screenResume, MODEL, BASE_URL };
