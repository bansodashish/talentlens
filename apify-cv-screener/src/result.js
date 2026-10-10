export function extractJson(text) {
  const candidate = String(text || '').trim().replace(/^```json\s*|\s*```$/gi, '');
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('OpenRouter did not return a JSON object.');
  return JSON.parse(candidate.slice(start, end + 1));
}

function score(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function normaliseResult(raw) {
  const recommendation = ['Strong Hire', 'Consider', 'Reject'].includes(raw.recommendation)
    ? raw.recommendation
    : score(raw.overallScore) >= 75 ? 'Strong Hire' : score(raw.overallScore) >= 55 ? 'Consider' : 'Reject';

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
    supplyChainScore: score(raw.supplyChainScore),
    procurementScore: score(raw.procurementScore),
    logisticsScore: score(raw.logisticsScore),
    technologyScore: score(raw.technologyScore),
    overallScore: score(raw.overallScore),
    recommendation,
    summary: String(raw.summary || '').trim(),
  };
}