/**
 * Shared helpers for local/self-hosted OpenAI-compatible resume screeners
 * (OpenClaw/Ollama, LocalAI, etc.). Keeps JSON extraction + score
 * normalisation in one place so each screener only differs by its HTTP
 * client configuration (base URL, model, API key).
 */

function extractJson(text) {
  if (!text) throw new Error('Empty response from local model.');
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
    jobTitle: String(raw.jobTitle || '').trim(),
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

module.exports = { extractJson, normalise };
