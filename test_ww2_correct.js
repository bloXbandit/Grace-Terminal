const axios = require('axios');

async function test() {
  console.log('🚀 Creating conversation...');
  const conv = await axios.post('http://localhost:5005/api/conversation', {
    mode_type: 'task',
    agent_id: 75,
    content: 'WW2 Essay'
  });
  const conversation_id = conv.data.data.conversation_id;
  console.log('✓ Conversation:', conversation_id);
  
  console.log('\n📝 Requesting WW2 essay document...');
  const question = "Create a Word document with a detailed essay about World War 2. Include: a title 'World War II: A Comprehensive Overview', an introduction paragraph, 3-4 body paragraphs covering major events (Pearl Harbor, D-Day, etc.), key figures (Churchill, Roosevelt, Hitler), and the war's impact on the world. Add a conclusion. Make it professional with proper formatting.";
  
  const response = await axios.post('http://localhost:5005/api/agent/run', {
    question,
    conversation_id,
    mode: 'task'
  }, {
    timeout: 120000,
    responseType: 'stream'
  });
  
  console.log('✓ Streaming response...\n');
  
  let actionCount = 0;
  response.data.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.meta?.action_type) {
            actionCount++;
            console.log(`  [${data.meta.action_type}] ${data.status}`);
          }
          if (data.content && (data.content.includes('.docx') || data.content.includes('Created:'))) {
            console.log(`  📄 ${data.content.substring(0, 150)}`);
          }
        } catch (e) {}
      }
    }
  });
  
  await new Promise((resolve) => {
    response.data.on('end', () => {
      console.log(`\n✅ Complete! (${actionCount} actions)`);
      resolve();
    });
  });
  
  // Check files
  const fs = require('fs');
  const path = require('path');
  const convDir = path.join(__dirname, `workspace/user_1/Conversation_${conversation_id.split('-')[0]}`);
  
  if (fs.existsSync(convDir)) {
    const files = fs.readdirSync(convDir);
    console.log('\n📁 Files in conversation directory:');
    files.forEach(f => {
      const stats = fs.statSync(path.join(convDir, f));
      console.log(`  - ${f} (${stats.size} bytes)`);
      if (f.endsWith('.docx')) {
        console.log(`    ✅ Word document found!`);
      }
    });
  } else {
    console.log(`\n⚠️  Directory not found: ${convDir}`);
  }
}

test().catch(e => console.error('\n❌ Error:', e.message));
