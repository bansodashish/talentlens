/**
 * Apollo Candidate Search
 *
 * Uses Apollo's People Search endpoint and normalises results into the
 * TalentLens candidate shape used by the search UI and CRM save flow.
 */
const axios = require('axios');
const { inferMarket } = require('./linkedinSearchService');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

const SENIORITY_MAP = {
  Entry: ['entry', 'junior'],
  Mid: ['manager', 'senior'],
  Senior: ['director', 'vp', 'c_suite', 'owner', 'founder'],
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function fullName(raw) {
  return raw.name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || 'Unknown';
}

function pickEmail(raw) {
  return raw.email || raw.email_address || raw.revealed_email || '';
}

function pickPhone(raw) {
  const phone =
    raw.phone ||
    raw.phone_number ||
    raw.mobile_phone ||
    raw.sanitized_phone ||
    raw.organization?.phone ||
    '';

  if (phone) return phone;

  const numbers = raw.phone_numbers || raw.contact_phone_numbers || raw.personal_phone_numbers;
  if (!Array.isArray(numbers) || numbers.length === 0) return '';

  const first = numbers[0];
  return typeof first === 'string'
    ? first
    : (first.raw_number || first.sanitized_number || first.number || '');
}

function normalise(raw, market) {
  const organization = raw.organization || raw.account || {};
  const title = raw.title || raw.headline || '';
  const company = raw.organization_name || raw.company || organization.name || '';
  const city = raw.city || '';
  const state = raw.state || '';
  const country = raw.country || '';
  const location = raw.location || [city, state, country].filter(Boolean).join(', ');
  const linkedinUrl = raw.linkedin_url || raw.linkedinUrl || raw.profile_url || '';
  const skills = [
    ...asArray(raw.skills),
    ...asArray(raw.departments),
    ...asArray(raw.functions),
  ].map(s => (typeof s === 'string' ? s : s?.name || s?.title)).filter(Boolean);

  return {
    name: fullName(raw),
    headline: title && company ? `${title} at ${company}` : (title || company),
    location,
    email: pickEmail(raw),
    phone: pickPhone(raw),
    profileUrl: linkedinUrl,
    linkedin_url: linkedinUrl,
    current_title: title,
    current_company: company,
    experience: [],
    education: [],
    skills,
    source: 'apollo',
    source_url: linkedinUrl || (raw.id ? `apollo:${raw.id}` : ''),
    apollo_id: raw.id || raw.person_id || '',
    email_status: raw.email_status || raw.email_confidence || '',
    market: inferMarket(location, market),
  };
}

async function runApolloSearch({ apolloKey, jobTitle, location, market, experienceLevel, maxResults = 50 }) {
  if (!apolloKey) throw new Error('Apollo API key is not configured for this user.');
  if (!jobTitle) throw new Error('jobTitle is required.');

  const max = Math.min(100, Math.max(1, parseInt(maxResults, 10) || 50));
  const perPage = Math.min(100, max);

  const body = {
    page: 1,
    per_page: perPage,
    person_titles: [jobTitle],
    q_keywords: jobTitle,
  };

  if (location) body.person_locations = [location];
  if (SENIORITY_MAP[experienceLevel]) body.person_seniorities = SENIORITY_MAP[experienceLevel];

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'x-api-key': apolloKey,
  };

  let res;
  try {
    res = await axios.post(`${APOLLO_BASE}/mixed_people/search`, body, {
      headers,
      timeout: 60_000,
    });
  } catch (axiosErr) {
    const errorCode = axiosErr.response?.data?.error_code;
    const errorMsg  = axiosErr.response?.data?.error || axiosErr.message || '';

    if (errorCode === 'API_INACCESSIBLE' || /not accessible.*free plan/i.test(errorMsg)) {
      const planErr = new Error(
        'Apollo People Search requires a paid plan. Upgrade at https://app.apollo.io/'
      );
      planErr.code = 'APOLLO_PLAN_REQUIRED';
      throw planErr;
    }

    throw axiosErr;
  }

  const people = res.data?.people || res.data?.contacts || res.data?.results || [];
  return people.slice(0, max).map(person => normalise(person, market));
}

module.exports = { runApolloSearch };
