/**
 * OpenAI CV Scoring Service
 * Uses GPT-4 to score a resume against a job description.
 * Returns the same structure as scorer.js for consistency.
 */

async function scoreWithOpenAI(resumeText, jobDescription, targetRole = null) {
  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are an expert recruitment consultant.
Analyse the provided CV and job description, then return a structured JSON scoring response.`;

  const userPrompt = `Score this candidate's CV against the job description.

JOB DESCRIPTION:
${jobDescription}

${targetRole ? `TARGET ROLE: ${targetRole}\n` : ''}
CANDIDATE CV:
${resumeText.substring(0, 4000)}

Return ONLY valid JSON with this exact structure:
{
  "score": 0.0-1.0,
  "score_pct": 0-100,
  "rating": 1-5,
  "label": "Excellent match|Strong match|Good match|Moderate match|Weak match",
  "recommendation": "one sentence recommendation",
  "strengths": ["strength1", "strength2", "strength3"],
  "gaps": ["gap1", "gap2", "gap3"],
  "details": {
    "skills": 0.0-1.0,
    "experience": 0.0-1.0,
    "title": 0.0-1.0,
    "summary": "2-3 sentence analysis"
  }
}`;

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 1000,
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
