import sse from '@/services/sse';
import fileServices from '@/services/files';
import { useChatStore } from '@/store/modules/chat';
import messageFun from './message';
import userService from '@/services/auth'
import emitter from '@/utils/emitter';

import { storeToRefs } from 'pinia';
import { useUserStore } from '@/store/modules/user.js'
const userStore = useUserStore();
const { user, membership, points } = storeToRefs(userStore);
import { v4 as uuid } from 'uuid';
import i18n from '@/locals';


async function getUserInfo() {
    //is_subscribe
    const model_info = localStorage.getItem('model_info');
    if (model_info) {
        const model = JSON.parse(model_info);
        if (!model.is_subscribe) {
            return;
        }
    }
    let res = await userService.getUserInfo();
    membership.value = res.membership;
    points.value = res.points;
}

const chatStore = useChatStore();
const { chatInfo, messages, mode, model_id, agent } = storeToRefs(chatStore)
const fileConversationId = async (files, conversation_id) => {
    //putFile
    files.forEach(async (file) => {
        await fileServices.putFile(file.id, conversation_id)
    });
};

const onOpenStream = (pending) => {
    pending = true;
};

const throttledScrollToBottom = () => {
    // throttledScrollToBottom function
};

let pending = false;

let lastFinishSummaryReloadByConversation = {};

async function sendMessage(question, conversationId, files, mcp_server_ids = [], workMode = "auto") {
    // Abort any existing SSE connection before starting new one
    if (chatStore.abortController && typeof chatStore.abortController.abort === 'function') {
        console.log('[SSE] Aborting previous SSE connection');
        chatStore.abortController.abort();
    }
    const abortController = new AbortController();
    chatStore.abortController = abortController; // ← Store it globally
    let fileIds = [];
    if (files && files.length > 0) {
        fileIds = files.map(file => file.id);
        // Modify files to include filepath
        files = files.map(file => {
            const filepath = `${file.workspace_dir}/Conversation_${conversationId.slice(0, 6)}/upload/${file.name}`;
            const filename = file.name;
            return { ...file, filepath, filename };
        });
        // Log updated files
        await fileConversationId(files, conversationId)
    }
    let chat = chatStore.list.find((c) => c.conversation_id == conversationId);
    if (chat) {
        chat.status = 'running';
    }
    chatStore.handleInitMessage(question, files);
    // HARDCODED: Always use relative URL to ensure proper proxy routing
    let baseURL = ""
    let uri = `${baseURL}/api/agent/run`;
    // if (mode.value === 'chat') {
    //     uri = `${baseURL}/api/agent/chat`;
    // }
    let options = {
        question: question,
        conversation_id: conversationId,
        fileIds,
        newlyUploadedFileIds: fileIds, // Mark all files as newly uploaded to bypass cache
        mcp_server_ids,
        agent_id: agent.value.id,
        model_id: model_id.value,
        mode: workMode
    };
    
    console.log('[see-agent] Sending request with options:', {
        question: question,
        conversationId,
        fileCount: fileIds.length,
        newlyUploadedFileIds: fileIds,
        agentId: agent.value.id,
        modelId: model_id.value,
        mode: workMode
    });

    // Log mode and chatInfo values

    // if (mode.value == 'chat') {
    //     // add pid
    //     options.pid = chatInfo.value.pid;
    //     // the pid is the user?
    //     var userKey = updateChat(question, 'user', options.pid)
    //     var assistantKey = updateChat('', 'assistant', userKey)
    //     chatInfo.value.cursorKey = assistantKey // update cursor
    // }
    let pending = false;
    let currentMode = null;

    const onTokenStream = (answer, ch, conversationId) => {
        let chat = chatStore.list.find((c) => c.conversation_id == conversationId);
        if (chat && chat.status === 'done') {
            return;
        }

        const currentConversationId = chatStore.conversationId
        // Process token stream

        if (ch.startsWith('__lemon_mode__')) {
            try {
                const modeStr = ch.substring('__lemon_mode__'.length);
                const modeData = JSON.parse(modeStr);
                currentMode = modeData.mode;
                // Stream mode detected

                const lastTempAssistantIndex = chatStore.messages.findLastIndex(
                    msg => msg.role === 'assistant' && msg.is_temp === true
                );
                // Found last temp assistant index
                if (lastTempAssistantIndex !== -1) {
                    const lastTempMessage = chatStore.messages[lastTempAssistantIndex];
                    if (currentMode == "chat") {
                        lastTempMessage.meta = { "action_type": "chat" };
                        lastTempMessage.content = "";
                    } else {
                        lastTempMessage.content = i18n.global.t('lemon.message.botInitialResponse');
                    }
                } else {
                    // No temp assistant message found, creating a new one
                    if (currentMode == "chat") {
                        const bot_message = {
                            content: "",
                            role: 'assistant',
                            meta: { "action_type": "chat" },
                            is_temp: true,
                        }
                        chatStore.messages.push(bot_message);
                    } else {
                        const bot_message = {
                            content: i18n.global.t('lemon.message.botInitialResponse'),
                            role: 'assistant',
                            is_temp: true,
                        }
                        chatStore.messages.push(bot_message);
                    }
                }
                return;
            } catch (e) {
                // Failed to parse mode data
                return;
            }
        }

        if (currentMode === 'chat') {
            // Handle structured messages (progress, auto_reply) in chat mode
            if (ch && ch.startsWith('{') && ch.endsWith('}')) {
                try {
                    const obj = JSON.parse(ch);
                    // Handle progress messages
                    if (obj && obj.meta && obj.meta.action_type === 'progress' && typeof obj.content === 'string') {
                        const messages = chatStore.messages;
                        if (messages.length > 0) {
                            const lastMessage = messages[messages.length - 1];
                            if (lastMessage && lastMessage.role === 'assistant' && lastMessage.is_temp === true) {
                                lastMessage.content = obj.content;
                                return;
                            }
                        }
                    }
                    // Handle auto_reply messages (memory save, etc) as complete messages
                    if (obj && obj.meta && obj.meta.action_type === 'auto_reply' && typeof obj.content === 'string') {
                        const messages = chatStore.messages;
                        const tempIndex = messages.findLastIndex(msg => msg.role === 'assistant' && msg.is_temp === true);
                        if (tempIndex !== -1) {
                            // Replace temp message with complete auto_reply
                            messages[tempIndex] = {
                                ...obj,
                                is_temp: false,
                                timestamp: new Date().getTime()
                            };
                            chatStore.scrollToBottom();
                            return;
                        }
                    }
                } catch (e) {
                    // fall through to normal token append
                }
            }

            updateChatToken(ch, conversationId);
        } else if (currentMode === 'agent') {
            if (ch && ch.startsWith('{') && ch.endsWith('}')) {
                if (currentConversationId === conversationId) {
                    update(ch, conversationId);
                }
            }
        }
    }

    const answer = '';

    // Increment user message count for smart title generation
    chatStore.incrementUserMessageCount();

    sse(uri, options, onTokenStream, onOpenStream(pending), answer, throttledScrollToBottom, abortController, conversationId).then((res) => {
        return res;
    }).catch((error) => {
        // Handle error
        return '';
    }).finally(() => {
        const conversation = chatStore.list.find((c) => c.conversation_id == conversationId);
        if (conversation) {
            conversation.status = 'done';
        }
        if (localStorage.getItem('access_token')) {
            getUserInfo();
        }
        emitter.emit("coding-message-sent", { conversationId });
    });

}


function update(ch, conversationId) {
    let json;
    try {
        json = JSON.parse(ch);
    } catch (e) {
        // Failed to parse JSON
        return;
    }
    // Process parsed JSON data

    const messages = chatStore.messages;
    const tempMessageIndex = findTemporaryAssistantMessage(messages);

    if (tempMessageIndex !== -1) {
        messages.splice(tempMessageIndex, 1);
    }
    // messages.push(json);
    messageFun.handleMessage(json, messages);

    // CRITICAL: Some finish_summery deliveries are persisted but not reflected in the live UI
    // (user sees files only after refresh). To make deliveries reliable, refresh the conversation
    // once after a successful finish_summery arrives.
    try {
        if (json?.meta?.action_type === 'finish_summery' && (json.status === 'success' || json.status === 'completed')) {
            const now = Date.now();
            const last = lastFinishSummaryReloadByConversation[conversationId] || 0;
            if (now - last > 1500) {
                lastFinishSummaryReloadByConversation[conversationId] = now;
                setTimeout(() => {
                    if (chatStore.conversationId === conversationId) {
                        chatStore.initConversation(conversationId);
                    }
                }, 300);
            }
        }
    } catch (e) {
        // best-effort
    }

    if (json.meta && typeof json.meta === 'string') {
        json.meta = JSON.parse(message.meta);
    }
    chatStore.scrollToBottom()
}
function updateChatToken(token, conversationId) {
    const currentConversationId = chatStore.conversationId;
    if (currentConversationId !== conversationId) {
        // Conversation ID mismatch
        return;
    }

    const conversation = chatStore.list.find(item => item.conversation_id === conversationId);
    if (conversation && (conversation.status === 'done' || conversation.status === 'stop')) {
        // Conversation is done, skipping token update
        return;
    }

    const messages = chatStore.messages;
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        
        // CRITICAL: Filter backend control markers from UI
        if (token.includes('__lemon_out_end__')) {
            lastMessage.is_temp = false;
            // Don't append the marker to content - it's a control signal
            return;
        }
        
        if (lastMessage) {
            lastMessage.content = (lastMessage.content || '') + token;
        }
    }
    chatStore.scrollToBottom();
}
function updateChat(question, role, pid) {
    let userKey = uuid()
    if (pid == -1) {
        chatInfo.value.msgList.push({
            id: userKey,
            role: role,
            content: question,
            status: "success",
            meta: JSON.stringify({
                pid: -1,
                is_active: true
            })
        })
    } else {
        chatInfo.value.msgList.push({
            id: userKey,
            role: role,
            content: question,
            status: "success",
            meta: JSON.stringify({
                pid: pid,
                is_active: true
            })
        })
    }
    return userKey
}
function updateUserAndAssistantMessage(ch, userKey, assistantKey) {
    //__lemon_out_end__{"message_id":4985}

    try {
        const match = ch.match(/__lemon_out_end__\{"message_id":"(\d+)","pid":"(\d+)"\}/);
        if (!match) {
            throw new Error("Invalid message format");
        }

        const jsonParse = {
            uid: parseInt(match[1]),
            pid: parseInt(match[2])
        };


        const userIndex = chatInfo.value.msgList.findIndex(item => item.id === userKey);
        const assistantIndex = chatInfo.value.msgList.findIndex(item => item.id === assistantKey);

        if (userIndex === -1 || assistantIndex === -1) {
            // User or Assistant message not found in msgList
            return;
        }
        chatInfo.value.msgList[userIndex].id = jsonParse.pid;
        chatInfo.value.msgList[assistantIndex].id = jsonParse.uid;
        chatInfo.value.msgList[assistantIndex].meta = JSON.stringify({ pid: jsonParse.pid, is_active: true });
        chatInfo.value.cursorKey = ''; // reset cursor key
        chatInfo.value.pid = jsonParse.uid;
    } catch (error) {
        // Failed to parse message or update messages
    }
}

function findTemporaryAssistantMessage(messages) {
    return messages.findIndex(message => message.is_temp === true && message.role === 'assistant');
}



export default {
    sendMessage
};
