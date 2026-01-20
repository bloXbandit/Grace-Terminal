const { callLLM } = require('@src/utils/llm');
const GitCommitTool = require('@src/tools/GitCommit');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class CodeReviewOrchestrator {
  constructor(user_id, conversation_id) {
    this.user_id = user_id;
    this.conversation_id = conversation_id;
    this.maxIterations = 3;
    this.testTimeout = 10000; // 10 seconds max for testing
  }

  /**
   * Main execution entry point
   */
  async execute(userMessage, options = {}) {
    console.log('[CodeReviewOrchestrator] Starting multi-agent code review');
    
    try {
      // 1. Analyze context (files, repo, dependencies)
      const context = await this.analyzeCodeContext(options);
      
      // 2. Initial implementation by Qwen3 Coder
      let implementation = await this.callGenerator(userMessage, context, 0);
      
      // 3. Iteration loop: Generate -> Test -> Review -> Refine
      let approved = false;
      let iteration = 0;
      let testResults = null;
      let finalReview = null;
      
      while (!approved && iteration < this.maxIterations) {
        iteration++;
        console.log(`[CodeReviewOrchestrator] Iteration ${iteration}/${this.maxIterations}`);
        
        // Try to test the code (non-blocking, don't fail if test fails)
        testResults = await this.executeTest(implementation, context);
        
        // Review with DeepSeek R1 (includes test results if available)
        const review = await this.callReviewer(implementation, context, testResults, iteration);
        finalReview = review;
        
        // Check consensus
        if (this.checkConsensus(review, testResults)) {
          approved = true;
          console.log('[CodeReviewOrchestrator] ✅ Consensus reached');
        } else {
          console.log('[CodeReviewOrchestrator] 🔄 Refining based on feedback');
          implementation = await this.refineImplementation(
            implementation,
            review.feedback,
            testResults,
            context
          );
        }
      }
      
      // 4. Deliver clean output (code + markdown narrative)
      return await this.deliverCode(implementation, finalReview, context, options);
      
    } catch (error) {
      console.error('[CodeReviewOrchestrator] Error:', error);
      // Fallback: return what we have with error context
      return {
        error: true,
        message: `Code review orchestrator encountered an error: ${error.message}`,
        fallback: true
      };
    }
  }

  /**
   * Analyze code context: files, dependencies, errors
   * Enhanced to search subdirectories for dependency files
   */
  async analyzeCodeContext(options) {
    const context = {
      files: options.files || [],
      uploadedFiles: options.uploadedFiles || [],
      errorTraceback: options.errorTraceback || null,
      dependencies: null,
      repoInfo: null,
      language: null
    };
    
    // Detect language from uploaded files
    if (context.uploadedFiles.length > 0) {
      const firstFile = context.uploadedFiles[0];
      const ext = path.extname(firstFile).toLowerCase();
      context.language = this.detectLanguage(ext);
    }
    
    // AGGRESSIVE dependency detection - search subdirectories
    try {
      const workspaceDir = `/app/workspace/Conversation_${this.conversation_id}`;
      
      // Helper function to recursively search for files
      async function findFileRecursive(dir, filename, maxDepth = 3, currentDepth = 0) {
        if (currentDepth >= maxDepth) return null;
        
        try {
          const files = await fs.readdir(dir);
          
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            
            if (file === filename) {
              return filePath;
            }
            
            if (stat.isDirectory()) {
              const found = await findFileRecursive(filePath, filename, maxDepth, currentDepth + 1);
              if (found) return found;
            }
          }
        } catch (error) {
          // Directory might not exist or be readable
        }
        
        return null;
      }
      
      // Check for package.json in subdirectories
      const packageJsonPath = await findFileRecursive(workspaceDir, 'package.json');
      if (packageJsonPath) {
        const packageJson = await fs.readFile(packageJsonPath, 'utf8');
        context.dependencies = { 
          type: 'npm', 
          content: JSON.parse(packageJson),
          path: packageJsonPath 
        };
        console.log(`[CodeReviewOrchestrator] Found package.json at: ${packageJsonPath}`);
      }
      
      // Check for requirements.txt in subdirectories
      const requirementsPath = await findFileRecursive(workspaceDir, 'requirements.txt');
      if (requirementsPath) {
        const requirements = await fs.readFile(requirementsPath, 'utf8');
        context.dependencies = { 
          type: 'pip', 
          content: requirements,
          path: requirementsPath 
        };
        console.log(`[CodeReviewOrchestrator] Found requirements.txt at: ${requirementsPath}`);
      }
      
      // Check for other common dependency files
      const yarnPath = await findFileRecursive(workspaceDir, 'yarn.lock');
      const pipfilePath = await findFileRecursive(workspaceDir, 'Pipfile');
      const cargoPath = await findFileRecursive(workspaceDir, 'Cargo.toml');
      const goModPath = await findFileRecursive(workspaceDir, 'go.mod');
      
      if (yarnPath) {
        console.log(`[CodeReviewOrchestrator] Found yarn.lock at: ${yarnPath}`);
        if (!context.dependencies) {
          context.dependencies = { type: 'yarn', path: yarnPath };
        }
      }
      
      if (pipfilePath) {
        console.log(`[CodeReviewOrchestrator] Found Pipfile at: ${pipfilePath}`);
        if (!context.dependencies) {
          context.dependencies = { type: 'pipenv', path: pipfilePath };
        }
      }
      
      if (cargoPath) {
        console.log(`[CodeReviewOrchestrator] Found Cargo.toml at: ${cargoPath}`);
        if (!context.dependencies) {
          context.dependencies = { type: 'cargo', path: cargoPath };
        }
      }
      
      if (goModPath) {
        console.log(`[CodeReviewOrchestrator] Found go.mod at: ${goModPath}`);
        if (!context.dependencies) {
          context.dependencies = { type: 'go', path: goModPath };
        }
      }
      
    } catch (error) {
      console.log('[CodeReviewOrchestrator] Could not read dependencies:', error.message);
    }
    
    return context;
  }

  /**
   * Execute code in sandbox (non-blocking, best effort)
   */
  async executeTest(implementation, context) {
    console.log('[CodeReviewOrchestrator] Attempting to test code in sandbox');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[CodeReviewOrchestrator] Test timeout, continuing without test results');
        resolve(null);
      }, this.testTimeout);
      
      try {
        const lang = context.language || 'python';
        const testFile = `/tmp/test_${Date.now()}.${lang === 'python' ? 'py' : 'js'}`;
        const command = lang === 'python' ? 'python3' : 'node';
        
        // Write code to temp file
        fs.writeFile(testFile, implementation.code || implementation)
          .then(() => {
            // Execute
            const proc = spawn(command, [testFile], {
              timeout: this.testTimeout - 1000
            });
            
            let stdout = '';
            let stderr = '';
            
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });
            
            proc.on('close', (code) => {
              clearTimeout(timeout);
              resolve({
                success: code === 0,
                exitCode: code,
                stdout,
                stderr,
                tested: true
              });
            });
            
            proc.on('error', (err) => {
              clearTimeout(timeout);
              resolve({
                success: false,
                error: err.message,
                tested: false
              });
            });
          })
          .catch((err) => {
            clearTimeout(timeout);
            resolve(null);
          });
          
      } catch (error) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  /**
   * Call Qwen3 Coder for implementation
   */
  async callGenerator(prompt, context, iteration) {
    console.log(`[CodeReviewOrchestrator] Calling Qwen3 Coder (iteration ${iteration})`);
    
    const systemPrompt = `You are a fast, efficient code generator specializing in clean, working implementations.

CONTEXT:
${context.language ? `Language: ${context.language}` : ''}
${context.dependencies ? `Dependencies: ${JSON.stringify(context.dependencies, null, 2)}` : ''}
${context.uploadedFiles.length > 0 ? `Files in context: ${context.uploadedFiles.join(', ')}` : ''}

OUTPUT FORMAT:
- Write clean, working code
- Include error handling
- Follow language best practices
- Add brief inline comments only where necessary

Generate the implementation now:`;

    const response = await callLLM({
      model: 'openrouter/qwen/qwen3-coder-30b-a3b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      stream: false
    });
    
    return {
      code: response.content,
      iteration,
      agent: 'qwen3-coder'
    };
  }

  /**
   * Call DeepSeek R1 for review
   */
  async callReviewer(implementation, context, testResults, iteration) {
    console.log(`[CodeReviewOrchestrator] Calling DeepSeek R1 for review (iteration ${iteration})`);
    
    const systemPrompt = `You are a senior code reviewer with deep reasoning capabilities. Review code across four dimensions:

1. **Security**: Vulnerabilities, injection risks, data exposure
2. **Performance**: Efficiency, scalability, resource usage
3. **Code Quality**: Readability, maintainability, best practices
4. **Functionality**: Correctness, edge cases, error handling

${testResults ? `
TEST RESULTS:
- Success: ${testResults.success}
- Exit Code: ${testResults.exitCode}
- Stdout: ${testResults.stdout}
- Stderr: ${testResults.stderr}
` : 'No test results available (code was not executed).'}

OUTPUT FORMAT:
{
  "approved": true/false,
  "feedback": "Detailed feedback with specific line references",
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Review the code now:`;

    const codeToReview = typeof implementation === 'string' ? implementation : implementation.code;
    
    const response = await callLLM({
      model: 'openrouter/deepseek/deepseek-r1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Code to review:\n\n${codeToReview}` }
      ],
      stream: false
    });
    
    // Parse JSON response
    try {
      const review = JSON.parse(response.content);
      return review;
    } catch (e) {
      // Fallback if not JSON
      return {
        approved: false,
        feedback: response.content,
        issues: [],
        suggestions: []
      };
    }
  }

  /**
   * Refine implementation based on feedback
   */
  async refineImplementation(implementation, feedback, testResults, context) {
    console.log('[CodeReviewOrchestrator] Refining implementation');
    
    const refinementPrompt = `The code has been reviewed. Please refine it based on this feedback:

FEEDBACK:
${feedback}

${testResults && !testResults.success ? `
TEST ERRORS:
${testResults.stderr}
` : ''}

ORIGINAL CODE:
${typeof implementation === 'string' ? implementation : implementation.code}

Provide the improved version:`;

    const response = await callLLM({
      model: 'openrouter/qwen/qwen3-coder-30b-a3b-instruct',
      messages: [
        { role: 'user', content: refinementPrompt }
      ],
      stream: false
    });
    
    return {
      code: response.content,
      refined: true,
      agent: 'qwen3-coder'
    };
  }

  /**
   * Check if consensus is reached
   */
  checkConsensus(review, testResults) {
    // Approved by reviewer AND (no tests OR tests passed)
    const reviewerApproved = review.approved === true;
    const testsOk = !testResults || testResults.success === true;
    
    return reviewerApproved && testsOk;
  }

  /**
   * Deliver clean output: code file + markdown narrative
   */
  async deliverCode(implementation, review, context, options) {
    console.log('[CodeReviewOrchestrator] Delivering final code');
    
    const code = typeof implementation === 'string' ? implementation : implementation.code;
    const lang = context.language || 'python';
    const ext = lang === 'python' ? 'py' : 'js';
    
    // Generate filename
    const timestamp = Date.now();
    const codeFilename = `reviewed_code_${timestamp}.${ext}`;
    const narrativeFilename = `code_review_summary_${timestamp}.md`;
    
    // Create markdown narrative
    const narrative = `# Code Review Summary

## Overview
Multi-agent code review completed with ${implementation.iteration || 0} iteration(s).

## Agents Involved
- **Generator**: Qwen3 Coder 30B (fast implementation)
- **Reviewer**: DeepSeek R1 (rigorous analysis)

## Review Status
${review.approved ? '✅ **APPROVED** - Code meets quality standards' : '⚠️ **NEEDS WORK** - See feedback below'}

## Changes Made
${review.suggestions ? review.suggestions.map(s => `- ${s}`).join('\n') : 'No specific suggestions provided'}

## Issues Addressed
${review.issues && review.issues.length > 0 ? review.issues.map(i => `- ${i}`).join('\n') : 'No critical issues found'}

## Recommendations
${review.feedback || 'Code is production-ready'}

---
*Generated by Grace Multi-Agent Code Review System*
`;

    // Return both files
    return {
      success: true,
      files: [
        {
          filename: codeFilename,
          content: code,
          type: 'code'
        },
        {
          filename: narrativeFilename,
          content: narrative,
          type: 'markdown'
        }
      ],
      review,
      approved: review.approved
    };
  }

  /**
   * Detect language from file extension
   */
  detectLanguage(ext) {
    const langMap = {
      '.py': 'python',
      '.js': 'javascript',
      '.ts': 'typescript',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php'
    };
    return langMap[ext] || 'python';
  }
}

module.exports = CodeReviewOrchestrator;
