/**
 * Regression tests for the Ultra fast-path schema parse pipeline.
 * Runs without Docker or an LLM: node_modules/.bin/mocha test/ultra-schema.test.js
 */
const assert = require('assert');
const {
  parseUltraDocSchema,
  parseUltraExcelSchema,
  jsonTextToPlainText
} = require('../src/agent/auto-reply/ultraSchema');

describe('parseUltraDocSchema', () => {
  it('parses clean JSON', () => {
    const raw = JSON.stringify({
      title: 'AI Trends',
      sections: [{ heading: 'Intro', body: 'Hello world' }]
    });
    const { schema, method } = parseUltraDocSchema(raw, { fallbackTitle: 'Doc' });
    assert.ok(schema);
    assert.strictEqual(method, 'direct');
    assert.strictEqual(schema.title, 'AI Trends');
    assert.strictEqual(schema.sections.length, 1);
  });

  it('parses fenced ```json output', () => {
    const raw = '```json\n{"title":"T","sections":[{"heading":"H","body":"B"}]}\n```';
    const { schema } = parseUltraDocSchema(raw);
    assert.ok(schema);
    assert.strictEqual(schema.sections[0].heading, 'H');
  });

  it('parses JSON with leading commentary (brace slice)', () => {
    const raw = 'Sure! Here is the document:\n{"title":"T","sections":[{"heading":"H","body":"B"}]}\nHope this helps!';
    const { schema } = parseUltraDocSchema(raw);
    assert.ok(schema);
    assert.strictEqual(schema.title, 'T');
  });

  it('repairs trailing commas', () => {
    const raw = '{"title":"T","sections":[{"heading":"H","body":"B"},]}';
    const { schema, method } = parseUltraDocSchema(raw);
    assert.ok(schema, 'trailing comma should be repaired');
    assert.strictEqual(method, 'cleanup');
  });

  it('repairs truncated JSON (max_tokens cutoff)', () => {
    const raw = '{"title":"US States","sections":[{"heading":"Alabama","body":"x"},{"heading":"Alaska","body":"y"},{"heading":"Arizona","bo';
    const { schema, method } = parseUltraDocSchema(raw, { fallbackTitle: 'Doc' });
    assert.ok(schema, 'truncated JSON should be salvaged');
    assert.strictEqual(method, 'truncation_repair');
    assert.ok(schema.sections.length >= 2, `expected >=2 sections, got ${schema.sections.length}`);
    assert.strictEqual(schema.sections[0].heading, 'Alabama');
  });

  it('salvages heading/body pairs from badly broken JSON', () => {
    const raw = '{"title": "Broken", "sections": [ {"heading": "One", "body": "First"} {"heading": "Two", "body": "Second"} ';
    const { schema, method } = parseUltraDocSchema(raw, { fallbackTitle: 'Doc' });
    assert.ok(schema, 'regex salvage should recover pairs');
    assert.ok(['regex_salvage', 'truncation_repair'].includes(method));
    const headings = schema.sections.map(s => s.heading);
    assert.ok(headings.includes('One'));
  });

  it('list mode keeps headings and empties bodies', () => {
    const raw = JSON.stringify({
      title: 'States',
      sections: [{ heading: 'Alabama', body: 'ignored' }, { heading: 'Alaska' }]
    });
    const { schema } = parseUltraDocSchema(raw, { isListRequest: true });
    assert.strictEqual(schema.sections.length, 2);
    assert.strictEqual(schema.sections[0].body, '');
  });

  it('returns null schema for garbage (caller retries)', () => {
    const { schema, method } = parseUltraDocSchema('I cannot help with that request.');
    assert.strictEqual(schema, null);
    assert.strictEqual(method, 'failed');
  });

  it('accepts alternate section field names (content/text)', () => {
    const raw = JSON.stringify({
      title: 'T',
      sections: [{ title: 'A', content: 'body a' }, { name: 'B', text: 'body b' }]
    });
    const { schema } = parseUltraDocSchema(raw);
    assert.strictEqual(schema.sections.length, 2);
    assert.strictEqual(schema.sections[0].heading, 'A');
    assert.strictEqual(schema.sections[1].body, 'body b');
  });
});

describe('parseUltraExcelSchema', () => {
  it('parses clean Excel JSON', () => {
    const raw = JSON.stringify({
      title: 'States',
      headers: ['State', 'Capital'],
      rows: [['Alabama', 'Montgomery'], ['Alaska', 'Juneau']]
    });
    const { schema, method } = parseUltraExcelSchema(raw);
    assert.ok(schema);
    assert.strictEqual(method, 'direct');
    assert.strictEqual(schema.rows.length, 2);
  });

  it('repairs truncated Excel JSON mid-row', () => {
    const raw = '{"title":"States","headers":["State","Capital"],"rows":[["Alabama","Montgomery"],["Alaska","Juneau"],["Arizona","Phoe';
    const { schema, method } = parseUltraExcelSchema(raw);
    assert.ok(schema, 'truncated rows should be salvaged');
    assert.strictEqual(method, 'truncation_repair');
    assert.strictEqual(schema.rows.length, 2, 'incomplete trailing row dropped');
    assert.deepStrictEqual(schema.rows[0], ['Alabama', 'Montgomery']);
  });

  it('drops rows with wrong width', () => {
    const raw = JSON.stringify({
      title: 'T',
      headers: ['A', 'B'],
      rows: [['1', '2'], ['only-one'], ['3', '4']]
    });
    const { schema } = parseUltraExcelSchema(raw);
    assert.strictEqual(schema.rows.length, 2);
  });

  it('returns null for empty rows (forces retry, not junk fallback)', () => {
    const raw = JSON.stringify({ title: 'T', headers: ['A'], rows: [] });
    const { schema } = parseUltraExcelSchema(raw);
    assert.strictEqual(schema, null);
  });
});

describe('jsonTextToPlainText', () => {
  it('never leaves raw JSON syntax in document bodies', () => {
    const raw = '{"title":"T","sections":[{"heading":"H","body":"Some actual content"}]}';
    const plain = jsonTextToPlainText(raw);
    assert.ok(!plain.includes('{'));
    assert.ok(!plain.includes('"sections"'));
    assert.ok(plain.includes('Some actual content'));
  });
});
