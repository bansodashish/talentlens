function composeHRSummary({ summary, strengths, gaps, assessment, jobTitle }) {
  const cleanItem = value => String(value || '')
    .replace(/^(?:Matched|Missing):\s*/i, '')
    .replace(/\.$/, '')
    .trim();
  const uniqueItems = values => [...new Set(values.map(cleanItem).filter(Boolean))].slice(0, 3);
  const supportedStrengths = uniqueItems([
    ...(strengths || []),
    ...(assessment?.reasons || []).map(item => item.claim),
  ]);
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
  if (cleanedSummary && !/^analysis incomplete|^review needed/i.test(cleanedSummary)) {
    return cleanedSummary.replace(/\s+/g, ' ');
  }
  const role = jobTitle ? ` for the ${jobTitle} role` : '';
  const overview = `The CV shows evidence relevant${role}.`;
  const strengthSentence = supportedStrengths.length
    ? ` Demonstrated strengths include ${supportedStrengths.join(', ')}.`
    : '';
  const clarificationSentence = clarificationAreas.length
    ? ` Areas to clarify include ${clarificationAreas.join(', ')}.`
    : ' Further discussion should confirm the depth of experience against the role requirements.';

  return `${overview}${strengthSentence}${clarificationSentence}`.replace(/\s+/g, ' ').trim();
}

module.exports = { composeHRSummary };