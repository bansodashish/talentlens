/**
 * Google Sheets Export Service
 * Ported from candidate_scraper/server/src/services/sheetsService.ts
 *
 * Appends a list of candidates to a Google Sheet using a service account.
 */
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuthClient() {
  let credentials;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    credentials = JSON.parse(json);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credentials = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } else {
    throw new Error('No Google service account credentials configured. Set GOOGLE_SERVICE_ACCOUNT_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.');
  }

  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

/**
 * Append an array of candidates to a Google Sheet.
 *
 * @param {object[]} candidates  Array of candidate objects
 * @param {string}   sheetId     Google Sheet ID (from URL)
 * @param {string}   sheetName   Tab name (default: 'Candidates')
 * @returns {object} { updatedRows, sheetUrl }
 */
async function appendCandidates(candidates, sheetId, sheetName = 'Candidates') {
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Header row (written only if sheet appears empty)
  const HEADERS = ['Name', 'Role', 'Company', 'Location', 'Market', 'LinkedIn', 'Email', 'Phone', 'Source', 'Scraped At'];

  const rows = candidates.map(c => [
    c.name || '', c.current_title || '', c.current_company || '', c.location || '',
    c.market || '', c.linkedin_url || c.source_url || '', c.email || '', c.phone || '',
    c.source || 'apify', c.scrapedAt || new Date().toISOString(),
  ]);

  // Check if sheet is empty to decide whether to write headers
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1:A1`,
  }).catch(() => ({ data: { values: [] } }));

  const isEmpty = !(existing.data.values && existing.data.values.length > 0);
  const valuesToAppend = isEmpty ? [HEADERS, ...rows] : rows;

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: valuesToAppend },
  });

  return {
    updatedRows: response.data.updates?.updatedRows || rows.length,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
  };
}

module.exports = { appendCandidates };
