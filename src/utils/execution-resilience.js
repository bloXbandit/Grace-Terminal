/**
 * Execution Resilience Module
 * Provides brute force retry logic, auto-debugging, and execution recovery
 * Ensures code executes successfully even if initial attempts fail
 */

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 5000]; // ms

/**
 * Execute code with automatic retry and debugging
 * @param {Function} executeFn - Function that executes code and returns result
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function executeWithResilience(executeFn, options = {}) {
  const {
    code,
    language,
    runtime,
    validateFirst = true,
    autoFix = true,
    maxRetries = MAX_RETRIES,
    context = {}
  } = options;

  let lastError = null;
  let attempts = [];

  // Step 1: Validate code syntax first (if enabled)
  if (validateFirst && code && language) {
    console.log('[ExecutionResilience] Validating code syntax...');
    
    try {
      const validator = require('../tools/CodeValidator');
      const validationResult = await validator.execute({
        code,
        language,
        fix_errors: autoFix
      }, { runtime });

      if (!validationResult.valid) {
        if (validationResult.fixed && validationResult.fixed_code) {
          console.log('[ExecutionResilience] Auto-fixed syntax error, using fixed code');
          // Update code in options for execution
          options.code = validationResult.fixed_code;
        } else {
          console.warn('[ExecutionResilience] Syntax validation failed:', validationResult.error);
          attempts.push({
            attempt: 0,
            phase: 'validation',
            error: validationResult.error,
            message: validationResult.message
          });
        }
      } else {
        console.log('[ExecutionResilience] ✅ Code syntax valid');
      }
    } catch (validationError) {
      console.warn('[ExecutionResilience] Validation error (non-fatal):', validationError.message);
    }
  }

  // Step 2: Execute with retry logic
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[ExecutionResilience] Execution attempt ${attempt}/${maxRetries}...`);
      
      const result = await executeFn(options);

      // Check if execution was successful
      if (result && (result.success || result.exit_code === 0 || !result.error)) {
        console.log(`[ExecutionResilience] ✅ Execution successful on attempt ${attempt}`);
        
        return {
          success: true,
          result,
          attempts: attempts.length + 1,
          recovered: attempt > 1,
          message: attempt > 1 
            ? `✅ Execution succeeded after ${attempt} attempts`
            : '✅ Execution succeeded'
        };
      }

      // Execution failed, log attempt
      lastError = result.error || result.stderr || 'Unknown error';
      attempts.push({
        attempt,
        error: lastError,
        result
      });

      console.warn(`[ExecutionResilience] ❌ Attempt ${attempt} failed:`, lastError);

      // Try to auto-fix common errors
      if (autoFix && attempt < maxRetries) {
        const fixed = await attemptAutoFix(code, language, lastError, runtime);
        if (fixed) {
          console.log('[ExecutionResilience] Auto-fixed error, retrying...');
          options.code = fixed;
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = RETRY_DELAYS[attempt - 1] || 5000;
        console.log(`[ExecutionResilience] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

    } catch (error) {
      lastError = error;
      attempts.push({
        attempt,
        error: error.message,
        stack: error.stack
      });

      console.error(`[ExecutionResilience] ❌ Attempt ${attempt} threw exception:`, error.message);

      // Wait before retry
      if (attempt < maxRetries) {
        const delay = RETRY_DELAYS[attempt - 1] || 5000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  console.error('[ExecutionResilience] ❌ All execution attempts failed');
  
  return {
    success: false,
    error: lastError,
    attempts: attempts.length,
    attemptDetails: attempts,
    message: `❌ Execution failed after ${maxRetries} attempts. Last error: ${lastError}`
  };
}

/**
 * Attempt to auto-fix common code errors
 */
async function attemptAutoFix(code, language, error, runtime) {
  if (!code || !language || !error) return null;

  const errorStr = typeof error === 'string' ? error : JSON.stringify(error);

  // Python-specific fixes
  if (language === 'python') {
    // Fix: ModuleNotFoundError
    if (errorStr.includes('ModuleNotFoundError') || errorStr.includes('No module named')) {
      const moduleMatch = errorStr.match(/No module named ['"]([^'"]+)['"]/);
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        console.log(`[ExecutionResilience] Attempting to install missing module: ${moduleName}`);
        
        if (runtime) {
          try {
            await runtime.executeCommand(`pip3 install ${moduleName}`);
            return code; // Return original code, module should now be installed
          } catch (installError) {
            console.error('[ExecutionResilience] Failed to install module:', installError);
          }
        }
      }
    }

    // Fix: IndentationError
    if (errorStr.includes('IndentationError') || errorStr.includes('unexpected indent')) {
      // Try to fix indentation
      const lines = code.split('\n');
      const fixed = lines.map(line => {
        // Remove leading tabs, replace with 4 spaces
        return line.replace(/^\t+/, match => '    '.repeat(match.length));
      }).join('\n');
      
      if (fixed !== code) {
        console.log('[ExecutionResilience] Fixed indentation');
        return fixed;
      }
    }

    // Fix: SyntaxError - missing colon
    if (errorStr.includes('SyntaxError') && errorStr.includes('expected')) {
      const lines = code.split('\n');
      const fixed = lines.map(line => {
        if (/^\s*(if|for|while|def|class|with|try|except|finally|elif|else)\s+.*[^:]$/.test(line)) {
          return line + ':';
        }
        return line;
      }).join('\n');
      
      if (fixed !== code) {
        console.log('[ExecutionResilience] Added missing colons');
        return fixed;
      }
    }
  }

  // JavaScript-specific fixes
  if (language === 'javascript' || language === 'typescript') {
    // Fix: Missing semicolons (if that's the issue)
    if (errorStr.includes('Unexpected token')) {
      // Add semicolons at end of statements
      const fixed = code.replace(/([^;{}\s])\s*\n/g, '$1;\n');
      if (fixed !== code) {
        console.log('[ExecutionResilience] Added missing semicolons');
        return fixed;
      }
    }
  }

  return null;
}

/**
 * Execute code with full resilience (validation + retry + auto-fix)
 * Convenience wrapper for common use case
 */
async function executeCode(code, language, runtime, options = {}) {
  return executeWithResilience(
    async (opts) => {
      // Execute code in runtime
      const tempFile = `/tmp/exec_${Date.now()}.${getExtension(language)}`;
      await runtime.writeFile(tempFile, opts.code);
      
      const command = getExecuteCommand(language, tempFile);
      const result = await runtime.executeCommand(command);
      
      await runtime.executeCommand(`rm ${tempFile}`);
      
      return result;
    },
    {
      code,
      language,
      runtime,
      validateFirst: true,
      autoFix: true,
      ...options
    }
  );
}

/**
 * Get file extension for language
 */
function getExtension(language) {
  const extensions = {
    python: 'py',
    javascript: 'js',
    typescript: 'ts',
    bash: 'sh',
    sh: 'sh'
  };
  return extensions[language] || 'txt';
}

/**
 * Get execute command for language
 */
function getExecuteCommand(language, filePath) {
  const commands = {
    python: `python3 ${filePath}`,
    javascript: `node ${filePath}`,
    typescript: `ts-node ${filePath}`,
    bash: `bash ${filePath}`,
    sh: `sh ${filePath}`
  };
  return commands[language] || `cat ${filePath}`;
}

module.exports = {
  executeWithResilience,
  executeCode,
  attemptAutoFix
};

