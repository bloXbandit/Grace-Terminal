const axios = require('axios');

async function testFollowUpDoc() {
  console.log('\n━━━ Testing Follow-up Document Modification ━━━\n');
  
  // Create conversation
  console.log('📝 Step 1: Creating initial document...');
  const conv = await axios.post('http://localhost:5005/api/conversation', {
    mode_type: 'task',
    agent_id: 75,
    content: 'Love document'
  });
  const conversation_id = conv.data.data.conversation_id;
  console.log('✓ Conversation:', conversation_id);
  
  // First request: Create initial document
  const response1 = await axios.post('http://localhost:5005/api/agent/run', {
    question: "Create a Word document about love with a title and 2 paragraphs",
    conversation_id,
    mode: 'task'
  }, {
    timeout: 120000,
    responseType: 'stream'
  });
  
  let firstDocCreated = false;
  let firstDocName = '';
  
  await new Promise((resolve) => {
    response1.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.meta?.action_type === 'terminal_run' && data.status === 'running') {
              console.log('  ▶️  Executing initial document creation...');
            }
            if (data.content && data.content.includes('created successfully')) {
              firstDocCreated = true;
              const match = data.content.match(/(\w+\.docx)/);
              if (match) firstDocName = match[1];
              console.log('  ✅', data.content.trim());
            }
            if (data.meta?.action_type === 'finish_summery') {
              console.log('  📦 Summary sent with', data.json?.length || 0, 'files');
              if (data.json) {
                data.json.forEach(f => {
                  if (f.filename.endsWith('.docx')) {
                    console.log('    📄', f.filename, `(${f.filesize} bytes)`);
                  }
                });
              }
            }
          } catch (e) {}
        }
      }
    });
    response1.data.on('end', resolve);
  });
  
  console.log('\n⏳ Waiting 3 seconds before follow-up...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Second request: Expand the document
  console.log('📝 Step 2: Asking to expand/modify the document...');
  const startTime = Date.now();
  
  const response2 = await axios.post('http://localhost:5005/api/agent/run', {
    question: "Make that document more romantic and add 2 more paragraphs about passion and connection",
    conversation_id,
    mode: 'task'
  }, {
    timeout: 120000,
    responseType: 'stream'
  });
  
  let sawSpecialist = false;
  let sawExecution = false;
  let sawSummary = false;
  let secondDocName = '';
  let filesInSummary = 0;
  
  await new Promise((resolve) => {
    response2.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.content && data.content.includes('Specialist')) {
              sawSpecialist = true;
              console.log('  🤖 Specialist routing');
            }
            if (data.content && data.content.includes('Thinking')) {
              console.log('  💭 Planning phase');
            }
            if (data.meta?.action_type === 'terminal_run' && data.status === 'running') {
              sawExecution = true;
              console.log('  ▶️  Executing modification...');
            }
            if (data.content && data.content.includes('created successfully')) {
              const match = data.content.match(/(\w+\.docx)/);
              if (match) secondDocName = match[1];
              console.log('  ✅', data.content.trim());
            }
            if (data.meta?.action_type === 'finish_summery') {
              sawSummary = true;
              filesInSummary = data.json?.length || 0;
              console.log('  📦 Summary sent with', filesInSummary, 'files');
              if (data.json) {
                data.json.forEach(f => {
                  if (f.filename.endsWith('.docx')) {
                    console.log('    📄', f.filename, `(${f.filesize} bytes)`);
                  }
                });
              }
            }
          } catch (e) {}
        }
      }
    });
    response2.data.on('end', resolve);
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n━━━ Results ━━━\n');
  console.log('Initial Document:');
  console.log('  Created:', firstDocCreated ? '✅' : '❌');
  console.log('  Filename:', firstDocName || 'N/A');
  
  console.log('\nFollow-up Document:');
  console.log('  Duration:', duration + 's');
  console.log('  Specialist routing:', sawSpecialist ? '✅' : '❌');
  console.log('  Code execution:', sawExecution ? '✅' : '❌');
  console.log('  Summary delivered:', sawSummary ? '✅' : '❌');
  console.log('  Files in summary:', filesInSummary);
  console.log('  Filename:', secondDocName || 'N/A');
  
  // Check actual files
  const fs = require('fs');
  const path = require('path');
  const convDir = path.join(__dirname, `workspace/user_1/Conversation_${conversation_id.split('-')[0]}`);
  
  if (fs.existsSync(convDir)) {
    const files = fs.readdirSync(convDir).filter(f => f.endsWith('.docx'));
    console.log('\n📁 Actual .docx files in directory:', files.length);
    files.forEach(f => {
      const stats = fs.statSync(path.join(convDir, f));
      console.log(`  - ${f} (${stats.size} bytes)`);
    });
    
    if (files.length > 1) {
      console.log('\n⚠️  WARNING: Multiple .docx files - may cause confusion');
    }
  }
}

testFollowUpDoc().catch(e => console.error('\n❌ Error:', e.message, e.stack));
