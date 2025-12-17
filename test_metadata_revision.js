#!/usr/bin/env node
/**
 * Test script for metadata revision workflow
 * Creates a document first, then tests metadata revision on same conversation
 */

const axios = require('axios').default;
const GRACE_URL = 'http://localhost:5005';

async function makeRequest(conversationId, question) {
  console.log(`\n🔄 Request: ${question}`);
  console.log(`📝 Conversation: ${conversationId}`);
  
  const response = await axios.post(`${GRACE_URL}/api/agent/run`, {
    conversation_id: conversationId,
    question: question,
    mode: 'task'
  }, {
    responseType: 'stream'
  });

  let fullContent = '';
  let messages = [];
  
  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      const lines = chunkStr.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const base64Data = line.slice(6).trim();
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf8');
            
            if (decodedData.trim().startsWith('{') || decodedData.trim().startsWith('[')) {
              const data = JSON.parse(decodedData);
              messages.push(data);
              
              if (data.content && !data.content.includes('data_generation')) {
                console.log(`💬 Response: ${data.content.substring(0, 100)}...`);
                fullContent += data.content + ' ';
              }
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    });
    
    response.data.on('end', () => {
      resolve({ messages, content: fullContent });
    });
    
    response.data.on('error', reject);
  });
}

async function checkForUpdatedDocuments(conversationId) {
  console.log(`\n🔍 Checking for updated documents in conversation ${conversationId}...`);
  
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec(`docker exec grace-app find /app/workspace -name "*${conversationId.substring(0, 6)}*" -name "*updated*.docx" -type f`, (error, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        const files = stdout.trim().split('\n').filter(f => f);
        console.log(`✅ Found updated documents: ${files.length}`);
        files.forEach(f => console.log(`   📄 ${f}`));
        resolve(files);
      } else {
        console.log(`❌ No updated documents found`);
        resolve([]);
      }
    });
  });
}

async function main() {
  console.log('🧪 Testing Metadata Revision Workflow');
  console.log('=====================================');
  
  const conversationId = 'test_rev_' + Date.now();
  console.log(`🆔 Using conversation ID: ${conversationId}`);
  
  try {
    // Step 1: Create a document
    console.log('\n📋 Step 1: Creating initial document...');
    await makeRequest(conversationId, 'create a word document about space exploration');
    
    // Wait for document creation
    console.log('⏳ Waiting 5 seconds for document creation...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 2: Ensure profile name is set so "my name" can resolve deterministically
    console.log('\n📋 Step 2: Setting profile name...');
    await makeRequest(conversationId, 'my name is Kenny Grey');
    console.log('⏳ Waiting 2 seconds for profile extraction...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Test metadata revision
    console.log('\n📋 Step 3: Testing metadata revision...');
    const revisionResult = await makeRequest(conversationId, 'add my name as the author on the doc');
    
    // Wait for revision
    console.log('⏳ Waiting 5 seconds for revision...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 4: Check results
    console.log('\n📋 Step 4: Checking results...');
    const updatedDocs = await checkForUpdatedDocuments(conversationId);
    
    if (updatedDocs.length > 0) {
      console.log('\n✅ SUCCESS: Metadata revision workflow is working!');
      console.log('📊 Summary:');
      console.log(`   - Created conversation: ${conversationId}`);
      console.log(`   - Generated updated documents: ${updatedDocs.length}`);
      console.log('   - Metadata fast-path executed Python script successfully');
    } else {
      console.log('\n❌ FAILURE: No updated documents found');
      console.log('🔍 Possible issues:');
      console.log('   - Python script failed to execute');
      console.log('   - No existing document found to modify');
      console.log('   - Workspace scanning issue');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

main().catch(console.error);
