/**
 * Google Custom Search Engine (CSE) service for X-Ray candidate search.
 *
 * Uses the Google Custom Search JSON API to run queries like:
 *   site:linkedin.com/in/ "Software Engineer" "London"
 *
 * One API key + one CSE engine covers all target platforms by varying
 * the site: operator per platform.
 *
 * Free tier: 100 queries/day. Each search uses 1–3 queries (10 results each).
 * Paid: $5 per 1,000 additional queries.
 */

const axios = require('axios');
const { inferMarket } = require('./linkedinSearchService');

// ── Per-platform configuration ────────────────────────────────────────────────

const PLATFORM_CONFIGS = {
  linkedin: {
    sitePrefix: 'site:linkedin.com/in/',
    label: 'LinkedIn',
    extraTerms: '-jobs -recruiting',
    parseItem(item) {
      // Title: "John Doe - Software Engineer at Acme Corp | LinkedIn"
      let raw = (item.title || '').replace(/\s*[|]\s*LinkedIn.*$/i, '').trim();
      let name = raw;
      let current_title = null;
      let current_company = null;

      const dashIdx = raw.indexOf(' - ');
      if (dashIdx > 0) {
        name = raw.substring(0, dashIdx).trim();
        const rest = raw.substring(dashIdx + 3).trim();
        const atMatch = rest.match(/^(.*?)\s+at\s+(.+)$/i);
        const bulletMatch = rest.match(/^(.*?)\s+[·•]\s+(.+)$/);
        if (atMatch) {
          current_title = atMatch[1].trim();
          current_company = atMatch[2].trim();
        } else if (bulletMatch) {
          current_title = bulletMatch[1].trim();
          current_company = bulletMatch[2].trim();
        } else {
          current_title = rest || null;
        }
      }

      const snippet = item.snippet || '';
      let location = null;
      if (snippet.includes('·')) {
        const seg = snippet.split('·')[0].trim().replace(/\n/g, ' ').trim();
        if (seg.length >= 2 && seg.length <= 60 && !/^\d/.test(seg)) location = seg;
      }

      const profileUrl = item.link || '';
      return {
        name: name || 'Unknown',
        current_title,
        current_company,
        headline: current_title
          ? `${current_title}${current_company ? ` at ${current_company}` : ''}`
          : null,
        linkedin_url: profileUrl,
        profileUrl,
        location,
        market: location ? inferMarket(location, null) : null,
        source: 'google_cse_linkedin',
        source_url: profileUrl,
        snippet: snippet.substring(0, 300),
      };
    },
  },

  github: {
    sitePrefix: 'site:github.com',
    label: 'GitHub',
    extraTerms: '',
    parseItem(item) {
      // Title: "username (Full Name) · GitHub" or "Full Name - GitHub"
      let raw = (item.title || '')
        .replace(/\s*[|·]\s*GitHub\s*$/i, '')
        .replace(/\s*-\s*GitHub\s*$/i, '')
        .trim();

      let name = raw;
      // "username (Full Name)" — prefer the full name in parens
      const parenMatch = raw.match(/^\S+\s+\((.+)\)$/);
      if (parenMatch) name = parenMatch[1];

      const snippet = item.snippet || '';
      let location = null;
      // GitHub snippets: "City · X followers · ..."
      const segs = snippet.split('·');
      if (segs.length > 1) {
        const first = segs[0].trim().replace(/\n/g, ' ').trim();
        if (first.length >= 2 && first.length <= 60 && !/follower|following|repo|star|\d{3}/i.test(first)) {
          location = first;
        }
      }

      return {
        name: name || 'Unknown',
        current_title: null,
        current_company: null,
        headline: snippet.substring(0, 120) || null,
        linkedin_url: null,
        profileUrl: item.link || '',
        location,
        market: location ? inferMarket(location, null) : null,
        source: 'google_cse_github',
        source_url: item.link || '',
        snippet: snippet.substring(0, 300),
      };
    },
  },

  wellfound: {
    sitePrefix: 'site:wellfound.com/u/',
    label: 'Wellfound',
    extraTerms: '',
    parseItem(item) {
      // Title: "Name | Wellfound" or "Name - Title at Company | Wellfound"
      let raw = (item.title || '')
        .replace(/\s*[|]\s*(Wellfound|AngelList).*$/i, '')
        .trim();

      let name = raw;
      let current_title = null;
      let current_company = null;

      const dashIdx = raw.indexOf(' - ');
      if (dashIdx > 0) {
        name = raw.substring(0, dashIdx).trim();
        const rest = raw.substring(dashIdx + 3).trim();
        const atMatch = rest.match(/^(.*?)\s+at\s+(.+)$/i);
        if (atMatch) {
          current_title = atMatch[1].trim();
          current_company = atMatch[2].trim();
        } else {
          current_title = rest || null;
        }
      }

      const snippet = item.snippet || '';
      let location = null;
      if (snippet.includes('·')) {
        const first = snippet.split('·')[0].trim().replace(/\n/g, ' ').trim();
        if (first.length >= 2 && first.length <= 60) location = first;
      }

      return {
        name: name || 'Unknown',
        current_title,
        current_company,
        headline: current_title
          ? `${current_title}${current_company ? ` at ${current_company}` : ''}`
          : null,
        linkedin_url: null,
        profileUrl: item.link || '',
        location,
        market: location ? inferMarket(location, null) : null,
        source: 'google_cse_wellfound',
        source_url: item.link || '',
        snippet: snippet.substring(0, 300),
      };
    },
  },
};

// ── Main search function ──────────────────────────────────────────────────────

async function runGoogleCseSearch({ apiKey, cseId, jobTitle, location, maxResults = 10, platform = 'linkedin' }) {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) throw new Error(`Unknown Google X-Ray platform: ${platform}`);

  // Build search query
  let query = `${config.sitePrefix} "${jobTitle}"`;
  if (location) query += ` "${location}"`;
  if (config.extraTerms) query += ` ${config.extraTerms}`;

  const candidates = [];
  const perPage  = 10;
  const maxPages = Math.min(Math.ceil(maxResults / perPage), 3); // cap at 3 pages = 3 API queries

  for (let page = 0; page < maxPages && candidates.length < maxResults; page++) {
    const start = page * 10 + 1;

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: apiKey, cx: cseId, q: query, start, num: 10 },
      timeout: 15000,
    });

    const items = response.data.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      if (candidates.length >= maxResults) break;
      try {
        candidates.push(config.parseItem(item));
      } catch (_) {
        // skip unparseable items silently
      }
    }

    // Polite delay between pages
    if (page < maxPages - 1 && items.length === 10) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return candidates;
}

function isConfigured() {
  return !!(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID);
}

module.exports = { runGoogleCseSearch, isConfigured, PLATFORM_CONFIGS };
