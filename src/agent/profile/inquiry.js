const { getMissingProfileKeys, getAllProfiles } = require('@src/services/userProfile');
const Message = require('@src/models/Message');
const { Op } = require('sequelize');

/**
 * Determine if it's appropriate to ask a profile question
 * Rules:
 * - Not on first message
 * - Not too frequently (max once per 5 messages)
 * - Only if missing key information
 * - Natural timing (after user asks a question or completes a task)
 */
const shouldAskProfileQuestion = async (user_id, conversation_id) => {
  try {
    // Get message count in this conversation
    const messageCount = await Message.count({
      where: {
        conversation_id,
        role: 'user'
      }
    });

    // Don't ask on first 2 messages
    if (messageCount < 3) {
      return { should_ask: false, reason: 'too_early' };
    }

    // Check if we asked recently (within last 5 messages)
    const recentMessages = await Message.findAll({
      where: {
        conversation_id,
        role: 'assistant'
      },
      order: [['create_at', 'DESC']],
      limit: 5
    });

    const askedRecently = recentMessages.some(msg => 
      msg.content && (
        msg.content.includes('may I ask') ||
        msg.content.includes('what\'s your name') ||
        msg.content.includes('what do you do') ||
        msg.content.includes('tell me about yourself')
      )
    );

    if (askedRecently) {
      return { should_ask: false, reason: 'asked_recently' };
    }

    // Check missing profile keys
    const missingKeys = await getMissingProfileKeys(user_id);
    
    if (missingKeys.length === 0) {
      return { should_ask: false, reason: 'profile_complete' };
    }

    // Randomly decide (30% chance to ask)
    const shouldAsk = Math.random() < 0.3;

    if (!shouldAsk) {
      return { should_ask: false, reason: 'random_skip' };
    }

    return {
      should_ask: true,
      missing_key: missingKeys[0]
    };
  } catch (error) {
    console.error('Error checking if should ask profile question:', error);
    return { should_ask: false, reason: 'error' };
  }
};

/**
 * Generate a natural profile question
 */
const generateProfileQuestion = (missing_key) => {
  const questions = {
    name: [
      "By the way, I'd love to personalize our conversations better. What should I call you?",
      "I don't think I caught your name earlier. What would you like me to call you?",
      "May I ask your name? It helps me provide a more personal experience."
    ],
    profession: [
      "I'm curious, what do you do professionally? It helps me tailor my responses better.",
      "What field do you work in? Understanding your background helps me assist you better.",
      "May I ask what you do for work? It'll help me provide more relevant examples."
    ],
    interests: [
      "What are some topics or areas you're particularly interested in?",
      "I'd love to know more about your interests. What do you enjoy learning about?",
      "What kind of projects or topics excite you the most?"
    ],
    expertise_level: [
      "How would you describe your technical expertise level? This helps me adjust my explanations.",
      "Are you more of a beginner, intermediate, or advanced user when it comes to technical topics?",
      "What's your comfort level with technical concepts? It helps me explain things better."
    ],
    location: [
      "Where are you based? It helps me consider time zones and regional context.",
      "What part of the world are you in? Just curious for context!"
    ],
    goals: [
      "What are you hoping to achieve with our conversations?",
      "Is there a particular goal or project you're working towards?",
      "What brings you here today? What are you looking to accomplish?"
    ]
  };

  const options = questions[missing_key] || questions.interests;
  return options[Math.floor(Math.random() * options.length)];
};

/**
 * Get profile inquiry to append to response
 */
const getProfileInquiry = async (user_id, conversation_id) => {
  const check = await shouldAskProfileQuestion(user_id, conversation_id);
  
  if (!check.should_ask) {
    return null;
  }

  const question = generateProfileQuestion(check.missing_key);
  
  return {
    question,
    key: check.missing_key,
    thinking_note: `[Waiting for user response to learn about: ${check.missing_key}]`
  };
};

module.exports = {
  shouldAskProfileQuestion,
  generateProfileQuestion,
  getProfileInquiry
};
