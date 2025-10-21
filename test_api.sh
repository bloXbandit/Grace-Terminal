#!/bin/bash

# Test OpenRouter Claude Sonnet 4.5
echo "Testing OpenRouter Claude Sonnet 4.5..."
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep OPENROUTER_API_KEY .env | cut -d= -f2)" \
  -H "HTTP-Referer: http://localhost:3000" \
  -H "X-Title: Grace AI" \
  -d '{
    "model": "anthropic/claude-sonnet-4.5",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }' | python3 -m json.tool

echo ""
echo "---"
echo ""

# Test OpenAI GPT-4o
echo "Testing OpenAI GPT-4o..."
curl -s https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep OPENAI_API_KEY .env | cut -d= -f2)" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ],
    "max_tokens": 50
  }' | python3 -m json.tool
