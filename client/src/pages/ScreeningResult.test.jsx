import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test.each(['Strong Hire', 'Consider', 'Reject'])('%s shows a narrative and keeps evidence in the expanded analysis', async recommendation => {
  renderResult(recommendation);
  await waitFor(() => expect(screen.getByText('Test Candidate')).toBeInTheDocument());
  expect(screen.queryByText('Demand Planner')).not.toBeInTheDocument();
  expect(screen.getByText('DevOps Engineer')).toBeInTheDocument();
  expect(screen.getAllByText(recommendation).length).toBeGreaterThan(0);
  expect(screen.getByText('Built production infrastructure. The scope of delivery needs clarification.')).toBeInTheDocument();
  expect(screen.queryByText('Strengths')).not.toBeInTheDocument();
  expect(screen.queryByText('Areas to clarify')).not.toBeInTheDocument();
  expect(screen.queryByText('Built Kubernetes platforms')).not.toBeInTheDocument();
  expect(screen.queryByText('Contact test@example.com')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Explore Full Screening Analysis/i }));
  expect(screen.getAllByText('Built Kubernetes platforms')).toHaveLength(2);
  expect(screen.getByText('No GitLab evidence')).toBeInTheDocument();
});

test('handles a saved assessment without CV excerpts or strength and gap lists', async () => {
  api.get.mockResolvedValue({ data: { screening: {
    name: 'Another Candidate', jobTitle: 'Engineer', recommendation: 'Consider',
    strengths: [], gaps: [], assessment: { requirements: [{ requirement: 'Automation', fit: 'partial' }], reasons: [{ claim: 'Platform experience' }] },
  } } });
  render(<MemoryRouter initialEntries={['/results/2']}><Routes><Route path="/results/:screeningId" element={<ScreeningResult />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Another Candidate')).toBeInTheDocument());
  expect(screen.queryByText('CV evidence')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Explore Full Screening Analysis/i }));
  expect(screen.getByText('Platform experience')).toBeInTheDocument();
  expect(screen.getAllByText('Automation').length).toBeGreaterThan(0);
});