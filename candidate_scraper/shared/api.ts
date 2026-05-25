export interface Candidate {
  name: string;
  role: string;
  company: string;
  location: string;
  profileUrl: string;
  email: string;
  phone: string;
  source: string;
  sourceUrl: string;
  query: string;
  scrapedAt: string;
}

export interface SheetResult {
  updatedRange?: string;
  updatedRows?: number;
  updatedCells?: number;
}

export interface SearchRequest {
  query: string;
  location?: string;
  maxItems?: number;
  sources?: string[];
  appendToSheet?: boolean;
}

export interface SearchResponse {
  candidates: Candidate[];
  sheetResult: SheetResult | null;
}

export interface SheetsAppendRequest {
  candidates: Candidate[];
}

export interface SheetsAppendResponse {
  sheetResult: SheetResult;
}

export interface HealthResponse {
  ok: boolean;
  apifyConfigured: boolean;
  sheetsConfigured: boolean;
}

export interface ApiErrorResponse {
  error: string;
  details?: unknown;
}
