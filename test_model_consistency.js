#!/usr/bin/env node

// Test script to verify post-finish routing loop fix
// This simulates a website generation request and checks if the model stays consistent

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5005';

async function testModelConsistency() {
  console.log('🧪 Testing post-finish routing loop fix...\n');
  
  try {
    // Step 1: Create a new conversation
    console.log('1. Creating new conversation...');
    const convResponse = await axios.post(`${BASE_URL}/api/conversation`, {
      title: 'Model Consistency Test'
    });
    
    const conversationId = convResponse.data.data.conversation_id;
    console.log(`   Created conversation: ${conversationId}\n`);
    
    // Step 2: Set the model to Kimi K2
    console.log('2. Setting model to Kimi K2...');
    await axios.post(`${BASE_URL}/api/conversation/model`, {
      conversation_id: conversationId,
      model_id: 'kimi-k2-turbo-preview'  // This should map to the actual model ID in DB
    });
    console.log('   Model set to Kimi K2\n');
    
    // Step 3: Send a website generation request
    console.log('3. Sending website generation request...');
    const messageResponse = await axios.post(`${BASE_URL}/api/message`, {
      conversation_id: conversationId,
      message: 'Create a simple website with HTML, CSS, and JavaScript for a portfolio site. Include a header, about section, projects, and contact.',
      files: []
    });
    
    console.log('   Message sent, waiting for completion...\n');
    
    // Step 4: Poll for completion and check logs
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const messagesResponse = await axios.get(
        `${BASE_URL}/api/message/list?conversation_id=${conversationId}`
      );
      
      const messages = messagesResponse.data.data || [];
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage && lastMessage.status === 'success') {
        console.log('✅ Task completed successfully!');
        
        // Check if the task was marked as completed
        if (lastMessage.content && lastMessage.content.includes('✅ Created')) {
          console.log('✅ Files created successfully');
        }
        
        break;
      }
      
      if (lastMessage && lastMessage.status === 'failure') {
        console.log('❌ Task failed:', lastMessage.content);
        break;
      }
      
      attempts++;
      console.log(`   Checking... (${attempts}/${maxAttempts})`);
    }
    
    if (attempts >= maxAttempts) {
      console.log('⚠️  Task did not complete within expected time');
    }
    
    console.log('\n🔍 Check the Docker logs for model consistency:');
    console.log('   Look for:');
    console.log('   - [LLM] Model selection: requested_model: kimi-k2-turbo-preview');
    console.log('   - [CodeAct] Preserving original requested model: kimi-k2-turbo-preview');
    console.log('   - [CodeAct] Task marked as completed - preventing further loops');
    console.log('   - No "Ultimate fallback" messages after task completion\n');
    
    console.log('📝 To check logs: docker logs grace-app --tail 100 | grep -E "(Model selection|Preserving|Task completed|Ultimate fallback)"');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testModelConsistency();
