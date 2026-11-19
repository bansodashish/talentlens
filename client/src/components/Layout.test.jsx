import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Recruiter', role: 'user' }, logout: jest.fn() }),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
  THEMES: [],
}));

test('desktop and mobile navigation omit Candidates and retain the other main links', () => {
  render(<MemoryRouter><Layout><div>Content</div></Layout></MemoryRouter>);
  const desktop = screen.getByRole('navigation');
  const links = [['Dashboard', '/dashboard'], ['Jobs', '/jobs'], ['Screening', '/cv-match'], ['Pipeline', '/pipeline']];
  for (const [label, path] of links) {
    expect(within(desktop).getByRole('link', { name: label })).toHaveAttribute('href', path);
  }
  expect(within(desktop).queryByRole('link', { name: 'Candidates' })).not.toBeInTheDocument();

  const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const mobile = screen.getByText('Navigation').parentElement;
  for (const [label, path] of links) {
    expect(within(mobile).getByRole('link', { name: label })).toHaveAttribute('href', path);
  }
  expect(within(mobile).queryByRole('link', { name: 'Candidates' })).not.toBeInTheDocument();
  fireEvent.click(within(mobile).getByRole('link', { name: 'Pipeline' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});