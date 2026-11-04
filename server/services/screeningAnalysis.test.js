const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { composeHRSummary } = require('./screeningSummary');
const { scoreWithOpenAI } = require('./openaiScorer');

test('preserves detailed saved assessment prose without adding keyword lists', () => {
  const summary = 'The candidate built Kubernetes platforms. Demonstrated strengths include leading a production migration. Areas to clarify include the scale of their responsibilities.';
  assert.equal(composeHRSummary({ summary, strengths: ['kubernetes'], gaps: ['gitlab'] }), summary);
  assert.equal(composeHRSummary({ summary: `Quantitative screening - Consider (75/100). ${summary}` }), summary);
});

test('constructs a cautious summary when no narrative was saved', () => {
  const summary = composeHRSummary({ jobTitle: 'DevOps Engineer', strengths: ['Matched: Kubernetes'], gaps: ['Missing: GitLab'] });
  assert.match(summary, /DevOps Engineer/);
  assert.match(summary, /Kubernetes/);
  assert.match(summary, /Areas to clarify include GitLab/);
  assert.equal(composeHRSummary({ summary }), summary);
});

test('grounds the fallback summary in a real CV excerpt when one is available', () => {
  const assessment = {
    reasons: [{ claim: 'Demonstrates Kubernetes', evidence: 'Platform engineer with 14 years of Kubernetes experience.', evidenceSource: 'cv_excerpt' }],
    requirements: [],
  };
  const summary = composeHRSummary({ jobTitle: 'DevOps Engineer', strengths: ['Kubernetes'], gaps: [], assessment });
  assert.match(summary, /CV includes the following evidence/i);
  assert.match(summary, /Platform engineer with 14 years of Kubernetes experience\./);
});

test('rebuilds a saved generic summary using deduplicated CV evidence', () => {
  const evidence = { requirement: 'Kubernetes', evidence: 'Built Kubernetes platforms.', evidenceSource: 'cv_excerpt' };
  const assessment = { requirements: [evidence], reasons: [evidence, { evidence: 'Implemented Prometheus monitoring.', evidenceSource: 'cv_excerpt' }] };
  const summary = composeHRSummary({
    summary: 'The CV shows evidence relevant. Demonstrated strengths include kubernetes, prometheus, end-to-end. Further discussion should confirm the depth of experience against the role requirements.',
    strengths: ['kubernetes', 'prometheus'], assessment,
  });
  assert.match(summary, /Built Kubernetes platforms/);
  assert.match(summary, /Implemented Prometheus monitoring/);
  assert.equal((summary.match(/Built Kubernetes platforms/g) || []).length, 1);
  assert.doesNotMatch(summary, /The CV shows evidence relevant/);
  assert.doesNotMatch(summary, /screening matched the following terms/);
});

test('rebuilds the prior quoted fallback without treating it as AI prose', () => {
  const summary = 'The CV shows evidence relevant for the Engineer role. Demonstrated strengths include Kubernetes. This is grounded in CV evidence such as: "Old excerpt.". Further discussion should confirm the depth of experience against the role requirements.';
  const result = composeHRSummary({ summary, assessment: { reasons: [{ evidence: 'New saved excerpt.', evidenceSource: 'cv_excerpt' }] } });
  assert.match(result, /New saved excerpt/);
  assert.doesNotMatch(result, /Old excerpt/);
});

test('builds a fuller grounded paragraph from saved reasons and use cases', () => {
  const assessment = {
    reasons: [{ claim: 'Demonstrates Kubernetes in production', evidence: 'Built Kubernetes platforms.', evidenceSource: 'cv_excerpt' }],
    useCases: [{ capability: 'Kubernetes', useCase: 'Apply Kubernetes to deploy and scale platform services in the role.' }],
    requirements: [{ requirement: 'GitLab CI', fit: 'not_met', evidence: 'No evidence', evidenceSource: 'generated_fallback' }],
  };
  const summary = composeHRSummary({ strengths: ['Kubernetes'], gaps: ['GitLab CI'], assessment, jobTitle: 'DevOps Engineer' });
  assert.match(summary, /Built Kubernetes platforms/);
  assert.match(summary, /Demonstrates Kubernetes in production/);
  assert.match(summary, /could be expected to contribute to work such as/);
  assert.match(summary, /projection of fit, not a claim/);
  assert.match(summary, /Areas to clarify include GitLab CI/);
});

test('never quotes a CV excerpt containing contact details', () => {
  const assessment = {
    reasons: [
      { claim: 'Demonstrates Email', evidence: 'Contact me at jane@example.com for references.', evidenceSource: 'cv_excerpt' },
      { claim: 'Demonstrates Kubernetes', evidence: 'Built Kubernetes platforms for 5 years.', evidenceSource: 'cv_excerpt' },
    ],
    requirements: [],
  };
  const summary = composeHRSummary({ jobTitle: 'DevOps Engineer', strengths: ['Kubernetes'], gaps: [], assessment });
  assert.doesNotMatch(summary, /jane@example\.com/);
  assert.match(summary, /Built Kubernetes platforms for 5 years\./);
});

test('OpenAI receives instructions for detailed grounded reports at every recommendation level', async () => {
  let request;
  const originalLoad = Module._load;
  class FakeOpenAI {
    constructor() {
      this.chat = { completions: { create: async options => {
        request = options;
        return { choices: [{ message: { content: JSON.stringify({
          summary: 'The CV describes production Kubernetes work.',
          strengths: ['Production Kubernetes'], gaps: [],
          assessment: { reasons: [{ claim: 'Kubernetes', evidence: 'Production Kubernetes work' }] },
          quantitativeAnalysis: { requirements: 90, roleFit: 85, experience: 80 },
        }) } }] };
      } } };
    }
  }
  Module._load = function (name, ...args) {
    return name === 'openai' ? { OpenAI: FakeOpenAI } : originalLoad.call(this, name, ...args);
  };
  try {
    const result = await scoreWithOpenAI('Production Kubernetes work in platform engineering.', 'DevOps Engineer using Kubernetes.', 'demand_planner');
    const prompt = request.messages[1].content;
    assert.match(prompt, /equally detailed, specific analysis for Strong Hire, Consider, and Reject/i);
    assert.match(prompt, /not that the candidate lacks the skill/i);
    assert.match(prompt, /job description takes precedence/i);
    assert.match(prompt, /6-8 substantive sentences/);
    assert.match(prompt, /Never return fewer than 5 sentences/);
    assert.deepEqual(result.details.quantitativeAnalysis, { requirements: 90, roleFit: 85, experience: 80 });
    assert.equal(result.assessment.reasons[0].evidenceSource, 'model_assessment');
  } finally {
    Module._load = originalLoad;
  }
});