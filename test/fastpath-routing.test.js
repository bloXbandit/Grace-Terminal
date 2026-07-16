/**
 * Regression tests for fast-path routing decisions.
 * Runs without Docker or an LLM: node_modules/.bin/mocha test/fastpath-routing.test.js
 */
require('module-alias/register');
require('dotenv').config();
const assert = require('assert');
const MultiAgentCoordinator = require('../src/agent/specialists/MultiAgentCoordinator');

describe('MultiAgentCoordinator.extractWebsiteFilename', () => {
  const c = new MultiAgentCoordinator({});

  it('derives filename from quoted name', () => {
    const f = c.extractWebsiteFilename('create a landing page for a coffee shop called "Bean There"');
    assert.strictEqual(f, 'bean-there.html');
  });

  it('derives filename from topic ("p6 training" regression case)', () => {
    const f = c.extractWebsiteFilename('make a website for p6 training');
    assert.strictEqual(f, 'p6-training.html');
  });

  it('never returns bare index.html', () => {
    const prompts = [
      'build a landing page',
      'make me a website',
      'create a homepage for my startup'
    ];
    for (const p of prompts) {
      const f = c.extractWebsiteFilename(p);
      assert.notStrictEqual(f, 'index.html', `"${p}" produced index.html`);
      assert.ok(f.endsWith('.html'), `"${p}" produced ${f}`);
    }
  });

  it('handles empty/garbage input with a safe default', () => {
    const f = c.extractWebsiteFilename('');
    assert.strictEqual(f, 'website.html');
  });
});

describe('MultiAgentCoordinator.detectTaskType', () => {
  const c = new MultiAgentCoordinator({});

  it('routes website requests to website_generation', () => {
    assert.strictEqual(c.detectTaskType('build me a landing page for my startup'), 'website_generation');
    assert.strictEqual(c.detectTaskType('create a portfolio site with tailwind'), 'website_generation');
  });

  it('routes creative requests to creative_writing', () => {
    assert.strictEqual(c.detectTaskType('write a poem about love with vivid imagery'), 'creative_writing');
  });
});

describe('website_generation minimal-prompt detection (regression for prompt-bloat bug)', () => {
  // The old check matched the literal 'file_path="index.html"' which broke when
  // filenames became dynamic — this pins the new detection contract.
  it('minimal prompt marker matches the prompt actually built in execute()', () => {
    // Mirror of the marker used in callSpecialist()
    const marker = 'ABSOLUTE OUTPUT RULES (FAIL IF BROKEN)';
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../src/agent/specialists/MultiAgentCoordinator.js'), 'utf8');
    // The prompt template in execute() must contain the marker the detector looks for
    const detectorCount = (src.match(/ABSOLUTE OUTPUT RULES \(FAIL IF BROKEN\)/g) || []).length;
    assert.ok(detectorCount >= 2, 'marker must appear in both the detector and the prompt template');
    // And taskType must be forwarded to specialist options
    assert.ok(/options\.taskType === 'website_generation'/.test(src), 'detector must accept explicit taskType');
    assert.ok(/routingContext,\s*\n\s*taskType/.test(src), 'execute() must pass taskType to callSpecialist options');
  });
});
