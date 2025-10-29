#!/usr/bin/env node
/**
 * Context Chaining Test - Tests context carryover across multiple edits
 * Tests: Profile context, file versioning, instruction adherence
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const GRACE_URL = 'http://localhost:5005';

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
  data: (label, data) => console.log(`${colors.magenta}${label}:${colors.reset}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
};

// Test sequence: Create → Edit → Edit → Verify context
const TEST_SEQUENCE = [
  {
    step: 1,
    name: 'Create Initial Document',
    goal: 'Create a Word document about love with a title "The Essence of Love" and 2 paragraphs',
    expectedFiles: 1,
    verifyContext: {
      profile: false, // First request, profile should be loaded
      fileCount: 0,   // No files yet
      taskCount: 0    // No previous tasks
    }
  },
  {
    step: 2,
    name: 'Add Author Name',
    goal: 'Add my name as the author at the top of the document',
    expectedFiles: 1,
    verifyContext: {
      profile: true,  // Should use Kenny from profile
      fileCount: 1,   // Should see the document from step 1
      taskCount: 1,   // Should see previous task
      userName: 'Kenny' // Should use actual name, not placeholder
    }
  },
  {
    step: 3,
    name: 'Add Red Star',
    goal: 'Add a big red star at the very top of the document',
    expectedFiles: 1,
    verifyContext: {
      profile: true,
      fileCount: 1,
      taskCount: 2,
      verifyColor: 'red',    // Must be red, not black
      verifyPosition: 'top', // Must be at top, not bottom
      verifySize: 'big'      // Must be large
    }
  },
  {
    step: 4,
    name: 'Add Section',
    goal: 'Add a new section called "Why Love Matters" with 1 paragraph',
    expectedFiles: 1,
    verifyContext: {
      profile: true,
      fileCount: 1,
      taskCount: 3
    }
  }
];

class ContextChainingTester {
  constructor() {
    this.conversationId = null;
    this.results = [];
    this.messages = [];
    this.fileVersions = [];
  }

  async createConversation() {
    try {
      const response = await axios.post(`${GRACE_URL}/api/conversation`, {
        content: 'Context chaining test',
        mode_type: 'task',
        agent_id: 1
      }, { timeout: 5000 });
      
      if (response.data?.data?.conversation_id) {
        this.conversationId = response.data.data.conversation_id;
        log.success(`Created conversation: ${this.conversationId}`);
        return this.conversationId;
      }
    } catch (error) {
      log.error(`Failed to create conversation: ${error.message}`);
    }
    
    this.conversationId = uuidv4();
    log.warn(`Using fallback UUID: ${this.conversationId}`);
    return this.conversationId;
  }

  async runStep(testStep) {
    log.section(`Step ${testStep.step}: ${testStep.name}`);
    log.info(`Goal: "${testStep.goal}"`);
    
    const startTime = Date.now();
    const stepMessages = [];
    let contextData = {
      profileUsed: false,
      filesSeen: 0,
      tasksSeen: 0,
      technicalLeakage: false,
      userName: null
    };

    try {
      const response = await axios.post(
        `${GRACE_URL}/api/agent/run`,
        {
          conversation_id: this.conversationId,
          question: testStep.goal,
          mode: 'task'
        },
        {
          responseType: 'stream',
          timeout: 90000
        }
      );

      log.info('Processing response...');
      
      let buffer = '';
      
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              stepMessages.push(data);
              
              const actionType = data.meta?.action_type;
              const content = data.content || '';
              
              // Check for technical leakage
              if (content.match(/Updated .+\.(docx|xlsx) with/i) ||
                  content.match(/Loaded existing/i) ||
                  content.match(/nice! now/i) ||
                  content.match(/The user wants me to/i)) {
                contextData.technicalLeakage = true;
                log.error(`❌ Technical leakage detected: ${content.substring(0, 100)}`);
              }
              
              // Check for profile usage (look for actual name)
              if (content.includes('Kenny') || content.includes('kenny')) {
                contextData.profileUsed = true;
                contextData.userName = 'Kenny';
                log.success(`✓ Profile used: Found user name "Kenny"`);
              }
              
              // Check for placeholder names (bad)
              if (content.match(/\[.*name.*\]/i) || content.match(/your name/i)) {
                log.warn(`⚠️  Placeholder detected: ${content.substring(0, 100)}`);
              }
              
              // Track file versions
              if (actionType === 'finish_summery' && data.meta?.json) {
                const files = data.meta.json;
                if (Array.isArray(files)) {
                  files.forEach(file => {
                    if (file.version_id) {
                      this.fileVersions.push({
                        step: testStep.step,
                        filename: file.filename,
                        version_id: file.version_id,
                        version_number: file.version_number
                      });
                      log.success(`✓ File version tracked: ${file.filename} (v${file.version_number}, id: ${file.version_id})`);
                    } else {
                      log.error(`❌ No version_id for file: ${file.filename}`);
                    }
                  });
                }
              }
              
              if (actionType === 'finish_summery') {
                log.success(`✅ Step completed: ${content.substring(0, 100)}`);
              }
              
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });

      const duration = Date.now() - startTime;
      
      // Analyze results
      const summary = stepMessages.find(m => m.meta?.action_type === 'finish_summery');
      const files = summary?.meta?.json || [];
      
      log.section(`Step ${testStep.step} Results`);
      log.info(`Duration: ${duration}ms`);
      log.info(`Messages: ${stepMessages.length}`);
      log.info(`Files: ${files.length}`);
      
      // Verify expectations
      const checks = {
        fileCount: files.length === testStep.expectedFiles,
        noTechnicalLeakage: !contextData.technicalLeakage,
        profileUsed: testStep.verifyContext.profile ? contextData.profileUsed : true,
        userName: testStep.verifyContext.userName ? contextData.userName === testStep.verifyContext.userName : true
      };
      
      const allPassed = Object.values(checks).every(v => v);
      
      if (allPassed) {
        log.success(`✅ All checks passed for step ${testStep.step}`);
      } else {
        log.error(`❌ Some checks failed for step ${testStep.step}`);
        Object.entries(checks).forEach(([check, passed]) => {
          if (!passed) {
            log.error(`  ✗ ${check}`);
          }
        });
      }
      
      this.results.push({
        step: testStep.step,
        name: testStep.name,
        success: allPassed,
        duration,
        checks,
        contextData,
        files
      });
      
      // Wait between steps to ensure context is saved
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return { success: allPassed, contextData };
      
    } catch (error) {
      log.error(`Step ${testStep.step} failed: ${error.message}`);
      this.results.push({
        step: testStep.step,
        name: testStep.name,
        success: false,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  async runFullTest() {
    log.section('Context Chaining Test Suite');
    log.info('Testing context carryover across multiple edits');
    log.info(`Steps: ${TEST_SEQUENCE.length}`);
    
    await this.createConversation();
    
    for (const step of TEST_SEQUENCE) {
      await this.runStep(step);
    }
    
    // Final analysis
    log.section('Final Analysis');
    
    const allPassed = this.results.every(r => r.success);
    const passed = this.results.filter(r => r.success).length;
    
    log.info(`Steps completed: ${this.results.length}/${TEST_SEQUENCE.length}`);
    log.info(`Steps passed: ${passed}/${this.results.length}`);
    
    // File version analysis
    if (this.fileVersions.length > 0) {
      log.section('File Version Tracking');
      log.info(`Total versions tracked: ${this.fileVersions.length}`);
      
      const uniqueVersions = new Set(this.fileVersions.map(v => v.version_id));
      log.info(`Unique version IDs: ${uniqueVersions.size}`);
      
      if (uniqueVersions.size === this.fileVersions.length) {
        log.success(`✅ Each edit created a new version (correct!)`);
      } else {
        log.error(`❌ Some edits reused version IDs (incorrect!)`);
      }
      
      this.fileVersions.forEach(v => {
        log.info(`  Step ${v.step}: ${v.filename} → v${v.version_number} (id: ${v.version_id})`);
      });
    } else {
      log.error(`❌ No file versions tracked - version_id not being attached!`);
    }
    
    // Context checks
    log.section('Context Checks');
    const contextChecks = {
      profileUsed: this.results.some(r => r.contextData?.profileUsed),
      noTechnicalLeakage: this.results.every(r => !r.contextData?.technicalLeakage),
      fileVersioning: this.fileVersions.length > 0
    };
    
    Object.entries(contextChecks).forEach(([check, passed]) => {
      const icon = passed ? '✓' : '✗';
      const color = passed ? colors.green : colors.red;
      console.log(`${color}${icon}${colors.reset} ${check}`);
    });
    
    if (allPassed && Object.values(contextChecks).every(v => v)) {
      log.success('\n🎉 ALL TESTS PASSED! Context system working correctly!');
    } else {
      log.error('\n❌ SOME TESTS FAILED - Context system needs fixes');
    }
    
    // Save results
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test_context_chaining_${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify({
      conversationId: this.conversationId,
      results: this.results,
      fileVersions: this.fileVersions,
      contextChecks
    }, null, 2));
    log.info(`\nDetailed results saved to: ${filename}`);
    
    return { allPassed, results: this.results };
  }
}

// Main execution
async function main() {
  const tester = new ContextChainingTester();
  await tester.runFullTest();
}

main().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
