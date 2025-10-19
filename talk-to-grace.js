/**
 * Interactive script to talk to Grace AI
 * Simulates a real conversation with proper authentication
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:3000';
const conversation_id = uuidv4();
const user_id = 1; // Mock user ID

console.log('🤖 Grace AI Conversation Tester');
console.log(`📝 Conversation ID: ${conversation_id}`);
console.log('=' .repeat(80));

async function askGrace(question, mode = 'auto') {
  console.log('\n' + '─'.repeat(80));
  console.log(`👤 YOU: ${question}`);
  console.log('─'.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/agent/run`, {
      question,
      conversation_id,
      mode,
      user_id,
      fileIds: [],
      mcp_server_ids: []
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'stream',
      timeout: 60000
    });

    return new Promise((resolve, reject) => {
      let fullResponse = '';
      let graceResponse = '';
      
      response.data.on('data', (chunk) => {
        const text = chunk.toString();
        fullResponse += text;
        
        // Parse SSE messages
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.action_type === 'auto_reply') {
                graceResponse += data.content;
                process.stdout.write(data.content);
              } else if (data.action_type === 'finish') {
                graceResponse += data.content;
                console.log(`\n🤖 GRACE: ${data.content}`);
              } else if (data.action_type === 'error') {
                console.error(`\n❌ ERROR: ${data.content}`);
              } else if (data.action_type === 'plan') {
                console.log(`\n📋 PLAN:`);
                if (data.json && data.json.phases) {
                  data.json.phases.forEach((phase, i) => {
                    console.log(`   ${i + 1}. ${phase.title}`);
                  });
                }
              } else if (data.action_type === 'thinking') {
                console.log(`\n💭 THINKING: ${data.content}`);
              } else if (data.action_type === 'action') {
                console.log(`\n⚡ ACTION: ${data.content}`);
              }
            } catch (e) {
              // Not JSON, might be streaming text
            }
          }
        }
      });

      response.data.on('end', () => {
        console.log('\n' + '─'.repeat(80));
        resolve({ fullResponse, graceResponse });
      });

      response.data.on('error', (err) => {
        console.error('\n❌ STREAM ERROR:', err.message);
        reject(err);
      });
    });

  } catch (error) {
    console.error('\n❌ REQUEST FAILED:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    throw error;
  }
}

async function runConversation() {
  try {
    console.log('\n🚀 Starting conversation with Grace...\n');
    
    // Test 1: System access question
    console.log('\n📍 TEST 1: System Access Question');
    await askGrace('can you access my local system?', 'auto');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Memory question
    console.log('\n\n📍 TEST 2: Memory Question');
    await askGrace('will you remember that my name is Kenny?', 'auto');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Check if she remembers
    console.log('\n\n📍 TEST 3: Memory Recall');
    await askGrace('what is my name?', 'auto');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Document creation
    console.log('\n\n📍 TEST 4: Document Creation');
    await askGrace('make a random word document for me', 'task');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 5: Dev mode activation
    console.log('\n\n📍 TEST 5: Dev Mode Activation');
    await askGrace('/dev', 'auto');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 6: Self-modification question (if dev mode worked)
    console.log('\n\n📍 TEST 6: Self-Modification Question');
    await askGrace('can you self modify yourself?', 'task');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n\n✅ All tests completed!');
    console.log('=' .repeat(80));
    
  } catch (error) {
    console.error('\n❌ Conversation failed:', error.message);
  } finally {
    // Check Grace logs for errors
    console.log('\n\n📋 Checking Grace logs for errors...');
    const { execSync } = require('child_process');
    try {
      const logs = execSync('tail -50 ~/Grace-Terminal/grace.log | grep -E "(ERROR|Error|Failed|failed)"', { encoding: 'utf-8' });
      if (logs) {
        console.log('\n⚠️  Errors found in logs:');
        console.log(logs);
      } else {
        console.log('✅ No errors in logs');
      }
    } catch (e) {
      console.log('✅ No errors in logs');
    }
    
    process.exit(0);
  }
}

// Run the conversation
runConversation();

