const TYPE_ENUM = {
  SSE: 'SSE',
  STREAM: 'STREAM'
}

const axios = require('axios');

class LLM {

  constructor(onTokenStream = (chunk) => { }, model = '', options = {}) {
    this.onTokenStream = onTokenStream;
    // 设置默认接口处理逻辑
    this.responseType = TYPE_ENUM.SSE;
    this.splitter = '\n'  // OpenRouter uses single newline, not double
    if (model) { this.model = model }
    this.options = options;
  }

  /**
   * 提问大模型 && 记录日志
   * 依赖 start 实现提问逻辑
   * @param {*} prompt 
   * @param {*} context 
   * @param {*} options 
   * @returns 
   */
  async completion(prompt, context = {}, options = {}) {
    // 发起调用
    const content = await this.start(prompt, context, options);
    return content;
  }

  /**
   * 发起请求并对返回流式数据进行处理
   * 若非 SSE 标准处理逻辑, 覆盖 start 的实现
   * @param {*} prompt 
   */
  async start(prompt, context = {}, options = {}) {
    // 发起调用
    const response = await this.call(prompt, context, options);
    // 处理SSE
    if (this.responseType === TYPE_ENUM.SSE) {
      const content = await this.handleSSE(response)
      return content;
    }
    return ""
  }

  async message(messages = [], options = {}) {
    // CRITICAL: Inject MASTER_SYSTEM_PROMPT as SYSTEM role message
    const { MASTER_SYSTEM_PROMPT } = require('@src/agent/prompt/MASTER_SYSTEM_PROMPT');
    
    // Only add system message if not already present
    if (messages.length === 0 || messages[0].role !== 'system') {
      messages.unshift({ "role": "system", "content": MASTER_SYSTEM_PROMPT });
    }
    
    const response = await this.request(messages, options);
    // 处理SSE
    if (this.responseType === TYPE_ENUM.SSE) {
      const content = await this.handleSSE(response)
      return content;
    }
    return ""
  }

  resolveConfigHeaders = (config) => {
    if (this.API_KEY) {
      Object.assign(config.headers, {
        "Authorization": `Bearer ${this.API_KEY}`,
      });
      if (config.url && config.url.indexOf('azure') !== -1) {
        Object.assign(config.headers, {
          "api-key": this.API_KEY
        });
      }
      if (config.url && config.url.indexOf('baidu') !== -1) {
        Object.assign(config.headers, { "appid": this.appid });
      }
    }
  }

  async request(messages = [], options = {}) {
    const model = options.model || this.model;

    const body = {
      model,
      messages,
      stream: true,
      // Speed optimizations for faster responses
      temperature: 0.7, // Slightly lower for faster, more focused responses
      top_p: 0.9, // Reduce diversity for faster generation
    }

    /**
     * Supported options
     * - temperature: Controls the randomness of generated text. Higher values increase randomness, lower values decrease it
     * - top_p: Sampling probability threshold, controls the diversity of generated text. Higher values increase diversity
     * - max_tokens: Maximum length limit for generated text
     * - stop: Stop sequence markers for generation
     * - stream: Whether to enable streaming response
     * - assistant_id: Assistant ID, used to identify specific assistants in multi-turn conversations
     * - response_format: Response format, such as JSON
     * - tools: List of callable tool functions, used for advanced features like function calling
     * - enable_thinking: Whether to enable thinking mode, applicable to Qwen3 model
     */
    const supportOptions = ['temperature', 'top_p', 'max_tokens', 'stop', 'stream', 'assistant_id', 'response_format', 'tools', 'enable_thinking'];
    for (const key in options) {
      if (supportOptions.includes(key) && options[key] !== undefined) {
        // Only add enable_thinking for Qwen models
        if (key === 'enable_thinking' && !model.toLowerCase().includes('qwen')) {
          continue;
        }
        body[key] = options[key]; // User options override defaults
      }
    }

    // COMPAT: OpenAI reasoning-family models (gpt-5*, o1/o3/o4*) called DIRECTLY on
    // api.openai.com reject legacy sampling params with 400:
    //   - max_tokens must be max_completion_tokens
    //   - temperature/top_p only support their defaults
    // OpenRouter translates these itself, so only direct OpenAI calls need the remap.
    const isDirectOpenAI = (this.CHAT_COMPLETION_URL || '').indexOf('api.openai.com') !== -1;
    const isReasoningFamily = /^(gpt-5|o[0-9])/i.test(model || '');
    if (isDirectOpenAI && isReasoningFamily) {
      if (body.max_tokens !== undefined) {
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
      }
      delete body.temperature;
      delete body.top_p;
      // Callers may request low/minimal reasoning for latency-critical calls
      // (e.g. ultra fast-path schema generation). Only applied here so the
      // param never leaks to providers that would reject it.
      if (options.reasoning_effort) {
        body.reasoning_effort = options.reasoning_effort;
      }
    }
    // Log request for debugging 400 errors
    console.log('🔍 [LLM Request]', {
      url: this.CHAT_COMPLETION_URL,
      model: body.model,
      messageCount: body.messages?.length,
      stream: body.stream,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      max_completion_tokens: body.max_completion_tokens,
      reasoning_effort: body.reasoning_effort
    });
    
    const config = {
      url: this.CHAT_COMPLETION_URL,
      method: "post",
      maxBodyLength: Infinity,
      headers: {
        "Content-Type": 'application/json'
      },
      data: body,
      // CRITICAL: Only use stream responseType if streaming is enabled
      responseType: body.stream ? "stream" : "json"
    };

    if (options.signal) {
      config.signal = options.signal;
    }

    if (config.url && config.url.indexOf('openrouter.ai') !== -1) {
      Object.assign(config.headers, {
        "HTTP-Referer": 'https://graceai.ai',
        "X-Title": "GraceAI"
      })
    }
    // console.log('config', config);
    this.resolveConfigHeaders(config);
    // console.log('config', JSON.stringify(config, null, 2));
    
    try {
      const response = await axios.request(config);
      // console.log('response', response);
      return response;
    } catch (err) {
      // Log detailed error for debugging
      // Safe stringify to avoid circular reference errors
      const safeStringify = (obj) => {
        try {
          return JSON.stringify(obj, (key, value) => {
            // Skip circular references and socket objects
            if (value instanceof Object && value.constructor && 
                (value.constructor.name === 'TLSSocket' || value.constructor.name === 'Socket')) {
              return '[Socket]';
            }
            return value;
          }).substring(0, 500);
        } catch (e) {
          return String(obj).substring(0, 500);
        }
      };

      const safeRequestPreview = () => {
        try {
          // Avoid dumping full prompts; keep a small preview for debugging 400s
          if (!config || !('data' in config)) return undefined;
          const raw = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
          return raw ? raw.substring(0, 800) : undefined;
        } catch (e) {
          return undefined;
        }
      };

      const responseData = err.response?.data;
      const responseDataPreview = (responseData && typeof responseData === 'object')
        ? safeStringify(responseData)
        : (typeof responseData === 'string' ? responseData.substring(0, 800) : responseData);

      console.error('❌ [LLM Error]', {
        model: this.model,
        url: config.url,
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorCode: err.code,
        errorMessage: err.message,
        requestDataPreview: safeRequestPreview(),
        responseData: responseDataPreview
      });
      
      // Return structured error object for retry logic
      return {
        isError: true,
        isRetryable: err.response?.status === 429 || err.response?.status >= 500,
        code: err.code || `ERR_${err.response?.status || 'UNKNOWN'}`,
        status: err.response?.status || 'unknown',
        message: err.message,
        data: err.response?.data
      };
    }
  }

  // 发起 HTTP 请求
  async call(prompt = '', context = {}, options = {}) {
    // Reduced logging for cleaner output
    const messages = context.messages || [];
    
    // CRITICAL: Inject contextual MASTER_SYSTEM_PROMPT as SYSTEM role message
    const { getContextualSystemPrompt } = require('@src/agent/prompt/MASTER_SYSTEM_PROMPT');
    
    // Build contextual prompt based on goal if available
    const goal = context.goal || prompt || '';
    const taskType = context.taskType || '';
    const contextualPrompt = getContextualSystemPrompt(goal, taskType);
    
    // Only add system message if not already present.
    // Latency-critical structured calls (ultra fast-path schema generation) can opt out —
    // the ~2K-token identity/capabilities prompt is pure overhead for "return JSON" calls.
    if (!options.skip_system_prompt && (messages.length === 0 || messages[0].role !== 'system')) {
      messages.unshift({ "role": "system", "content": contextualPrompt });
    }

    if (prompt) {
      const massageUser = { "role": "user", "content": prompt };
      messages.push(massageUser);
    }
    // console.log("发起请求.messages", messages);
    return this.request(messages, options);
  }

  resolveRequestMessages(input, context) {

  }

  // 处理流式请求
  /**
   * Suppress <think>…</think> spans from the OUTGOING token stream so reasoning
   * models (DeepSeek/GLM/Qwen via CrofAI etc.) don't leak their thinking into chat.
   * fullContent keeps the tags — internal consumers (planning, code-act) parse them.
   * Handles tags split across stream chunks via a small carry buffer.
   */
  _createThinkStreamFilter(emit) {
    const OPEN_TAG = '<think>';
    const CLOSE_TAG = '</think>';
    let inThink = false;
    let carry = '';
    const push = (chunk) => {
      carry += chunk;
      let out = '';
      while (carry.length > 0) {
        if (!inThink) {
          const idx = carry.indexOf(OPEN_TAG);
          if (idx !== -1) {
            out += carry.slice(0, idx);
            carry = carry.slice(idx + OPEN_TAG.length);
            inThink = true;
            continue;
          }
          // hold back a possible partial '<think>' prefix at the buffer end
          let hold = 0;
          for (let k = Math.min(OPEN_TAG.length - 1, carry.length); k > 0; k--) {
            if (carry.endsWith(OPEN_TAG.slice(0, k))) { hold = k; break; }
          }
          out += carry.slice(0, carry.length - hold);
          carry = carry.slice(carry.length - hold);
          break;
        } else {
          const idx = carry.indexOf(CLOSE_TAG);
          if (idx !== -1) {
            // drop the thought, and eat whitespace immediately after it
            carry = carry.slice(idx + CLOSE_TAG.length).replace(/^\s+/, '');
            inThink = false;
            continue;
          }
          // still inside the thought: discard content, keep only a potential partial closing tag
          carry = carry.slice(-(CLOSE_TAG.length - 1));
          break;
        }
      }
      if (out) emit(out);
    };
    const flush = () => {
      if (!inThink && carry) emit(carry);
      carry = '';
    };
    return { push, flush };
  }

  async handleSSE(response) {
    // Check for structured error object from request()
    if (response.isError) {
      console.error('[LLM handleSSE] Processing error response:', {
        code: response.code,
        status: response.status,
        message: response.message,
        isRetryable: response.isRetryable
      });
      
      // Throw error with details for upstream retry logic
      const error = new Error(`LLM API Error: ${response.message}`);
      error.code = response.code;
      error.status = response.status;
      error.isRetryable = response.isRetryable;
      error.data = response.data;
      throw error;
    }
    
    // Legacy: Check for old-style error object (should not happen with new code)
    if (response.code && !response.data) {
      console.error('[LLM handleSSE] Legacy error object detected:', response.code);
      const error = new Error(`LLM API Error: ${response.code}`);
      error.code = response.code;
      throw error;
    }
    
    // Strip <think>…</think> for anything emitted to the UI stream
    const stripThink = (s) => (s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s+/, '');

    // Handle non-streaming JSON response (when responseType: "json")
    if (response.data && typeof response.data === 'object' && !response.data.on) {
      console.log('[LLM handleSSE] Non-streaming JSON response detected');
      const choices = response.data.choices || [];
      const choice = choices[0] || {};
      if (choice.message && choice.message.content) {
        const content = choice.message.content;
        console.log('[LLM handleSSE] Extracted content:', content.substring(0, 100));
        this.onTokenStream(stripThink(content));
        return content;
      }
      console.error('[LLM handleSSE] No content in non-streaming response');
      return "";
    }

    // 处理流式返回
    let fullContent = "";
    let reasoning = false;
    const thinkFilter = this._createThinkStreamFilter((ch) => this.onTokenStream(ch));
    const fn = new Promise((resolve, reject) => {
      let content = "";
      let isNonStreaming = false;
      
      response.data.on("data", (chunk) => {
        content += chunk;
        
        // Debug: Log first chunk to see format (reduced verbosity)
        if (fullContent === "" && content.length > 0) {
          // Only log first chunk in development mode
          if (process.env.NODE_ENV === 'development') {
            console.log('[LLM Stream] First chunk format:', content.substring(0, 100));
          }
          
          // Detect non-streaming response (single JSON object without "data: " prefix)
          if (!content.startsWith('data:') && content.trim().startsWith('{')) {
            isNonStreaming = true;
            console.log('[LLM Stream] Non-streaming response detected');
          }
        }
        
        // Handle non-streaming response
        if (isNonStreaming) {
          // Wait for complete JSON
          try {
            const jsonResponse = JSON.parse(content);
            const choices = jsonResponse.choices || [];
            const choice = choices[0] || {};
            if (choice.message && choice.message.content) {
              fullContent = choice.message.content;
              console.log('[LLM Stream] Non-streaming content extracted:', fullContent.substring(0, 100));
              this.onTokenStream(stripThink(fullContent));
            }
          } catch (e) {
            // Not complete JSON yet, wait for more chunks
          }
          return;
        }
        
        // Handle streaming response (SSE format)
        const splitter = this.splitter;
        while (content.indexOf(splitter) !== -1) {
          const index = content.indexOf(splitter);
          const message = content.slice(0, index);
          content = content.slice(index + splitter.length);
          const value = this.messageToValue(message);
          if (value.type === "text" || value.type === 'reasoning') {
            let ch = value.text;
            // 处理 reasoning
            if (value.type === 'reasoning' && fullContent === '') {
              ch = '<think>' + ch;
              reasoning = true;
            }
            if (value.type === 'text' && reasoning) {
              ch = '</think>' + ch;
              reasoning = false;
            }
            if (ch) {
              // process.stdout.write(ch);
              fullContent += ch;
              // UI stream gets think-filtered tokens; fullContent keeps the tags
              thinkFilter.push(ch);
            }
          } else { }
        }
      });
      response.data.on("end", () => {
        thinkFilter.flush();
        resolve(fullContent);
      });
      response.data.on("error", (err) => {
        if (err.code === 'ERR_CANCELED' || err.message === 'canceled') {
          console.log('请求被中断');
          resolve(fullContent);
        } else {
          reject(err)
        }

      });

    });

    const content = await fn;
    return content;
  }

  /**
   * 标准 chat/completions message 处理解析逻辑
   * 1. 截取 data: 后并 JSON.parse
   * 2. 读取 json.choices[0].delta.content
   * 
   * 适用服务 openai | minimax | kimi | deepseek | zhipu(智谱) | qwen 开源
   * @param {*} message 
   * @returns { type: 'text', text: '' }
   */
  messageToValue(message) {
    // console.log('message', message);
    
    // Skip SSE comments (lines starting with :) - used by OpenRouter for status updates
    if (message.trim().startsWith(':')) {
      return { type: "text", text: "" };
    }
    
    if (message == "data: [DONE]" || message.startsWith("data: [DONE]")) {
      return { type: "done" };
    }
    let data = message.split("data:")[1];
    let value = {}
    try {
      value = JSON.parse(data)
    } catch (error) {
      return { type: "done" };
    }

    // Capture provider-reported usage — exact tokens beat tiktoken estimates.
    // Consumers read llm.lastUsage after completion (see utils/llm.js).
    if (value.usage) {
      this.lastUsage = value.usage;
    }

    const choices = value.choices || [];
    const choice = choices[0] || {};
    if (Object.keys(choice).length === 0) {
      console.log('[messageToValue] Empty choice object');
      return { type: "text", text: "" }
    }
    
    // Debug: Log what we received
    if (!choice.delta && choice.message) {
      console.log('[messageToValue] Non-streaming response detected:', {
        hasMessage: !!choice.message,
        hasContent: !!choice.message?.content,
        contentLength: choice.message?.content?.length || 0
      });
    }
    // 工具使用处理
    if (choice.delta && choice.delta.tool_calls && choice.delta.tool_calls.length > 0) {
      this.tools = choice.delta.tool_calls;
    }

    // reasoning thinking
    if (choice.delta && choice.delta.reasoning_content) {
      return { type: "reasoning", text: choice.delta.reasoning_content };
    }

    // Handle streaming response (delta.content)
    if (choice.delta && choice.delta.content) {
      return { type: "text", text: choice.delta.content };
    }
    
    // Handle non-streaming response (message.content)
    if (choice.message && choice.message.content) {
      return { type: "text", text: choice.message.content };
    }
    
    // FIX 2: Handle reasoning models (GLM-4.6) that return reasoning instead of content
    if (choice.message && choice.message.reasoning) {
      return { type: "text", text: choice.message.reasoning };
    }
    
    return {};
  }
}

module.exports = exports = LLM;