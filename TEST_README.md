# 🧪 Grace AI Conversation Test Scripts

Test Grace's routing, multi-agent collaboration, and conversation flow.

---

## 🎯 What These Tests Do

The test scripts simulate a realistic conversation flow:

1. **Greeting** → Tests general chat (GPT-4o)
2. **Complex Request** → Tests multi-agent collaboration detection
3. **Research** → Tests web research routing (GLM-4 Plus)
4. **UI Design** → Tests UI specialist routing (Microsoft Phi-4)
5. **Code Review** → Tests code review routing (DeepSeek Coder)

---

## 🚀 Quick Start

### Option 1: Python Script (Recommended)

```bash
# Make sure Grace is running on http://localhost:5005
cd /Users/wonkasworld/Downloads/GRACEai

# Run the test
python3 test_grace.py
```

### Option 2: Bash Script

```bash
# Make executable
chmod +x test_grace_simple.sh

# Run the test
./test_grace_simple.sh
```

### Option 3: Node.js Script

```bash
# Install dependencies
npm install axios

# Run the test
node test_grace_conversation.js
```

---

## 📋 Expected Output

```
================================================================================
🧪 GRACE AI CONVERSATION TEST
================================================================================

Testing:
  ✓ Specialist routing
  ✓ Multi-agent collaboration
  ✓ Response speed
  ✓ Conversation flow

🚀 Creating new conversation...

✅ Conversation created: conv_abc123

================================================================================
📝 Step 1: Initial greeting - should use GPT-4o
================================================================================

👤 User: Hey Grace! What can you help me with?

🤖 Grace: Hello! I'm Grace, your AI assistant. I can help you with...

⏱️  Response time: 3.45s
🎯 Expected routing: general_chat
✅ Specialist used: openai/gpt-4o

================================================================================
📝 Step 2: Complex task - should trigger multi-agent collaboration
================================================================================

👤 User: I need to build a user dashboard for a SaaS application...

🤖 Grace: I'll help you build a comprehensive dashboard...

⏱️  Response time: 18.23s
🎯 Expected routing: complex_task
🤝 Multi-agent collaboration activated!
   Subtasks: 4

...

================================================================================
📊 TEST SUMMARY
================================================================================

✅ Successful: 5/5
❌ Failed: 0/5
⏱️  Total time: 45.67s
⚡ Average response time: 9.13s
🤝 Multi-agent collaborations: 1

📋 Detailed Results:

✅    Step 1: 3.45s - general_chat
     └─ Specialist: openai/gpt-4o
✅ 🤝 Step 2: 18.23s - complex_task
     └─ Multi-agent collaboration
✅    Step 3: 5.12s - web_research
     └─ Specialist: openrouter/zhipu/glm-4-plus
✅    Step 4: 8.34s - ui_design
     └─ Specialist: openrouter/microsoft/phi-4
✅    Step 5: 10.53s - code_review
     └─ Specialist: openrouter/deepseek/deepseek-coder

================================================================================
🎉 Test completed!
================================================================================

Conversation ID: conv_abc123
View at: http://localhost:5005
```

---

## 🔍 What to Look For

### ✅ Success Indicators:

1. **All 5 steps complete** without errors
2. **Correct specialist routing**:
   - Step 1: GPT-4o (general chat)
   - Step 2: Multi-agent collaboration
   - Step 3: GLM-4 Plus (research)
   - Step 4: Microsoft Phi-4 (UI design)
   - Step 5: DeepSeek Coder (code review)
3. **Response times**:
   - Simple tasks: 3-5 seconds
   - Complex tasks: 15-25 seconds
4. **Multi-agent activated** for complex dashboard request

### ⚠️ Warning Signs:

- ❌ All tasks routing to same model
- ❌ Response times > 30 seconds
- ❌ Multi-agent not activating for complex task
- ❌ API errors or timeouts

---

## 🛠️ Troubleshooting

### Grace not responding?

```bash
# Check if Grace is running
curl http://localhost:5005/health

# Check Docker containers
docker ps | grep grace
```

### API Key issues?

```bash
# Set your API key
export GRACE_API_KEY="your-api-key-here"

# Or edit the script directly
```

### Want to see the full conversation?

1. Open http://localhost:5005 in your browser
2. Look for the conversation ID from the test output
3. Click on that conversation to see the full exchange

---

## 📊 Performance Benchmarks

### Expected Performance:

| Task Type | Expected Time | Specialist |
|-----------|--------------|------------|
| General Chat | 3-5s | GPT-4o |
| Research | 5-8s | GLM-4 Plus |
| UI Design | 8-12s | Microsoft Phi-4 |
| Code Review | 8-12s | DeepSeek Coder |
| Multi-Agent | 15-25s | Multiple specialists |

### What Affects Speed:

- ⚡ **API response times** - OpenRouter/OpenAI latency
- 🔄 **Multi-agent overhead** - Multiple sequential calls
- 🌐 **Network conditions** - Your internet speed
- 💻 **Server load** - Grace's current workload

---

## 🎯 Customizing Tests

### Add Your Own Test Cases:

Edit the `CONVERSATION_FLOW` array in any script:

```python
{
    "step": 6,
    "message": "Debug this authentication error: TypeError...",
    "expected_routing": "debugging",
    "description": "Debugging - should use DeepSeek R1"
}
```

### Test Specific Specialists:

```python
# Test fast code generation
{
    "message": "Quick function to validate email addresses",
    "expected_routing": "code_generation_fast"
}

# Test complex reasoning
{
    "message": "Design an algorithm for graph shortest path with constraints",
    "expected_routing": "code_reasoning"
}
```

---

## 📝 Test Scenarios

### Scenario 1: Simple Tasks (Fast)
- Greeting
- Quick question
- Code explanation

**Expected**: 3-5s per response, single specialist

### Scenario 2: Complex Tasks (Collaborative)
- Full-stack feature
- Production system
- Security-critical code

**Expected**: 15-25s, multi-agent collaboration

### Scenario 3: Specialist Tasks
- UI design → Phi-4
- Debugging → DeepSeek R1
- Research → GLM-4 Plus

**Expected**: 8-12s, correct specialist routing

---

## 🎉 Success Criteria

✅ **All tests pass** (5/5 successful)
✅ **Correct routing** for each task type
✅ **Multi-agent activates** for complex tasks
✅ **Response times** within expected ranges
✅ **No errors** or timeouts

---

## 🚀 Next Steps

After successful tests:

1. ✅ Verify routing is working correctly
2. ✅ Check multi-agent collaboration
3. ✅ Monitor response times
4. ✅ Test with real user scenarios
5. ✅ Deploy to production!

---

**Happy Testing!** 🧪🤖
