import { getStrengthsAndGaps, getCvEvidence, getSummaryDetails } from './screeningEvidence';

test('getStrengthsAndGaps prefers saved strengths/gaps over derived assessment fields', () => {
  const screening = {
    strengths: ['Kubernetes'],
    gaps: [],
    assessment: {
      reasons: [{ claim: 'Terraform' }],
      requirements: [{ requirement: 'GitLab', fit: 'not_met' }],
    },
  };
  expect(getStrengthsAndGaps(screening)).toEqual({ strengths: ['Kubernetes'], weaknesses: ['GitLab'] });
});

test('getCvEvidence excludes non cv_excerpt items, duplicates, and contact details', () => {
  const screening = {
    assessment: {
      requirements: [
        { requirement: 'Kubernetes', evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' },
        { requirement: 'Kubernetes', evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' },
        { requirement: 'Email', evidence: 'Contact test@example.com', evidenceSource: 'cv_excerpt' },
        { requirement: 'GitLab', evidence: 'No evidence', evidenceSource: 'generated_fallback' },
      ],
      reasons: [],
    },
  };
  expect(getCvEvidence(screening)).toEqual([
    { requirement: 'Kubernetes', evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' },
  ]);
});

test('adds distinct attributed evidence, clarification and a follow-up question', () => {
  const screening = { assessment: {
    reasons: [
      { evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' },
      { evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' },
      { evidence: 'Led production migrations', evidenceSource: 'model_assessment' },
    ],
    requirements: [{ requirement: 'GitLab', fit: 'partial', evidence: 'Generated guidance', evidenceSource: 'generated_fallback' }],
    interviewQuestions: [{ question: 'How did you use GitLab?' }],
  } };
  expect(getSummaryDetails(screening, 'Experienced platform engineer.')).toEqual([
    'CV excerpt: "Built Kubernetes platforms" AI assessment: Led production migrations',
    'Areas to clarify: GitLab.',
    'Interview follow-up: How did you use GitLab?',
  ]);
});

test('omits duplicates, synthetic evidence, contact details and missing fields', () => {
  expect(getSummaryDetails({ assessment: {
    reasons: [
      { evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' },
      { evidence: 'Contact jane@example.com for details', evidenceSource: 'cv_excerpt' },
      { evidence: 'Identified from the candidate CV.', evidenceSource: 'generated_fallback' },
      { evidence: 'Kubernetes', evidenceSource: 'model_assessment' },
    ],
    requirements: null,
    interviewQuestions: [{ question: 'Call +1 555 123 4567' }],
  } }, 'Built Kubernetes platforms.')).toEqual([]);
  expect(getSummaryDetails({})).toEqual([]);
});
