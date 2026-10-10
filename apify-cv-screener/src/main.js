import { Actor, log } from 'apify';
import { extractJson, normaliseResult } from './result.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function validateInput(input) {
  if (!input || !Array.isArray(input.screenings) || input.screenings.length === 0) {
    throw new Error('Input requires a non-empty screenings array.');
  }
  if (!String(input.jobDescription || '').trim()) throw new Error('Input requires jobDescription.');
  for (const screening of input.screenings) {
    if (!Number.isInteger(Number(screening.screeningId)) || !String(screening.resumeText || '').trim()) {
      throw new Error('Every screening requires an integer screeningId and resumeText.');
    }
  }
}

function createPrompt({ jobTitle, jobDescription, resumeText }) {
  return `You are a recruitment analyst. Score this CV against the job description.

Focus on demonstrated skills. Do not use protected characteristics. Keep scores between 0 and 100.

Job title: ${jobTitle || 'Not specified'}
Job description:
${jobDescription.slice(0, 12000)}

CV:
${resumeText.slice(0, 16000)}

Return only a JSON object with exactly these fields:
{
  "name": "", "email": "", "phone": "", "currentRole": "", "jobTitle": "",
  "yearsExperience": 0, "keySkills": [], "strengths": [], "gaps": [],
  "supplyChainScore": 0, "procurementScore": 0, "logisticsScore": 0,
  "technologyScore": 0, "overallScore": 0,
  "recommendation": "Strong Hire|Consider|Reject", "summary": ""
}`;
}

async function scoreWithOpenRouter({ apiKey, model, jobTitle, jobDescription, resumeText }) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return valid JSON only. Do not include markdown.' },
        { role: 'user', content: createPrompt({ jobTitle, jobDescription, resumeText }) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter request failed with ${response.status}.`);
  const payload = await response.json();
  return normaliseResult(extractJson(payload.choices?.[0]?.message?.content));
}

await Actor.init();
try {
  const input = await Actor.getInput();
  validateInput(input);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Set OPENROUTER_API_KEY in Apify Secrets.');
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  for (const screening of input.screenings) {
    const screeningId = Number(screening.screeningId);
    try {
      const result = await scoreWithOpenRouter({
        apiKey,
        model,
        jobTitle: input.jobTitle,
        jobDescription: input.jobDescription,
        resumeText: screening.resumeText,
      });
      await Actor.pushData({ screeningId, status: 'completed', result, actor: { model } });
    } catch (error) {
      log.warning(`Screening ${screeningId} failed: ${error.message}`);
      await Actor.pushData({ screeningId, status: 'failed', error: error.message, actor: { model } });
    }
  }
} finally {
  await Actor.exit();
}