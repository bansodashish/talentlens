import { getStrengthsAndGaps, getCvEvidence } from './screeningEvidence';

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
