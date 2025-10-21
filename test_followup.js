const axios = require('axios');
const chalk = require('chalk');

const conversation_id = 'dcac643f-fc16-485f-9479-852e872c27ae';

console.log('\n━━━ Follow-up Request: Expand Love Document ━━━\n');
console.log('Conversation ID:', conversation_id);
console.log('Request: Make the love document more romantic with 2 additional paragraphs\n');

const startTime = Date.now();

axios.post('http://localhost:5005/api/agent/run', {
  question: "Make that love document more romantic and passionate. Add 2 more paragraphs about deep connection and eternal devotion. Make it really beautiful.",
  conversation_id,
  mode: 'task'
}, {
  timeout: 120000,
  responseType: 'stream'
}).then(response => {
  
  let sawSpecialist = false;
  let sawPlanning = false;
  let sawExecution = false;
  let sawFinish = false;
  let filesDelivered = 0;
  let docName = '';
  
  response.data.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          
          if (data.content) {
            if (data.content.includes('Specialist') || data.content.includes('routing')) {
              sawSpecialist = true;
              console.log('🤖 Specialist routing detected');
            }
            if (data.content.includes('Thinking')) {
              sawPlanning = true;
              console.log('💭 Planning phase');
            }
            if (data.content.includes('created successfully')) {
              const match = data.content.match(/(\w+\.docx)/);
              if (match) docName = match[1];
              console.log('✅', data.content.trim());
            }
          }
          
          if (data.meta?.action_type === 'terminal_run') {
            sawExecution = true;
            console.log('▶️  Executing code...');
          }
          
          if (data.meta?.action_type === 'finish_summery') {
            sawFinish = true;
            filesDelivered = data.json?.length || 0;
            console.log('📦 Summary delivered with', filesDelivered, 'files:');
            if (data.json) {
              data.json.forEach(f => {
                console.log('  -', f.filename, `(${f.filesize} bytes)`);
              });
            }
          }
        } catch (e) {}
      }
    }
  });
  
  response.data.on('end', () => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n━━━ Results ━━━');
    console.log('Duration:', duration + 's');
    console.log('Specialist routing:', sawSpecialist ? '✅' : '❌');
    console.log('Planning:', sawPlanning ? '✅' : '❌');
    console.log('Execution:', sawExecution ? '✅' : '❌');
    console.log('Summary delivered:', sawFinish ? '✅' : '❌');
    console.log('Files in summary:', filesDelivered);
    console.log('Document name:', docName || 'N/A');
    
    // Check files
    const fs = require('fs');
    const path = require('path');
    const convDir = path.join(__dirname, `workspace/user_1/Conversation_${conversation_id.split('-')[0]}`);
    
    if (fs.existsSync(convDir)) {
      const files = fs.readdirSync(convDir).filter(f => f.endsWith('.docx'));
      console.log('\n📁 .docx files in directory:', files.length);
      files.forEach(f => {
        const stats = fs.statSync(path.join(convDir, f));
        const mtime = stats.mtime.toLocaleTimeString();
        console.log(`  - ${f} (${stats.size} bytes) - Modified: ${mtime}`);
      });
    }
  });
  
}).catch(e => console.error('❌ Error:', e.message));
