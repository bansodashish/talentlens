import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ScreeningResult from './ScreeningResult';
import api from '../utils/api';

jest.mock('../utils/api', () => ({ get: jest.fn(), patch: jest.fn() }));

const renderResult = recommendation => {
  api.get.mockResolvedValue({ data: { screening: {
    name: 'Test Candidate', currentRole: 'Demand Planner', jobTitle: 'DevOps Engineer', recommendation,
    summary: 'Built production infrastructure. The scope of delivery needs clarification.',
    strengths: ['Kubernetes'], gaps: ['GitLab'],
    assessment: {
      requirements: [
        { requirement: 'Kubernetes', fit: 'strong', evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' },
        { requirement: 'Personal details', fit: 'strong', evidence: 'Contact test@example.com', evidenceSource: 'cv_excerpt' },
        { requirement: 'GitLab', fit: 'not_met', evidence: 'No GitLab evidence', evidenceSource: 'generated_fallback' },
      ],
      reasons: [{ claim: 'Kubernetes', evidence: 'Built Kubernetes platforms', evidenceSource: 'cv_excerpt' }],
    },
  } } });
  render(<MemoryRouter initialEntries={['/results/1']}><Routes><Route path="/results/:screeningId" element={<ScreeningResult />} /></Routes></MemoryRouter>);
};

test.each(['Strong Hire', 'Consider', 'Reject'])('%s shows the job and grounded evidence without the inferred role', async recommendation => {
  renderResult(recommendation);
  await waitFor(() => expect(screen.getByText('Test Candidate')).toBeInTheDocument());
  expect(screen.queryByText('Demand Planner')).not.toBeInTheDocument();
  expect(screen.getByText('DevOps Engineer')).toBeInTheDocument();
  expect(screen.getAllByText(recommendation).length).toBeGreaterThan(0);
  expect(screen.getByText('Strengths')).toBeInTheDocument();
  expect(screen.getByText('Areas to clarify')).toBeInTheDocument();
  expect(screen.getByText('CV evidence')).toBeInTheDocument();
  expect(screen.getAllByText('Built Kubernetes platforms')).toHaveLength(1);
  expect(screen.queryByText('Contact test@example.com')).not.toBeInTheDocument();
  expect(screen.queryByText('No GitLab evidence')).not.toBeInTheDocument();
});

test('handles a saved assessment without CV excerpts or strength and gap lists', async () => {
  api.get.mockResolvedValue({ data: { screening: {
    name: 'Another Candidate', jobTitle: 'Engineer', recommendation: 'Consider',
    strengths: [], gaps: [], assessment: { requirements: [{ requirement: 'Automation', fit: 'partial' }], reasons: [{ claim: 'Platform experience' }] },
  } } });
  render(<MemoryRouter initialEntries={['/results/2']}><Routes><Route path="/results/:screeningId" element={<ScreeningResult />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Another Candidate')).toBeInTheDocument());
  expect(screen.queryByText('CV evidence')).not.toBeInTheDocument();
  expect(screen.getByText('Platform experience')).toBeInTheDocument();
  expect(screen.getAllByText('Automation').length).toBeGreaterThan(0);
});