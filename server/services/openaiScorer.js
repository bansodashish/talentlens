/**
 * OpenAI CV Scoring Service
 * Uses GPT-4 to score a resume against a job description.
 * Returns the same structure as scorer.js for consistency.
 */

const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
const MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 2000);

function parseScoringResponse(response) {
  const choice = response?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const error = new Error('OpenAI returned an empty scoring response.');
    error.code = 'OPENAI_INVALID_RESPONSE';
    throw error;
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    const reason = choice?.finish_reason === 'length' ? ' The response was truncated; please retry the screening.' : '';
    const error = new Error(`OpenAI returned an invalid scoring response.${reason}`);
    error.code = 'OPENAI_INVALID_RESPONSE';
    throw error;
  }
}

function normaliseQuantitativeAnalysis(analysis) {
  const toScore = (value, label) => {
    if (value === null || value === undefined || value === '') {
      const error = new Error(`OpenAI returned a missing ${label} score.`);
      error.code = 'OPENAI_INVALID_RESPONSE';
      throw error;
    }
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      const error = new Error(`OpenAI returned an invalid ${label} score.`);
      error.code = 'OPENAI_INVALID_RESPONSE';
      throw error;
    }
    return Math.round(score);
  };

  return {
    requirements: toScore(analysis?.requirements, 'requirements'),
    roleFit: toScore(analysis?.roleFit, 'role fit'),
    experience: toScore(analysis?.experience, 'experience'),
  };
}

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

**IMPORTANT: Assess only job-related evidence from the CV. Do not infer protected characteristics or use them in the assessment.**

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
  "assessment": {
    "requirements": [{"requirement": "string", "fit": "strong|partial|not_met", "evidence": "CV-grounded evidence"}],
    "reasons": [{"claim": "string", "evidence": "CV-grounded evidence"}],
    "useCases": [{"capability": "string", "useCase": "string"}],
    "interviewQuestions": [{"question": "string", "gap": "string"}]
  },
  "quantitativeAnalysis": {
    "requirements": 0-100,
    "roleFit": 0-100,
    "experience": 0-100
  }
}

**Quantitative scoring criteria:**
- quantitativeAnalysis.requirements: match the CV's demonstrated hard skills, tools, qualifications, and responsibilities against the JD's required requirements. Do not award points for unproven claims.
- quantitativeAnalysis.roleFit: match the candidate's actual roles, scope, seniority, and domain against the target role. Do not use location or protected characteristics.
- quantitativeAnalysis.experience: compare only relevant experience evidenced in the CV against the JD's stated experience expectations. If the JD gives no experience expectation, score the demonstrated relevance and depth.
- Return an integer from 0 to 100 for every quantitativeAnalysis field. These fields are required and must not be null.
- The application calculates the final weighted score as Requirements 60%, Role fit 20%, Experience 20%, then applies: 80-100 Strong Hire, 60-79 Consider, below 60 Reject.
- assessment evidence must be explicitly supported by the CV. Do not invent experience, achievements, employers, or qualifications.
- Use empty arrays when evidence is unavailable. Keep requirements and reasons focused on the job description.

Extract 3-6 key strengths (matched skills) and 3-6 gaps (missing skills).
`.trim();

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-6-luna',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    response_format: { type: 'json_object' },
  });

  const result = parseScoringResponse(response);
  const quantitativeAnalysis = normaliseQuantitativeAnalysis(result.quantitativeAnalysis);

  // Normalise to ensure all required fields exist. The server derives the
  // weighted total and recommendation from these three model assessments.
  return {
    score: result.score || 0,
    score_pct: result.score_pct || Math.round((result.score || 0) * 100),
    rating: result.rating || 1,
    label: result.label || 'Unknown',
    recommendation: result.recommendation || '',
    strengths: result.strengths || [],
    gaps: result.gaps || [],
    assessment: normaliseAssessment(result.assessment),
    details: {
      ...(result.details || {}),
      skills: quantitativeAnalysis.requirements / 100,
      title: quantitativeAnalysis.roleFit / 100,
      experience: quantitativeAnalysis.experience / 100,
      quantitativeAnalysis,
    },
  };
}

function normaliseAssessment(assessment) {
  const safeArray = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
  return {
    requirements: safeArray(assessment?.requirements).map(item => ({
      requirement: String(item.requirement || '').trim(),
      fit: ['strong', 'partial', 'not_met'].includes(item.fit) ? item.fit : 'partial',
      evidence: String(item.evidence || '').trim(),
      evidenceSource: 'model_assessment',
    })).filter(item => item.requirement),
    reasons: safeArray(assessment?.reasons).map(item => ({
      claim: String(item.claim || '').trim(), evidence: String(item.evidence || '').trim(), evidenceSource: 'model_assessment',
    })).filter(item => item.claim),
    useCases: safeArray(assessment?.useCases).map(item => ({
      capability: String(item.capability || '').trim(), useCase: String(item.useCase || '').trim(),
    })).filter(item => item.capability),
    interviewQuestions: safeArray(assessment?.interviewQuestions).map(item => ({
      question: String(item.question || '').trim(), gap: String(item.gap || '').trim(),
    })).filter(item => item.question),
  };
}

module.exports = { scoreWithOpenAI, parseScoringResponse, normaliseQuantitativeAnalysis };
