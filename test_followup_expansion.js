const axios = require('axios');

const conversation_id = 'c06c9d40-cb65-4ec5-8ea9-3b221ea8c023';

console.log('\n━━━ FOLLOW-UP REQUEST: Expand Love Document ━━━\n');
console.log('Conversation ID:', conversation_id);
console.log('Waiting 3 seconds before sending follow-up...\n');

setTimeout(async () => {
  console.log('📝 Sending follow-up: "Make that love document more romantic and passionate. Add 2 more paragraphs about deep connection and eternal devotion."\n');
  
  const startTime = Date.now();
  let sawSpecialist = false;
  let sawPlanning = false;
  let sawExecution = false;
  let sawFinish = false;
  let filesDelivered = 0;
  let docxFiles = [];
  
  try {
    const response = await axios.post('http://localhost:5005/api/agent/run', {
      question: "Make that love document more romantic and passionate. Add 2 more paragraphs about deep connection and eternal devotion. Make it really beautiful.",
      conversation_id,
      mode: 'task'
    }, {
      timeout: 120000,
      responseType: 'stream'
    });
    
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.content) {
              if (data.content.includes('Specialist') || data.content.includes('routing')) {
                if (!sawSpecialist) {
                  sawSpecialist = true;
                  console.log('🤖 Specialist routing detected');
                }
              }
              if (data.content.includes('Thinking')) {
                if (!sawPlanning) {
                  sawPlanning = true;
                  console.log('💭 Planning phase');
                }
              }
              if (data.content.includes('created successfully') || data.content.includes('Created:')) {
                console.log('✅', data.content.trim());
              }
            }
            
            if (data.meta?.action_type === 'terminal_run' && data.status === 'running') {
              if (!sawExecution) {
                sawExecution = true;
                console.log('▶️  Executing code...');
              }
            }
            
            if (data.meta?.action_type === 'finish_summery') {
              sawFinish = true;
              filesDelivered = data.json?.length || 0;
              console.log('\n�� Summary delivered with', filesDelivered, 'files:');
              if (data.json) {
                data.json.forEach(f => {
                  console.log('  -', f.filename, `(${f.filesize} bytes)`);
                  if (f.filename.endsWith('.docx')) {
                    docxFiles.push(f);
                  }
                });
              }
            }
          } catch (e) {}
        }
      }
    });
    
    response.data.on('end', () => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('\n━━━ RESULTS ━━━');
      console.log('Duration:', duration + 's');
      console.log('Specialist routing:', sawSpecialist ? '✅' : '❌');
      console.log('Planning:', sawPlanning ? '✅' : '❌');
      console.log('Execution:', sawExecution ? '✅' : '❌');
      console.log('Summary delivered:', sawFinish ? '✅' : '❌');
      console.log('Files in summary:', filesDelivered);
      console.log('.docx files:', docxFiles.length);
      
      // Check actual files
      const fs = require('fs');
      const path = require('path');
      const convDir = path.join(__dirname, `workspace/user_1/Conversation_${conversation_id.split('-')[0]}`);
      
      if (fs.existsSync(convDir)) {
        const files = fs.readdirSync(convDir).filter(f => f.endsWith('.docx'));
        console.log('\n📁 Actual .docx files in directory:', files.length);
        files.forEach(f => {
          const stats = fs.statSync(path.join(convDir, f));
          const mtime = new Date(stats.mtime).toLocaleTimeString();
          console.log(`  - ${f}`);
          console.log(`    Size: ${stats.size} bytes`);
          console.log(`    Modified: ${mtime}`);
        });
        
        if (files.length > 1) {
          console.log('\n⚠️  WARNING: Multiple .docx files detected!');
          console.log('   This may cause confusion about which file to display.');
        }
      }
    });
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}, 3000);
