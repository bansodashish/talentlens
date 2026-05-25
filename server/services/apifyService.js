const axios = require('axios');

const APIFY_BASE = 'https://api.apify.com/v2';

// ── Core Apify runner ─────────────────────────────────────────────────────────

const runActor = async (actorId, input, maxItems = 25) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    const err = new Error('Apify token not configured. Add APIFY_TOKEN to server/.env');
    err.status = 503;
    err.hint = 'Get your token at https://console.apify.com/account/integrations';
    throw err;
  }

  console.log(`[Apify] Starting actor: ${actorId}`, JSON.stringify(input, null, 2));

  let runId, defaultDatasetId;

  try {
    // Start the run — waitForFinish=300 means Apify waits up to 5 min server-side
    const runRes = await axios.post(
      `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs`,
      input,
      {
        params: { token, waitForFinish: 300 },
        timeout: 330_000, // 5.5 min axios timeout
      }
    );

    const runData = runRes.data?.data ?? runRes.data;
    runId           = runData.id;
    defaultDatasetId = runData.defaultDatasetId;
    const immediateStatus = runData.status;

    console.log(`[Apify] Run started — id=${runId} dataset=${defaultDatasetId} status=${immediateStatus}`);

    // If already finished (waitForFinish resolved it), skip polling
    if (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(immediateStatus)) {
      // Still running — poll up to 2 more minutes
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await axios.get(`${APIFY_BASE}/actor-runs/${runId}`, {
          params: { token },
          timeout: 15_000,
        });
        const status = statusRes.data.data?.status || statusRes.data.status;
        console.log(`[Apify] Poll ${i + 1}: ${status}`);
        if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) break;
      }
    }
  } catch (axiosErr) {
    console.error('[Apify] Run start failed:', axiosErr.response?.data || axiosErr.message);
    const err = new Error(
      axiosErr.response?.data?.error?.message ||
      axiosErr.response?.data?.message ||
      `Apify actor call failed: ${axiosErr.message}`
    );
    err.status = axiosErr.response?.status || 502;
    err.hint   = axiosErr.response?.status === 404
      ? `Actor "${actorId}" not found on Apify. Check the actor ID in your .env file.`
      : axiosErr.response?.status === 401
      ? 'Invalid Apify token. Check APIFY_TOKEN in server/.env'
      : null;
    throw err;
  }

  // Fetch results from the dataset
  try {
    const dataRes = await axios.get(
      `${APIFY_BASE}/datasets/${defaultDatasetId}/items`,
      { params: { token, limit: maxItems, clean: true }, timeout: 30_000 }
    );
    const items = dataRes.data || [];
    console.log(`[Apify] Dataset returned ${items.length} items`);
    return items;
  } catch (dataErr) {
    console.error('[Apify] Dataset fetch failed:', dataErr.message);
    return [];
  }
};

// ── Market helper ─────────────────────────────────────────────────────────────
const inferMarket = (location = '') => {
  const l = location.toLowerCase();
  return ['dubai', 'uae', 'abu dhabi', 'sharjah', 'united arab'].some(k => l.includes(k)) ? 'Dubai' : 'UK';
};

// ── LinkedIn People Search ────────────────────────────────────────────────────

const normaliseLinkedIn = (raw) => ({
  name:            raw.fullName || raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(' ') || 'Unknown',
  current_title:   raw.headline || raw.jobTitle || raw.title || raw.occupation || '',
  current_company: raw.companyName || raw.currentCompany || raw.company || (raw.positions?.[0]?.companyName) || '',
  location:        raw.location || raw.addressWithCountry || raw.city || '',
  market:          inferMarket(raw.location || raw.addressWithCountry || raw.city || ''),
  // email: check many possible field names the actor might return
  email:           raw.email || raw.emailAddress || raw.workEmail || raw.personalEmail ||
                   raw.emails?.[0] || raw.contactInfo?.email || '',
  // phone: same
  phone:           raw.phone || raw.phoneNumber || raw.mobile ||
                   raw.phones?.[0] || raw.contactInfo?.phone || '',
  skills:          Array.isArray(raw.skills) ? raw.skills.join(', ') : (raw.skills || ''),
  linkedin_url:    raw.linkedInUrl || raw.profileUrl || raw.url || raw.linkedinUrl || '',
  source:          'linkedin',
  source_url:      raw.linkedInUrl || raw.profileUrl || raw.url || raw.linkedinUrl || '',
  summary:         raw.summary || raw.about || raw.description || '',
  experience_years: raw.yearsOfExperience || raw.totalExperienceInYears || null,
});

const searchLinkedIn = async ({ query, location, maxItems = 25 }) => {
  const actorId = process.env.APIFY_LINKEDIN_ACTOR_ID;
  if (!actorId) {
    const err = new Error('LinkedIn actor not configured. Add APIFY_LINKEDIN_ACTOR_ID to server/.env');
    err.status = 503;
    throw err;
  }

  const searchKeywords = [query, location].filter(Boolean).join(' ');
  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchKeywords)}&origin=GLOBAL_SEARCH_HEADER`;

  // Input schema for get-leads~linkedin-scraper (no cookies, free email discovery)
  const input = {
    // Search mode
    searchType:       'people',
    searchKeywords,
    keywords:         searchKeywords,
    query:            searchKeywords,

    // Location
    location:         location || '',
    locationName:     location || '',
    geoUrn:           '',

    // Search URL fallback
    startUrls:        [{ url: searchUrl }],
    searchUrl,
    profileUrls:      [searchUrl],

    // Output controls
    maxResults:       maxItems,
    maxItems,
    resultsPerPage:   maxItems,
    count:            maxItems,
    limit:            maxItems,

    // Email discovery (key feature of get-leads actor)
    findEmails:       true,
    scrapeEmail:      true,
    getEmail:         true,
    emailDiscovery:   true,

    // Profile details
    scrapeCompany:    false,
    scrapeSkills:     true,
    getContactInfo:   true,
  };

  const items = await runActor(actorId, input, maxItems);
  return items.map(normaliseLinkedIn);
};

// ── CV-Library Search ─────────────────────────────────────────────────────────

const normaliseCVLibrary = (raw) => ({
  name:            raw.name || raw.fullName || raw.candidateName || 'Unknown',
  current_title:   raw.jobTitle || raw.title || raw.desiredRole || raw.currentRole || raw.position || '',
  current_company: raw.currentEmployer || raw.company || raw.employer || '',
  location:        raw.location || raw.city || raw.town || raw.region || '',
  market:          inferMarket(raw.location || raw.city || raw.town || ''),
  email:           raw.email || raw.emailAddress || '',
  phone:           raw.phone || raw.telephone || raw.mobile || '',
  skills:          Array.isArray(raw.skills) ? raw.skills.join(', ') : (raw.skills || raw.keySkills || ''),
  linkedin_url:    raw.linkedinUrl || raw.linkedin || raw.linkedInUrl || '',
  source:          'cv-library',
  source_url:      raw.profileUrl || raw.url || raw.cvUrl || `https://www.cv-library.co.uk/candidate/${raw.candidateId || raw.id || ''}`,
  summary:         raw.summary || raw.description || raw.profileSummary || raw.about || '',
  experience_years: raw.experience || raw.yearsOfExperience || raw.experienceYears || null,
});

const searchCVLibrary = async ({ query, location, maxItems = 25 }) => {
  const actorId = process.env.APIFY_CVLIBRARY_ACTOR_ID;
  if (!actorId) {
    const err = new Error('CV-Library actor not configured. Add APIFY_CVLIBRARY_ACTOR_ID to server/.env');
    err.status = 503;
    throw err;
  }

  // Broad input — covers field names used by various CV-Library Apify actors
  const input = {
    // Most common field names across actors
    keyword:        query,
    keywords:       query,
    searchTerm:     query,
    search:         query,
    query:          query,
    jobTitle:       query,

    location:       location || '',
    locationName:   location || '',
    city:           location || '',
    area:           location || '',

    distance:       25,
    radius:         25,
    distanceMiles:  25,

    maxItems,
    maxResults:     maxItems,
    limit:          maxItems,
    resultsPerPage: maxItems,
  };

  const items = await runActor(actorId, input, maxItems);
  return items.map(normaliseCVLibrary);
};

// ── Legacy generic search (kept for backward compat) ─────────────────────────

const normaliseCandidate = (raw) => ({
  name:            raw.name || raw.fullName || 'Unknown',
  current_title:   raw.headline || raw.jobTitle || raw.title || '',
  current_company: raw.company || raw.currentCompany || '',
  location:        raw.location || '',
  market:          inferMarket(raw.location || ''),
  email:           raw.email || '',
  phone:           raw.phone || '',
  skills:          Array.isArray(raw.skills) ? raw.skills.join(', ') : '',
  linkedin_url:    raw.linkedInUrl || raw.profileUrl || '',
  source:          'apify',
  source_url:      raw.linkedInUrl || raw.profileUrl || '',
  summary:         raw.summary || '',
  experience_years: null,
});

const searchCandidates = async ({ query, location, maxItems = 25, sources }) => {
  const actorId = process.env.APIFY_ACTOR_ID;
  const taskId  = process.env.APIFY_TASK_ID;
  if (!actorId && !taskId) {
    const err = new Error('Apify actor not configured.');
    err.status = 503;
    err.hint = 'Set APIFY_ACTOR_ID or APIFY_TASK_ID in server/.env';
    throw err;
  }
  const id    = actorId || taskId;
  const items = await runActor(id, { query, location, maxItems, sources }, maxItems);
  return items.map(r => normaliseCandidate(r));
};

// ── Connectivity test ─────────────────────────────────────────────────────────
const testConnection = async () => {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { ok: false, error: 'No APIFY_TOKEN configured' };
  try {
    const res = await axios.get(`${APIFY_BASE}/users/me`, {
      params: { token },
      timeout: 10_000,
    });
    const user = res.data?.data ?? res.data;
    return {
      ok: true,
      username: user.username,
      email: user.email,
      plan: user.plan?.id || 'unknown',
    };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error?.message || err.message,
      status: err.response?.status,
    };
  }
};

module.exports = {
  searchCandidates,
  searchLinkedIn,
  searchCVLibrary,
  inferMarket,
  normaliseCandidate,
  testConnection,
  isLinkedInConfigured:  () => !!(process.env.APIFY_TOKEN && process.env.APIFY_LINKEDIN_ACTOR_ID),
  isCVLibraryConfigured: () => !!(process.env.APIFY_TOKEN && process.env.APIFY_CVLIBRARY_ACTOR_ID),
};
