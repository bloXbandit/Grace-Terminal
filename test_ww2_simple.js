const axios = require('axios');

async function test() {
  console.log('Creating conversation...');
  const conv = await axios.get('http://localhost:5005/api/conversation/create?mode_type=task&agent_id=75');
  const conversation_id = conv.data.data.id;
  console.log('✓ Conversation:', conversation_id);
  
  console.log('\nSending request for WW2 essay...');
  const goal = "Create a Word document with an essay about World War 2. Include title, introduction, 3 body paragraphs, and conclusion.";
  
  const response = await axios.post('http://localhost:5005/api/agent/run', {
    goal,
    conversation_id,
    mode: 'task'
  }, {
    timeout: 120000,
    responseType: 'stream'
  });
  
  console.log('✓ Streaming response...\n');
  
  response.data.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.meta?.action_type) {
            console.log(`  [${data.meta.action_type}] ${data.status}`);
          }
          if (data.content?.includes('docx') || data.content?.includes('Created:')) {
            console.log(`  📄 ${data.content.substring(0, 100)}`);
          }
        } catch (e) {}
      }
    }
  });
  
  await new Promise((resolve) => {
    response.data.on('end', () => {
      console.log('\n✅ Complete!');
      resolve();
    });
  });
  
  // Check files
  const fs = require('fs');
  const convDir = `./workspace/user_1/Conversation_${conversation_id.split('-')[0]}`;
  if (fs.existsSync(convDir)) {
    const files = fs.readdirSync(convDir);
    console.log('\n📁 Files created:');
    files.forEach(f => console.log(`  - ${f}`));
  }
}

test().catch(e => console.error('Error:', e.message));
