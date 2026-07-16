const { exec, spawn } = require('child_process');
const { restrictFilepath } = require('./runtime.util');

// SAFETY: Kill runaway commands (infinite loops, hung processes) instead of
// wedging the action pipeline forever. Configurable via env.
const EXEC_TIMEOUT_MS = parseInt(process.env.SANDBOX_EXEC_TIMEOUT_MS || '120000', 10);
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // cap stdout/stderr at 2MB

const runCommand = (command, args, cwd) => {
  return new Promise((resolve, reject) => {
    if (Array.isArray(args)) {
      args = args.join(' ');
    }
    const fullCommand = `${command} ${args}`;
    console.log('fullCommand', fullCommand, 'cwd', cwd);

    // Handle nohup command
    if (command.includes('nohup')) {
      // Use shell to execute nohup command
      const child = spawn('/bin/bash', ['-c', fullCommand], {
        cwd,
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'] // Ignore all standard input output
      });
      child.unref(); // Allow parent process to exit independently of child process
      resolve({
        stdout: `Background process started, PID: ${child.pid}, output redirected to nohup.out`,
        stderr: ''
      });
    } else {
      exec(fullCommand, {
        cwd,
        shell: '/bin/bash',
        timeout: EXEC_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES
      }, (error, stdout, stderr) => {
        if (error) {
          // Distinguish timeout kills so the agent (and user) get a clear message
          if (error.killed || error.signal === 'SIGKILL') {
            reject({
              error: `Command timed out after ${Math.round(EXEC_TIMEOUT_MS / 1000)}s and was killed. ` +
                     `Long-running servers should use nohup; check for infinite loops otherwise.`,
              stderr: (stderr || '').slice(-4000)
            });
            return;
          }
          reject({ error: error.message, stderr });
          return;
        }
        resolve({ stdout, stderr });
      });
    }
  });
}

const terminal_run = async (action, uuid) => {
  const { command, args = [], cwd } = action.params;
  // Use provided cwd or default to current directory
  const executionDir = cwd ? await restrictFilepath(cwd) : process.cwd();
  console.log('[terminal_run] Executing in directory:', executionDir);
  try {
    const result = await runCommand(command, args, executionDir);
    return {
      uuid,
      status: 'success',
      content: result.stdout || 'Execution result has no return content',
      stderr: result.stderr,
      meta: {
        action_type: action.type,
      }
    };
  } catch (e) {
    console.error('Error executing command:', e);
    // NOTE: runCommand rejects with { error, stderr } — read e.error first, or the
    // agent receives an empty failure reason and can't react to timeouts/crashes.
    return {
      uuid,
      status: 'failure',
      error: e.error || e.stderr || e.message || 'Command failed with no output',
      content: '',
      stderr: e.stderr || '',
      meta: {
        action_type: action.type
      }
    };
  }
}

module.exports = terminal_run;

