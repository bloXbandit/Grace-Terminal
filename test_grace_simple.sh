#!/bin/bash

# Grace AI Simple Conversation Test
# Tests routing and multi-agent collaboration with curl

BASE_URL="http://localhost:5005"
API_KEY="${GRACE_API_KEY:-your-api-key-here}"

echo ""
echo "================================================================================"
echo "🧪 GRACE AI CONVERSATION TEST"
echo "================================================================================"
echo ""
echo "Testing:"
echo "  ✓ Specialist routing"
echo "  ✓ Multi-agent collaboration"
echo "  ✓ Response speed"
echo "  ✓ Conversation flow"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create conversation
echo "🚀 Creating new conversation..."
echo ""

CONV_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/conversation/create" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Conversation - Routing & Multi-Agent",
    "mode": "auto"
  }')

CONVERSATION_ID=$(echo $CONV_RESPONSE | grep -o '"conversation_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CONVERSATION_ID" ]; then
  echo "❌ Failed to create conversation"
  echo "Response: $CONV_RESPONSE"
  exit 1
fi

echo "✅ Conversation created: $CONVERSATION_ID"
echo ""

# Function to send message
send_message() {
  local STEP=$1
  local MESSAGE=$2
  local EXPECTED_ROUTING=$3
  local DESCRIPTION=$4
  
  echo "================================================================================"
  echo "📝 Step $STEP: $DESCRIPTION"
  echo "================================================================================"
  echo ""
  echo -e "${BLUE}👤 User:${NC} $MESSAGE"
  echo ""
  
  START_TIME=$(date +%s)
  
  RESPONSE=$(curl -s -X POST "${BASE_URL}/api/agent/run" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"conversation_id\": \"${CONVERSATION_ID}\",
      \"question\": \"${MESSAGE}\",
      \"mode\": \"auto\"
    }")
  
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  
  # Extract response content (simplified)
  CONTENT=$(echo $RESPONSE | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 200)
  
  echo -e "${GREEN}🤖 Grace:${NC} ${CONTENT}..."
  echo ""
  echo "⏱️  Response time: ${DURATION}s"
  echo "🎯 Expected routing: $EXPECTED_ROUTING"
  echo ""
  
  # Wait between messages
  sleep 2
}

# Test conversation flow
send_message 1 \
  "Hey Grace! What can you help me with?" \
  "general_chat" \
  "Initial greeting - should use GPT-4o"

send_message 2 \
  "I need to build a user dashboard for a SaaS application. Can you help?" \
  "complex_task" \
  "Complex task - should trigger multi-agent collaboration"

send_message 3 \
  "What are the latest trends in dashboard UI design for 2025?" \
  "web_research" \
  "Research task - should use GLM-4 Plus"

send_message 4 \
  "Can you create a quick prototype of a dashboard layout with sidebar and cards?" \
  "ui_design" \
  "UI design - should use Microsoft Phi-4"

send_message 5 \
  "Review the code you just generated for any issues" \
  "code_review" \
  "Code review - should use DeepSeek Coder"

echo "================================================================================"
echo "🎉 Test completed!"
echo "================================================================================"
echo ""
echo "Check the Grace UI at http://localhost:5005 to see the full conversation"
echo "Conversation ID: $CONVERSATION_ID"
echo ""
