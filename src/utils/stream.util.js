const { PassThrough } = require("stream");
const { v4: uuidv4 } = require("uuid");

const handleStream = (responseType = 'sse', response, debug = true) => {
  const stream = new PassThrough();
  let onTokenStream = new Function();
  
  // Get raw response for direct writes (bypasses Koa buffering)
  // response.res is the raw Node.js http.ServerResponse
  const rawRes = response.res;
  let headersWritten = false;

  if (responseType === "openai-sse") {
    // 设置响应头 response
    response.type = "text/event-stream";
    response.set("Cache-Control", "no-cache");
    response.set("Connection", "keep-alive");
    onTokenStream = (token, model = "gpt") => {
      debug && process.stdout.write(token);
      if (typeof token === "object") {
        token = JSON.stringify(token);
      }
      const encoded = JSON.stringify({
        id: uuidv4(),
        object: "chat.completion.chunk",
        created: parseInt((Date.now() / 1000).toFixed(0)),
        model: model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: token },
            finish_reason: null,
          }
        ]
      });
      stream.write(`data: ${encoded}\n\n`);
    };
  }

  if (responseType === 'sse') {
    // 设置响应头 response
    response.type = "text/event-stream";
    response.set("Cache-Control", "no-cache, no-transform");
    response.set("Connection", "keep-alive");
    response.set("X-Accel-Buffering", "no"); // Disable nginx/proxy buffering
    response.set("Content-Encoding", "identity"); // Disable compression buffering
    
    onTokenStream = (token) => {
      if (typeof token === 'object') {
        token = JSON.stringify(token);
        debug && process.stdout.write(token);
      }
      const encoded = Buffer.from(token).toString("base64");
      const chunk = `event: message\ndata: ${encoded}\n\n`;
      
      // Write directly to raw response for immediate flush (preferred path)
      if (rawRes && !rawRes.writableEnded) {
        try {
          // Flush headers on first write if not already sent
          if (!headersWritten && !rawRes.headersSent) {
            rawRes.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
              'X-Accel-Buffering': 'no',
              'Content-Encoding': 'identity'
            });
            headersWritten = true;
          }
          rawRes.write(chunk);
        } catch (e) {
          // Ignore write errors on closed connections
          // Fallback to PassThrough stream
          stream.write(chunk);
        }
      } else {
        // Fallback to PassThrough stream if raw response not available
        stream.write(chunk);
      }
    };
  }

  if (responseType === 'stream') {
    // 设置响应头
    response.set("Content-Type", "text/plain");
    response.set("Transfer-Encoding", "chunked");
    onTokenStream = (token) => {
      stream.write(token);
    };
  }

  return { stream, onTokenStream };
}

module.exports = exports = handleStream