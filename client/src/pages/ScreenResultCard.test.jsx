import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResultCard } from './Screen';

test.each(['Strong Hire', 'Consider', 'Reject'])('%s result card displays prose and links to the full analysis', recommendation => {
  render(<MemoryRouter><ResultCard c={{
    id: 1, name: 'Candidate', currentRole: 'Supply Chain Analyst', recommendation, summary: 'Built production infrastructure. Scope needs clarification.',
    strengths: ['Kubernetes'], gaps: ['GitLab'], assessment: {
      reasons: [{ evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' }],
      requirements: [{ requirement: 'GitLab', fit: 'partial' }],
      interviewQuestions: [{ question: 'How did you use GitLab?' }],
    },
  }} /></MemoryRouter>);
  expect(screen.getByText('Built production infrastructure. Scope needs clarification.')).toBeInTheDocument();
  expect(screen.getByText('CV excerpt: "Built Kubernetes platforms"')).toBeInTheDocument();
  expect(screen.getByText('Areas to clarify: GitLab.')).toBeInTheDocument();
  expect(screen.queryByText('Interview follow-up: How did you use GitLab?')).not.toBeInTheDocument();
  expect(screen.queryByText('Strengths')).not.toBeInTheDocument();
  expect(screen.queryByText('CV evidence')).not.toBeInTheDocument();
  const analysisLink = screen.getByRole('link', { name: 'View Full Analysis' });
  expect(analysisLink).toHaveAttribute('href', '/cv-match/results/1');
  expect(analysisLink.compareDocumentPosition(screen.getByRole('button', { name: 'Add to Pipeline' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText('Supply Chain Analyst')).not.toBeInTheDocument();
  expect(screen.queryByText('1')).not.toBeInTheDocument();
});

test('handles pending, failed, missing ID and already-added results', () => {
  const { rerender } = render(<MemoryRouter><ResultCard c={{ name: 'Pending', status: 'pending' }} /></MemoryRouter>);
  expect(screen.queryByRole('link', { name: 'View Full Analysis' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add to Pipeline' })).not.toBeInTheDocument();
  rerender(<MemoryRouter><ResultCard c={{ fileName: 'failed.pdf', status: 'failed', error: 'Failed to screen' }} /></MemoryRouter>);
  expect(screen.getByText('Failed to screen')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'View Full Analysis' })).not.toBeInTheDocument();
  rerender(<MemoryRouter><ResultCard c={{ name: 'No ID' }} isAdded /></MemoryRouter>);
  expect(screen.queryByRole('link', { name: 'View Full Analysis' })).not.toBeInTheDocument();
  expect(screen.getByText('Added to Pipeline')).toBeInTheDocument();
});