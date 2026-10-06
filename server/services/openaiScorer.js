/**
 * OpenAI CV Scoring Service
 * Uses GPT-4 to score a resume against a job description.
 * Returns the same structure as scorer.js for consistency.
 */

const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120000);

async function scoreWithOpenAI(resumeText, jobDescription, targetRole = null) {
  const { OpenAI } = require('openai');
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: TIMEOUT_MS,
    maxRetries: 2,
  });

  const systemPrompt = `You are an expert recruitment consultant.
Analyse the provided CV and job description, then return a structured JSON scoring response.`;

  const userPrompt = `
You are an expert recruitment consultant analyzing how well a resume matches a job description.

**IMPORTANT: Focus ONLY on skills matching. Do NOT factor in years of experience or location in your scoring.**

Job Description:
${jobDescription.slice(0, 3000)}

Resume:
${resumeText.slice(0, 4000)}

Target Role: ${targetRole || 'Not specified'}

Analyze the resume against the job description and return ONLY valid JSON (no markdown, no commentary):

{
  "score": 0.0-1.0,
  "score_pct": 0-100,
  "rating": 1-5,
  "label": "Excellent match|Strong match|Good match|Moderate match|Weak match",
  "recommendation": "one sentence recommendation",
  "strengths": ["strength 1", "strength 2", ...],
  "gaps": ["gap 1", "gap 2", ...],
  "details": {
    "skills": 0.0-1.0,
    "experience": 0,
    "location": 0,
    "title": 0.0-1.0
  }
}

**Scoring criteria (SKILLS ONLY):**
- Compare the resume's demonstrated skills against the JD's required skills
- Score reflects percentage of required skills that are present
- Experience years and location should NOT affect the score
- Set details.experience and details.location to 0
- Overall score = skills match only

Extract 3-6 key strengths (matched skills) and 3-6 gaps (missing skills).
`.trim();

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-6-luna',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content);
  // Normalise to ensure all required fields exist
  return {
    score: result.score || 0,
    score_pct: result.score_pct || Math.round((result.score || 0) * 100),
    rating: result.rating || 1,
    label: result.label || 'Unknown',
    recommendation: result.recommendation || '',
    strengths: result.strengths || [],
    gaps: result.gaps || [],
    details: result.details || {},
  };
}

module.exports = { scoreWithOpenAI };
