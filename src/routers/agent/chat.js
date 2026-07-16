// @ts-ignore
const router = require("koa-router")();
const handleStream = require("@src/utils/stream.util");

const uuid = require("uuid");
const Conversation = require("@src/models/Conversation");
const Message = require("@src/utils/message");
const MessageTable = require("@src/models/Message");
const call = require("@src/utils/llm");
const calcToken = require('@src/completion/calc.token.js')
const { getProfileContext } = require('@src/services/userProfile');
const { extractProfileFromMessage } = require('@src/agent/profile/extract');
const { getProfileInquiry } = require('@src/agent/profile/inquiry');
const MultiAgentCoordinator = require('@src/agent/specialists/MultiAgentCoordinator');
const modeCommandHandler = require('@src/agent/modes/ModeCommandHandler');
const DefaultModelSetting = require('@src/models/DefaultModelSetting');


const activeChatAbortControllers = new Map(); // conversation_id -> AbortController


router.post("/chat", async (ctx, next) => {
  const { request, response } = ctx;
  const body = request.body || {};
  let { question, conversation_id, pid, model_id } = body;
  
  // Get default model if not provided
  if (!model_id) {
    const defaultSetting = await DefaultModelSetting.findOne({ where: { setting_type: 'assistant' } });
    model_id = defaultSetting?.model_id || 22; // Fallback to GPT-5 Pro (model 22)
  }
  
  await Conversation.update({ model_id }, { where: { conversation_id } })


  if (!conversation_id) {
    conversation_id = uuid.v4();
    const title = question.slice(0, 20);
    const newConversation = await Conversation.create({
      user_id: ctx.state.user.id,
      conversation_id: conversation_id,
      content: question,
      title: title,
      status: 'done',
      model_id: model_id  // Use the default model we just looked up
    });
  }

  body.responseType = body.responseType || "sse";
  const { stream, onTokenStream } = handleStream(body.responseType, response);

  // Check for mode commands (/dev, /normal, /dev status)
  const modeCommandResult = await modeCommandHandler.handleCommand(question, conversation_id);
  if (modeCommandResult) {
    // This was a mode command, return the result directly
    const ResponseValidator = require('@src/utils/responseValidator');
    const rawContent = modeCommandResult.message || modeCommandResult.error || 'Mode command executed';
    const content = ResponseValidator.intelligentStringConversion(rawContent);
    const msg = Message.format({
      status: modeCommandResult.success ? 'success' : 'failure',
      action_type: 'auto_reply',
      content: content
    });
    // Send full message object like AgenticAgent does
    onTokenStream(msg);
    // Give stream time to flush before ending
    await new Promise(resolve => setImmediate(resolve));
    await Message.saveToDB(msg, conversation_id);
    await Conversation.update({ status: 'done' }, { where: { conversation_id } });
    ctx.body = stream;
    stream.end();
    return;
  }

  // 新增：为本次会话创建 AbortController（并中断上一次未完成的请求）
  const existingController = activeChatAbortControllers.get(conversation_id);
  if (existingController) {
    console.log(`[Chat] Aborting active execution for conversation ${conversation_id}`);
    existingController.abort();
    activeChatAbortControllers.delete(conversation_id);
  }
  const abortController = new AbortController();
  activeChatAbortControllers.set(conversation_id, abortController);

  // 修改 onCompleted，接收 message_id 并 base64 编码
  const onCompleted = (message_id, new_pid) => {
    // 1. 构造原始字符串
    const raw = `__lemon_out_end__{"message_id":"${message_id}","pid":"${new_pid}"}\n\n`;
    // 2. base64 编码
    const base64_content = Buffer.from(raw).toString('base64');
    // 3. 写入流
    onTokenStream(raw);
    stream.end();
  };

  let messagesContext = []
  if (pid != -1) {
    // 寻找上下文
    const messages = await MessageTable.findAll({
      where: {
        conversation_id: conversation_id
      }
    })
    messagesContext = getMessagesContext(messages, pid)
  }


  // Get user profile context (non-invasive)
  const user_id = ctx.state.user.id;
  let profileContext = '';
  try {
    profileContext = await getProfileContext(user_id);
  } catch (err) {
    console.error('Profile context error:', err);
  }

  // Multi-Agent routing in Chat mode (enabled for complex tasks)
  // Initialize coordinator
  const coordinator = new MultiAgentCoordinator({
    conversation_id,
    user_id
  });
  
  // Check if this is a specialist-worthy task (LLM classifier, regex fallback)
  const taskType = await coordinator.classifyTaskType(question);
  
  // CRITICAL: Chat mode cannot execute code, so exclude tasks that require execution
  const executionRequiredTasks = [
    'data_generation',      // Excel, CSV, JSON files - needs pandas execution
    'code_generation',      // Code files - needs file writing
    'code_generation_fast', // Quick code - needs file writing
    'system_design',        // Diagrams - needs file generation
    'web_research'          // Research with file output
  ];
  
  // If task requires execution, skip specialist and use default model
  // Default model will provide helpful response or guide user to task mode
  const useSpecialist = taskType !== 'general_chat' && !executionRequiredTasks.includes(taskType);

  // CRITICAL: Use MASTER_SYSTEM_PROMPT + profileContext (same as task mode)
  const { MASTER_SYSTEM_PROMPT } = require('@src/agent/prompt/MASTER_SYSTEM_PROMPT');
  
  let sysPromptMessage = {
    role: 'system',
    content: `${MASTER_SYSTEM_PROMPT}
    
---

## Chat Mode Specific Instructions:
You are in Chat mode - provide concise, conversational responses.
Be friendly and helpful. Keep responses brief unless the user asks for details.

${profileContext}
    `
  }
  messagesContext.unshift(sysPromptMessage)

  const msg = Message.format({
    role: 'user',
    status: 'success',
    content: question,
    action_type: 'chat',
    task_id: conversation_id,
    type: 'chat',
    pid: pid
  });
  let message = await Message.saveToDB(msg, conversation_id);
  let new_pid = message.id

  // 调用大模型
  let content

  // MEMORY SAVE FAST-PATH: Check for explicit memory save requests BEFORE profile extraction
  // This ensures "remember that..." goes to UserMemory table, not Knowledge table (user_profile)
  let isMemorySaveRequest = false;
  let memoryContent = null;
  
  // Pattern 1: "remember that X" or "save to memory that X"
  let match = question.match(/\b(save|remember|store|record|note|memorize|keep)\s+(to|in)?\s*(memory|mind|assistant)?\s+that\s+(.+)$/i);
  if (match) {
    memoryContent = match[4].trim();
    isMemorySaveRequest = true;
  }
  
  // Pattern 2: "remember: X" or "save to memory: X"
  if (!match) {
    match = question.match(/\b(save|remember|store|record|note|memorize|keep)\s+(to|in)?\s*(memory|mind|assistant)?\s*:\s*(.+)$/i);
    if (match) {
      memoryContent = match[4].trim();
      isMemorySaveRequest = true;
    }
  }
  
  // Pattern 3: "remember X" (everything after verb)
  if (!match) {
    match = question.match(/\b(save|remember|store|record|note|memorize|keep)\s+(.+)$/i);
    if (match) {
      memoryContent = match[2].trim();
      // Remove trailing "save it to memory" type phrases
      memoryContent = memoryContent.replace(/,?\s*(save|store|keep)\s+(it|this|that)\s+(to|in)\s+(memory|mind)$/i, '');
      isMemorySaveRequest = true;
    }
  }
  
  if (isMemorySaveRequest && memoryContent) {
    console.log('[Chat] 💾 Memory save fast-path triggered');
    console.log('[Chat] Extracted content:', memoryContent);
    
    try {
      const axios = require('axios');
      
      // Clean up content: remove leading "that" if present
      memoryContent = memoryContent.replace(/^that\s+/i, '');
      
      // Generate title (first 50 chars or first sentence)
      let title;
      if (memoryContent.length <= 50) {
        title = memoryContent;
      } else {
        const firstSentence = memoryContent.match(/^[^.!?]+[.!?]/);
        if (firstSentence) {
          title = firstSentence[0].trim();
        } else {
          title = memoryContent.substring(0, 50) + '...';
        }
      }
      
      // Auto-tag based on content
      const tags = ['user-requested'];
      const lowerContent = memoryContent.toLowerCase();
      
      if (/\b(trip|travel|going to|visit|vacation)\b/i.test(lowerContent)) {
        tags.push('travel');
      }
      if (/\b(meeting|appointment|event|schedule)\b/i.test(lowerContent)) {
        tags.push('event');
      }
      if (/\b(prefer|like|favorite|love|enjoy)\b/i.test(lowerContent)) {
        tags.push('preference');
      }
      if (/\b(want to|goal|plan|aim|objective)\b/i.test(lowerContent)) {
        tags.push('goal');
      }
      if (/\b(remind|reminder|don't forget|remember to)\b/i.test(lowerContent)) {
        tags.push('reminder');
      }
      if (/\b(birthday|name|email|phone|address)\b/i.test(lowerContent)) {
        tags.push('personal');
      }
      
      // Save to UserMemory via API
      const response = await axios.post('http://localhost:3000/api/assistant/memories', {
        title: title,
        content: memoryContent,
        tags: tags,
        source: 'grace',
        conversation_id: conversation_id
      });
      
      if (response.data.success) {
        console.log('[Chat] ✅ Memory saved to UserMemory table:', response.data.memory.id);
        
        // Generate concise, natural response - extract key phrase instead of full paraphrase
        let naturalResponse;
        const lowerContent = memoryContent.toLowerCase();
        
        // Extract key phrase (first 3-5 words or main subject)
        let keyPhrase = memoryContent;
        const words = memoryContent.split(/\s+/);
        if (words.length > 6) {
          // Extract main subject/action
          keyPhrase = words.slice(0, 5).join(' ');
          // Clean up trailing words
          keyPhrase = keyPhrase.replace(/\b(that|the|a|an|to|in|on|at)$/i, '').trim();
        }
        
        // Detect content type and craft concise response
        if (/\b(prefer|like|favorite|love|enjoy|fan)\b/i.test(lowerContent)) {
          // Preference - extract the thing they like
          const match = memoryContent.match(/\b(fan|prefer|like|love|enjoy)\s+(.+?)(?:\s+and|\s+,|$)/i);
          const thing = match ? match[2].trim() : keyPhrase;
          naturalResponse = `Got it, ${thing} fan! Saved to memory.`;
        } else if (/\b(moving|going to|visit|trip|travel)\b/i.test(lowerContent)) {
          // Travel/event - extract destination/event
          const match = memoryContent.match(/\b(moving|going|visit|trip|travel)\s+(?:to\s+)?(.+?)(?:\s+in|\s+on|$)/i);
          const destination = match ? match[2].trim() : keyPhrase;
          naturalResponse = `Noted, ${destination}. I've saved that.`;
        } else if (/\b(meeting|appointment|event)\b/i.test(lowerContent)) {
          // Appointment
          naturalResponse = `Got it, I've saved that appointment.`;
        } else if (/\b(name is|called)\b/i.test(lowerContent)) {
          // Name/identity
          const match = memoryContent.match(/(?:name is|called)\s+(.+?)(?:\s+and|\s+,|$)/i);
          const name = match ? match[1].trim() : keyPhrase;
          naturalResponse = `Perfect, ${name}. Saved.`;
        } else {
          // Generic - short and casual
          naturalResponse = `Saved to memory!`;
        }
        
        const successMsg = Message.format({
          role: 'assistant',
          status: 'success',
          content: naturalResponse,
          action_type: 'chat',
          task_id: conversation_id,
          type: 'chat',
          pid: new_pid
        });
        
        onTokenStream(successMsg);
        let savedMessage = await Message.saveToDB(successMsg, conversation_id);
        onCompleted(savedMessage.id, new_pid);
        await Conversation.update({ status: 'done' }, { where: { conversation_id } });
        return;
      } else {
        console.error('[Chat] Memory save API returned failure:', response.data.error);
        // Fall through to normal chat if save fails
      }
    } catch (error) {
      console.error('[Chat] Memory save fast-path failed:', error?.message || error);
      // Fall through to normal chat if save fails
    }
  }

  // MEMORY RECALL FAST-PATH: Check for memory recall requests
  // IMPORTANT: Patterns are designed to avoid false positives from task instructions
  let memoryRecallContext = '';
  
  const isRecallQuery = (() => {
    const q = question.toLowerCase().trim();
    
    // Pattern 1: "what do you remember/recall/know" - but NOT "do you know what my [method/way/approach]"
    if (/\b(what|do|did)\s+(do\s+)?(you\s+)?(remember|recall)\b/i.test(question)) {
      return true;
    }
    if (/\bdo\s+you\s+know\b/i.test(question)) {
      // Only trigger if followed by memory-related terms, not task terms
      if (/\bdo\s+you\s+know\s+(about|if|whether|when|where|who)\s+(my|i|we)\b/i.test(question)) {
        return true;
      }
      // Exclude task-related "do you know what my [method/way/approach/steps]"
      if (/\bdo\s+you\s+know\s+what\s+(my|the)\s+(fastest|best|easiest|quickest|method|way|approach|steps?|process)\b/i.test(question)) {
        return false;
      }
    }
    
    // Pattern 2: "do I have any [events/appointments/things]"
    if (/^(do|did)\s+i\s+have\s+(any|some)\s+(events?|appointments?|meetings?|plans?|trips?|things?)\b/i.test(question)) {
      return true;
    }
    
    // Pattern 3: "what/show/list [my] events/appointments/memories"
    if (/\b(what|show|list)\s+(are\s+)?(my|our|the)?\s*(events?|appointments?|trips?|plans?|memories)\b/i.test(question)) {
      return true;
    }
    
    // Pattern 4: "remind me" or "tell me about [my/specific memory]"
    if (/\bremind\s+me\b/i.test(question)) {
      return true;
    }
    if (/\btell\s+me\s+(about|what)\s+(my|i|we|our)\b/i.test(question)) {
      return true;
    }
    
    // Pattern 5: "what's my favorite/preferred/usual [thing]"
    if (/\b(what'?s?|what\s+is|what\s+are)\s+(my|our)\s+(favorite|preferred|usual)\b/i.test(question)) {
      return true;
    }
    
    // Pattern 6: "what's my [thing] name"
    if (/\b(what'?s?|what\s+is|what\s+are)\s+(my|our|the)\s+\w+\s+name\b/i.test(question)) {
      return true;
    }
    
    // Pattern 7: "what kind/type/brand/color of [thing] do I [verb]"
    if (/\b(what|which)\s+(kind|type|brand|color|style|size)\s+of\s+\w+\s+do\s+(i|we)\b/i.test(question)) {
      return true;
    }
    if (/\b(what|which)\s+(kind|type|brand|color|style|size)\s+\w+\s+do\s+(i|we)\b/i.test(question)) {
      return true;
    }
    if (/\b(what|which)\s+(kind|type|brand|color|style|size)\s+(is|are)\s+(my|our|the)\b/i.test(question)) {
      return true;
    }
    
    // Pattern 8: "when do i [verb] with [person/thing]"
    if (/\b(when|what\s+time)\s+(do|did|am|is|are)\s+(i|we|my|our)\b/i.test(question)) {
      return true;
    }
    
    return false;
  })();
  
  if (isRecallQuery) {
    console.log('[Chat] 🔍 Memory recall fast-path triggered');
    try {
      const { getRelevantMemories, formatMemoriesForResponse } = require('@src/services/userMemory');
      
      // Get top 5 relevant memories using smart scoring
      const isEventQuery = /\b(events?|appointments?|meetings?|plans?|trips?|schedule|coming\s+up)\b/i.test(question);
      const relevantMemories = await getRelevantMemories(user_id, question, { 
        limit: 5,
        includeEventDates: isEventQuery
      });
      
      if (relevantMemories.length > 0) {
        console.log(`[Chat] Found ${relevantMemories.length} relevant memories for recall`);
        
        // Format memories for context injection (content only, no numbering)
        const memoryLines = relevantMemories.map(m => m.content).join('\n');
        
        memoryRecallContext = `\n## Relevant Saved Memories:\n${memoryLines}\n\nProvide a brief, direct answer to the user's question using these memories. Do not list or enumerate the memories - just answer the question naturally and concisely.\n`;
        console.log('[Chat] Memory recall context injected');
      } else {
        console.log('[Chat] No relevant memories found - providing helpful empty response');
        
        // Provide helpful context for "nothing found" scenario
        // Detect if query is about events/appointments/plans
        const isEventQuery = /\b(events?|appointments?|meetings?|plans?|trips?|schedule)\b/i.test(question);
        
        if (isEventQuery) {
          memoryRecallContext = `\n## Memory Search Result:\nNo saved memories found matching this query.\n\nRespond naturally that you don't see anything in their saved memories or calendar for the next 60 days. Be helpful and suggest they can save events/plans by saying "remember that..." or check back later.\n`;
        } else {
          memoryRecallContext = `\n## Memory Search Result:\nNo saved memories found matching this query.\n\nRespond naturally that you don't have any saved memories about that topic yet. Be helpful and suggest they can save information by saying "remember that..."\n`;
        }
      }
    } catch (err) {
      console.error('[Chat] Memory recall failed (continuing anyway):', err.message);
    }
  }
  
  // CONDITIONAL PROFILE EXTRACTION: Only run when message contains personal info
  // This saves 0-2s latency on messages that don't need profile extraction
  // CRITICAL: Keep pattern broad to avoid missing important profile updates
  const needsProfileExtraction = 
    /\b(my name|I am|I'm|I live|my email|my phone|my address|my birthday|my age|prefer|favorite|like|love|hate|enjoy|dislike)\b/i.test(question) ||
    /\b(call me|known as|go by|refer to me)\b/i.test(question) ||
    /\b(remember|note|keep in mind|don't forget)\b/i.test(question);
  
  if (needsProfileExtraction) {
    console.log('[Chat] Profile extraction triggered for:', question.substring(0, 50));
    try {
      await Promise.race([
        extractProfileFromMessage(user_id, question, conversation_id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile extraction timeout')), 2000)
        )
      ]);
      console.log('[Chat] Profile extraction completed successfully');
    } catch (err) {
      console.error('[Chat] Profile extraction failed (continuing anyway):', err.message);
    }
  } else {
    console.log('[Chat] Skipping profile extraction - no personal info detected');
  }

  // Inject memory recall context into messages if available
  if (memoryRecallContext) {
    // Add memory context as a system message at the end
    messagesContext.push({
      role: 'system',
      content: memoryRecallContext
    });
  }
  
  // Check if we should route to specialist
  let responsePromise;
  if (useSpecialist) {
    console.log(`[Chat] Routing to specialist: ${taskType}`);
    responsePromise = coordinator.execute(question, { 
      messages: messagesContext, 
      temperature: 0.7,
      onTokenStream,
      signal: abortController.signal
    }).then(result => {
      if (result.success) {
        console.log(`[Chat] Specialist ${result.specialist} (${taskType}) completed the request`);
        return result.result;
      }
      // Fallback to default if specialist fails
      console.log('[Chat] Specialist execution failed, falling back to default model');
      return call(question, conversation_id, 'assistant', { temperature: 0.7, messages: messagesContext, signal: abortController.signal }, onTokenStream);
    }).catch(error => {
      console.error('[Chat] Specialist routing failed, falling back:', error);
      return call(question, conversation_id, 'assistant', { temperature: 0.7, messages: messagesContext, signal: abortController.signal }, onTokenStream);
    });
  } else {
    // Use default model for casual chat
    console.log('[Chat] Using default model for casual conversation');
    responsePromise = call(question, conversation_id, 'assistant', { temperature: 0.7, messages: messagesContext, signal: abortController.signal }, onTokenStream);
  }

  responsePromise.then(async (content) => {
    // CRITICAL: Convert content to string FIRST before any processing
    const ResponseValidator = require('@src/utils/responseValidator');
    if (typeof content !== 'string') {
      console.error('[Chat] LLM Content is not a string:', typeof content, content);
      content = ResponseValidator.intelligentStringConversion(content);
    }
    
    // STRATEGIC: Validate file delivery claims before sending response
    let validatedContent = ResponseValidator.validateFileDeliveryClaims(content, conversation_id);
    // DOUBLE CHECK: Ensure validatedContent is always a meaningful string
    if (typeof validatedContent !== 'string') {
      console.error('[Chat] ValidatedContent is not a string:', typeof validatedContent, validatedContent);
      validatedContent = ResponseValidator.intelligentStringConversion(validatedContent || content || '');
    }  
    // Check if we should ask a profile question (natural inquiry)
    let finalContent = validatedContent;
    try {
      const inquiry = await getProfileInquiry(user_id, conversation_id);
      if (inquiry) {
        // Append natural question to response
        finalContent += `\n\n${inquiry.question}`;
        onTokenStream(`\n\n${inquiry.question}`);
      }
    } catch (err) {
      console.error('Profile inquiry error (non-critical):', err);
    }

    const assistant_msg = Message.format({
      role: 'assistant',
      status: 'success',
      content: finalContent,
      action_type: 'chat',
      task_id: conversation_id,
      type: 'chat',
      pid: new_pid
    });
    let new_message = await Message.saveToDB(assistant_msg, conversation_id);

    // 在这里调用 onCompleted
    onCompleted(new_message.id, new_pid);

    await Conversation.update({ status: 'done' }, { where: { conversation_id } })
  }).catch(async (error) => {
    // CRITICAL: Convert error.message to string before Message.format
    const ResponseValidator = require('@src/utils/responseValidator');
    content = ResponseValidator.intelligentStringConversion(error.message || error || 'An error occurred');
    const assistant_msg = Message.format({
      role: 'assistant',
      status: 'success',
      content: content,
      action_type: 'chat',
      task_id: conversation_id,
      type: 'chat',
      pid: new_pid
    });
    let new_message = await Message.saveToDB(assistant_msg, conversation_id);

    // 在这里调用 onCompleted
    onCompleted(new_message.id, new_pid);
  }).finally(() => {
    activeChatAbortControllers.delete(conversation_id);
  })

  // completeCodeAct(task, context).then(async content => {
  //   console.log('content', content);
  //   onCompleted();
  // });
  ctx.body = stream;
  ctx.status = 200;
});

// 重新回答
router.post("/re_chat", async (ctx, next) => {
  const { request, response } = ctx;
  const body = request.body || {};
  const user_id = ctx.state.user.id
  let { conversation_id, pid, model_id } = body;
  
  // Get default model if not provided
  if (!model_id) {
    const defaultSetting = await DefaultModelSetting.findOne({ where: { setting_type: 'assistant' } });
    model_id = defaultSetting?.model_id || 22; // Fallback to GPT-5 Pro (model 22)
  }

  await Conversation.update({ status: 'running', model_id }, { where: { conversation_id } })

  body.responseType = body.responseType || "sse";
  const { stream, onTokenStream } = handleStream(body.responseType, response);

  const messages = await MessageTable.findAll({
    where: {
      conversation_id: conversation_id
    }
  })

  // 根据pid找到另一个message的is_active是true的，改成false
  // 只处理同一conversation下，除当前pid外的is_active为true的assistant消息
  for (const msg of messages) {
    if (msg.get('role') === 'assistant') {
      let meta = msg.get('meta');
      if (typeof meta === 'string') meta = JSON.parse(meta);
      if (meta && typeof meta === 'object' && 'is_active' in meta && meta.is_active && meta.pid == pid) {
        meta.is_active = false;
        console.log("====debug====", msg.id)
        await MessageTable.update({ meta: JSON.stringify(meta) }, { where: { id: msg.id } });
      }
    }
  }

  const abortController = new AbortController();
  activeChatAbortControllers.set(conversation_id, abortController);

  const onCompleted = (message_id, new_pid) => {
    // 1. 构造原始字符串
    const raw = `__lemon_out_end__{"message_id":"${message_id}","pid":"${new_pid}"}\n\n`;
    // 2. base64 编码
    const base64_content = Buffer.from(raw).toString('base64');
    // 3. 写入流
    onTokenStream(raw);
    stream.end();
  };

  const messagesContext = getMessagesContext(messages, pid)


  const message = getMessageByPid(messages, pid)
  const question = message.content
  console.log("messagesContext[messagesContext.length - 1]", message)
  const contextMessages = messagesContext.slice(0, -1)
  call(question, conversation_id, 'assistant', { temperature: 0.7, messages: contextMessages }, onTokenStream).then(async (content) => {
    // CRITICAL: Convert LLM content to string before Message.format
    const ResponseValidator = require('@src/utils/responseValidator');
    if (typeof content !== 'string') {
      console.error('[Chat] LLM Content is not a string:', typeof content, content);
      content = ResponseValidator.intelligentStringConversion(content);
    }
    const assistant_msg = Message.format({
      role: 'assistant',
      status: 'success',
      content: content,
      action_type: 'chat',
      task_id: conversation_id,
      type: 'chat',
      pid: message.id,
      is_active: true
    });
    let new_message = await Message.saveToDB(assistant_msg, conversation_id);

    onCompleted(new_message.id, message.id);

    await Conversation.update({ status: 'done' }, { where: { conversation_id } })
  }).catch(async (error) => {
    // CRITICAL: Convert error.message to string before Message.format
    const ResponseValidator = require('@src/utils/responseValidator');
    let content = ResponseValidator.intelligentStringConversion(error.message || error || 'An error occurred');
    const assistant_msg = Message.format({
      role: 'assistant',
      status: 'success',
      content: content,
      action_type: 'chat',
      task_id: conversation_id,
      type: 'chat',
      pid: message.id,
      is_active: true
    });
    let new_message = await Message.saveToDB(assistant_msg, conversation_id);

    onCompleted(new_message.id, message.id);

    await Conversation.update({ status: 'done' }, { where: { conversation_id } })
  }).finally(() => {
    activeChatAbortControllers.delete(conversation_id);
  })




  ctx.body = stream;
  ctx.status = 200;
});

// 回答切换
router.post("/change", async (ctx, next) => {
  const { request, response } = ctx;
  const body = request.body || {};
  const user_id = ctx.state.user.id
  let { conversation_id, pid, old_message_id, new_message_id } = body;

  // 1. 查找所有 assistant 消息，筛选 meta.pid 相同的，设为 false
  const messages = await MessageTable.findAll({
    where: {
      conversation_id: conversation_id,
    }
  });
  for (const msg of messages) {
    let meta = msg.get('meta');
    if (typeof meta === 'string') meta = JSON.parse(meta);
    meta = meta || {};
    if (meta.pid === pid) {
      meta.is_active = false;
      await MessageTable.update({ meta: JSON.stringify(meta) }, { where: { id: msg.get('id') } });
    }
  }

  // 2. 设定 new_message_id 的 is_active 为 true
  const targetMsg = await MessageTable.findOne({ where: { id: new_message_id } });
  if (targetMsg) {
    let meta = targetMsg.get('meta');
    if (typeof meta === 'string') meta = JSON.parse(meta);
    meta = meta || {};
    meta.is_active = true;
    await MessageTable.update({ meta }, { where: { id: new_message_id } });
  }

  ctx.body = { success: true };
  ctx.status = 200;
})

// 停止回答
router.post("/stop_chat", async (ctx, next) => {
  const { conversation_id } = ctx.request.body || {};
  if (!conversation_id) {
    ctx.body = { success: false, message: "conversation_id is required" };
    ctx.status = 400;
    return;
  }
  const controller = activeChatAbortControllers.get(conversation_id);
  if (controller) {
    controller.abort();
    activeChatAbortControllers.delete(conversation_id);
    ctx.body = { success: true, message: "Chat stopped" };
    ctx.status = 200;
  } else {
    ctx.body = { success: false, message: "No active chat for this conversation_id" };
    ctx.status = 404;
  }
});

// 获取从根到pid的消息链，且总token不超过128k，从最新往旧累加
function getMessagesContext(messages, pid) {
  const idMap = {};
  messages.forEach(msg => {
    idMap[msg.id] = msg;
  });

  // 回溯链路，先收集完整链路
  const context = [];
  let cur = idMap[pid];
  const visited = new Set();
  while (cur) {
    if (visited.has(cur.id)) break; // 防止自环
    visited.add(cur.id);

    context.unshift(cur); // 先unshift，最后是从旧到新
    const meta = typeof cur.meta === 'string' ? JSON.parse(cur.meta) : cur.meta;
    if (!meta || meta.pid === undefined || meta.pid === -1) break;
    cur = idMap[meta.pid];
  }

  // 反转为从新到旧
  const reversed = context.slice().reverse();

  // 累加token，超过128k就丢弃更旧的
  let totalTokens = 0;
  const limited = [];
  for (const msg of reversed) {
    const tokens = calcToken(msg.content || "");
    if (totalTokens + tokens > 131072) break;
    limited.push(msg);
    totalTokens += tokens;
  }

  // 再反转回来，保持从旧到新
  const finalContext = limited.reverse();

  // 转换为 openai 标准格式
  return finalContext.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}


//根据pid 获取message
function getMessageByPid(messages, pid) {
  return messages.find(msg => msg.id === pid);
}

module.exports = exports = router.routes();