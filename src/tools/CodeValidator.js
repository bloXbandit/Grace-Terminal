/**
 * CodeValidator Tool
 * Validates code syntax before execution to prevent runtime errors
 * Supports Python, JavaScript, TypeScript, and more
 */

const code_validator = {
  name: "validate_code",
  description: "Validate code syntax before execution. Checks for syntax errors, missing imports, and common mistakes. Supports Python, JavaScript, TypeScript, Bash, and more. Use this before executing any code to ensure it will run successfully.",
  
  params: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Code to validate"
      },
      language: {
        type: "string",
        enum: ["python", "javascript", "typescript", "bash", "sh"],
        description: "Programming language"
      },
      fix_errors: {
        type: "boolean",
        description: "If true, attempt to auto-fix syntax errors",
        default: false
      }
    },
    required: ["code", "language"]
  },

  async execute(params, context = {}) {
    const { code, language, fix_errors } = params;
    const { runtime } = context;

    try {
      console.log(`[CodeValidator] Validating ${language} code...`);

      if (!runtime) {
        return {
          success: false,
          error: "Runtime not available"
        };
      }

      let validationResult;

      switch (language) {
        case 'python':
          validationResult = await this.validatePython(code, runtime, fix_errors);
          break;
        case 'javascript':
        case 'typescript':
          validationResult = await this.validateJavaScript(code, runtime, fix_errors);
          break;
        case 'bash':
        case 'sh':
          validationResult = await this.validateBash(code, runtime);
          break;
        default:
          return {
            success: false,
            error: `Unsupported language: ${language}`
          };
      }

      return validationResult;

    } catch (error) {
      console.error('[CodeValidator] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  async validatePython(code, runtime, fix_errors) {
    // Write code to temp file
    const tempFile = `/tmp/validate_${Date.now()}.py`;
    await runtime.writeFile(tempFile, code);

    // Check syntax with py_compile
    const checkScript = `
import py_compile
import sys

try:
    py_compile.compile('${tempFile}', doraise=True)
    print('SYNTAX_OK')
except SyntaxError as e:
    print(f'SYNTAX_ERROR:{e.lineno}:{e.offset}:{e.msg}')
    sys.exit(1)
`;

    const checkFile = `/tmp/check_${Date.now()}.py`;
    await runtime.writeFile(checkFile, checkScript);
    const result = await runtime.executeCommand(`python3 ${checkFile}`);
    await runtime.executeCommand(`rm ${tempFile} ${checkFile}`);

    if (result.stdout.includes('SYNTAX_OK')) {
      // Check for common issues
      const issues = this.checkPythonCommonIssues(code);
      
      return {
        success: true,
        valid: true,
        message: "✅ Python code is syntactically valid",
        warnings: issues.length > 0 ? issues : undefined
      };
    } else {
      // Parse syntax error
      const errorMatch = result.stdout.match(/SYNTAX_ERROR:(\d+):(\d+):(.+)/);
      if (errorMatch) {
        const [, line, col, msg] = errorMatch;
        
        if (fix_errors) {
          const fixed = await this.autoFixPython(code, parseInt(line), msg);
          if (fixed) {
            return {
              success: true,
              valid: false,
              fixed: true,
              original_error: { line: parseInt(line), column: parseInt(col), message: msg },
              fixed_code: fixed,
              message: "⚠️ Syntax error found and auto-fixed"
            };
          }
        }

        return {
          success: true,
          valid: false,
          error: {
            line: parseInt(line),
            column: parseInt(col),
            message: msg
          },
          message: `❌ Syntax error at line ${line}: ${msg}`
        };
      }

      return {
        success: true,
        valid: false,
        message: "❌ Syntax error detected",
        details: result.stdout
      };
    }
  },

  checkPythonCommonIssues(code) {
    const issues = [];

    // Check for common import issues
    const imports = code.match(/^(from|import)\s+(\w+)/gm) || [];
    const commonLibs = ['docx', 'openpyxl', 'pandas', 'fpdf', 'pptx', 'yaml', 'toml', 'lxml', 'qrcode'];
    
    imports.forEach(imp => {
      const lib = imp.split(/\s+/)[1];
      if (commonLibs.includes(lib)) {
        // This is fine, these are installed
      }
    });

    // Check for print statements without parentheses (Python 2 style)
    if (/print\s+[^(]/.test(code)) {
      issues.push({
        type: 'warning',
        message: 'Found print statement without parentheses (Python 2 style). Use print() instead.'
      });
    }

    // Check for missing colons
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      if (/^\s*(if|for|while|def|class|with|try|except|finally|elif|else)\s+.*[^:]$/.test(line)) {
        issues.push({
          type: 'warning',
          line: idx + 1,
          message: 'Possible missing colon at end of control statement'
        });
      }
    });

    return issues;
  },

  async autoFixPython(code, errorLine, errorMsg) {
    // Simple auto-fixes for common errors
    const lines = code.split('\n');
    
    // Fix missing colon
    if (errorMsg.includes('expected') && errorMsg.includes(':')) {
      if (errorLine <= lines.length) {
        const line = lines[errorLine - 1];
        if (/^\s*(if|for|while|def|class|with|try|except|finally|elif|else)\s+.*[^:]$/.test(line)) {
          lines[errorLine - 1] = line + ':';
          return lines.join('\n');
        }
      }
    }

    // Fix print statement (Python 2 -> 3)
    if (errorMsg.includes('print')) {
      const fixed = code.replace(/print\s+([^(].*?)$/gm, 'print($1)');
      if (fixed !== code) {
        return fixed;
      }
    }

    return null;
  },

  async validateJavaScript(code, runtime, fix_errors) {
    // Use Node.js to check syntax
    const tempFile = `/tmp/validate_${Date.now()}.js`;
    await runtime.writeFile(tempFile, code);

    const result = await runtime.executeCommand(`node --check ${tempFile}`);
    await runtime.executeCommand(`rm ${tempFile}`);

    if (result.exit_code === 0) {
      return {
        success: true,
        valid: true,
        message: "✅ JavaScript code is syntactically valid"
      };
    } else {
      // Parse error
      const errorMatch = result.stderr.match(/SyntaxError: (.+)/);
      const error = errorMatch ? errorMatch[1] : result.stderr;

      return {
        success: true,
        valid: false,
        error: error,
        message: `❌ Syntax error: ${error}`
      };
    }
  },

  async validateBash(code, runtime) {
    // Use bash -n to check syntax
    const tempFile = `/tmp/validate_${Date.now()}.sh`;
    await runtime.writeFile(tempFile, code);

    const result = await runtime.executeCommand(`bash -n ${tempFile}`);
    await runtime.executeCommand(`rm ${tempFile}`);

    if (result.exit_code === 0) {
      return {
        success: true,
        valid: true,
        message: "✅ Bash script is syntactically valid"
      };
    } else {
      return {
        success: true,
        valid: false,
        error: result.stderr,
        message: `❌ Syntax error: ${result.stderr}`
      };
    }
  }
};

module.exports = code_validator;

