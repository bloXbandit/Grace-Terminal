const axios = require('axios');
const chalk = require('chalk');

const log = {
  info: (msg) => console.log(chalk.blue('ℹ'), msg),
  success: (msg) => console.log(chalk.green('✓'), msg),
  error: (msg) => console.log(chalk.red('✗'), msg),
  warn: (msg) => console.log(chalk.yellow('⚠'), msg)
};

async function testWW2Essay() {
  console.log('\n━━━ Testing Complex Word Document: WW2 Essay ━━━\n');
  
  const goal = "Create a Word document with a detailed essay about World War 2. Include: a title, introduction, 3-4 body paragraphs covering major events, key figures, and impact, and a conclusion. Make it professional and well-formatted.";
  
  try {
    // Create conversation
    log.info('Creating conversation...');
    const convResponse = await axios.post('http://localhost:5005/api/agent/run', {
      goal,
      mode: 'task',
      user_id: 1
    }, {
      timeout: 120000,
      responseType: 'stream'
    });
    
    log.success('Request sent, streaming response...');
    
    let messageCount = 0;
    let fileCreated = false;
    
    convResponse.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            messageCount++;
            
            if (data.meta?.action_type === 'terminal_run') {
              log.info('💭 Executing Python code...');
            }
            if (data.content?.includes('.docx')) {
              log.success('📄 Word document mentioned!');
              fileCreated = true;
            }
            if (data.meta?.action_type === 'finish') {
              log.success('✅ Task completed!');
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });
    
    await new Promise((resolve, reject) => {
      convResponse.data.on('end', resolve);
      convResponse.data.on('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 120000);
    });
    
    log.success(`Received ${messageCount} messages`);
    
    // Check for files
    const fs = require('fs');
    const path = require('path');
    const workspaceDir = path.join(__dirname, 'workspace/user_1');
    
    if (fs.existsSync(workspaceDir)) {
      const conversations = fs.readdirSync(workspaceDir).filter(d => d.startsWith('Conversation_'));
      const latestConv = conversations.sort().pop();
      
      if (latestConv) {
        const convPath = path.join(workspaceDir, latestConv);
        const files = fs.readdirSync(convPath);
        
        console.log('\n📁 Files created:');
        files.forEach(file => {
          const filePath = path.join(convPath, file);
          const stats = fs.statSync(filePath);
          console.log(`  - ${file} (${stats.size} bytes)`);
          
          if (file.endsWith('.docx')) {
            log.success(`✅ Found Word document: ${file}`);
          }
        });
      }
    }
    
  } catch (error) {
    log.error(`Error: ${error.message}`);
  }
}

testWW2Essay();
