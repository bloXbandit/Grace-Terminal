#!/usr/bin/env node
/**
 * Test Document Viewing Fix
 * Tests the fixes for:
 * 1. Fast-path catching "tell me what you see" questions
 * 2. Content preview in fast-path responses
 * 3. Specialist not creating scripts for viewing requests
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const GRACE_URL = 'http://localhost:5005';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`)
};

async function createTestDocument() {
  // Create a simple test document
  const testContent = `LOAN AGREEMENT

This Loan Agreement ("Agreement") is entered into on December 1, 2024, between:

Lender: ABC Financial Corp
Borrower: John Smith

Loan Amount: $50,000
Interest Rate: 5.5% per annum
Repayment Term: 36 months

Terms and Conditions:
1. The borrower agrees to repay the loan in monthly installments.
2. Payments are due on the first of each month.
3. Late payments will incur a 2% penalty fee.

Signatures:
_________________
ABC Financial Corp

_________________
John Smith`;

  const testFile = path.join(__dirname, 'test_loan_agreement.txt');
  fs.writeFileSync(testFile, testContent);
  log.success(`Created test document: ${testFile}`);
  return testFile;
}

async function createConversation() {
  try {
    const response = await axios.post(`${GRACE_URL}/api/conversation`, {
      content: 'Document viewing test',
      mode_type: 'chat',
      agent_id: 1
    });
    
    if (response.data?.data?.conversation_id) {
      const convId = response.data.data.conversation_id;
      log.success(`Created conversation: ${convId}`);
      return convId;
    }
  } catch (error) {
    log.error(`Failed to create conversation: ${error.message}`);
    throw error;
  }
}

async function uploadDocument(conversationId, filePath) {
  try {
    const formData = new FormData();
    formData.append('files', fs.createReadStream(filePath)); // Use 'files' not 'file'
    formData.append('conversation_id', conversationId);
    
    const response = await axios.post(
      `${GRACE_URL}/api/file/upload`,
      formData,
      {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
    
    log.success(`Uploaded document to conversation ${conversationId}`);
    return response.data;
  } catch (error) {
    log.error(`Failed to upload document: ${error.message}`);
    throw error;
  }
}

async function askQuestion(conversationId, question) {
  log.section(`Asking: "${question}"`);
  
  const startTime = Date.now();
  let messages = [];
  let fastPathDetected = false;
  let contentPreviewFound = false;
  let scriptCreationDetected = false;
  
  try {
    const response = await axios.post(
      `${GRACE_URL}/api/agent/run`,
      {
        conversation_id: conversationId,
        question: question,
        mode: 'chat'
      },
      {
        responseType: 'stream',
        timeout: 30000
      }
    );
    
    let buffer = '';
    
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            messages.push(data);
            
            const content = data.content || '';
            const actionType = data.meta?.action_type || '';
            
            // Check for fast-path
            if (actionType === 'auto_reply' || data.specialist === 'general_chat') {
              fastPathDetected = true;
              log.success('✓ Fast-path detected');
            }
            
            // Check for content preview
            if (content.includes('Here\'s what I see:') || content.includes('**Here\'s what I see:**')) {
              contentPreviewFound = true;
              log.success('✓ Content preview found');
            }
            
            // Check for script creation (bad!)
            if (actionType === 'write_code' || actionType === 'terminal_run') {
              scriptCreationDetected = true;
              log.error('✗ Script creation detected (should not happen for viewing!)');
            }
            
            // Log the response
            if (content && actionType !== 'thinking') {
              console.log(`\n${colors.green}Response:${colors.reset}`);
              console.log(content.substring(0, 500));
              if (content.length > 500) console.log('...');
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
    log.section('Results');
    log.info(`Duration: ${duration}ms`);
    log.info(`Messages: ${messages.length}`);
    
    const checks = {
      fastPath: fastPathDetected,
      contentPreview: contentPreviewFound,
      noScriptCreation: !scriptCreationDetected
    };
    
    const allPassed = Object.values(checks).every(v => v);
    
    if (allPassed) {
      log.success('✓ ALL CHECKS PASSED');
    } else {
      log.error('✗ SOME CHECKS FAILED:');
      if (!checks.fastPath) log.error('  - Fast-path not detected');
      if (!checks.contentPreview) log.error('  - Content preview not found');
      if (!checks.noScriptCreation) log.error('  - Unnecessary script creation detected');
    }
    
    return { success: allPassed, checks, messages, duration };
    
  } catch (error) {
    log.error(`Failed to ask question: ${error.message}`);
    throw error;
  }
}

async function runTests() {
  log.section('Document Viewing Fix Test');
  
  try {
    // Create test document
    const testFile = await createTestDocument();
    
    // Create conversation
    const conversationId = await createConversation();
    
    // Upload document
    await uploadDocument(conversationId, testFile);
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 1: "tell me what you see"
    log.section('TEST 1: "tell me what you see"');
    const test1 = await askQuestion(conversationId, 'tell me what you see');
    
    // Test 2: "what's in this file"
    log.section('TEST 2: "what\'s in this file"');
    const test2 = await askQuestion(conversationId, "what's in this file");
    
    // Test 3: "show me what you see"
    log.section('TEST 3: "show me what you see"');
    const test3 = await askQuestion(conversationId, 'show me what you see');
    
    // Summary
    log.section('SUMMARY');
    const allTests = [test1, test2, test3];
    const passed = allTests.filter(t => t.success).length;
    const total = allTests.length;
    
    if (passed === total) {
      log.success(`✓ ALL TESTS PASSED (${passed}/${total})`);
    } else {
      log.error(`✗ SOME TESTS FAILED (${passed}/${total} passed)`);
    }
    
    // Cleanup
    fs.unlinkSync(testFile);
    log.info('Cleaned up test file');
    
    process.exit(passed === total ? 0 : 1);
    
  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();
