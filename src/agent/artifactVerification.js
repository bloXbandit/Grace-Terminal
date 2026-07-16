/**
 * Artifact-grounded completion.
 *
 * Problem this solves: tasks self-reported "completed" and the summary LLM narrated
 * success from task chatter — even when the promised files were never written
 * (e.g. "sleek frontend is ready!" with no .html on disk).
 *
 * Two sources of expectations, checked against the VERIFIED files that exist on disk:
 *   1. Claimed artifacts — file names mentioned in task actions/results
 *      (<file_path>, doc.save(...), "Created: x.ext", …)
 *   2. Goal-implied artifacts — the goal asks for a website/docx/xlsx/… so at least
 *      one file of that type must exist.
 *
 * Output feeds (a) an honest final status and (b) a grounding block in the summary
 * prompt that forbids claiming anything outside the verified list.
 */

const IGNORED_ARTIFACTS = [
  /^temp_script_\d+\.py$/i,
  /^nohup\.out$/i,
  /^create_doc_\d+\.py$/i,
  /^todo\.md$/i
];

const isIgnoredArtifact = (name) => IGNORED_ARTIFACTS.some(re => re.test(name));

/** Pull explicit file-name claims out of task text (actions, results, descriptions). */
function extractClaimedArtifacts(tasks = []) {
  const names = new Set();
  const patterns = [
    /<file_path>\s*([^<\n]+?)\s*<\/file_path>/gi,          // XML write_code child form
    /file_path="([^"]+)"/gi,                                  // XML attribute form
    /\.save\(\s*['"]([^'"]+)['"]\s*\)/g,                     // doc.save('x.docx')
    /to_excel\(\s*['"]([^'"]+)['"]/g,                         // df.to_excel('x.xlsx')
    /\.output\(\s*['"]([^'"]+)['"]\s*\)/g,                   // fpdf pdf.output('x.pdf')
    /open\(\s*['"]([\w\-./ ]+\.(?:html|css|js|txt|md|json|csv|xml|svg))['"]\s*,\s*['"]w/g, // open('x.html','w')
    /Created:?\s+([\w\-. ]+\.(?:docx|xlsx|pdf|html|css|js|py|txt|md|csv|pptx|json|xml|svg|zip))/gi // "✅ Created x.ext"
  ];

  for (const task of tasks) {
    const haystack = [
      task.preGeneratedAction,
      task.requirement,
      task.result,
      typeof task.memorized === 'string' ? task.memorized : '',
      typeof task.content === 'string' ? task.content : ''
    ].filter(Boolean).join('\n');

    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(haystack)) !== null) {
        const base = require('path').basename(m[1].trim());
        if (base && !isIgnoredArtifact(base)) names.add(base.toLowerCase());
      }
    }
  }
  return Array.from(names);
}

/** Goal keywords → at least one file with these extensions must exist. */
const GOAL_EXPECTATIONS = [
  { re: /\b(website|web\s?page|webpage|landing\s?page|frontend|front-end|html\s+(page|file|frontend)|dashboard.*(ui|frontend|html)|(ui|frontend|html).*dashboard)\b/i, exts: ['.html'], label: 'HTML frontend (.html)' },
  { re: /\b(word\s+document|docx)\b/i, exts: ['.docx'], label: 'Word document (.docx)' },
  { re: /\b(excel|spreadsheet|xlsx)\b/i, exts: ['.xlsx', '.csv'], label: 'spreadsheet (.xlsx/.csv)' },
  { re: /\bpdf\b/i, exts: ['.pdf'], label: 'PDF (.pdf)' },
  { re: /\b(powerpoint|pptx|slide\s?deck|presentation)\b/i, exts: ['.pptx'], label: 'presentation (.pptx)' },
  { re: /\b(flask|fastapi|backend\s+api|api\s+backend|python\s+(server|api|backend))\b/i, exts: ['.py'], label: 'Python backend (.py)' }
];

function extractGoalExpectations(goal = '') {
  return GOAL_EXPECTATIONS.filter(g => g.re.test(goal))
    .map(({ exts, label }) => ({ exts, label }));
}

/**
 * Verify expectations against files that actually exist.
 * @param {object} p
 * @param {Array}  p.tasks         planned tasks (with actions/results)
 * @param {string} p.goal          original user goal
 * @param {Array}  p.verifiedFiles session-created files that exist on disk
 *                                 (objects with .filename, from getFilesMetadata)
 * @returns {{ verifiedNames: string[], missingClaims: string[], missingGoalArtifacts: string[], satisfied: boolean }}
 */
function verifyArtifacts({ tasks = [], goal = '', verifiedFiles = [], extraExpected = [] }) {
  const verifiedNames = verifiedFiles
    .map(f => (f.filename || '').toLowerCase())
    .filter(n => n && !isIgnoredArtifact(n));
  const verifiedSet = new Set(verifiedNames);
  const verifiedExts = new Set(verifiedNames.map(n => n.slice(n.lastIndexOf('.'))));

  const claimed = extractClaimedArtifacts(tasks);
  const missingClaims = claimed.filter(name => !verifiedSet.has(name));

  const missingGoalArtifacts = extractGoalExpectations(goal)
    .filter(({ exts }) => !exts.some(ext => verifiedExts.has(ext)))
    .map(({ label }) => label);

  // Classifier-provided expectations: ".html" style extensions OR concrete filenames.
  // A filename expectation is satisfied by an exact match OR any file with its extension
  // (the classifier guesses names like "index.html"; delivering "dashboard.html" counts).
  for (const exp of extraExpected) {
    const e = (exp || '').toLowerCase().trim();
    if (!e || isIgnoredArtifact(e)) continue;
    if (e.startsWith('.')) {
      if (!verifiedExts.has(e)) missingGoalArtifacts.push(`file of type ${e}`);
    } else if (e.includes('.')) {
      const ext = e.slice(e.lastIndexOf('.'));
      if (!verifiedSet.has(e) && !verifiedExts.has(ext)) missingGoalArtifacts.push(e);
    }
  }

  return {
    verifiedNames,
    missingClaims,
    missingGoalArtifacts: [...new Set(missingGoalArtifacts)],
    satisfied: missingClaims.length === 0 && missingGoalArtifacts.length === 0
  };
}

/** Grounding block injected into the summary prompt. */
function buildGroundingBlock(verification) {
  const { verifiedNames, missingClaims, missingGoalArtifacts } = verification;
  const missing = [...new Set([...missingClaims, ...missingGoalArtifacts])];

  let block = `\n**ARTIFACT VERIFICATION (GROUND TRUTH — checked on disk):**\n`;
  block += verifiedNames.length > 0
    ? `Files that ACTUALLY exist: ${JSON.stringify(verifiedNames)}\n`
    : `NO files were created.\n`;
  if (missing.length > 0) {
    block += `EXPECTED but MISSING: ${JSON.stringify(missing)}\n`;
  }
  block += `
**GROUNDING RULES (ABSOLUTE):**
- ONLY claim creation/delivery of files in the verified list above
- If something is in the MISSING list, you MUST say it was NOT completed — name it specifically
- NEVER say "ready", "complete", "all set", or "full package" when the MISSING list is non-empty
- An honest partial report beats a false success claim, always`;
  return block;
}

module.exports = {
  extractClaimedArtifacts,
  extractGoalExpectations,
  verifyArtifacts,
  buildGroundingBlock,
  isIgnoredArtifact
};
