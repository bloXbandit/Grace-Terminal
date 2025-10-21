const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const isError = (value) => {
  return value instanceof Error;
}

const friendlyContent = `Sorry, there was an error with the request. I am currently unable to answer your question`;

const resolveStatusContent = (status) => {
  return `Sorry, the current request interface ${status} is abnormal, please check the service deployment`
}

const handleError = async (error, onTokenStream) => {
  if (isError(error)) {
    const res = error.response || {}
    // let content = friendlyContent;
    let content = error.message.toString();
    
    // Log detailed error for debugging
    if (res.status) {
      console.error(`❌ [LLM API Error] Status: ${res.status}`);
      if (res.data) {
        console.error(`❌ [LLM API Error] Response:`, JSON.stringify(res.data, null, 2));
      }
      content = resolveStatusContent(res.status);
    }
    
    // Stream error message faster (reduced from 10ms to 0ms delay)
    for (const ch of content) {
      onTokenStream(ch);
      // No delay for faster error display
    }
    return content;
  }
  return null;
}

module.exports = exports = handleError;