import { ApifyClient } from 'apify-client';
import { type Candidate, type SearchRequest } from '../../../shared/api';
import { normalizeCandidate } from '../utils/normalizeCandidate';

type CandidateSearchCriteria = Required<SearchRequest>;

function getClient(): ApifyClient {
  if (!process.env.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not configured.');
  }

  return new ApifyClient({ token: process.env.APIFY_TOKEN });
}

function buildApifyInput(criteria: CandidateSearchCriteria): Record<string, unknown> {
  return {
    query: criteria.query,
    search: criteria.query,
    location: criteria.location,
    maxItems: criteria.maxItems,
    sources: criteria.sources
  };
}

export async function runCandidateSearch(criteria: CandidateSearchCriteria): Promise<Candidate[]> {
  const client = getClient();
  const input = buildApifyInput(criteria);
  const actorId = process.env.APIFY_ACTOR_ID;
  const taskId = process.env.APIFY_TASK_ID;

  if (!taskId && !actorId) {
    throw new Error('Set either APIFY_TASK_ID or APIFY_ACTOR_ID.');
  }

  const run = taskId
    ? await client.task(taskId).call(input)
    : await client.actor(actorId as string).call(input);

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: criteria.maxItems,
    clean: true
  });

  return items
    .map((item) => normalizeCandidate(item as Record<string, unknown>, criteria))
    .filter((candidate) => candidate.name || candidate.profileUrl || candidate.sourceUrl);
}
