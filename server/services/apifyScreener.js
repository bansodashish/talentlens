const axios = require('axios');

const APIFY_BASE = 'https://api.apify.com/v2';

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function getConfiguration() {
  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_CV_SCREENING_ACTOR_ID;
  const appUrl = process.env.APP_URL?.replace(/\/$/, '');

  if (!token) throw configurationError('Apify CV screening is not configured. Set APIFY_TOKEN.');
  if (!actorId) throw configurationError('Apify CV screening is not configured. Set APIFY_CV_SCREENING_ACTOR_ID.');
  if (!appUrl) throw configurationError('Apify CV screening is not configured. Set APP_URL.');

  return { token, actorId, appUrl };
}

function createWebhooks(appUrl, callbackSecret) {
  const requestUrl = `${appUrl}/api/apify-screening/webhook`;
  const headersTemplate = JSON.stringify({ 'X-TalentLenses-Callback-Secret': callbackSecret });

  return ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'].map(eventType => ({
    eventTypes: [eventType],
    requestUrl,
    headersTemplate,
    payloadTemplate: JSON.stringify({
      runId: '{{resource.id}}',
      runStatus: '{{resource.status}}',
    }),
  }));
}

async function startScreeningRun({ batchId, jobTitle, jobDescription, screenings, callbackSecret }) {
  const { token, actorId, appUrl } = getConfiguration();
  const webhooks = Buffer.from(JSON.stringify(createWebhooks(appUrl, callbackSecret))).toString('base64');

  try {
    const response = await axios.post(
      `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs`,
      { batchId, jobTitle, jobDescription, screenings },
      { params: { token, webhooks }, timeout: 30_000 }
    );
    const run = response.data?.data ?? response.data;
    if (!run?.id || !run.defaultDatasetId) {
      throw new Error('Apify did not return a run ID and dataset ID.');
    }
    return { runId: run.id, datasetId: run.defaultDatasetId, status: run.status };
  } catch (axiosError) {
    const message = axiosError.response?.data?.error?.message
      || axiosError.response?.data?.message
      || axiosError.message;
    const error = new Error(`Apify CV screening run could not start: ${message}`);
    error.status = axiosError.response?.status || 502;
    throw error;
  }
}

async function getRun(runId) {
  const { token } = getConfiguration();
  const response = await axios.get(`${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}`, {
    params: { token },
    timeout: 15_000,
  });
  return response.data?.data ?? response.data;
}

async function getDatasetItems(datasetId) {
  const { token } = getConfiguration();
  const response = await axios.get(`${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items`, {
    params: { token, clean: true },
    timeout: 30_000,
  });
  return Array.isArray(response.data) ? response.data : [];
}

module.exports = { startScreeningRun, getRun, getDatasetItems };