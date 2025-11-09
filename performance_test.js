const axios = require('axios');
const { performance } = require('perf_hooks');

// Configuration
const API_URL = 'http://localhost:5005/api/agent/run';
const TEST_MESSAGES = [
  "Hello, how are you?",
  "What can you do?",
  "Tell me about yourself"
];

// Test function
async function testPerformance() {
  console.log('🚀 Starting performance tests...\n');
  
  for (const message of TEST_MESSAGES) {
    const start = performance.now();
    
    try {
      const response = await axios.post(API_URL, {
        question: message,
        responseType: 'sse',
        mode: 'auto'
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000 // 30 second timeout
      });
      
      const end = performance.now();
      const responseTime = (end - start).toFixed(2);
      
      console.log(`📝 Message: "${message}"`);
      console.log(`⏱️  Response time: ${responseTime}ms`);
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      
      if (response.data) {
        console.log(`📦 Response length: ${JSON.stringify(response.data).length} bytes`);
      }
      
    } catch (error) {
      const end = performance.now();
      console.error(`❌ Error with message "${message}":`);
      console.error(`⏱️  Failed after: ${((end - start)/1000).toFixed(2)}s`);
      console.error(`📛 ${error.message}`);
      
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Response:', error.response.data);
      }
    }
    
    console.log('\n' + '-'.repeat(50) + '\n');
  }
  
  console.log('✅ Performance tests completed');
}

// Run the test
testPerformance().catch(console.error);
