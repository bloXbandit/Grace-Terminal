const BaseLLM = require('./llm.base')
const axios = require('axios')

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

class OpenAILLM extends BaseLLM {
  constructor(onTokenStream) {
    super(onTokenStream);
    this.CHAT_COMPLETION_URL = `${OPENAI_BASE_URL}/chat/completions`;
    this.splitter = "\n";
  }

  async request(prompt, context, options = {}) {
    const {
      model = "gpt-4o-mini",
      temperature = 0.7,
      max_tokens = 4000,
      stream = false,
      messages = []
    } = options;

    const massageUser = [{ "role": "user", "content": prompt }];
    
    const config = {
      url: this.CHAT_COMPLETION_URL,
      method: "post",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": 'application/json'
      },
      data: {
        model,
        messages: messages.concat(massageUser),
        temperature,
        max_tokens,
        stream
      },
      timeout: 300000 // 5 minutes
    };

    console.log('config', JSON.stringify(config, null, 2))
    
    if (stream) {
      config.responseType = "stream"
    }

    try {
      const response = await axios(config);
      return response;
    } catch (err) {
      console.error('❌ [OpenAI Error]', {
        model: model,
        url: config.url,
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorCode: err.code,
        errorMessage: err.message,
        responseData: err.response?.data
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

  messageToValue(message) {
    try {
      const value = JSON.parse(message.split("data:")[1]);
      const choices = value.choices || [];
      const choice = choices[0] || {};
      
      if (Object.keys(choice).length === 0) {
        return { type: "text", text: "" }
      }

      // Handle streaming response (delta.content)
      if (choice.delta && choice.delta.content) {
        return { type: "text", text: choice.delta.content };
      }
      
      // Handle non-streaming response (message.content)
      if (choice.message && choice.message.content) {
        return { type: "text", text: choice.message.content };
      }
      
      return {};
    } catch (error) {
      return { type: "text", text: "" }
    }
  }
}

module.exports = exports = OpenAILLM;
