/**
 * Workspace janitor — self-cleaning efficiency.
 *
 * After a task completes, remove throwaway artifacts so conversation workspaces
 * stay tidy and don't accumulate cruft across compound/iterative sessions.
 * Deliberately conservative: only removes KNOWN-disposable patterns, never user
 * deliverables. Fire-and-forget, off the critical path.
 */
const fs = require('fs').promises;
const path = require('path');

const DISPOSABLE = [
  /^temp_script_\d+\.py$/i,
  /^create_(doc|excel|pdf|file)_\d+\.py$/i,
  /^nohup\.out$/i,
  /^flask\.log$/i,
  /^__pycache__$/i,
  /\.pyc$/i
];

const isDisposable = (name) => DISPOSABLE.some(re => re.test(name));

async function cleanupWorkspace(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let removed = 0;
    for (const e of entries) {
      if (isDisposable(e.name)) {
        const full = path.join(dirPath, e.name);
        try {
          if (e.isDirectory()) {
            await fs.rm(full, { recursive: true, force: true });
          } else {
            await fs.unlink(full);
          }
          removed++;
        } catch { /* skip locked files */ }
      }
    }
    if (removed > 0) console.log(`[Janitor] 🧹 cleaned ${removed} disposable item(s) from ${path.basename(dirPath)}`);
  } catch (e) {
    // dir may not exist / race — non-fatal
  }
}

module.exports = { cleanupWorkspace, isDisposable };
