/**
 * OpenAI (ChatGPT) Resume Screener Service
 *
 * Mirrors the public surface of `claudeScreener.js` so it is a drop-in
 * replacement for the `/api/screen/resume` AI mode:
 *   - exports `screenResume({ apiKey, jobDescription, mustHave, niceToHave,
 *                             filePath, plainText, fileName, mimeType })`
 *     returning `{ result, raw }` with the same `result` shape.
 *   - exports `MODEL` (string) for logging / response metadata.
 *
 * Uses the official `openai` SDK with JSON-mode responses.
 * PDFs are extracted to text via `cvParser` before sending (the chat
 * completions endpoint expects text, not a binary document).
 */
const path = require('path');
const { parseCV } = require('./cvParser');

const MODEL       = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_TOKENS  = 2048;

const SYSTEM_PROMPT =
  'You are an expert recruiter. Evaluate resumes against the provided job description objectively. Respond ONLY in valid JSON.';

function buildUserPrompt({ resumeText, fileName, jobDescription, mustHave, niceToHave }) {
  const reqBlock = (mustHave?.length || niceToHave?.length)
    ? `=== HARD REQUIREMENTS (must-have) ===
${(mustHave || []).join(', ')}

=== BONUS SKILLS (nice-to-have) ===
${(niceToHave || []).join(', ')}

`
    : '';

  return `=== RESUME (${fileName || 'unknown'}) ===
${resumeText}

=== JOB DESCRIPTION ===
${jobDescription}

${reqBlock}=== TASK ===
Evaluate the candidate against the job description above. Return ONLY a single JSON object with this exact schema (no markdown, no commentary):

{
  "name": string,
  "email": string,
  "phone": string,
  "currentRole": string,
  "yearsExperience": number,
  "keySkills": string[],
  "mustHaveScore": number,
  "niceToHaveScore": number,
  "titleMatchScore": number,
  "experienceScore": number,
  "overallScore": number,
  "recommendation": "Strong Hire" | "Consider" | "Reject",
  "summary": string,
  "matchedMustHave": string[],
  "missingMustHave": string[]
}

Scoring rules:
- All scores are integers from 0 to 100.
- overallScore = your holistic fit assessment (not necessarily the average).
- recommendation should align with overallScore: >=75 -> "Strong Hire", 55-74 -> "Consider", <55 -> "Reject".
- summary: 2-3 sentences covering strengths, gaps, and overall fit.
- matchedMustHave: array of must-have keywords the candidate possesses.
- missingMustHave: array of must-have keywords the candidate lacks.
${mustHave?.length ? '- Penalise overallScore by 5 per missing hard requirement (floor 0).\n' : ''}- Use "" for unknown strings and 0 for unknown numbers — never invent data.`;
}

function extractJson(text) {
  if (!text) throw new Error('Empty response from OpenAI.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in OpenAI response.');
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalise(raw) {
  const clip = (n) => {
    const v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  };
  const rec = ['Strong Hire', 'Consider', 'Reject'].includes(raw.recommendation)
    ? raw.recommendation
    : (clip(raw.overallScore) >= 75 ? 'Strong Hire'
        : clip(raw.overallScore) >= 55 ? 'Consider'
        : 'Reject');

  return {
    name:            String(raw.name || '').trim(),
    email:           String(raw.email || '').trim(),
    phone:           String(raw.phone || '').trim(),
    currentRole:     String(raw.currentRole || '').trim(),
    yearsExperience: Number(raw.yearsExperience) || 0,
    keySkills:       Array.isArray(raw.keySkills) ? raw.keySkills.map(String) : [],
    mustHaveScore:   clip(raw.mustHaveScore),
    niceToHaveScore: clip(raw.niceToHaveScore),
    titleMatchScore: clip(raw.titleMatchScore),
    experienceScore: clip(raw.experienceScore),
    overallScore:    clip(raw.overallScore),
    recommendation:  rec,
    summary:         String(raw.summary || '').trim(),
    matchedMustHave: Array.isArray(raw.matchedMustHave) ? raw.matchedMustHave.map(String) : [],
    missingMustHave: Array.isArray(raw.missingMustHave) ? raw.missingMustHave.map(String) : [],
  };
}

/**
 * Score a single resume against a job description using OpenAI.
 *
 * Accepts either `plainText` (preferred) or a `filePath` — if a path is
 * given without plain text, the file is parsed to text first.
 */
async function screenResume({ apiKey, jobDescription, mustHave, niceToHave, filePath, plainText, fileName, mimeType }) {
  if (!apiKey) throw new Error('OpenAI API key is not configured.');
  if (!jobDescription) throw new Error('jobDescription is required.');

  let resumeText = plainText;
  if (!resumeText && filePath) {
    resumeText = await parseCV(filePath, fileName || '');
  }
  if (!resumeText || resumeText.trim().length < 20) {
    throw new Error('Could not extract readable text from file.');
  }

  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey, timeout: 120_000 });

  const userPrompt = buildUserPrompt({
    resumeText,
    fileName,
    jobDescription,
    mustHave,
    niceToHave,
  });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    response_format: { type: 'json_object' },
  });

  const text = completion.choices?.[0]?.message?.content || '';
  const parsed = extractJson(text);
  return { result: normalise(parsed), raw: parsed };
}

module.exports = { screenResume, MODEL };
