/**
 * Regression tests for the LLM intent classifier's parsing + fallback contract.
 * Runs without an LLM: node_modules/.bin/mocha test/intent-classifier.test.js
 */
require('module-alias/register');
require('dotenv').config();
const assert = require('assert');
const { parseClassification, VALID_TASK_TYPES } = require('../src/agent/intent-classifier');
const { verifyArtifacts } = require('../src/agent/artifactVerification');

describe('parseClassification', () => {
  it('parses clean classifier JSON', () => {
    const r = parseClassification('{"task_type":"code_generation","complexity":"complex","expected_artifacts":["app.py","index.html"],"needs_execution":true}');
    assert.ok(r);
    assert.strictEqual(r.task_type, 'code_generation');
    assert.deepStrictEqual(r.expected_artifacts, ['app.py', 'index.html']);
    assert.strictEqual(r.needs_execution, true);
  });

  it('parses fenced output', () => {
    const r = parseClassification('```json\n{"task_type":"general_chat","complexity":"simple","expected_artifacts":[],"needs_execution":false}\n```');
    assert.ok(r);
    assert.strictEqual(r.task_type, 'general_chat');
  });

  it('rejects invalid task_type (forces regex fallback)', () => {
    const r = parseClassification('{"task_type":"made_up_type","complexity":"simple","expected_artifacts":[]}');
    assert.strictEqual(r, null);
  });

  it('rejects garbage (forces regex fallback)', () => {
    assert.strictEqual(parseClassification('I think this is a coding task.'), null);
    assert.strictEqual(parseClassification(''), null);
    assert.strictEqual(parseClassification(null), null);
  });

  it('normalizes bad complexity and clamps artifacts', () => {
    const arts = JSON.stringify(Array.from({ length: 20 }, (_, i) => `f${i}.txt`));
    const r = parseClassification(`{"task_type":"data_generation","complexity":"weird","expected_artifacts":${arts}}`);
    assert.strictEqual(r.complexity, 'moderate');
    assert.strictEqual(r.expected_artifacts.length, 8);
  });

  it('task type enum covers routing config + general_chat', () => {
    assert.ok(VALID_TASK_TYPES.has('website_generation'));
    assert.ok(VALID_TASK_TYPES.has('code_generation'));
    assert.ok(VALID_TASK_TYPES.has('general_chat'));
  });
});

describe('verifyArtifacts with classifier expectations (extraExpected)', () => {
  it('classifier filename satisfied by same-extension delivery', () => {
    // classifier guessed index.html; agent delivered dashboard.html — counts
    const v = verifyArtifacts({
      tasks: [], goal: 'build a thing',
      verifiedFiles: [{ filename: 'dashboard.html' }, { filename: 'app.py' }],
      extraExpected: ['index.html', 'app.py']
    });
    assert.strictEqual(v.satisfied, true);
  });

  it('classifier expectation missing → flagged', () => {
    const v = verifyArtifacts({
      tasks: [], goal: 'build a thing',
      verifiedFiles: [{ filename: 'app.py' }],
      extraExpected: ['index.html']
    });
    assert.strictEqual(v.satisfied, false);
    assert.ok(v.missingGoalArtifacts.includes('index.html'));
  });

  it('extension-style expectation works', () => {
    const v = verifyArtifacts({
      tasks: [], goal: 'x',
      verifiedFiles: [{ filename: 'report.docx' }],
      extraExpected: ['.docx']
    });
    assert.strictEqual(v.satisfied, true);
  });
});
