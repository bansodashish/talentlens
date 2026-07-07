const axios = require('axios');

const getAuth = () => {
  const key = process.env.REED_JOB_POSTING_API_KEY || process.env.REED_API_KEY;
  if (!key) return null;
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
};

const compact = (value) => (typeof value === 'string' ? value.trim() : value);

const buildPayload = (job) => ({
  title: compact(job.title),
  description: compact(job.description),
  requirements: compact(job.requirements),
  location: compact(job.location),
  employmentType: compact(job.employment_type),
  salary: {
    minimum: job.salary_min || null,
    maximum: job.salary_max || null,
    currency: job.salary_currency || 'GBP',
  },
  reference: `talentlens-${job.id}`,
});

const extractExternalId = (data) => (
  data?.jobId ||
  data?.id ||
  data?.reference ||
  data?.job?.id ||
  data?.job?.jobId ||
  null
);

const extractExternalUrl = (data) => (
  data?.url ||
  data?.jobUrl ||
  data?.postingUrl ||
  data?.job?.url ||
  data?.job?.jobUrl ||
  null
);

async function publishJob(job) {
  const auth = getAuth();
  if (!auth) {
    const err = new Error('Reed job posting API key is not configured.');
    err.status = 503;
    err.hint = 'Set REED_JOB_POSTING_API_KEY or REED_API_KEY in server/.env.';
    throw err;
  }

  const endpoint = process.env.REED_JOB_POSTING_URL;
  if (!endpoint) {
    const err = new Error('Reed job posting endpoint is not configured.');
    err.status = 503;
    err.hint = 'Set REED_JOB_POSTING_URL after Reed enables job posting/API feed access for your account.';
    throw err;
  }

  const payload = buildPayload(job);
  const res = await axios.post(endpoint, payload, {
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: Number(process.env.REED_JOB_POSTING_TIMEOUT_MS || 20000),
  });

  return {
    externalJobId: extractExternalId(res.data),
    externalUrl: extractExternalUrl(res.data),
    raw: res.data,
  };
}

module.exports = {
  buildPayload,
  publishJob,
  isConfigured: () => Boolean(getAuth() && process.env.REED_JOB_POSTING_URL),
};