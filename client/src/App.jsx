import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Candidates from './pages/Candidates';
import CandidateForm from './pages/CandidateForm';
import CandidateDetail from './pages/CandidateDetail';
import Jobs from './pages/Jobs';
import JobForm from './pages/JobForm';
import JobDetail from './pages/JobDetail';
import Pipeline from './pages/Pipeline';
import Scraper from './pages/Scraper';
import CandidateSearch from './pages/CandidateSearch';
import CVMatch from './pages/Screen';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import History from './pages/History';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';

function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  // First-time users → onboarding
  if (user.onboarding_complete === false) return <Navigate to="/onboarding" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && user.onboarding_complete === false) return <Navigate to="/onboarding" replace />;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

function LandingRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && user.onboarding_complete === false) return <Navigate to="/onboarding" replace />;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function OnboardingRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboarding_complete) return <Navigate to="/dashboard" replace />;
  return <Onboarding />;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"         element={<LandingRoute />} />
          <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/onboarding" element={<OnboardingRoute />} />

          {/* Core recruitment */}
          <Route path="/dashboard"           element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/candidates"          element={<PrivateRoute><Candidates /></PrivateRoute>} />
          <Route path="/candidates/new"      element={<PrivateRoute><CandidateForm /></PrivateRoute>} />
          <Route path="/candidates/:id"      element={<PrivateRoute><CandidateDetail /></PrivateRoute>} />
          <Route path="/candidates/:id/edit" element={<PrivateRoute><CandidateForm /></PrivateRoute>} />
          <Route path="/jobs"                element={<PrivateRoute><Jobs /></PrivateRoute>} />
          <Route path="/jobs/new"            element={<PrivateRoute><JobForm /></PrivateRoute>} />
          <Route path="/jobs/:id"            element={<PrivateRoute><JobDetail /></PrivateRoute>} />
          <Route path="/jobs/:id/edit"       element={<PrivateRoute><JobForm /></PrivateRoute>} />
          <Route path="/pipeline"            element={<PrivateRoute><Pipeline /></PrivateRoute>} />

          {/* AI Tools */}
          <Route path="/candidate-search" element={<PrivateRoute><CandidateSearch /></PrivateRoute>} />
          <Route path="/cv-match"         element={<PrivateRoute><CVMatch /></PrivateRoute>} />
          <Route path="/scraper"          element={<Navigate to="/candidate-search" replace />} />
          <Route path="/search"           element={<Navigate to="/candidate-search" replace />} />
          <Route path="/screen"           element={<Navigate to="/cv-match" replace />} />
          <Route path="/history"          element={<PrivateRoute><History /></PrivateRoute>} />

          {/* Account */}
          <Route path="/profile"   element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/admin"     element={<PrivateRoute adminOnly><Admin /></PrivateRoute>} />

          {/* Fallbacks */}
          <Route path="*"  element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
