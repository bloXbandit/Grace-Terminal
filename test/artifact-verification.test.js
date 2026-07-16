/**
 * Regression tests for artifact-grounded completion.
 * Runs without Docker or an LLM: node_modules/.bin/mocha test/artifact-verification.test.js
 */
const assert = require('assert');
const {
  extractClaimedArtifacts,
  extractGoalExpectations,
  verifyArtifacts,
  buildGroundingBlock
} = require('../src/agent/artifactVerification');

describe('extractClaimedArtifacts', () => {
  it('extracts <file_path> claims', () => {
    const tasks = [{ preGeneratedAction: '<write_code>\n<file_path>app.py</file_path>\n<content>x</content>\n</write_code>' }];
    assert.deepStrictEqual(extractClaimedArtifacts(tasks), ['app.py']);
  });

  it('extracts doc.save / to_excel / pdf.output claims', () => {
    const tasks = [{ result: "doc.save('report.docx')\ndf.to_excel('data.xlsx')\npdf.output('out.pdf')" }];
    const claims = extractClaimedArtifacts(tasks);
    assert.ok(claims.includes('report.docx'));
    assert.ok(claims.includes('data.xlsx'));
    assert.ok(claims.includes('out.pdf'));
  });

  it('extracts "Created: x.ext" claims', () => {
    const tasks = [{ memorized: '✅ Created dashboard.html' }];
    assert.deepStrictEqual(extractClaimedArtifacts(tasks), ['dashboard.html']);
  });

  it('ignores temp scripts and nohup.out', () => {
    const tasks = [{ preGeneratedAction: '<file_path>temp_script_12345.py</file_path>', result: 'Created nohup.out' }];
    assert.deepStrictEqual(extractClaimedArtifacts(tasks), []);
  });
});

describe('extractGoalExpectations', () => {
  it('dashboard-with-frontend goal expects .html and .py', () => {
    const goal = 'Create a complete dashboard application with a Python Flask backend API and an HTML/CSS/JavaScript frontend';
    const exps = extractGoalExpectations(goal);
    const labels = exps.map(e => e.label).join(' ');
    assert.ok(labels.includes('HTML frontend'), 'should expect HTML');
    assert.ok(labels.includes('Python backend'), 'should expect Python');
  });

  it('word document goal expects .docx', () => {
    const exps = extractGoalExpectations('Create a Word document about love');
    assert.strictEqual(exps.length, 1);
    assert.deepStrictEqual(exps[0].exts, ['.docx']);
  });

  it('plain question expects nothing', () => {
    assert.deepStrictEqual(extractGoalExpectations('What is the capital of France?'), []);
  });
});

describe('verifyArtifacts — the dashboard regression case', () => {
  const dashboardGoal = 'Create a complete dashboard application with: 1) A Python Flask backend API. 2) An HTML/CSS/JavaScript frontend with a beautiful modern UI.';

  it('FAILS verification when only app.py exists (the original lie)', () => {
    const tasks = [
      { title: 'Backend', status: 'completed', preGeneratedAction: '<file_path>app.py</file_path>' },
      { title: 'Frontend', status: 'completed', result: 'Frontend UI designed and integrated.' }
    ];
    const v = verifyArtifacts({ tasks, goal: dashboardGoal, verifiedFiles: [{ filename: 'app.py' }] });
    assert.strictEqual(v.satisfied, false, 'must NOT be satisfied without the .html');
    assert.ok(v.missingGoalArtifacts.some(l => l.includes('HTML')), 'missing list must name the HTML frontend');
    assert.deepStrictEqual(v.verifiedNames, ['app.py']);
  });

  it('PASSES when both app.py and index.html exist', () => {
    const v = verifyArtifacts({
      tasks: [],
      goal: dashboardGoal,
      verifiedFiles: [{ filename: 'app.py' }, { filename: 'index.html' }]
    });
    assert.strictEqual(v.satisfied, true);
  });

  it('flags claimed-but-missing files', () => {
    const tasks = [{ memorized: '✅ Created report.docx' }];
    const v = verifyArtifacts({ tasks, goal: 'make me a report', verifiedFiles: [] });
    assert.strictEqual(v.satisfied, false);
    assert.deepStrictEqual(v.missingClaims, ['report.docx']);
  });

  it('is satisfied for non-file goals with no claims', () => {
    const v = verifyArtifacts({ tasks: [], goal: 'Explain how OAuth works', verifiedFiles: [] });
    assert.strictEqual(v.satisfied, true);
  });
});

describe('buildGroundingBlock', () => {
  it('names missing artifacts and forbids success language', () => {
    const v = verifyArtifacts({
      tasks: [],
      goal: 'build a website dashboard with html frontend',
      verifiedFiles: [{ filename: 'app.py' }]
    });
    const block = buildGroundingBlock(v);
    assert.ok(block.includes('EXPECTED but MISSING'));
    assert.ok(block.includes('HTML frontend'));
    assert.ok(block.includes('NEVER say "ready"'));
  });

  it('reports NO files created when list is empty', () => {
    const v = verifyArtifacts({ tasks: [], goal: 'make a docx', verifiedFiles: [] });
    const block = buildGroundingBlock(v);
    assert.ok(block.includes('NO files were created'));
  });
});
