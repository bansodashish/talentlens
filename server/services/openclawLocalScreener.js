/**
 * OpenClaw Local Resume Screener Service
 *
 * Calls a local OpenAI-compatible endpoint (for example Ollama/OpenClaw/vLLM)
 * to score resumes against a job description using the same output shape as
 * claudeScreener so the rest of the pipeline remains unchanged.
 */
const { parseCV } = require('./cvParser');

const BASE_URL = process.env.OPENCLAW_LOCAL_BASE_URL || 'http://127.0.0.1:11434/v1';
const MODEL = process.env.OPENCLAW_LOCAL_MODEL || 'qwen2.5:7b-instruct';
const API_KEY = process.env.OPENCLAW_LOCAL_API_KEY || 'local-dev-key';
const MAX_TOKENS = Number(process.env.OPENCLAW_LOCAL_MAX_TOKENS || 2048);
const TIMEOUT_MS = Number(process.env.OPENCLAW_LOCAL_TIMEOUT_MS || 180000);

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

Score mapping — map the 4 JD requirement areas you identified onto the 4 score fields in order:
- supplyChainScore = score for JD requirement area 1
- procurementScore = score for JD requirement area 2
- logisticsScore   = score for JD requirement area 3
- technologyScore  = score for JD requirement area 4

Scoring rules:
- All scores are integers from 0 to 100.
- Base ALL scores solely on how well the candidate matches the job description — ignore any domain not mentioned in the JD.
- overallScore = holistic fit against the JD (not necessarily the average of the 4 scores).
- recommendation: >=75 -> "Strong Hire", 55-74 -> "Consider", <55 -> "Reject".
- summary: 2-3 sentences — what makes the candidate a good or poor fit for THIS specific role.
- strengths: list of 3-6 specific skills or qualities the candidate HAS that match the JD requirements (short phrases, e.g. "5 years Terraform", "AWS certified").
- gaps: list of 2-5 specific skills or requirements the JD asks for that the candidate is MISSING or weak on (short phrases, e.g. "No Kubernetes experience", "Missing GCP certification").
- Use "" for unknown strings and 0 for unknown numbers — never invent data.`;
}

function extractJson(text) {
  if (!text) throw new Error('Empty response from local OpenClaw model.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in local model response.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalise(raw) {
  const clip = (n) => {
    const v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  };

  const recommendation = ['Strong Hire', 'Consider', 'Reject'].includes(raw.recommendation)
    ? raw.recommendation
    : (clip(raw.overallScore) >= 75 ? 'Strong Hire'
        : clip(raw.overallScore) >= 55 ? 'Consider'
        : 'Reject');

  return {
    name: String(raw.name || '').trim(),
    email: String(raw.email || '').trim(),
    phone: String(raw.phone || '').trim(),
    currentRole: String(raw.currentRole || '').trim(),
    yearsExperience: Number(raw.yearsExperience) || 0,
    keySkills: Array.isArray(raw.keySkills) ? raw.keySkills.map(String) : [],
    strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
    gaps: Array.isArray(raw.gaps) ? raw.gaps.map(String) : [],
    supplyChainScore: clip(raw.supplyChainScore),
    procurementScore: clip(raw.procurementScore),
    logisticsScore: clip(raw.logisticsScore),
    technologyScore: clip(raw.technologyScore),
    overallScore: clip(raw.overallScore),
    recommendation,
    summary: String(raw.summary || '').trim(),
  };
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
    response_format: { type: 'json_object' },
  });

  const text = completion.choices?.[0]?.message?.content || '';
  const parsed = extractJson(text);
  return { result: normalise(parsed), raw: parsed };
}

module.exports = { screenResume, MODEL, BASE_URL };
