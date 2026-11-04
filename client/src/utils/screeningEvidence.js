// Shared presentation logic for screening results, used by both the
// post-screening results list (Screen.jsx) and the full analysis page
// (ScreeningResult.jsx) so both surfaces show the same grounded detail.

export function getStrengthsAndGaps(screening) {
  const assessment = screening?.assessment || {};
  const requirements = assessment.requirements || [];
  const reasons = assessment.reasons || [];
  const savedStrengths = screening?.strengths?.filter(Boolean) || [];
  const savedGaps = screening?.gaps?.filter(Boolean) || [];
  const strengths = (savedStrengths.length ? savedStrengths : reasons.map(item => item.claim).filter(Boolean)).slice(0, 3);
  const weaknesses = (savedGaps.length ? savedGaps : requirements
    .filter(item => item.fit === 'partial' || item.fit === 'not_met')
    .map(item => item.requirement)
    .filter(Boolean)).slice(0, 3);
  return { strengths, weaknesses };
}

// Matches an email address or a phone-like digit run, so contact details
// never leak into a "CV excerpt" even if the model captured them as evidence.
const CONTACT_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+?\d[\d\s().-]{7,}\d)/;

export function getCvEvidence(screening, limit = 3) {
  const assessment = screening?.assessment || {};
  const requirements = assessment.requirements || [];
  const reasons = assessment.reasons || [];
  const seen = new Set();
  return [...requirements, ...reasons].filter(item => {
    const text = typeof item.evidence === 'string' ? item.evidence.trim() : '';
    if (item.evidenceSource !== 'cv_excerpt' || !text || seen.has(text) || CONTACT_PATTERN.test(text)) return false;
    seen.add(text);
    return true;
  }).slice(0, limit);
}

export function getSummaryDetails(screening, summary = '', limit = 3) {
  const assessment = screening?.assessment || {};
  const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
  const requirements = Array.isArray(assessment.requirements) ? assessment.requirements : [];
  const questions = Array.isArray(assessment.interviewQuestions) ? assessment.interviewQuestions : [];
  const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const existing = clean(summary).toLowerCase();
  const seen = new Set();
  const evidence = [];

  for (const item of [...reasons, ...requirements]) {
    if (!item || !['cv_excerpt', 'model_assessment'].includes(item.evidenceSource)) continue;
    const text = clean(item.evidence);
    const key = text.toLowerCase();
    if (!text || text.split(/\s+/).length < 3 || CONTACT_PATTERN.test(text) || existing.includes(key) || seen.has(key)) continue;
    seen.add(key);
    evidence.push(item.evidenceSource === 'cv_excerpt' ? `CV excerpt: "${text}"` : `AI assessment: ${text}`);
    if (evidence.length === 2) break;
  }

  const areas = requirements
    .filter(item => item && (item.fit === 'partial' || item.fit === 'not_met'))
    .map(item => clean(item.requirement))
    .filter(text => text && !CONTACT_PATTERN.test(text) && !existing.includes(text.toLowerCase()));
  const uniqueAreas = [...new Set(areas.map(text => text.toLowerCase()))]
    .map(key => areas.find(text => text.toLowerCase() === key)).slice(0, 3);
  const question = questions.map(item => clean(item?.question))
    .find(text => text && !CONTACT_PATTERN.test(text) && !existing.includes(text.toLowerCase()));

  return [
    evidence.join(' '),
    uniqueAreas.length ? `Areas to clarify: ${uniqueAreas.join(', ')}.` : '',
    question ? `Interview follow-up: ${question}` : '',
  ].filter(Boolean).slice(0, Math.max(0, limit));
}
