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
