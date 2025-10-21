const axios = require('axios');

async function testComplexDoc() {
  console.log('\n━━━ Testing Complex Word Document ━━━\n');
  
  const goal = "Create a professional Word document about Artificial Intelligence with a title, introduction paragraph, 3 main sections with bullet points, and a conclusion. Make it look professional.";
  
  try {
    const response = await axios.post('http://localhost:5005/api/conversation', {
      mode_type: 'task',
      agent_id: 75
    });
    
    const conversation_id = response.data.data.id;
    console.log(`✓ Created conversation: ${conversation_id}`);
    
    const runResponse = await axios.post('http://localhost:5005/api/agent/run', {
      goal,
      conversation_id,
      mode: 'task'
    }, {
      timeout: 60000
    });
    
    console.log('✓ Request completed');
    
    // Wait a bit for file to be created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for generated files
    const fs = require('fs');
    const path = require('path');
    const conversationDir = path.join(__dirname, 'workspace/user_1/Conversation_' + conversation_id.split('-')[0]);
    
    if (fs.existsSync(conversationDir)) {
      const files = fs.readdirSync(conversationDir);
      console.log('\n📁 Files in conversation directory:');
      files.forEach(file => {
        const filePath = path.join(conversationDir, file);
        const stats = fs.statSync(filePath);
        console.log(`  - ${file} (${stats.size} bytes)`);
      });
      
      const docxFiles = files.filter(f => f.endsWith('.docx'));
      if (docxFiles.length > 0) {
        console.log(`\n✅ SUCCESS! Found ${docxFiles.length} Word document(s)`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testComplexDoc();
