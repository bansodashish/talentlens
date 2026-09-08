/**
 * LocalAI Resume Screener Service — embedding-similarity mode
 *
 * Calls a self-hosted LocalAI instance (OpenAI-compatible /v1/embeddings API)
 * to embed the job description and resume text with a small embedding model
 * (e.g. bge-small-en or all-MiniLM-L6-v2), then scores the candidate primarily
 * by cosine similarity between the two vectors. This is much lighter/faster
 * than chat-completion-based screening (no token-by-token generation), which
 * matters on constrained VPS hardware. Keyword-based details (skills,
 * experience, location, contact info) come from the existing local scorer so
 * the result stays explainable, not just a bare similarity number.
 *
 * Runs alongside — not instead of — the OpenClaw/Ollama local mode.
 */
const { parseCV } = require('./cvParser');
const { scoreCandidate, detectRole, ALL_ROLES, extractContact, extractYears } = require('./scorer');
const { extractJobTitle } = require('../utils/extractJobTitle');

const BASE_URL = process.env.LOCALAI_BASE_URL || 'http://127.0.0.1:8081/v1';
// Must name an embedding model registered in LocalAI, e.g. "bge-small-en" or "all-MiniLM-L6-v2".
const MODEL = process.env.LOCALAI_MODEL || '';
const API_KEY = process.env.LOCALAI_API_KEY || 'local-dev-key';
const TIMEOUT_MS = Number(process.env.LOCALAI_TIMEOUT_MS || 180000);

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

async function getEmbeddings(texts) {
  const { OpenAI } = require('openai');
  const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS,
  });
  const res = await client.embeddings.create({ model: MODEL, input: texts });
  return res.data.map(d => d.embedding);
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

  const [jdVec, resumeVec] = await getEmbeddings([jobDescription, resumeText]);
  const similarity = cosineSimilarity(jdVec, resumeVec); // typically 0..1 for related text, can dip negative
  const semanticScore = Math.round(Math.max(0, Math.min(1, (similarity + 1) / 2)) * 100);

  const detectedRole = detectRole(resumeText);
  const local = scoreCandidate(resumeText, jobDescription, detectedRole);
  const contact = extractContact(resumeText);
  const roleTitle = detectedRole && ALL_ROLES[detectedRole] ? ALL_ROLES[detectedRole].title : '';
  const locationScore = Math.round((local.details.location || 0) * 100);

  // Semantic similarity is the primary signal; keyword match is a secondary,
  // more explainable signal blended in.
  const overallScore = Math.round(semanticScore * 0.7 + local.score_pct * 0.3);
  const recommendation = overallScore >= 75 ? 'Strong Hire' : overallScore >= 55 ? 'Consider' : 'Reject';

  const keySkills = (local.details.matchedSkills || []).slice(0, 12);
  const gapNote = local.gaps?.length
    ? ` Key gaps: ${local.gaps.slice(0, 3).map(g => g.replace(/^Missing:\s*/i, '')).join(', ')}.`
    : '';
  const summary = `Semantic match ${semanticScore}% (embedding similarity), keyword match ${local.score_pct}%. ${local.recommendation}.${gapNote}`;

  const result = {
    name: contact.name || '',
    email: contact.email,
    phone: contact.phone,
    currentRole: roleTitle,
    jobTitle: extractJobTitle(jobDescription),
    yearsExperience: extractYears(resumeText),
    keySkills,
    strengths: local.strengths || [],
    gaps: local.gaps || [],
    supplyChainScore: semanticScore,
    procurementScore: local.score_pct,
    logisticsScore: locationScore,
    technologyScore: 0,
    overallScore,
    recommendation,
    summary,
  };

  return {
    result,
    raw: {
      mode: 'localai-embeddings',
      model: MODEL,
      similarity,
      semanticScore,
      keywordScore: local.score_pct,
      detectedRole,
    },
  };
}

module.exports = { screenResume, MODEL, BASE_URL };

