import { google } from 'googleapis';
import { type Candidate, type SheetResult } from '../../../shared/api';
import { candidateToSheetRow } from '../utils/normalizeCandidate';

function loadServiceAccount(): Record<string, unknown> | undefined {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  }

  return undefined;
}

async function getSheetsClient() {
  const credentials = loadServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials,
    keyFile: credentials ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: 'v4', auth });
}

export async function appendCandidatesToSheet(candidates: Candidate[]): Promise<SheetResult> {
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not configured.');
  }

  const sheets = await getSheetsClient();
  const values = candidates.map(candidateToSheetRow);

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: process.env.GOOGLE_SHEET_RANGE || 'Candidates!A:K',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });

  return {
    updatedRange: response.data.updates?.updatedRange ?? undefined,
    updatedRows: response.data.updates?.updatedRows ?? undefined,
    updatedCells: response.data.updates?.updatedCells ?? undefined
  };
}
