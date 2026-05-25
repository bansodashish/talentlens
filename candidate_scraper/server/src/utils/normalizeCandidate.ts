import { type Candidate, type SearchRequest } from '../../../shared/api';

const pick = (item: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

type CandidateSearchCriteria = Required<SearchRequest>;

export function normalizeCandidate(item: Record<string, unknown>, criteria: CandidateSearchCriteria): Candidate {
  const sourceUrl = pick(item, ['sourceUrl', 'url', 'jobUrl', 'profileUrl', 'link']);
  const profileUrl = pick(item, ['linkedinUrl', 'linkedInUrl', 'profileUrl', 'profile', 'personUrl']);

  return {
    name: pick(item, ['name', 'fullName', 'candidateName', 'title']),
    role: pick(item, ['role', 'position', 'jobTitle', 'headline', 'currentRole']),
    company: pick(item, ['company', 'currentCompany', 'employer', 'organization']),
    location: pick(item, ['location', 'address', 'city', 'country']) || criteria.location,
    profileUrl,
    email: pick(item, ['email', 'workEmail']),
    phone: pick(item, ['phone', 'phoneNumber', 'mobile']),
    source: pick(item, ['source', 'platform']) || 'Apify',
    sourceUrl,
    query: criteria.query,
    scrapedAt: new Date().toISOString()
  };
}

export function candidateToSheetRow(candidate: Candidate): string[] {
  return [
    candidate.name || '',
    candidate.role || '',
    candidate.company || '',
    candidate.location || '',
    candidate.profileUrl || '',
    candidate.email || '',
    candidate.phone || '',
    candidate.source || '',
    candidate.sourceUrl || '',
    candidate.query || '',
    candidate.scrapedAt || new Date().toISOString()
  ];
}
