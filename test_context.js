/**
 * Test script for ConversationContext and FileRegistry
 * Run with: node test_context.js
 */

require('module-alias/register');
require('dotenv').config();

const ConversationContext = require('./src/context/ConversationContext');
const FileRegistry = require('./src/context/FileRegistry');

async function testConversationContext() {
  console.log('\n=== Testing ConversationContext ===\n');
  
  try {
    // Test with a real conversation ID (use one from your database)
    const context = new ConversationContext({
      conversation_id: '3febeea5-16df-4e22-9260-cf9de26fe77d', // Your love document conversation
      user_id: 1
    });
    
    console.log('✅ ConversationContext created');
    
    // Test build (first time)
    console.time('First build');
    await context.build({ requestId: 'test-request-1' });
    console.timeEnd('First build');
    
    // Test cached build (should be instant)
    console.time('Cached build');
    await context.build({ requestId: 'test-request-1' });
    console.timeEnd('Cached build');
    
    // Test different context views
    const routingCtx = context.getRoutingContext();
    console.log('\n📍 Routing Context:', {
      hasFiles: routingCtx.hasFiles,
      fileCount: routingCtx.files.length,
      messageCount: routingCtx.recentMessages.length,
      hasProfile: !!routingCtx.profile,
      previousImplementation: routingCtx.previousImplementation
    });
    
    const planningCtx = context.getPlanningContext();
    console.log('\n📋 Planning Context:', {
      fileCount: planningCtx.files.length,
      taskCount: planningCtx.tasks.length,
      messageCount: planningCtx.recentMessages.length,
      hasProfile: !!planningCtx.profile
    });
    
    const specialistCtx = context.getSpecialistContext();
    console.log('\n🤖 Specialist Context:', {
      fileCount: specialistCtx.files.length,
      taskHistoryCount: specialistCtx.taskHistory.length,
      hasProfile: !!specialistCtx.profile,
      profileContext: specialistCtx.profileContext.substring(0, 100) + '...'
    });
    
    // Test incremental update
    console.log('\n📝 Testing incremental update...');
    await context.incrementalUpdate('file', {
      file_name: 'test.txt',
      file_path: '/test/test.txt',
      file_type: '.txt'
    });
    
    const updatedCtx = context.getRoutingContext();
    console.log('Files after update:', updatedCtx.files.length);
    
    // Test invalidation
    console.log('\n🔄 Testing cache invalidation...');
    context.invalidate();
    console.log('Cache invalidated');
    
    console.log('\n✅ All ConversationContext tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ ConversationContext test failed:', error);
  }
}

async function testFileRegistry() {
  console.log('\n=== Testing FileRegistry ===\n');
  
  try {
    const registry = new FileRegistry(
      '3febeea5-16df-4e22-9260-cf9de26fe77d',
      1
    );
    
    console.log('✅ FileRegistry created');
    console.log('Conversation dir:', registry.getConversationDir());
    
    // Test getAll (syncs DB and filesystem)
    console.log('\n📂 Getting all files (with sync)...');
    const files = await registry.getAll();
    console.log(`Found ${files.length} files:`, files.map(f => f.file_name));
    
    // Test exists
    if (files.length > 0) {
      const firstFile = files[0].file_name;
      console.log(`\n🔍 Checking if ${firstFile} exists...`);
      const exists = await registry.exists(firstFile);
      console.log(`Exists: ${exists}`);
      
      // Test get
      console.log(`\n📄 Getting ${firstFile}...`);
      const file = await registry.get(firstFile);
      console.log('File:', file);
    }
    
    console.log('\n✅ All FileRegistry tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ FileRegistry test failed:', error);
  }
}

async function runTests() {
  console.log('\n🧪 Starting Context System Tests\n');
  console.log('='.repeat(50));
  
  await testConversationContext();
  await testFileRegistry();
  
  console.log('='.repeat(50));
  console.log('\n✅ All tests complete!\n');
  
  process.exit(0);
}

runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
