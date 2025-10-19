/**
 * Test script to interact with Grace AI
 * Reproduces the scenarios from user screenshots
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:3000';
const conversation_id = uuidv4();

// Mock user authentication (you'll need to adjust this based on actual auth)
const headers = {
  'Content-Type': 'application/json',
  // Add auth headers if needed
};

async function askGrace(question, mode = 'auto') {
  console.log('\n' + '='.repeat(80));
  console.log(`🗣️  USER: ${question}`);
  console.log('='.repeat(80));
  
  try {
    const response = await axios.post(`${BASE_URL}/api/agent/run`, {
      question,
      conversation_id,
      mode,
      fileIds: [],
      mcp_server_ids: []
    }, {
      headers,
      responseType: 'stream'
    });

    let fullResponse = '';
    
    response.data.on('data', (chunk) => {
      const text = chunk.toString();
      fullResponse += text;
      
      // Parse SSE messages
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.action_type === 'auto_reply' || data.action_type === 'finish') {
              console.log(`\n🤖 GRACE: ${data.content}`);
            } else if (data.action_type === 'error') {
              console.error(`\n❌ ERROR: ${data.content}`);
            } else if (data.action_type === 'plan') {
              console.log(`\n📋 PLAN: ${JSON.stringify(data.json, null, 2)}`);
            }
          } catch (e) {
            // Not JSON, might be streaming text
            if (!line.includes('__lemon_mode__')) {
              process.stdout.write(line.substring(6));
            }
          }
        }
      }
    });

    return new Promise((resolve, reject) => {
      response.data.on('end', () => {
        console.log('\n' + '-'.repeat(80));
        resolve(fullResponse);
      });
      response.data.on('error', reject);
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

async function runTests() {
  console.log('🚀 Starting Grace AI Tests');
  console.log(`📝 Conversation ID: ${conversation_id}`);
  
  try {
    // Test 1: System access question
    await askGrace('can you access my local system?', 'auto');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Memory question
    await askGrace('will you remember that my name is Kenny?', 'auto');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Document creation
    await askGrace('make a random word document and place on my desktop', 'task');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 4: Self-modification question
    await askGrace('can you self modify yourself?', 'task');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
  } finally {
    process.exit(0);
  }
}

// Run tests
runTests();

