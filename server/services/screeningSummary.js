// Matches an email address or a phone-like digit run, so a quoted CV excerpt
// never leaks contact details into the generated summary.
const CONTACT_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+?\d[\d\s().-]{7,}\d)/;

function joinWithAnd(items) {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function findGroundingExcerpts(assessment) {
  const candidates = [...(assessment?.requirements || []), ...(assessment?.reasons || [])];
  const excerpts = [];
  const seen = new Set();
  for (const item of candidates) {
    const text = typeof item.evidence === 'string' ? item.evidence.trim() : '';
    const normalized = text.replace(/\s+/g, ' ');
    if (item.evidenceSource === 'cv_excerpt' && normalized && !CONTACT_PATTERN.test(normalized) && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      excerpts.push(normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized);
      if (excerpts.length === 3) break;
    }
  }
  return excerpts;
}

function composeHRSummary({ summary, strengths, gaps, assessment, jobTitle }) {
  const cleanItem = value => String(value || '')
    .replace(/^(?:Matched|Missing):\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  const uniqueItems = values => [...new Set(values.map(cleanItem).filter(Boolean))].slice(0, 3);
  const supportedStrengths = uniqueItems(strengths || []);
  const clarificationAreas = uniqueItems([
    ...(gaps || []),
    ...(assessment?.requirements || [])
      .filter(item => item.fit === 'partial' || item.fit === 'not_met')
      .map(item => item.requirement),
  ]);
  const cleanedSummary = String(summary || '')
    .replace(/^Quantitative screening\s*-\s*(?:Strong Hire|Consider|Reject)\s*\(\s*\d+\s*\/\s*100\s*\)\.\s*/i, '')
    .replace(/^Key skill gaps?:\s*/i, '')
    .replace(/\b(?:Strong Hire|Consider|Reject)\s*\(\s*\d+\s*\/\s*100\s*\)\.?\s*/gi, '')
    .trim();
  const legacyFallback = /^The CV shows evidence relevant(?: for the .+? role)?\.(?: Demonstrated strengths include [^.]+\.)?(?: This is grounded in CV evidence such as: "[\s\S]*"\.)? (?:Areas to clarify include [^.]+\.|Further discussion should confirm the depth of experience against the role requirements\.)$/i.test(cleanedSummary);
  if (cleanedSummary && !legacyFallback && !/^analysis incomplete|^review needed/i.test(cleanedSummary)) {
    return cleanedSummary.replace(/\s+/g, ' ');
  }
  const role = jobTitle ? ` for the ${jobTitle} role` : '';
  const excerpts = findGroundingExcerpts(assessment);
  const reasons = (assessment?.reasons || [])
    .map(item => String(item.claim || '').trim())
    .filter(claim => claim && claim.split(/\s+/).length > 1);
  const useCases = (assessment?.useCases || [])
    .map(item => String(item.useCase || '').trim())
    .filter(text => text && text.split(/\s+/).length > 3);

  const opening = excerpts.length
    ? `The CV includes the following evidence relevant to the screening${role}: ${excerpts.map(excerpt => `"${excerpt}"`).join(' ')}${/[.!?]$/.test(excerpts[excerpts.length - 1]) ? '' : '.'}`
    : `No supporting CV excerpts were captured for the screening${role}.`;
  const matchedTerms = supportedStrengths.length && !excerpts.length
    ? ` The screening matched the following terms: ${joinWithAnd(supportedStrengths)}; these matches should be reviewed in context rather than treated as confirmed expertise.`
    : '';
  const claimsSentence = reasons.length
    ? ` The assessment notes: ${joinWithAnd([...new Set(reasons)].slice(0, 3).map(text => text.replace(/\.$/, '')))}.`
    : '';
  const relevanceSentence = useCases.length
    ? ` Based on this, the candidate could be expected to contribute to work such as: ${joinWithAnd([...new Set(useCases)].slice(0, 2).map(text => text.replace(/\.$/, '')))}. This is a projection of fit, not a claim that they have done it.`
    : '';
  const clarificationSentence = clarificationAreas.length
    ? ` Areas to clarify include ${joinWithAnd(clarificationAreas)}; these can be probed at interview to confirm depth of experience.`
    : ' Further discussion should confirm the depth of experience against the role requirements.';

  return `${opening}${matchedTerms}${claimsSentence}${relevanceSentence}${clarificationSentence}`.replace(/\s+/g, ' ').trim();
}

module.exports = { composeHRSummary };