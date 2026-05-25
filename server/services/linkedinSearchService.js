/**
 * LinkedIn Candidate Search — harvestapi/linkedin-profile-search
 *
 * Runs the Apify actor synchronously and returns normalised candidates.
 * The Apify API token is supplied per-call (read from the logged-in
 * user's encrypted profile settings).
 */
const axios = require('axios');

const ACTOR_ID = 'harvestapi~linkedin-profile-search'; // tilde-form for URL path
const API_BASE = 'https://api.apify.com/v2';

const EXPERIENCE_MAP = {
  Entry:  ['1', '2'],          // Internship, Entry level
  Mid:    ['3', '4'],          // Associate, Mid-Senior
  Senior: ['5', '6', '7'],     // Director, Executive
};

function inferMarket(location, fallback) {
  if (fallback === 'UK' || fallback === 'Dubai') return fallback;
  const l = (location || '').toLowerCase();
  if (['dubai', 'uae', 'abu dhabi', 'sharjah', 'emirates'].some(k => l.includes(k))) return 'Dubai';
  return 'UK';
}

/**
 * Normalise a raw harvestapi profile to TalentLens shape.
 */
function normalise(raw, market) {
  const name =
    raw.fullName ||
    [raw.firstName, raw.lastName].filter(Boolean).join(' ') ||
    raw.name || 'Unknown';

  const profileUrl =
    raw.linkedinUrl || raw.profileUrl || raw.url || raw.publicIdentifier
      ? (raw.linkedinUrl || raw.profileUrl || raw.url ||
         `https://www.linkedin.com/in/${raw.publicIdentifier}`)
      : '';

  const headline = raw.headline || raw.title || '';
  const location = raw.location?.linkedinText || raw.location || raw.locationName || raw.geoLocationName || '';

  // Email harvested by "Full + email search" mode
  const email =
    raw.email ||
    raw.emailAddress ||
    (Array.isArray(raw.emails) && raw.emails[0]) ||
    '';

  const experience = Array.isArray(raw.experience) ? raw.experience.map(e => ({
    title:    e.title || e.position || '',
    company:  e.companyName || e.company || '',
    location: e.location || '',
    duration: e.duration || e.dateRange || '',
    description: e.description || '',
  })) : [];

  const education = Array.isArray(raw.education) ? raw.education.map(e => ({
    school: e.schoolName || e.school || e.title || '',
    degree: e.degree || e.degreeName || '',
    field:  e.fieldOfStudy || e.field || '',
    dates:  e.dateRange || e.duration || '',
  })) : [];

  const skills = Array.isArray(raw.skills)
    ? raw.skills.map(s => (typeof s === 'string' ? s : s.name || s.title)).filter(Boolean)
    : [];

  const current = experience[0] || {};

  return {
    name,
    headline,
    location: typeof location === 'string' ? location : (location?.text || ''),
    email,
    profileUrl,
    current_title:   current.title   || headline,
    current_company: current.company || '',
    experience,
    education,
    skills,
    market: inferMarket(typeof location === 'string' ? location : location?.text, market),
  };
}

/**
 * Run the harvestapi LinkedIn profile search actor.
 *
 * @param {object} params
 * @param {string} params.apifyToken       User's Apify API token.
 * @param {string} params.jobTitle         e.g. "Supply Chain Manager"
 * @param {string} params.location         e.g. "London" | "Dubai" | custom
 * @param {string} [params.market]         "UK" | "Dubai"
 * @param {string} [params.experienceLevel] "Entry" | "Mid" | "Senior"
 * @param {number} [params.maxResults=50]
 * @returns {Promise<object[]>}
 */
async function runLinkedInSearch({ apifyToken, jobTitle, location, market, experienceLevel, maxResults = 50 }) {
  if (!apifyToken) throw new Error('Apify API key is not configured for this user.');
  if (!jobTitle)   throw new Error('jobTitle is required.');

  const max = Math.min(500, Math.max(1, parseInt(maxResults) || 50));

  const input = {
    profileScraperMode: 'Full + email search',
    searchQuery:      jobTitle,
    currentJobTitles: [jobTitle],
    locations:        location ? [location] : [],
    maxItems:         max,
  };

  const expCodes = EXPERIENCE_MAP[experienceLevel];
  if (expCodes) input.experienceLevels = expCodes;

  const headers = { Authorization: `Bearer ${apifyToken}` };

  // Start the run, wait up to ~290s for completion
  const runRes = await axios.post(
    `${API_BASE}/acts/${ACTOR_ID}/runs`,
    input,
    { headers, params: { waitForFinish: 290 }, timeout: 300_000 },
  );

  const runData = runRes.data?.data || runRes.data;
  const datasetId = runData?.defaultDatasetId;
  if (!datasetId) throw new Error('Apify run did not return a dataset ID.');

  // Poll once more if status is still RUNNING (rare with waitForFinish)
  if (runData.status && runData.status !== 'SUCCEEDED' && runData.status !== 'FAILED') {
    const runId = runData.id;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await axios.get(`${API_BASE}/actor-runs/${runId}`, { headers });
      const s = poll.data?.data?.status;
      if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'ABORTED' || s === 'TIMED-OUT') break;
    }
  }

  const dataRes = await axios.get(`${API_BASE}/datasets/${datasetId}/items`, {
    headers,
    params: { limit: max, clean: true },
  });

  const items = Array.isArray(dataRes.data) ? dataRes.data : (dataRes.data?.items || []);
  return items.map(it => normalise(it, market)).filter(c => c.profileUrl || c.name !== 'Unknown');
}

module.exports = { runLinkedInSearch, inferMarket };
