/**
 * Telegram bridge — Grace in your pocket.
 *
 * Long-polling (no public IP, port-forwarding, or webhook needed): the bridge
 * pulls updates from api.telegram.org, forwards each message to Grace's
 * /api/agent/run, then sends the reply — and any generated files — back to the chat.
 *
 * Setup:
 *   1. Create a bot with @BotFather → get the token
 *   2. .env:  TELEGRAM_BOT_TOKEN=123456:ABC...
 *             TELEGRAM_ALLOWED_CHAT_IDS=<your chat id>   (comma-separated; empty = first
 *             chat to message the bot gets pinned and printed to logs)
 *   3. Recreate grace-app (env loads at container creation)
 *
 * Security: only allowed chat IDs are served. If the allowlist is empty, the FIRST
 * chat to message the bot is auto-pinned (logged loudly) — lock it in .env afterwards.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const GRACE_URL = process.env.TELEGRAM_GRACE_URL || 'http://localhost:5005';
const POLL_TIMEOUT_S = 50; // Telegram long-poll window
const RUN_TIMEOUT_MS = parseInt(process.env.TELEGRAM_RUN_TIMEOUT_MS || '300000', 10);

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let allowedChatIds = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
);
let autoPinnedChatId = null;

// One Grace conversation per Telegram chat (continuity across messages)
const chatConversations = new Map();

const tg = async (method, data) => {
  const res = await axios.post(`${API}/${method}`, data, { timeout: 65000, validateStatus: () => true });
  if (!res.data || !res.data.ok) {
    console.warn(`[Telegram] ${method} failed:`, res.data && res.data.description);
  }
  return res.data;
};

const sendText = async (chat_id, text) => {
  // Telegram caps messages at 4096 chars
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks.slice(0, 5)) {
    await tg('sendMessage', { chat_id, text: chunk });
  }
};

const sendDocument = async (chat_id, filepath) => {
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('chat_id', String(chat_id));
    form.append('document', fs.createReadStream(filepath), path.basename(filepath));
    const res = await axios.post(`${API}/sendDocument`, form, {
      headers: form.getHeaders(), timeout: 120000, maxBodyLength: Infinity, validateStatus: () => true
    });
    return res.data && res.data.ok;
  } catch (e) {
    console.warn('[Telegram] sendDocument failed:', e.message);
    return false;
  }
};

const isAllowed = (chatId) => {
  const id = String(chatId);
  if (allowedChatIds.size > 0) return allowedChatIds.has(id);
  if (autoPinnedChatId === null) {
    autoPinnedChatId = id;
    console.warn(`[Telegram] ⚠️ No TELEGRAM_ALLOWED_CHAT_IDS set — auto-pinned first chat: ${id}. Add TELEGRAM_ALLOWED_CHAT_IDS=${id} to .env to lock this in.`);
  }
  return autoPinnedChatId === id;
};

/** Run a message through Grace and collect the reply + generated files. */
const runThroughGrace = async (chatId, text) => {
  let conversation_id = chatConversations.get(chatId);
  if (!conversation_id) {
    conversation_id = uuidv4();
    chatConversations.set(chatId, conversation_id);
  }

  const collected = { summary: '', chats: [], files: new Map(), rawContent: '' };

  const res = await axios.post(`${GRACE_URL}/api/agent/run`, {
    conversation_id, question: text, mode: 'auto', source: 'telegram'
  }, { responseType: 'stream', timeout: RUN_TIMEOUT_MS });

  await new Promise((resolvePromise) => {
    let buffer = '';
    const finish = () => resolvePromise();
    res.data.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;
        const payload = dataLine.slice(6).trim();
        let text2 = payload;
        // SSE frames are base64-encoded JSON in Grace's protocol
        try { text2 = Buffer.from(payload, 'base64').toString('utf8'); } catch { /* raw */ }
        try {
          const obj = JSON.parse(text2);
          const at = obj.meta && obj.meta.action_type;
          if (at === 'finish_summery' && obj.content) {
            collected.summary = obj.content;
            const files = (obj.meta && obj.meta.json) || [];
            for (const f of files) {
              if (f && f.filepath) collected.files.set(f.filepath, f);
            }
          } else if ((at === 'chat' || at === 'auto_reply') && obj.content) {
            collected.chats.push(obj.content);
          } else if (obj.meta && obj.meta.filepath) {
            collected.files.set(obj.meta.filepath, { filepath: obj.meta.filepath });
          } else if (obj.role === 'assistant' && obj.content && !at) {
            // Capture raw streamed chat responses (no action_type wrapper)
            collected.rawContent += obj.content;
          }
        } catch { 
          // Not JSON - might be raw text token, collect it
          if (text2 && !text2.startsWith('__lemon_')) {
            collected.rawContent += text2;
          }
        }
      }
    });
    res.data.on('end', finish);
    res.data.on('error', finish);
  });

  return collected;
};

const handleMessage = async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) return;

  if (!isAllowed(chatId)) {
    console.warn(`[Telegram] Rejected message from unauthorized chat ${chatId}`);
    return;
  }

  if (text === '/start') {
    await sendText(chatId, "👋 Hey! I'm Grace. Ask me anything or tell me to make documents, spreadsheets, code — files come right back here.\n\n/new starts a fresh conversation.");
    return;
  }
  if (text === '/new') {
    chatConversations.delete(chatId);
    await sendText(chatId, '🆕 Fresh conversation started.');
    return;
  }

  await tg('sendChatAction', { chat_id: chatId, action: 'typing' });
  console.log(`[Telegram] chat ${chatId} → "${text.slice(0, 80)}"`);

  try {
    const result = await runThroughGrace(chatId, text);
    const reply = result.summary || result.chats.join('\n\n') || result.rawContent.trim() || '✅ Done.';
    await sendText(chatId, reply);

    // Deliver generated files as Telegram documents (skip scripts/temp)
    for (const [filepath] of result.files) {
      const base = path.basename(filepath);
      if (/^(temp_script_|create_doc_|create_excel_|create_pdf_|nohup)/.test(base)) continue;
      if (fs.existsSync(filepath)) {
        await sendDocument(chatId, filepath);
      }
    }
  } catch (e) {
    console.error('[Telegram] run failed:', e.message);
    await sendText(chatId, `⚠️ Something went wrong: ${e.message}`);
  }
};

const startTelegramBridge = async () => {
  if (!BOT_TOKEN) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN not set — bridge disabled');
    return;
  }
  const me = await tg('getMe', {});
  if (!me || !me.ok) {
    console.error('[Telegram] Invalid bot token — bridge disabled');
    return;
  }
  console.log(`[Telegram] ✅ Bridge online as @${me.result.username} (long-polling)`);

  let offset = 0;
  const poll = async () => {
    try {
      const res = await axios.get(`${API}/getUpdates`, {
        params: { offset, timeout: POLL_TIMEOUT_S, allowed_updates: JSON.stringify(['message']) },
        timeout: (POLL_TIMEOUT_S + 10) * 1000
      });
      const updates = (res.data && res.data.result) || [];
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) {
          // fire-and-forget so one long task doesn't block new messages
          handleMessage(u.message).catch(e => console.error('[Telegram] handler error:', e.message));
        }
      }
    } catch (e) {
      console.warn('[Telegram] poll error (retrying in 5s):', e.message);
      await new Promise(r => setTimeout(r, 5000));
    }
    setImmediate(poll);
  };
  poll();
};

module.exports = { startTelegramBridge };
