/**
 * Claude Resume Screener Service
 *
 * Calls Anthropic's Messages API with the resume + job description
 * and parses a strict JSON evaluation for supply-chain roles.
 */
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const MODEL          = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const API_URL        = 'https://api.anthropic.com/v1/messages';
const API_VERSION    = '2023-06-01';
const MAX_TOKENS     = 2048;

const SYSTEM_PROMPT = `You are an expert recruiter. Evaluate resumes against the provided job description objectively. Respond ONLY in valid JSON.`;

/**
 * Build the user-message content array.
 * - PDFs are sent as base64 documents (Claude can read them natively).
 * - Other files (txt/docx/etc.) are sent as plain text extracted by the caller.
 */
function buildContent({ filePath, mimeType, fileName, plainText, jobDescription }) {
  const content = [];

  if (filePath && /pdf/i.test(mimeType || path.extname(fileName || ''))) {
    const buf = fs.readFileSync(filePath);
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: buf.toString('base64'),
      },
    });
  } else if (plainText) {
    content.push({
      type: 'text',
      text: `=== RESUME (${fileName || 'unknown'}) ===\n${plainText}`,
    });
  }

  content.push({
    type: 'text',
    text:
`=== JOB DESCRIPTION ===
${jobDescription}

=== TASK ===
Evaluate the candidate against the job description above. Return ONLY a single JSON object with this exact schema (no markdown, no commentary):

{
  "name": string,
  "email": string,
  "phone": string,
  "currentRole": string,
  "jobTitle": string,
  "yearsExperience": number,
  "keySkills": string[],
  "supplyChainScore": number,   // Skills Match (how well core skills match the JD, 0–100)
  "procurementScore": number,   // Experience (depth & seniority match, 0–100)
  "logisticsScore": number,     // Domain Fit (industry & domain alignment, 0–100)
  "technologyScore": number,    // Tools & Tech (tools/platforms/certifications, 0–100)
  "overallScore": number,
  "recommendation": "Strong Hire" | "Consider" | "Reject",
  "summary": string
}

- currentRole = the candidate's OWN current/most-recent job title, taken from their résumé.
- jobTitle = the position title being hired for, taken from the JOB DESCRIPTION above (e.g. "Principal DevOps Engineer") — NOT the candidate's résumé.

Scoring rules:
- All scores are integers from 0 to 100.
- overallScore = your holistic fit assessment (not necessarily the average).
- recommendation should align with overallScore: >=75 → "Strong Hire", 55-74 → "Consider", <55 → "Reject".
- summary: 2-3 sentences covering strengths, gaps, and overall fit.
- Use "" for unknown strings and 0 for unknown numbers — never invent data.`,
  });

  return content;
}

/**
 * Extract JSON from Claude's text response.
 * Handles plain JSON, ```json fences, and surrounding prose.
 */
function extractJson(text) {
  if (!text) throw new Error('Empty response from Claude.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in Claude response.');
  const slice = candidate.slice(start, end + 1);
  return JSON.parse(slice);
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
    jobTitle:        String(raw.jobTitle || '').trim(),
    yearsExperience: Number(raw.yearsExperience) || 0,
    keySkills:       Array.isArray(raw.keySkills) ? raw.keySkills.map(String) : [],
    supplyChainScore: clip(raw.supplyChainScore),
    procurementScore: clip(raw.procurementScore),
    logisticsScore:   clip(raw.logisticsScore),
    technologyScore:  clip(raw.technologyScore),
    overallScore:     clip(raw.overallScore),
    recommendation:   rec,
    summary:          String(raw.summary || '').trim(),
  };
}

/**
 * Score a single resume against a job description.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.jobDescription
 * @param {string} [params.filePath]   Path to PDF (preferred for PDFs)
 * @param {string} [params.plainText]  Extracted plain text (for non-PDF or fallback)
 * @param {string} [params.fileName]
 * @param {string} [params.mimeType]
 */
async function screenResume({ apiKey, jobDescription, filePath, plainText, fileName, mimeType }) {
  if (!apiKey) throw new Error('Claude API key is not configured.');
  if (!jobDescription) throw new Error('jobDescription is required.');

  const content = buildContent({ filePath, mimeType, fileName, plainText, jobDescription });

  const res = await axios.post(
    API_URL,
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      timeout: 120_000,
    },
  );

  const text = res.data?.content?.find(c => c.type === 'text')?.text
    || res.data?.content?.[0]?.text
    || '';

  const parsed = extractJson(text);
  return { result: normalise(parsed), raw: parsed };
}

module.exports = { screenResume, MODEL };
