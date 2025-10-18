/**
 * Grace AI Conversation Test Script
 * Tests routing, multi-agent collaboration, and conversation flow
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5005';
const API_KEY = process.env.GRACE_API_KEY || 'your-api-key-here';

// Test conversation flow
const conversationFlow = [
  {
    step: 1,
    message: "Hey Grace! What can you help me with?",
    expectedRouting: "general_chat",
    description: "Initial greeting - should use GPT-4o"
  },
  {
    step: 2,
    message: "I need to build a user dashboard for a SaaS application. Can you help?",
    expectedRouting: "complex_task_detection",
    description: "Complex task - should trigger multi-agent collaboration"
  },
  {
    step: 3,
    message: "What are the latest trends in dashboard UI design for 2025?",
    expectedRouting: "web_research",
    description: "Research task - should use GLM-4 Plus"
  },
  {
    step: 4,
    message: "Can you create a quick prototype of a dashboard layout with sidebar and cards?",
    expectedRouting: "ui_design",
    description: "UI design - should use Microsoft Phi-4"
  },
  {
    step: 5,
    message: "Review the code you just generated for any issues",
    expectedRouting: "code_review",
    description: "Code review - should use DeepSeek Coder"
  }
];

class GraceConversationTester {
  constructor() {
    this.conversationId = null;
    this.results = [];
    this.startTime = Date.now();
  }

  async createConversation() {
    console.log('\n🚀 Creating new conversation...\n');
    try {
      const response = await axios.post(`${BASE_URL}/api/conversation/create`, {
        title: 'Test Conversation - Routing & Multi-Agent',
        mode: 'auto' // Use auto mode to enable specialist routing
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      this.conversationId = response.data.conversation_id;
      console.log(`✅ Conversation created: ${this.conversationId}\n`);
      return this.conversationId;
    } catch (error) {
      console.error('❌ Failed to create conversation:', error.message);
      throw error;
    }
  }

  async sendMessage(step, message, expectedRouting, description) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 Step ${step}: ${description}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`\n👤 User: ${message}\n`);

    const messageStartTime = Date.now();

    try {
      const response = await axios.post(`${BASE_URL}/api/agent/run`, {
        conversation_id: this.conversationId,
        question: message,
        mode: 'auto'
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout
      });

      const messageEndTime = Date.now();
      const duration = ((messageEndTime - messageStartTime) / 1000).toFixed(2);

      console.log(`\n🤖 Grace: ${response.data.content?.substring(0, 200)}${response.data.content?.length > 200 ? '...' : ''}\n`);
      console.log(`⏱️  Response time: ${duration}s`);
      console.log(`🎯 Expected routing: ${expectedRouting}`);
      
      if (response.data.meta?.specialist) {
        console.log(`✅ Specialist used: ${response.data.meta.specialist}`);
      }
      
      if (response.data.meta?.mode === 'multi-agent') {
        console.log(`🤝 Multi-agent collaboration activated!`);
        console.log(`   Subtasks: ${response.data.meta.subtasks?.length || 0}`);
      }

      this.results.push({
        step,
        message,
        expectedRouting,
        duration: parseFloat(duration),
        success: true,
        specialist: response.data.meta?.specialist,
        multiAgent: response.data.meta?.mode === 'multi-agent',
        responseLength: response.data.content?.length || 0
      });

      // Wait a bit between messages
      await this.sleep(2000);

      return response.data;

    } catch (error) {
      const messageEndTime = Date.now();
      const duration = ((messageEndTime - messageStartTime) / 1000).toFixed(2);

      console.error(`\n❌ Error: ${error.message}`);
      console.error(`⏱️  Failed after: ${duration}s\n`);

      this.results.push({
        step,
        message,
        expectedRouting,
        duration: parseFloat(duration),
        success: false,
        error: error.message
      });

      return null;
    }
  }

  async runConversationFlow() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 GRACE AI CONVERSATION TEST');
    console.log('='.repeat(80));
    console.log('\nTesting:');
    console.log('  ✓ Specialist routing');
    console.log('  ✓ Multi-agent collaboration');
    console.log('  ✓ Response speed');
    console.log('  ✓ Conversation flow');
    console.log('');

    try {
      // Create conversation
      await this.createConversation();

      // Run through conversation flow
      for (const { step, message, expectedRouting, description } of conversationFlow) {
        await this.sendMessage(step, message, expectedRouting, description);
      }

      // Print summary
      this.printSummary();

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    }
  }

  printSummary() {
    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const successCount = this.results.filter(r => r.success).length;
    const failCount = this.results.filter(r => !r.success).length;
    const avgDuration = (this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length).toFixed(2);
    const multiAgentCount = this.results.filter(r => r.multiAgent).length;

    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Successful: ${successCount}/${this.results.length}`);
    console.log(`❌ Failed: ${failCount}/${this.results.length}`);
    console.log(`⏱️  Total time: ${totalTime}s`);
    console.log(`⚡ Average response time: ${avgDuration}s`);
    console.log(`🤝 Multi-agent collaborations: ${multiAgentCount}`);

    console.log('\n📋 Detailed Results:\n');
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const multiAgent = result.multiAgent ? '🤝' : '  ';
      console.log(`${status} ${multiAgent} Step ${result.step}: ${result.duration}s - ${result.expectedRouting}`);
      if (result.specialist) {
        console.log(`     └─ Specialist: ${result.specialist}`);
      }
      if (result.error) {
        console.log(`     └─ Error: ${result.error}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('🎉 Test completed!');
    console.log('='.repeat(80) + '\n');

    // Exit with appropriate code
    process.exit(failCount > 0 ? 1 : 0);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test
const tester = new GraceConversationTester();
tester.runConversationFlow().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
