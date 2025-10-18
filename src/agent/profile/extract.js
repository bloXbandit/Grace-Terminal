const call = require("@src/utils/llm");
const { upsertProfile } = require('@src/services/userProfile');

/**
 * Extract user profile information from conversation
 * This runs passively in the background after each user message
 */
const extractProfileFromMessage = async (user_id, user_message, conversation_id) => {
  try {
    const prompt = `You are a profile extraction assistant. Analyze the user's message and extract any personal information that could be useful for building a user profile.

**IMPORTANT RULES:**
1. Only extract EXPLICIT information stated by the user
2. Do NOT infer or assume anything
3. Return ONLY valid JSON, no additional text
4. If no profile information found, return empty array

**Extract these categories:**
- name: User's name
- profession: Job title or occupation
- location: City, country, or region
- interests: Hobbies, topics of interest
- expertise_level: Technical skill level (beginner/intermediate/advanced)
- communication_style: Preferred communication style
- goals: What the user wants to achieve

**User Message:**
${user_message}

**Output Format (JSON only):**
[
  {"key": "name", "value": "John", "confidence": 0.9},
  {"key": "profession", "value": "Software Developer", "confidence": 0.8}
]`;

    const response = await call(prompt, conversation_id);
    
    // Parse JSON response
    let extracted = [];
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log('No profile information extracted from message');
      return;
    }

    // Save extracted profiles
    for (const item of extracted) {
      if (item.key && item.value) {
        await upsertProfile(
          user_id,
          item.key,
          item.value,
          item.confidence || 0.8,
          `conversation:${conversation_id}`
        );
        console.log(`✓ Profile updated: ${item.key} = ${item.value}`);
        
        // Emit notification event (will be sent to frontend via SSE)
        global.profileLearned = global.profileLearned || [];
        global.profileLearned.push({
          user_id,
          key: item.key,
          value: item.value,
          timestamp: Date.now()
        });
      }
    }
  } catch (error) {
    console.error('Error extracting profile:', error);
  }
};

module.exports = {
  extractProfileFromMessage
};
