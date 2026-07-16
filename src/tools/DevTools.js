/**
 * DevTools — live browser with Chrome DevTools superpowers, surfaced as a native
 * Grace action. Under the hood it speaks MCP to Google's chrome-devtools-mcp
 * server (spawned on demand via the existing src/mcp client, stdio transport).
 *
 * What this unlocks beyond the sandbox `browser` action:
 *   - list_console_messages → read JS errors on pages Grace generated (self-heal!)
 *   - list_network_requests → see failed API calls
 *   - evaluate_script       → poke the live DOM
 *   - navigate/screenshot/snapshot/click/fill → standard live-web interaction
 *
 * Requirements (baked into grace-app image): chromium + chrome-devtools-mcp npm pkg.
 */
const path = require('path');

const CHROMIUM_PATH = process.env.CHROME_PATH || '/usr/bin/chromium';

// Server definition consumed by src/mcp/client.js (stdio transport)
const SERVER_DEF = {
  id: 'chrome-devtools',
  name: 'chrome-devtools',
  type: 'stdio',
  command: 'node',
  args: [
    path.join(__dirname, '../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
    '--headless',
    '--isolated',
    '--executablePath', CHROMIUM_PATH,
    // Container runs as root — Chromium requires --no-sandbox there
    '--chromeArg=--no-sandbox',
    '--chromeArg=--disable-dev-shm-usage'
  ],
  // NOTE: the stdio transport passes ONLY this env to the child (no inherit) —
  // without PATH/HOME the spawn dies instantly with "Connection closed".
  env: {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME || '/root'
  },
  timeout: 90
};

let _mcpClient = null;
let _toolNames = null;

const getMcp = () => {
  if (!_mcpClient) {
    const McpClient = require('@src/mcp/client');
    _mcpClient = typeof McpClient === 'function' ? new McpClient() : McpClient;
  }
  return _mcpClient;
};

const listToolNames = async () => {
  if (_toolNames) return _toolNames;
  const mcp = getMcp();
  const tools = await mcp.listTools(SERVER_DEF);
  _toolNames = (tools || []).map(t => (t.name || '').replace(/^chrome-devtools__/, ''));
  console.log('[DevTools] available operations:', _toolNames.join(', '));
  return _toolNames;
};

/** Map friendly operation names to actual chrome-devtools-mcp tool names. */
const resolveOperation = async (operation) => {
  const names = await listToolNames();
  if (names.includes(operation)) return operation;
  const aliases = {
    navigate: ['navigate_page', 'new_page'],
    goto: ['navigate_page', 'new_page'],
    screenshot: ['take_screenshot'],
    snapshot: ['take_snapshot'],
    console: ['list_console_messages'],
    console_logs: ['list_console_messages'],
    network: ['list_network_requests'],
    evaluate: ['evaluate_script'],
    click: ['click'],
    fill: ['fill', 'fill_form'],
    wait: ['wait_for']
  };
  for (const candidate of (aliases[operation] || [])) {
    if (names.includes(candidate)) return candidate;
  }
  // last resort: substring match
  const fuzzy = names.find(n => n.includes(operation));
  if (fuzzy) return fuzzy;
  throw new Error(`Unknown devtools operation "${operation}". Available: ${names.join(', ')}`);
};

/** @type {import('types/Tool').Tool} */
const DevToolsTool = {
  name: 'devtools',
  description: 'Live Chrome browser with DevTools: navigate pages, take snapshots/screenshots, click, fill, run JS, and read console/network — ideal for verifying and debugging generated websites.',
  params: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: 'One of: navigate, snapshot, screenshot, click, fill, evaluate, console, network, wait — or any raw chrome-devtools-mcp tool name'
      },
      url: { type: 'string', description: 'URL for navigate' },
      uid: { type: 'string', description: 'Element uid from a prior snapshot (for click/fill)' },
      value: { type: 'string', description: 'Text value for fill' },
      script: { type: 'string', description: 'JavaScript for evaluate (a function body or expression)' },
      args: { type: 'string', description: 'Optional raw JSON args passed through to the underlying tool' }
    },
    required: ['operation']
  },
  memorized: true,

  getActionDescription: async ({ operation, url }) => {
    return `🔬 DevTools: ${operation}${url ? ` → ${url}` : ''}`;
  },

  execute: async ({ operation, url, uid, value, script, args, conversation_id = '' }) => {
    try {
      const opName = await resolveOperation((operation || '').trim());

      // Build args: explicit JSON passthrough wins, else map the friendly params
      let toolArgs = {};
      if (args) {
        try { toolArgs = typeof args === 'string' ? JSON.parse(args) : args; } catch { toolArgs = {}; }
      }
      if (url && !toolArgs.url) toolArgs.url = url;
      if (uid && !toolArgs.uid) toolArgs.uid = uid;
      if (value && !toolArgs.value) toolArgs.value = value;
      if (script && !toolArgs.function && !toolArgs.script) {
        // chrome-devtools-mcp evaluate_script expects a `function` parameter
        toolArgs.function = script.trim().startsWith('(') || script.trim().startsWith('function')
          ? script
          : `() => { return ${script}; }`;
      }

      const mcp = getMcp();
      const result = await mcp.callTool({ server: SERVER_DEF, name: opName, args: toolArgs });

      // MCP results: { content: [{type:'text', text}, {type:'image', data}...] }
      let text = '';
      let imageCount = 0;
      for (const item of (result && result.content) || []) {
        if (item.type === 'text') text += item.text + '\n';
        else if (item.type === 'image') imageCount++;
      }
      if (imageCount > 0) text += `\n[${imageCount} screenshot(s) captured]`;
      const trimmed = (text || 'OK (no text output)').slice(0, 8000);

      return {
        status: 'success',
        content: trimmed,
        meta: { action_type: 'devtools', operation: opName }
      };
    } catch (error) {
      console.error('[DevTools] execute failed:', error.message);
      return {
        status: 'failure',
        content: '',
        error: `devtools ${operation} failed: ${error.message}`,
        meta: { action_type: 'devtools' }
      };
    }
  }
};

module.exports = DevToolsTool;
