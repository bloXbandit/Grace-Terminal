const axios = require('axios');

async function testAutoMode() {
  console.log('\n━━━ Testing Auto Mode File Creation ━━━\n');
  
  // Create conversation in auto mode
  console.log('Creating conversation in AUTO mode...');
  const conv = await axios.post('http://localhost:5005/api/conversation', {
    mode_type: 'auto',
    content: 'Create document'
  });
  const conversation_id = conv.data.data.conversation_id;
  console.log('✓ Conversation:', conversation_id);
  
  console.log('\n📝 Requesting document creation in AUTO mode...');
  const question = "Create a Word document about cats with a title and 2 paragraphs";
  
  const response = await axios.post('http://localhost:5005/api/agent/run', {
    question,
    conversation_id,
    mode: 'auto'
  }, {
    timeout: 120000,
    responseType: 'stream'
  });
  
  console.log('✓ Streaming response...\n');
  
  let sawSpecialist = false;
  let sawExecution = false;
  let sawFinish = false;
  
  response.data.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          
          if (data.content && data.content.includes('Specialist')) {
            sawSpecialist = true;
            console.log('  🤖 Specialist routing detected');
          }
          if (data.meta?.action_type === 'terminal_run') {
            sawExecution = true;
            console.log('  ▶️  Executing code...');
          }
          if (data.meta?.action_type === 'finish_summery') {
            sawFinish = true;
            console.log('  📦 Summary with files:', data.json?.length || 0, 'files');
          }
          if (data.content && data.content.includes('.docx')) {
            console.log('  📄', data.content.substring(0, 100));
          }
        } catch (e) {}
      }
    }
  });
  
  await new Promise((resolve) => {
    response.data.on('end', () => {
      console.log('\n✅ Complete!\n');
      console.log('Results:');
      console.log('  Specialist routing:', sawSpecialist ? '✅' : '❌');
      console.log('  Code execution:', sawExecution ? '✅' : '❌');
      console.log('  File delivery:', sawFinish ? '✅' : '❌');
      resolve();
    });
  });
  
  // Check files
  const fs = require('fs');
  const path = require('path');
  const convDir = path.join(__dirname, `workspace/user_1/Conversation_${conversation_id.split('-')[0]}`);
  
  if (fs.existsSync(convDir)) {
    const files = fs.readdirSync(convDir);
    console.log('\n📁 Files created:');
    files.forEach(f => {
      const stats = fs.statSync(path.join(convDir, f));
      console.log(`  - ${f} (${stats.size} bytes)`);
    });
  }
}

testAutoMode().catch(e => console.error('\n❌ Error:', e.message));
