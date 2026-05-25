const axios = require('axios');

const REED_BASE = 'https://www.reed.co.uk/recruiter/api/1.0';

const getAuth = () => {
  const key = process.env.REED_API_KEY;
  if (!key) return null;
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
};

const inferMarket = (location = '') => {
  const l = location.toLowerCase();
  return ['dubai', 'uae', 'abu dhabi', 'sharjah'].some(k => l.includes(k)) ? 'Dubai' : 'UK';
};

const normalise = (raw) => ({
  name:             [raw.firstName, raw.lastName].filter(Boolean).join(' ') || 'Unknown',
  current_title:    raw.desiredJobTitle || raw.jobTitle || '',
  current_company:  raw.currentEmployer || '',
  location:         raw.location || '',
  market:           inferMarket(raw.location),
  email:            raw.email || '',
  phone:            raw.telephone || '',
  experience_years: raw.yearsExperience || null,
  skills:           Array.isArray(raw.skills) ? raw.skills.join(', ') : (raw.skills || ''),
  linkedin_url:     raw.linkedInUrl || '',
  source:           'reed',
  source_url:       `https://www.reed.co.uk/recruiter/candidate/${raw.candidateId}`,
  summary:          raw.summary || '',
  reed_id:          raw.candidateId,
});

/**
 * Search Reed CV database
 */
const searchCandidates = async ({ query, location, maxResults = 25 }) => {
  const auth = getAuth();
  if (!auth) {
    const err = new Error('Reed API key not configured. Add REED_API_KEY to server/.env');
    err.status = 503;
    err.hint = 'Contact reed.co.uk to obtain a Recruiter API key, then add REED_API_KEY=your_key to server/.env';
    throw err;
  }

  const res = await axios.get(`${REED_BASE}/cvsearch`, {
    headers: { Authorization: auth },
    params: {
      keywords:            query,
      location:            location || '',
      distanceFromLocation: 25,
      resultsToTake:       Math.min(maxResults, 100),
      resultsToSkip:       0,
    },
  });

  return (res.data.results || []).map(normalise);
};

/**
 * Get full candidate profile (uses a download credit on Reed)
 */
const getCandidate = async (candidateId) => {
  const auth = getAuth();
  if (!auth) throw new Error('Reed API key not configured.');
  const res = await axios.get(`${REED_BASE}/candidate/${candidateId}`, {
    headers: { Authorization: auth },
  });
  return normalise(res.data);
};

/**
 * Preview candidate without spending a download credit
 */
const previewCandidate = async (candidateId) => {
  const auth = getAuth();
  if (!auth) throw new Error('Reed API key not configured.');
  const res = await axios.get(`${REED_BASE}/candidatepreview/${candidateId}`, {
    headers: { Authorization: auth },
  });
  return normalise(res.data);
};

module.exports = { searchCandidates, getCandidate, previewCandidate, isConfigured: () => !!process.env.REED_API_KEY };
