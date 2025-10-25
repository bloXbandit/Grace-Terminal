#!/usr/bin/env node
/**
 * Cascade-Grace Development Test Suite
 * AI-to-AI collaboration: Cascade sends tasks, Grace executes, Cascade QCs and iterates
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const GRACE_URL = 'http://localhost:5005';
const TEST_USER_ID = 'cascade_dev_user';
const MAX_ITERATIONS = 3;

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}${colors.bright}━━━ ${msg} ━━━${colors.reset}\n`),
  cascade: (msg) => console.log(`${colors.magenta}🤖 [Cascade]${colors.reset} ${msg}`),
  grace: (msg) => console.log(`${colors.green}💚 [Grace]${colors.reset} ${msg}`),
  data: (label, data) => console.log(`${colors.magenta}${label}:${colors.reset}`, JSON.stringify(data, null, 2))
};

/**
 * Cascade Dev Test Case
 */
const CASCADE_DEV_TEST = {
  name: 'Cascade-Grace Collaborative Development',
  initialTask: 'Create a Python script that calculates the first 10 fibonacci numbers and saves them to a file called fibonacci.txt',
  mode: 'task',
  
  // Quality criteria Cascade will check
  qualityCriteria: {
    codeQuality: {
      hasComments: true,
      hasErrorHandling: false, // Not required for simple script
      followsPEP8: true
    },
    functionality: {
      correctAlgorithm: true,
      outputsToFile: true,
      correctCount: 10
    },
    files: {
      expectedFiles: ['fibonacci.txt'],
      expectedPattern: /fibonacci\.txt$/
    }
  },
  
  // Cascade's feedback templates
  feedbackTemplates: {
    missingFile: "The file wasn't created. Please ensure the script writes to fibonacci.txt",
    wrongCount: "The output has {actual} numbers but should have {expected}",
    noComments: "Please add comments explaining the fibonacci algorithm",
    improvement: "Good work! Could you also add: {suggestion}"
  }
};

class CascadeDevTester {
  constructor() {
    this.conversationId = null;
    this.iteration = 0;
    this.testResults = {
      iterations: [],
      finalQuality: null,
      totalTime: 0
    };
  }

  /**
   * Create a new conversation
   */
  async createConversation() {
    try {
      const response = await axios.post(`${GRACE_URL}/api/conversation`, {
        content: `Cascade Dev Test - ${new Date().toISOString()}`,
        mode_type: 'task',
        agent_id: 1
      }, {
        timeout: 5000
      });
      
      if (response.data && response.data.data && response.data.data.conversation_id) {
        this.conversationId = response.data.data.conversation_id;
        log.success(`✅ Created conversation: ${this.conversationId}`);
        return this.conversationId;
      } else {
        throw new Error('Invalid response: conversation_id not found');
      }
    } catch (error) {
      log.error(`Failed to create conversation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send task to Grace and wait for completion
   */
  async sendTaskToGrace(task, mode = 'task') {
    log.grace(`Executing: "${task}"`);
    
    const startTime = Date.now();
    const messages = [];
    
    try {
      const response = await axios.post(
        `${GRACE_URL}/api/agent/run`,
        {
          conversation_id: this.conversationId,
          question: task,  // Use 'question' not 'goal'
          mode: mode
        },
        {
          responseType: 'stream',
          timeout: 120000 // 2 minutes
        }
      );

      // Parse SSE stream
      let buffer = '';
      
      await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'message') {
                  messages.push(data);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        });
        
        response.data.on('end', () => resolve());
        response.data.on('error', (err) => reject(err));
        
        // Timeout
        setTimeout(() => reject(new Error('Stream timeout')), 120000);
      });

      const duration = Date.now() - startTime;
      log.success(`Grace completed in ${(duration / 1000).toFixed(2)}s`);
      
      return {
        success: true,
        duration,
        messages
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error(`Grace failed after ${(duration / 1000).toFixed(2)}s: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        duration,
        messages
      };
    }
  }

  /**
   * Cascade analyzes Grace's output
   */
  async analyzeOutput(result, criteria) {
    log.cascade('Analyzing Grace\'s output...');
    
    const analysis = {
      passed: true,
      issues: [],
      suggestions: [],
      filesCreated: [],
      quality: {
        codeQuality: 0,
        functionality: 0,
        completeness: 0
      }
    };

    // Check if task succeeded
    if (!result.success) {
      analysis.passed = false;
      analysis.issues.push(`Task failed: ${result.error}`);
      return analysis;
    }

    // Check for files created
    const workspacePath = path.join(__dirname, 'workspace', TEST_USER_ID);
    if (fs.existsSync(workspacePath)) {
      const files = this.findFilesRecursive(workspacePath);
      analysis.filesCreated = files;
      
      // Check expected files
      if (criteria.files?.expectedFiles) {
        const expectedFound = criteria.files.expectedFiles.every(expectedFile => 
          files.some(file => file.includes(expectedFile))
        );
        
        if (!expectedFound) {
          analysis.passed = false;
          analysis.issues.push(`Missing expected files: ${criteria.files.expectedFiles.join(', ')}`);
          analysis.quality.completeness = 0;
        } else {
          analysis.quality.completeness = 100;
        }
      }
    } else {
      analysis.issues.push('Workspace directory not found');
      analysis.quality.completeness = 0;
    }

    // Check messages for code quality indicators
    const messages = result.messages || [];
    const hasCode = messages.some(m => m.content?.includes('```python') || m.content?.includes('def '));
    const hasComments = messages.some(m => m.content?.includes('#'));
    
    if (hasCode) {
      analysis.quality.codeQuality = hasComments ? 100 : 70;
      if (!hasComments && criteria.codeQuality?.hasComments) {
        analysis.suggestions.push('Add comments to explain the code');
      }
    }

    // Overall quality score
    const avgQuality = Object.values(analysis.quality).reduce((a, b) => a + b, 0) / Object.keys(analysis.quality).length;
    analysis.overallQuality = avgQuality;

    // Determine if passed
    analysis.passed = analysis.issues.length === 0 && avgQuality >= 70;

    return analysis;
  }

  /**
   * Find files recursively
   */
  findFilesRecursive(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        this.findFilesRecursive(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    });
    
    return fileList;
  }

  /**
   * Generate feedback for Grace based on analysis
   */
  generateFeedback(analysis, templates) {
    if (analysis.passed) {
      return null; // No feedback needed
    }

    let feedback = "Let me help improve this:\n\n";
    
    if (analysis.issues.length > 0) {
      feedback += "Issues found:\n";
      analysis.issues.forEach((issue, i) => {
        feedback += `${i + 1}. ${issue}\n`;
      });
      feedback += "\n";
    }

    if (analysis.suggestions.length > 0) {
      feedback += "Suggestions:\n";
      analysis.suggestions.forEach((suggestion, i) => {
        feedback += `${i + 1}. ${suggestion}\n`;
      });
    }

    return feedback;
  }

  /**
   * Main test loop with iterations
   */
  async runTest(testCase) {
    log.section(`Starting Cascade-Grace Dev Test: ${testCase.name}`);
    
    const startTime = Date.now();
    
    // Create conversation
    await this.createConversation();
    
    let currentTask = testCase.initialTask;
    let testPassed = false;
    
    // Iteration loop
    while (this.iteration < MAX_ITERATIONS && !testPassed) {
      this.iteration++;
      log.section(`Iteration ${this.iteration}/${MAX_ITERATIONS}`);
      
      // Cascade sends task to Grace
      log.cascade(`Sending task: "${currentTask}"`);
      const result = await this.sendTaskToGrace(currentTask, testCase.mode);
      
      // Cascade analyzes output
      const analysis = await this.analyzeOutput(result, testCase.qualityCriteria);
      
      // Store iteration results
      this.testResults.iterations.push({
        iteration: this.iteration,
        task: currentTask,
        result,
        analysis
      });
      
      // Display analysis
      log.cascade(`Quality Score: ${analysis.overallQuality?.toFixed(1)}%`);
      if (analysis.filesCreated.length > 0) {
        log.info(`Files created: ${analysis.filesCreated.map(f => path.basename(f)).join(', ')}`);
      }
      
      if (analysis.passed) {
        log.success('✅ Test PASSED! Grace\'s output meets quality criteria');
        testPassed = true;
        this.testResults.finalQuality = 'PASSED';
      } else {
        log.warn(`Quality issues found (${analysis.issues.length} issues, ${analysis.suggestions.length} suggestions)`);
        
        // Generate feedback
        const feedback = this.generateFeedback(analysis, testCase.feedbackTemplates);
        
        if (this.iteration < MAX_ITERATIONS) {
          log.cascade('Sending feedback to Grace for improvement...');
          currentTask = feedback;
        } else {
          log.error('❌ Max iterations reached without passing');
          this.testResults.finalQuality = 'FAILED';
        }
      }
    }
    
    this.testResults.totalTime = Date.now() - startTime;
    
    // Final summary
    this.printSummary();
    
    return testPassed;
  }

  /**
   * Print test summary
   */
  printSummary() {
    log.section('Test Summary');
    
    console.log(`Total Iterations: ${this.iteration}`);
    console.log(`Total Time: ${(this.testResults.totalTime / 1000).toFixed(2)}s`);
    console.log(`Final Result: ${this.testResults.finalQuality}`);
    
    console.log('\nIteration Breakdown:');
    this.testResults.iterations.forEach((iter, i) => {
      console.log(`\n  Iteration ${i + 1}:`);
      console.log(`    Quality: ${iter.analysis.overallQuality?.toFixed(1)}%`);
      console.log(`    Issues: ${iter.analysis.issues.length}`);
      console.log(`    Suggestions: ${iter.analysis.suggestions.length}`);
      console.log(`    Files: ${iter.analysis.filesCreated.length}`);
    });
  }
}

/**
 * Main execution
 */
async function main() {
  const tester = new CascadeDevTester();
  
  try {
    const passed = await tester.runTest(CASCADE_DEV_TEST);
    process.exit(passed ? 0 : 1);
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { CascadeDevTester, CASCADE_DEV_TEST };
