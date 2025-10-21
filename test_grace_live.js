#!/usr/bin/env node
/**
 * Live Grace API Test Suite
 * Tests real-time API calls and monitors request/response formats
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const GRACE_URL = 'http://localhost:5005';
const TEST_USER_ID = 'test_user_1';

// ANSI colors for better visibility
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
  data: (label, data) => console.log(`${colors.magenta}${label}:${colors.reset}`, JSON.stringify(data, null, 2))
};

// Test cases - organized by mode
const TEST_CASES = {
  chat: [
    {
      name: 'Simple Chat',
      goal: 'Hello, how are you?',
      mode: 'chat',
      expectedActions: ['auto_reply'],
      breakPoints: ['intent_detection', 'llm_call', 'response']
    },
    {
      name: 'Chat with Question',
      goal: 'What is the capital of France?',
      mode: 'chat',
      expectedActions: ['auto_reply'],
      breakPoints: ['intent_detection', 'llm_call', 'response']
    }
  ],
  task: [
    {
      name: 'Word Document Creation',
      goal: 'Create a Word document about love with a title and 2 paragraphs',
      mode: 'task',
      expectedActions: ['plan', 'write_code', 'finish_summery'],
      breakPoints: ['intent_detection', 'specialist_routing', 'planning', 'thinking', 'execution', 'summary', 'file_context_added'],
      verifyExecution: {
        type: 'file',
        pattern: /love.*\.docx$/i,
        location: '/workspace'
      }
    },
    {
      name: 'Code Generation',
      goal: 'Write a Python function to calculate fibonacci',
      mode: 'task',
      expectedActions: ['plan', 'write_code', 'finish_summery'],
      breakPoints: ['intent_detection', 'specialist_routing', 'planning', 'thinking', 'execution', 'summary']
    },
    {
      name: 'Excel Spreadsheet',
      goal: 'Create an Excel file with sales data',
      mode: 'task',
      expectedActions: ['plan', 'write_code', 'finish_summery'],
      breakPoints: ['intent_detection', 'specialist_routing', 'planning', 'thinking', 'execution', 'summary']
    },
    {
      name: 'WW2 Essay Document',
      goal: 'Create a Word document with a detailed essay about World War 2. Include: a title "World War II: A Comprehensive Overview", an introduction paragraph, 3-4 body paragraphs covering major events (Pearl Harbor, D-Day), key figures (Churchill, Roosevelt, Hitler), and the war\'s impact. Add a conclusion with proper formatting.',
      mode: 'task',
      expectedActions: ['plan', 'write_code', 'finish_summery'],
      breakPoints: ['intent_detection', 'specialist_routing', 'planning', 'thinking', 'execution', 'summary'],
      verifyExecution: {
        type: 'file',
        pattern: /world.*war.*\.docx$/i,
        location: '/workspace'
      }
    },
    {
      name: 'Phi-4 Frontend Test',
      goal: 'Create a beautiful HTML landing page with a hero section, navigation bar, and call-to-action button using modern CSS',
      mode: 'task',
      expectedActions: ['plan', 'write_code', 'finish_summery'],
      breakPoints: ['intent_detection', 'specialist_routing', 'planning', 'execution', 'summary']
    },
    {
      name: 'MythoMax Creative Test',
      goal: 'Write a short fantasy story about a dragon who learns to code. Make it creative and engaging with vivid descriptions.',
      mode: 'task',
      expectedActions: ['plan', 'write_code', 'finish_summery'],
      breakPoints: ['intent_detection', 'specialist_routing', 'planning', 'execution', 'summary']
    },
    {
      name: 'GPT-OSS Reasoning Test',
      goal: 'Design an algorithm to find the shortest path in a weighted graph. Explain the logic step by step with pseudocode.',
      mode: 'task',
      expectedActions: ['plan', 'write_code', 'finish_summery'],
      breakPoints: ['intent_detection', 'specialist_routing', 'planning', 'execution', 'summary']
    }
  ],
  auto: [
    {
      name: 'Auto Mode - Simple Question',
      goal: 'What is 2+2?',
      mode: 'auto',
      expectedActions: ['auto_reply'],
      breakPoints: ['intent_detection', 'auto_reply', 'response']
    },
    {
      name: 'Auto Mode - File Request',
      goal: 'Create a text file',
      mode: 'auto',
      expectedActions: ['plan', 'write_code'],
      breakPoints: ['intent_detection', 'mode_switch', 'planning', 'execution']
    }
  ],
  special: [
    {
      name: 'Dev Mode Activation',
      goal: 'force dev mode',
      mode: 'task',
      expectedActions: ['auto_reply'],
      breakPoints: ['mode_command_detection', 'dev_mode_activation', 'response']
    },
    {
      name: 'Dev Mode Status',
      goal: '/dev status',
      mode: 'task',
      expectedActions: ['auto_reply'],
      breakPoints: ['mode_command_detection', 'status_check', 'response']
    }
  ]
};

// Flatten for easy iteration
const ALL_TEST_CASES = Object.values(TEST_CASES).flat();

class GraceTester {
  constructor() {
    this.results = [];
    this.conversationId = null;
  }

  async createConversation(providedId = null) {
    // If conversation ID provided via command line, use it
    if (providedId) {
      this.conversationId = providedId;
      log.info(`Using provided conversation ID: ${this.conversationId}`);
      return this.conversationId;
    }
    
    // Create a new conversation via API
    try {
      const response = await axios.post(`${GRACE_URL}/api/conversation`, {
        content: 'Test conversation',
        mode_type: 'task',
        agent_id: 1
      }, {
        timeout: 5000
      });
      
      if (response.data && response.data.data && response.data.data.conversation_id) {
        this.conversationId = response.data.data.conversation_id;
        log.success(`✅ Created conversation: ${this.conversationId}`);
        return this.conversationId;
      }
    } catch (error) {
      log.error(`Failed to create conversation: ${error.message}`);
    }
    
    // Fallback: generate a UUID (may cause "Conversation not found" errors)
    this.conversationId = uuidv4();
    log.warn(`⚠️  Using fallback UUID: ${this.conversationId} (may not work)`);
    return this.conversationId;
  }

  async runTest(testCase) {
    log.section(`Test: ${testCase.name}`);
    log.info(`Goal: "${testCase.goal}"`);
    log.info(`Mode: ${testCase.mode}`);
    
    const startTime = Date.now();
    const messages = [];
    let lastActivityTime = Date.now();
    let hangDetected = false;
    const backendLogs = [];
    const llmCalls = []; // Track all LLM requests/responses
    const breakPointsReached = new Set(); // Track which break points were hit
    let hasError = false;
    let errorDetails = null;
    let currentLLMCall = null;
    
    // Start monitoring Docker logs for this test
    const { spawn } = require('child_process');
    const dockerMonitor = spawn('docker', ['logs', '-f', '--tail', '0', 'grace-app']);
    
    // Hang detection timer - check every 5 seconds
    const HANG_TIMEOUT = 45000; // 45 seconds without activity = hang
    const ABSOLUTE_TIMEOUT = 120000; // 2 minutes absolute max
    
    const hangCheckInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      const totalTime = Date.now() - startTime;
      
      if (totalTime > ABSOLUTE_TIMEOUT) {
        hangDetected = true;
        log.error(`❌ ABSOLUTE TIMEOUT: Test exceeded ${ABSOLUTE_TIMEOUT/1000}s - Force stopping`);
        clearInterval(hangCheckInterval);
        dockerMonitor.kill();
      } else if (timeSinceActivity > HANG_TIMEOUT) {
        hangDetected = true;
        log.error(`❌ HANG DETECTED: No activity for ${timeSinceActivity/1000}s`);
        log.warn(`Last activity was ${timeSinceActivity/1000}s ago`);
        log.info(`Break points reached: ${Array.from(breakPointsReached).join(', ')}`);
        clearInterval(hangCheckInterval);
        dockerMonitor.kill();
      }
    }, 5000);
    
    dockerMonitor.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          backendLogs.push({ timestamp: Date.now(), line });
          lastActivityTime = Date.now(); // Update activity time on any log
          
          // Track LLM Request
          if (line.includes('🔍 [LLM Request]')) {
            breakPointsReached.add('llm_call');
            try {
              const jsonMatch = line.match(/\{.*\}/);
              if (jsonMatch) {
                const requestData = JSON.parse(jsonMatch[0]);
                currentLLMCall = {
                  model: requestData.model,
                  timestamp: Date.now(),
                  stream: requestData.stream,
                  messageCount: requestData.messageCount,
                  streamChunks: 0,
                  streamBytes: 0
                };
                llmCalls.push(currentLLMCall);
                log.info(`🔍 LLM Request: ${requestData.model} (stream: ${requestData.stream})`);
              }
            } catch (e) {
              log.warn('Failed to parse LLM request');
            }
          }
          
          // Track LLM Stream chunks
          else if (line.includes('[LLM Stream]')) {
            if (currentLLMCall) {
              currentLLMCall.streamChunks++;
              if (line.includes('First chunk')) {
                const preview = line.substring(line.indexOf('First chunk'));
                log.info(`📡 ${preview.substring(0, 100)}`);
              } else if (line.includes('Non-streaming')) {
                breakPointsReached.add('non_streaming_detected');
                log.info(`📡 Non-streaming response detected`);
              }
            }
          }
          
          // Track response format issues
          else if (line.includes('[LLM handleSSE]')) {
            if (line.includes('Non-streaming JSON response')) {
              breakPointsReached.add('non_streaming_json');
              log.info(`📦 Non-streaming JSON response being parsed`);
            } else if (line.includes('Extracted content')) {
              const contentMatch = line.match(/Extracted content: (.+)/);
              if (contentMatch && currentLLMCall) {
                currentLLMCall.contentPreview = contentMatch[1].substring(0, 100);
                log.success(`✅ Content extracted: ${contentMatch[1].substring(0, 80)}...`);
              }
            } else if (line.includes('No content')) {
              breakPointsReached.add('empty_response');
              log.error(`❌ No content in response`);
            }
          }
          
          // Track LLM Response/Error
          else if (line.includes('❌ [LLM Error]')) {
            try {
              const jsonMatch = line.match(/\{.*\}/);
              if (jsonMatch) {
                const errorData = JSON.parse(jsonMatch[0]);
                if (currentLLMCall) {
                  currentLLMCall.error = errorData;
                  currentLLMCall.duration = Date.now() - currentLLMCall.timestamp;
                }
                log.error(`❌ LLM Error: ${errorData.model} - ${errorData.status}`);
                if (errorData.responseData) {
                  log.data('Error Response', errorData.responseData);
                }
              }
            } catch (e) {
              log.error(`Backend Error: ${line}`);
            }
          }
          
          // Track Specialist response content
          else if (line.includes('[Specialist]') && line.includes('returned:')) {
            breakPointsReached.add('specialist_response');
            log.info(`📦 ${line.substring(line.indexOf('[Specialist]'))}`);
          }
          
          // Track AutoReply response content
          else if (line.includes('[AutoReply] Specialist response content:')) {
            log.data('AutoReply Content', line.substring(line.indexOf('content:')));
          }
          
          // Track resolveActions errors
          else if (line.includes('[resolveActions] Invalid input')) {
            breakPointsReached.add('action_parse_error');
            log.error(`🔴 Action parsing failed: ${line}`);
          }
          
          // Track execution failures
          else if (line.includes('execution failure') || line.includes('Failed to execute')) {
            breakPointsReached.add('execution_failure');
            log.error(`🔴 Execution failed: ${line}`);
          }
          
          // Track thinking errors
          else if (line.includes('[thinking]') || line.includes('thinking_local')) {
            breakPointsReached.add('thinking');
            if (line.includes('Error') || line.includes('error')) {
              log.error(`🔴 Thinking error: ${line}`);
            } else {
              log.info(`💭 Thinking: ${line.substring(0, 100)}`);
            }
          }
          
          // Track action resolution
          else if (line.includes('action undefined') || line.includes('content.length')) {
            log.error(`🔴 Action resolution issue: ${line}`);
          }
          
          // Track Coordinator routing
          else if (line.includes('[Coordinator] Using model:')) {
            breakPointsReached.add('specialist_routing');
            const modelMatch = line.match(/Using model: (.+)/);
            if (modelMatch) {
              log.info(`🎯 Coordinator routing to: ${modelMatch[1]}`);
            }
          }
          
          // Track Specialist calls
          else if (line.includes('[Specialist] Calling')) {
            breakPointsReached.add('specialist_routing');
            const modelMatch = line.match(/Calling (.+) for task/);
            if (modelMatch) {
              log.info(`🤖 Specialist calling: ${modelMatch[1]}`);
            }
          }
          
          // Track task type detection
          else if (line.includes('[Coordinator] Detected task type:')) {
            breakPointsReached.add('intent_detection');
            const typeMatch = line.match(/task type: (.+)/);
            if (typeMatch) {
              log.info(`📋 Task type detected: ${typeMatch[1]}`);
            }
          }
          
          // Track thinking/planning
          else if (line.includes('[CodeAct]')) {
            breakPointsReached.add('thinking');
            log.info(`💭 ${line.substring(line.indexOf('['))}`);
          }
          else if (line.includes('[Planning]')) {
            breakPointsReached.add('planning');
            log.info(`💭 ${line.substring(line.indexOf('['))}`);
          }
          
          // Track mode command detection
          else if (line.includes('[ModeCommand]')) {
            breakPointsReached.add('mode_command_detection');
            log.info(`🎮 ${line.substring(line.indexOf('[ModeCommand]'))}`);
          }
          
          // Track dev mode activation
          else if (line.includes('[DevMode]')) {
            breakPointsReached.add('dev_mode_activation');
            log.info(`🔧 ${line.substring(line.indexOf('[DevMode]'))}`);
            
            // Track self-modification attempts
            if (line.includes('Modifying') || line.includes('Creating') || line.includes('Updating')) {
              breakPointsReached.add('self_modification');
              log.warn(`⚠️  Self-modification detected: ${line.substring(line.indexOf('[DevMode]'))}`);
            }
          }
          
          // Track local filesystem access
          else if (line.includes('[LocalFilesystem]') || line.includes('local_filesystem')) {
            breakPointsReached.add('local_filesystem_access');
            log.info(`💾 Local filesystem access: ${line.substring(0, 100)}`);
          }
          
          // Track file operations
          else if (line.includes('File created:') || line.includes('File written:')) {
            const fileMatch = line.match(/File (?:created|written): (.+)/);
            if (fileMatch) {
              log.success(`📝 File operation: ${fileMatch[1]}`);
            }
          }
          
          // Track file context awareness
          else if (line.includes('[Specialist] Adding file context')) {
            breakPointsReached.add('file_context_added');
            const filesMatch = line.match(/(\d+) files? found/);
            if (filesMatch) {
              log.success(`📂 File context added: ${filesMatch[1]} existing file(s)`);
            }
          }
          else if (line.includes('EXISTING FILES IN THIS CONVERSATION')) {
            breakPointsReached.add('existing_files_detected');
            log.info(`📋 Specialist received existing files list`);
          }
          
          // Track conversation memory/context
          else if (line.includes('conversation history') || line.includes('previous messages')) {
            breakPointsReached.add('conversation_history');
            log.info(`💬 Using conversation history`);
          }
          
          // Track specialist response and needsExecution
          else if (line.includes('needsExecution: true')) {
            breakPointsReached.add('needs_execution');
            log.info(`🔄 needsExecution flag set - continuing to planning`);
          }
          else if (line.includes('[AutoReply] Task type') && line.includes('requires tools')) {
            log.info(`🔧 Task requires tools - will continue to execution`);
          }
          else if (line.includes('[AgenticAgent] Specialist provided')) {
            breakPointsReached.add('agentic_agent_received');
            log.success(`🤖 AgenticAgent received specialist code for execution`);
          }
          else if (line.includes('====== start execute ======')) {
            breakPointsReached.add('execution');
            log.success(`▶️  Execution phase started`);
          }
        }
      }
    });
    
    try {
      // Create new conversation for each test
      await this.createConversation();
      
      // Send request and capture streaming response
      const response = await axios.post(
        `${GRACE_URL}/api/agent/run`,
        {
          conversation_id: this.conversationId,
          question: testCase.goal,
          mode: testCase.mode
        },
        {
          responseType: 'stream',
          timeout: 60000 // 60 second timeout
        }
      );

      log.info('Streaming response...');
      
      // Parse SSE stream
      let buffer = '';
      let lastChunkTime = Date.now();
      let chunkCount = 0;
      
      // Monitor stream for hangs
      const streamHangCheck = setInterval(() => {
        const timeSinceChunk = Date.now() - lastChunkTime;
        if (timeSinceChunk > 30000 && chunkCount > 0) {
          log.error(`❌ STREAM HANG: No data received for ${timeSinceChunk/1000}s`);
          log.warn(`Received ${chunkCount} chunks before hang`);
          clearInterval(streamHangCheck);
          response.data.destroy();
        }
      }, 5000);
      
      response.data.on('data', (chunk) => {
        lastChunkTime = Date.now();
        lastActivityTime = Date.now();
        chunkCount++;
        
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              messages.push(data);
              
              // Log message type
              const actionType = data.meta?.action_type || 'unknown';
              const status = data.status || 'unknown';
              
              // Track break points based on action types
              if (actionType === 'plan') {
                breakPointsReached.add('planning');
                log.data('📋 Plan', data.meta?.json);
              }
              if (actionType === 'write_code') {
                breakPointsReached.add('execution');
                log.success(`📝 File created: ${data.meta?.filepath}`);
                if (data.content) {
                  log.info(`   Content preview: ${data.content.substring(0, 100)}...`);
                }
              }
              if (actionType === 'terminal_run') {
                breakPointsReached.add('execution');
                log.info(`⚡ Terminal command: ${data.content}`);
              }
              if (actionType === 'finish_summery') {
                breakPointsReached.add('summary');
                log.success('✅ Task completed!');
                log.data('📦 Summary', data.content);
                if (data.meta?.json) {
                  log.data('📁 Files', data.meta.json);
                }
              }
              if (actionType === 'auto_reply') {
                breakPointsReached.add('auto_reply');
                breakPointsReached.add('response');
                log.info(`💬 Auto reply: ${data.content?.substring(0, 100) || 'empty'}`);
              }
              if (actionType === 'thinking') {
                breakPointsReached.add('thinking');
                log.info(`🤔 Thinking: ${data.content?.substring(0, 100) || 'processing...'}`);
              }
              
              if (actionType === 'error' || status === 'failed') {
                hasError = true;
                errorDetails = data;
                breakPointsReached.add('error');
                log.error(`❌ Error: ${data.content}`);
                if (data.meta?.json?.comments) {
                  log.error(`   Details: ${data.meta.json.comments}`);
                }
              } else {
                log.info(`📨 Message: ${actionType} (${status})`);
              }
            } catch (e) {
              // Ignore parse errors for non-JSON lines
            }
          }
        }
      });

      // Wait for stream to complete
      await new Promise((resolve, reject) => {
        response.data.on('end', () => {
          clearInterval(streamHangCheck);
          log.success(`Received ${messages.length} messages (${chunkCount} chunks)`);
          resolve();
        });
        response.data.on('error', reject);
      });

      const duration = Date.now() - startTime;
      
      // Stop Docker monitor and hang detection
      clearInterval(hangCheckInterval);
      dockerMonitor.kill();
      
      // Analyze results
      const actionTypes = messages.map(m => m.meta?.action_type).filter(Boolean);
      const uniqueActions = [...new Set(actionTypes)];
      
      log.section('Test Results');
      log.info(`Duration: ${duration}ms`);
      log.info(`Messages received: ${messages.length}`);
      log.info(`Action types: ${uniqueActions.join(', ')}`);
      log.info(`LLM calls made: ${llmCalls.length}`);
      
      // Break point analysis
      const expectedBreakPoints = testCase.breakPoints || [];
      const missedBreakPoints = expectedBreakPoints.filter(bp => !breakPointsReached.has(bp));
      const reachedBreakPoints = Array.from(breakPointsReached);
      
      log.info(`Break points reached: ${reachedBreakPoints.join(', ')}`);
      if (missedBreakPoints.length > 0) {
        log.warn(`⚠️  Missed break points: ${missedBreakPoints.join(', ')}`);
        log.warn(`   Flow stopped at: ${reachedBreakPoints[reachedBreakPoints.length - 1] || 'start'}`);
      }
      
      // Show context enhancements
      const contextFeatures = {
        fileContext: breakPointsReached.has('file_context_added'),
        existingFiles: breakPointsReached.has('existing_files_detected'),
        conversationHistory: breakPointsReached.has('conversation_history'),
        specialistRouting: breakPointsReached.has('specialist_routing')
      };
      
      if (Object.values(contextFeatures).some(v => v)) {
        log.section('Context Enhancements');
        if (contextFeatures.fileContext) log.success('✓ File context awareness enabled');
        if (contextFeatures.existingFiles) log.success('✓ Existing files detected and passed to specialist');
        if (contextFeatures.conversationHistory) log.success('✓ Conversation history utilized');
        if (contextFeatures.specialistRouting) log.success('✓ Specialist routing active');
      }
      
      // Show LLM call summary
      if (llmCalls.length > 0) {
        log.section('LLM Call Summary');
        llmCalls.forEach((call, idx) => {
          const status = call.error ? `❌ ${call.error.status}` : '✓ Success';
          log.info(`${idx + 1}. ${call.model} - ${status} (${call.duration || 'pending'}ms)`);
          if (call.error) {
            log.error(`   Error: ${call.error.errorMessage}`);
            if (call.error.responseData) {
              log.data('   Response', call.error.responseData);
            }
          }
        });
      }
      
      // Show error break points
      const errorBreakPoints = Array.from(breakPointsReached).filter(bp => 
        bp.includes('error') || bp.includes('failure')
      );
      if (errorBreakPoints.length > 0) {
        log.section('Errors Detected');
        errorBreakPoints.forEach(bp => {
          log.error(`🔴 ${bp}`);
        });
      }
      
      // Check if expected actions occurred
      const missingActions = testCase.expectedActions.filter(
        expected => !uniqueActions.includes(expected)
      );
      
      if (missingActions.length > 0) {
        log.warn(`Missing expected actions: ${missingActions.join(', ')}`);
      }
      
      // Verify execution if configured
      let executionVerification = null;
      if (testCase.verifyExecution) {
        executionVerification = await this.verifyExecution(testCase);
      }
      
      if (hasError) {
        log.error('Test completed with errors');
        log.data('Error Details', errorDetails);
      } else {
        log.success('Test completed successfully');
      }
      
      return {
        testName: testCase.name,
        success: !hasError && !hangDetected && missingActions.length === 0 && (!executionVerification || executionVerification.verified),
        duration,
        messageCount: messages.length,
        actionTypes: uniqueActions,
        executionVerified: executionVerification,
        missingActions,
        hangDetected,
        error: hasError ? errorDetails : null,
        llmCalls, // Include all LLM request/response data
        messages
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dockerMonitor.kill();
      log.error(`Test failed: ${error.message}`);
      log.error(`Error stack: ${error.stack}`);
      
      if (error.response) {
        log.data('Error Response', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      if (error.code) {
        log.error(`Error code: ${error.code}`);
      }
      
      return {
        testName: testCase.name,
        success: false,
        duration,
        error: error.message,
        messages
      };
    }
  }

  async runAllTests() {
    log.section('Grace Live API Test Suite');
    log.info(`Testing Grace at: ${GRACE_URL}`);
    log.info(`Test cases: ${TEST_CASES.length}`);
    
    const results = [];
    
    for (const testCase of TEST_CASES) {
      const result = await this.runTest(testCase);
      results.push(result);
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Summary
    log.section('Test Summary');
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;
    
    log.info(`Total: ${results.length}`);
    log.success(`Passed: ${passed}`);
    if (failed > 0) {
      log.error(`Failed: ${failed}`);
    }
    
    // Detailed results
    console.log('\n');
    results.forEach(result => {
      const icon = result.success ? '✓' : '✗';
      const color = result.success ? colors.green : colors.red;
      console.log(`${color}${icon}${colors.reset} ${result.testName} (${result.duration}ms)`);
      
      if (!result.success) {
        console.log(`  ${colors.red}Error: ${result.error?.content || result.error}${colors.reset}`);
        if (result.missingActions?.length > 0) {
          console.log(`  ${colors.yellow}Missing: ${result.missingActions.join(', ')}${colors.reset}`);
        }
      }
    });
    
    // Save detailed results
    const fs = require('fs');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test_results_${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    log.info(`\nDetailed results saved to: ${filename}`);
    
    return results;
  }

  async verifyExecution(testCase) {
    if (!testCase.verifyExecution) {
      return { verified: true, message: 'No verification configured' };
    }
    
    const config = testCase.verifyExecution;
    log.section('Execution Verification');
    
    try {
      if (config.type === 'file') {
        // Check if file was created in Docker container
        const findCmd = `find ${config.location} -type f -name "*" -mmin -2 2>/dev/null`;
        const { stdout } = await this.execDockerCommand(findCmd);
        const files = stdout.trim().split('\n').filter(f => f);
        
        log.info(`Found ${files.length} recent files in ${config.location}`);
        
        const matchingFiles = files.filter(f => config.pattern.test(f));
        
        if (matchingFiles.length > 0) {
          log.success(`✅ Execution verified: Found ${matchingFiles.length} matching file(s)`);
          matchingFiles.forEach(f => log.info(`   📄 ${f}`));
          
          // Check if file exists on local system (dev mode)
          const localFiles = await this.checkLocalSystem(matchingFiles);
          if (localFiles.length > 0) {
            log.success(`✅ Dev Mode: Files accessible on local system!`);
            localFiles.forEach(f => log.info(`   💻 ${f}`));
          }
          
          return { verified: true, files: matchingFiles, localFiles };
        } else {
          log.error(`❌ Execution failed: No matching files found`);
          log.info(`   Pattern: ${config.pattern}`);
          log.info(`   Recent files: ${files.join(', ')}`);
          return { verified: false, message: 'No matching files created' };
        }
      }
      
      return { verified: true, message: 'Unknown verification type' };
    } catch (error) {
      log.error(`❌ Verification error: ${error.message}`);
      return { verified: false, error: error.message };
    }
  }
  
  async execDockerCommand(command) {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(`docker exec grace-app ${command}`, (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
  
  async checkLocalSystem(dockerPaths) {
    // Check if Docker files are accessible on local system (dev mode with volume mounts)
    const fs = require('fs');
    const path = require('path');
    const localFiles = [];
    
    for (const dockerPath of dockerPaths) {
      // Try common volume mount locations
      const possiblePaths = [
        dockerPath.replace('/workspace', '/Users/wonkasworld/Downloads/GRACEai/workspace'),
        dockerPath.replace('/workspace', './workspace'),
        dockerPath.replace('/app', '/Users/wonkasworld/Downloads/GRACEai'),
        dockerPath.replace('/app', '.')
      ];
      
      for (const localPath of possiblePaths) {
        try {
          if (fs.existsSync(localPath)) {
            localFiles.push(localPath);
            break;
          }
        } catch (e) {
          // Ignore errors, try next path
        }
      }
    }
    
    return localFiles;
  }
  
  async monitorDockerLogs() {
    log.section('Monitoring Docker Logs');
    log.info('Watching for errors and important events...');
    
    const { spawn } = require('child_process');
    const docker = spawn('docker', ['logs', '-f', '--tail', '50', 'grace-app']);
    
    docker.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.includes('❌') || line.includes('Error') || line.includes('400') || line.includes('404')) {
          log.error(line);
        } else if (line.includes('🔍') || line.includes('[LLM Request]')) {
          log.info(line);
        } else if (line.includes('[Coordinator]') || line.includes('[Specialist]')) {
          log.warn(line);
        }
      }
    });
    
    docker.stderr.on('data', (data) => {
      log.error(data.toString());
    });
    
    return docker;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'test';
  
  // Parse conversation ID from args (--conv-id=xxx)
  const convIdArg = args.find(arg => arg.startsWith('--conv-id='));
  const conversationId = convIdArg ? convIdArg.split('=')[1] : null;
  
  const tester = new GraceTester();
  
  // Set conversation ID if provided
  if (conversationId) {
    await tester.createConversation(conversationId);
  }
  
  if (command === 'monitor') {
    log.info('Starting log monitor (Ctrl+C to stop)...');
    await tester.monitorDockerLogs();
  } else if (command === 'test') {
    const modeOrName = args[1];
    if (modeOrName) {
      // Check if it's a mode (chat, task, auto, special)
      if (TEST_CASES[modeOrName]) {
        log.info(`Running all ${modeOrName} mode tests...`);
        const results = [];
        for (const testCase of TEST_CASES[modeOrName]) {
          const result = await tester.runTest(testCase);
          results.push(result);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        // Show summary for mode
        const passed = results.filter(r => r.success).length;
        log.section(`${modeOrName.toUpperCase()} Mode Summary`);
        log.info(`Passed: ${passed}/${results.length}`);
      } else {
        // Try to find by test name
        const testCase = ALL_TEST_CASES.find(t => t.name.toLowerCase().includes(modeOrName.toLowerCase()));
        if (testCase) {
          await tester.runTest(testCase);
        } else {
          log.error(`Test or mode not found: ${modeOrName}`);
          log.info(`Available modes: ${Object.keys(TEST_CASES).join(', ')}`);
          log.info(`Available tests: ${ALL_TEST_CASES.map(t => t.name).join(', ')}`);
        }
      }
    } else {
      await tester.runAllTests();
    }
  } else {
    console.log(`
Usage:
  node test_grace_live.js test [mode|name]  - Run tests (all, by mode, or specific)
  node test_grace_live.js monitor           - Monitor Docker logs in real-time

Modes: chat, task, auto, special

Examples:
  node test_grace_live.js test              # Run all tests
  node test_grace_live.js test task         # Run all task mode tests
  node test_grace_live.js test chat         # Run all chat mode tests
  node test_grace_live.js test word         # Run Word document test
  node test_grace_live.js monitor           # Watch logs
    `);
  }
}

main().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
