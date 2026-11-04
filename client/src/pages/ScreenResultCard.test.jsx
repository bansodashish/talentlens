import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResultCard } from './Screen';

test.each(['Strong Hire', 'Consider', 'Reject'])('%s result card displays prose and links to the full analysis', recommendation => {
  render(<MemoryRouter><ResultCard rank={1} c={{
    id: 1, name: 'Candidate', recommendation, summary: 'Built production infrastructure. Scope needs clarification.',
    strengths: ['Kubernetes'], gaps: ['GitLab'], assessment: { requirements: [{ evidence: 'An excerpt', evidenceSource: 'cv_excerpt' }] },
  }} /></MemoryRouter>);
  expect(screen.getByText('Built production infrastructure. Scope needs clarification.')).toBeInTheDocument();
  expect(screen.queryByText('Strengths')).not.toBeInTheDocument();
  expect(screen.queryByText('CV evidence')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'More info' })).toHaveAttribute('href', '/cv-match/results/1');
});