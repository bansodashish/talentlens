import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, normaliseResult } from '../src/result.js';

test('normaliseResult bounds scores and derives a recommendation', () => {
  const result = normaliseResult({ overallScore: 101, supplyChainScore: -2, keySkills: ['SQL'] });
  assert.equal(result.overallScore, 100);
  assert.equal(result.supplyChainScore, 0);
  assert.equal(result.recommendation, 'Strong Hire');
  assert.deepEqual(result.keySkills, ['SQL']);
});

test('extractJson accepts a fenced model response', () => {
  assert.deepEqual(extractJson('```json\n{"overallScore": 55}\n```'), { overallScore: 55 });
});