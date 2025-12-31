#!/usr/bin/env node

/**
 * Test script to measure voice latency improvements
 * Tests micro-chunk dispatch and TTS timing logs
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

const CONVERSATION_ID = 'latency-test-' + Date.now();
const WS_URL = 'ws://localhost:5005';
const API_URL = 'http://localhost:5005';

async function testVoiceLatency() {
  console.log('\n=== Voice Latency Test ===');
  console.log('Testing micro-chunk dispatch and TTS timing...\n');

  // Test 1: Simple question to trigger voice response
  const testQueries = [
    "What time is it?",
    "Tell me a brief fun fact",
    "How's the weather today?"
  ];

  for (let i = 0; i < testQueries.length; i++) {
    const query = testQueries[i];
    console.log(`\n--- Test ${i + 1}: "${query}" ---`);
    
    const startTime = Date.now();
    
    try {
      // Send voice task request
      const response = await fetch(`${API_URL}/api/agent/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Conversation-Id': CONVERSATION_ID,
          'X-Voice-Task': 'true'
        },
        body: JSON.stringify({
          question: query,
          conversation_id: CONVERSATION_ID,
          mode: 'auto',
          responseType: 'sse'
        })
      });

      if (!response.ok) {
        console.error('Request failed:', response.status);
        continue;
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstTokenTime = null;
      let tokens = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (!firstTokenTime) firstTokenTime = Date.now();
              
              if (parsed.choices?.[0]?.delta?.content) {
                tokens.push(parsed.choices[0].delta.content);
              }
            } catch (e) {
              // Skip parse errors
            }
          }
        }
      }

      const endTime = Date.now();
      console.log(`First token: ${firstTokenTime - startTime}ms`);
      console.log(`Total time: ${endTime - startTime}ms`);
      console.log(`Tokens received: ${tokens.length}`);
      
    } catch (error) {
      console.error('Test failed:', error.message);
    }

    // Wait between tests
    if (i < testQueries.length - 1) {
      console.log('Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n=== Test Complete ===');
  console.log('Check Docker logs for detailed TTS timing:');
  console.log('docker logs grace-app --tail 100 | grep -E "(TTS|Micro-chunk|first audio)"');
}

// Run the test
testVoiceLatency().catch(console.error);
