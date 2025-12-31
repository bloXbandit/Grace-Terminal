async function checkLlmApiAvailability(baseUrl, apiKey='', model) {
  if (!baseUrl) {
    return { status: false, message: 'Base URL is required.' };
  }
  const isGeminiBaseUrl = typeof baseUrl === 'string' && baseUrl.includes('generativelanguage.googleapis.com');
  const isGeminiModel = typeof model === 'string' && model.toLowerCase().startsWith('gemini');
  const isGemini = isGeminiBaseUrl || isGeminiModel;

  const api_url = isGemini
    ? `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey || '')}`
    : baseUrl + '/chat/completions'
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(api_url, {
      method: 'POST',
      headers: isGemini
        ? {
          'Content-Type': 'application/json'
        }
        : {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}` // API key is usually passed as Bearer
        },
      body: JSON.stringify(
        isGemini
          ? {
            contents: [{
              parts: [{ text: 'hello' }]
            }]
          }
          : {
            // This is a simple example request body for the OpenAI Chat Completion API
            // **Important: Adjust according to your actual LLM API documentation**
            model: model, // Replace with the model name you are testing
            messages: [{
              role: "user",
              content: "hello" // A simple request content for testing
            }],
            // Use max_completion_tokens for newer models (gpt-5, o1, o3), max_tokens for older
            ...(model && /^(gpt-5|o1|o3)/i.test(model)
              ? { max_completion_tokens: 16 }
              : { max_tokens: 16 })
          }
      ),
      signal: controller.signal
    });

    if (response.ok) { // HTTP status code in the 200-299 range
      const data = await response.json();
      // Further check the response data, e.g., whether expected fields or error info exist
      // Different LLM API responses may vary, adjust as needed
      if (!isGemini && data && data.choices && data.choices.length > 0) {
        return { status: true, message: 'LLM API call succeeded.' };
      }
      if (isGemini && data && Array.isArray(data.candidates) && data.candidates.length > 0) {
        return { status: true, message: 'LLM API call succeeded.' };
      }
      return { status: false, message: 'LLM API call succeeded, but response data is not as expected.' };
    }

    const errorText = await response.text();
    return { status: false, message: `LLM API call failed, HTTP status: ${response.status}, error: ${errorText}` };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { status: false, message: `LLM API call timed out: ${error.message}` };
    } else {
      return { status: false, message: `Network or other error occurred during LLM API call: ${error.message}` };
    }
  }
}

module.exports = exports = checkLlmApiAvailability;