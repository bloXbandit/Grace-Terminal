#!/usr/bin/env python3
"""
Grace AI Conversation Test Script
Tests routing, multi-agent collaboration, and conversation flow
"""

import requests
import time
import json
import os
from datetime import datetime

BASE_URL = "http://localhost:5005"
API_KEY = os.getenv("GRACE_API_KEY", "your-api-key-here")

# Test conversation flow
CONVERSATION_FLOW = [
    {
        "step": 1,
        "message": "Hey Grace! What can you help me with?",
        "expected_routing": "general_chat",
        "description": "Initial greeting - should use GPT-4o"
    },
    {
        "step": 2,
        "message": "I need to build a user dashboard for a SaaS application. Can you help?",
        "expected_routing": "complex_task",
        "description": "Complex task - should trigger multi-agent collaboration"
    },
    {
        "step": 3,
        "message": "What are the latest trends in dashboard UI design for 2025?",
        "expected_routing": "web_research",
        "description": "Research task - should use GLM-4 Plus"
    },
    {
        "step": 4,
        "message": "Can you create a quick prototype of a dashboard layout with sidebar and cards?",
        "expected_routing": "ui_design",
        "description": "UI design - should use Microsoft Phi-4"
    },
    {
        "step": 5,
        "message": "Review the code you just generated for any issues",
        "expected_routing": "code_review",
        "description": "Code review - should use DeepSeek Coder"
    }
]

class Colors:
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    END = '\033[0m'

class GraceConversationTester:
    def __init__(self):
        self.conversation_id = None
        self.results = []
        self.start_time = time.time()
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json'
        })

    def print_header(self):
        print("\n" + "=" * 80)
        print("🧪 GRACE AI CONVERSATION TEST")
        print("=" * 80)
        print("\nTesting:")
        print("  ✓ Specialist routing")
        print("  ✓ Multi-agent collaboration")
        print("  ✓ Response speed")
        print("  ✓ Conversation flow")
        print("")

    def create_conversation(self):
        print("\n🚀 Conversation will be created with first message...\n")
        # Grace creates conversation automatically on first message
        # We'll set it after the first send
        return None

    def send_message(self, step, message, expected_routing, description):
        print("\n" + "=" * 80)
        print(f"📝 Step {step}: {description}")
        print("=" * 80)
        print(f"\n{Colors.BLUE}👤 User:{Colors.END} {message}\n")

        start_time = time.time()

        try:
            payload = {
                "question": message,
                "mode": "auto"
            }
            
            # Add conversation_id if we have one
            if self.conversation_id:
                payload["conversation_id"] = self.conversation_id
            
            response = self.session.post(
                f"{BASE_URL}/api/agent/run",
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            data = response.json()
            
            # Capture conversation_id from first response
            if not self.conversation_id and data.get('conversation_id'):
                self.conversation_id = data['conversation_id']
                print(f"✅ Conversation created: {self.conversation_id}\n")

            end_time = time.time()
            duration = end_time - start_time

            content = data.get('content', '')
            preview = content[:200] + ('...' if len(content) > 200 else '')
            
            print(f"{Colors.GREEN}🤖 Grace:{Colors.END} {preview}\n")
            print(f"⏱️  Response time: {duration:.2f}s")
            print(f"🎯 Expected routing: {expected_routing}")

            meta = data.get('meta', {})
            if meta.get('specialist'):
                print(f"✅ Specialist used: {meta['specialist']}")
            
            if meta.get('mode') == 'multi-agent':
                print(f"🤝 Multi-agent collaboration activated!")
                subtasks = meta.get('subtasks', [])
                print(f"   Subtasks: {len(subtasks)}")

            self.results.append({
                'step': step,
                'message': message,
                'expected_routing': expected_routing,
                'duration': duration,
                'success': True,
                'specialist': meta.get('specialist'),
                'multi_agent': meta.get('mode') == 'multi-agent',
                'response_length': len(content)
            })

            # Wait between messages
            time.sleep(2)

            return data

        except Exception as e:
            end_time = time.time()
            duration = end_time - start_time

            print(f"\n{Colors.RED}❌ Error: {e}{Colors.END}")
            print(f"⏱️  Failed after: {duration:.2f}s\n")

            self.results.append({
                'step': step,
                'message': message,
                'expected_routing': expected_routing,
                'duration': duration,
                'success': False,
                'error': str(e)
            })

            return None

    def run_conversation_flow(self):
        self.print_header()

        try:
            # Create conversation
            self.create_conversation()

            # Run through conversation flow
            for item in CONVERSATION_FLOW:
                self.send_message(
                    item['step'],
                    item['message'],
                    item['expected_routing'],
                    item['description']
                )

            # Print summary
            self.print_summary()

        except Exception as e:
            print(f"\n{Colors.RED}❌ Test failed: {e}{Colors.END}")
            exit(1)

    def print_summary(self):
        total_time = time.time() - self.start_time
        success_count = sum(1 for r in self.results if r['success'])
        fail_count = sum(1 for r in self.results if not r['success'])
        avg_duration = sum(r['duration'] for r in self.results) / len(self.results)
        multi_agent_count = sum(1 for r in self.results if r.get('multi_agent'))

        print("\n" + "=" * 80)
        print("📊 TEST SUMMARY")
        print("=" * 80)
        print(f"\n✅ Successful: {success_count}/{len(self.results)}")
        print(f"❌ Failed: {fail_count}/{len(self.results)}")
        print(f"⏱️  Total time: {total_time:.2f}s")
        print(f"⚡ Average response time: {avg_duration:.2f}s")
        print(f"🤝 Multi-agent collaborations: {multi_agent_count}")

        print("\n📋 Detailed Results:\n")
        for result in self.results:
            status = "✅" if result['success'] else "❌"
            multi_agent = "🤝" if result.get('multi_agent') else "  "
            print(f"{status} {multi_agent} Step {result['step']}: {result['duration']:.2f}s - {result['expected_routing']}")
            if result.get('specialist'):
                print(f"     └─ Specialist: {result['specialist']}")
            if result.get('error'):
                print(f"     └─ Error: {result['error']}")

        print("\n" + "=" * 80)
        print("🎉 Test completed!")
        print("=" * 80)
        print(f"\nConversation ID: {self.conversation_id}")
        print(f"View at: {BASE_URL}\n")

        exit(0 if fail_count == 0 else 1)

if __name__ == "__main__":
    tester = GraceConversationTester()
    tester.run_conversation_flow()
