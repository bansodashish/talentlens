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
    assert.deepEqual(result.details.quantitativeAnalysis, { requirements: 90, roleFit: 85, experience: 80 });
    assert.equal(result.assessment.reasons[0].evidenceSource, 'model_assessment');
  } finally {
    Module._load = originalLoad;
  }
});