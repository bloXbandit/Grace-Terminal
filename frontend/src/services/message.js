import { v4 as uuid } from 'uuid';
import { nextTick } from 'vue';
import i18n from '@/locals';

let messageStatus = "running";
const PROGRESS_ACTIONS = new Set(['progress', 'coding']);

const normalizeContent = (content) => {
    if (Array.isArray(content)) {
        return content
            .filter(item => item !== undefined && item !== null)
            .join('\n')
            .trim();
    }
    if (typeof content === 'string') {
        return content;
    }
    if (content && typeof content === 'object') {
        try {
            return JSON.stringify(content, null, 2);
        } catch (err) {
            console.warn('[handleMessage] Failed to stringify content object', err);
            return '';
        }
    }
    return '';
};

const isSandboxTraceback = (message) => {
    if (!message) return false;
    if (message.role !== 'system') return false;
    if (!PROGRESS_ACTIONS.has(message.meta?.action_type)) return false;
    const content = typeof message.content === 'string' ? message.content : '';
    return content.includes('Traceback (most recent call last)');
};

// 处理消息
function handleMessage(message, messages) {
    if (message.meta && typeof message.meta === 'string') {
        message.meta = JSON.parse(message.meta);
    }

    message.content = normalizeContent(message.content);

    if(message.meta.action_type == ""){
        return
    }

    if (!message.meta || !message.meta.action_type) {
        return messages.push(message);
    }

    if (isSandboxTraceback(message)) {
        console.warn('[handleMessage] Masking sandbox traceback message', message.content);
        return;
    }

    const { action_type } = message.meta;
    console.log("handleMessage", message)
    if (messageStatus == "stop" && action_type != "question" && action_type != "auto_reply") {
        return
    }

    switch (action_type) {
        case "chat":
            return handleChatMessage(message, messages);
        case "auto_reply":
            messageStatus = "running"
            return handleAutoReply(message, messages);
        case "plan":
            return handlePlan(message, messages);
        case "question":
            messageStatus = "running"
            return handleQuestion(message, messages);
        case "finish_summery":
        case 'progress':
        case 'coding':
            return handleFinishSummaryAddId(message, messages);
        case "stop":
            return handleStop(message, messages);
        case "error":
            return handleStop(message, messages);
        case "finish":
            return
        case "task":
            return updateTask(message, messages);

        default:
            // 默认也执行更新任务
            return updateAction(message, messages);
    }
}

function handleStop(message, messages) {
    // Only mutate messages array if ChatPanel is still mounted
    if (window.isChatPanelMounted?.value) {
        messages.push(message);
    }
    // messageStatus = "stop";
    console.log('handleStop', messages);
    //找到 meta.action_type 是 plan 的
    //删除 action_type : "update_status"
    if (window.isChatPanelMounted?.value) {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].meta?.action_type === "update_status") {
                messages.splice(i, 1); // 原地删除元素
            }
        }
    }
    messages.forEach((message) => {
        if (message.meta?.action_type === 'plan') {
            // // 确保 meta.json 存在且是数组
            if (Array.isArray(message.meta.json)) {
                // 遍历 meta.json
                message.meta.json.forEach((jsonItem) => {
                    if (jsonItem.status == "running") {
                        jsonItem.status = "success"
                    }
                    let actions = jsonItem.actions;
                    if (actions?.length > 0) {
                        actions.forEach(action => {
                            if (action.status == "running") {
                                action.status = "success"
                            }
                        })
                    }
                })
            }
        }
        return message
    })
    return
}
function handleFinishSummaryAddId(message, messages) {
    // Defensive: Ensure message.content is a string
    if (typeof message.content !== 'string') {
        console.warn('[handleFinishSummaryAddId] message.content is not a string:', typeof message.content, message.content);
        message.content = message.content ? String(message.content) : '';
    }
    
    // Defensive: Ensure meta.json exists and is an array
    if (!message.meta || !Array.isArray(message.meta.json)) {
        console.warn('[handleFinishSummaryAddId] meta.json is not an array:', message.meta);
        if (!message.meta) message.meta = {};
        if (!message.meta.json) message.meta.json = [];
    }
    
    const rawList = Array.isArray(message.meta?.json) ? message.meta.json : [];
    const filteredList = rawList.filter(file => {
        const name = file?.name || file?.file_name || file?.title || '';
        if (!name) return true;
        return !name.endsWith('.py');
    });

    // CRITICAL: NEVER overwrite existing IDs - this breaks preview selection
    // Only generate UUID if absolutely no ID exists
    for (let i = 0; i < filteredList.length; i++) {
        const element = filteredList[i];
        // RED BUTTON: Preserve all existing IDs, never overwrite
        if (!element.id) {
            element.id = uuid();
        }
    }

    if (message.meta) {
        message.meta.json = filteredList;
        
        // CRITICAL: Clean up Ultra metadata after completion to prevent stale flags
        if (message.status === 'success' || message.status === 'completed') {
            delete message.meta.is_ultra_fast;
            // Clean up any stale Ultra action metadata that could cause render errors
            if (message.meta.action && typeof message.meta.action === 'object') {
                delete message.meta.action.is_ultra_fast;
            }
        }
    }

    // Only mutate messages array if ChatPanel is still mounted
    if (window.isChatPanelMounted?.value) {
        // PROGRESS MESSAGES: Update in place instead of adding new messages
        // This creates a single updating line instead of multiple message items
        if (message.meta?.action_type === 'progress') {
            const taskId = message.meta?.task_id;
            // Find existing progress message for this task
            const existingIdx = messages.findIndex(m => 
                m.meta?.action_type === 'progress' && m.meta?.task_id === taskId
            );
            if (existingIdx !== -1) {
                // Update existing progress message content in place
                messages[existingIdx].content = message.content;
                messages[existingIdx].timestamp = message.timestamp;
                return; // Don't push a new message
            }
        }
        
        messages.push(message);

        if (message.status === 'success') {
            nextTick(() => {
                // Double-check mounted state before mutating
                if (window.isChatPanelMounted?.value) {
                    const filteredMessages = messages.filter(msg => {
                        // Keep all non-temp messages
                        if (!msg?.is_temp) return true;
                        
                        // Keep user messages even if marked temp (preserves user prompts)
                        if (msg.role === 'user') return true;
                        
                        // Remove all other temp messages (system spinners, etc.)
                        return false;
                    });

                    messages.splice(0, messages.length, ...filteredMessages);
                }
            });
        }
    }
}
// 删掉临时message update_status
function deleteTempMessage(messages) {
    //!message.is_temp && message.meta.action_type !== "update_status" 删除
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.meta?.action_type == "update_status") {
            messages.splice(i, 1);
        }
    }
}

function handlePlan(message, messages) {
    // Only mutate messages array if ChatPanel is still mounted
    if (!window.isChatPanelMounted?.value) {
        console.log('[handlePlan] Blocked mutation - ChatPanel unmounting');
        return;
    }
    
    deleteTempMessage(messages);
    console.log('plan', message);
    //将第一task的任务设置为开始
    // item.is_collapse = true
    if (message.meta && message.meta.json && Array.isArray(message.meta.json)) {
        message.meta.json.forEach(item => {
            item.is_collapse = true
        });
        if (message.meta.json.length > 0) {
            message.meta.json[0].status = 'running';
        }
    }
    messages.push(message);
    //update_status
}

//处理自动回复
function handleAutoReply(message, messages) {
    // Only mutate messages array if ChatPanel is still mounted
    if (window.isChatPanelMounted?.value) {
        messages.push(message);
        //update_status
        messages.push(
            {
                content: i18n.global.t('lemon.message.botInitialPlan'),
                role: 'assistant',
                is_temp: true,
                meta: {
                    action_type: "update_status",
                },
            }
        )
    }
}
function handleChatMessage(message, messages) {
    console.log('handleChatMessage', message);
    // Defensive: Ensure message.content is a string
    if (typeof message.content !== 'string') {
        console.warn('[handleChatMessage] message.content is not a string:', typeof message.content, message.content);
        message.content = message.content ? String(message.content) : '';
    }
    
    // CRITICAL: Clean up Ultra metadata from historical messages to prevent stale flags
    if (message.meta && (message.status === 'success' || message.status === 'completed')) {
        delete message.meta.is_ultra_fast;
        // Clean up any stale Ultra action metadata that could cause render errors
        if (message.meta.action && typeof message.meta.action === 'object') {
            delete message.meta.action.is_ultra_fast;
        }
    }
    
    // Only mutate messages array if ChatPanel is still mounted
    if (window.isChatPanelMounted?.value) {
        messages.push(message);
    } else {
        console.log('[handleChatMessage] Blocked mutation - ChatPanel unmounting');
    }
}

//处理question
function handleQuestion(message, messages) {
    console.log('handleQuestion', message);
    // Only mutate messages array if ChatPanel is still mounted
    if (!window.isChatPanelMounted?.value) {
        console.log('[handleQuestion] Blocked mutation - ChatPanel unmounting');
        return;
    }
    
    // CRITICAL: Only replace temp messages if this is a real-time SSE message (has is_temp flag)
    // Historical messages from initConversation should just be appended, not replace anything
    if (message.is_temp) {
        // This is a real-time SSE message, find and replace the temp user message
        let user_message_index = messages.findLastIndex(messageInfo => messageInfo.role === 'user' && messageInfo.is_temp);
        if (user_message_index !== -1) {
            messages[user_message_index] = message;
            messages[user_message_index].files = message.meta.json;
        } else {
            messages.push(message);
        }
    } else {
        // This is a historical message from DB, just append it
        messages.push(message);
    }
}

//更新任务
function updateTask(message, messages) {
    const task_id = message.meta.task_id;
    //根据 task_id 找到对应的任务
    //第一步 找到 plan_message 
    let plan_message_index = messages.findLastIndex(messageInfo => messageInfo.meta && messageInfo.meta.action_type === 'plan');
    //获取 plan 的 actions
    let plan = messages[plan_message_index];

    // ULTRA-FAST-PATH FIX: If no plan exists, skip task update
    if (!plan || plan_message_index === -1) {
        console.log('[updateTask] No plan found (ultra-fast-path) - skipping task update');
        return;
    }

    //根据plan 的 json 找到当前的task

    let task_index = plan.meta.json.findIndex(task => task.id === task_id);
    // console.log('task_index',task_index);
    if (task_index !== -1) {
        // console.log('plan.meta.json[task_index]',plan.meta.json[task_index]);
        plan.meta.json[task_index].status = message.meta.json.status || message.status;
        plan.meta.json[task_index].meta = message.meta;

        //如果task 的 status 为 failure 则替换
        let status = message.meta.json.status || message.status;
        if (status === 'failure') {
            //将当前task  let actions = plan.meta.json[task_index].actions; 
            let actions = plan.meta.json[task_index].actions || [];
            //删除 状态为 running 的任务
            actions = actions.filter(action => action.status !== 'running');
            plan.meta.json[task_index].actions = actions;
        }
        //只有任务成功了 才执行下一个task 如果失败了 则不执行下一个task
        if (status === 'success' || status === 'completed') {
            //找到下一个task
            if (plan.meta.json[task_index + 1]) {
                plan.meta.json[task_index + 1].status = 'running';
            }
        }
    }
}


/**
 * Updates an action message in the chat
 * @param {Object|string} message - The message to update
 * @param {Array} messages - The array of all messages
 */
function updateAction(message, messages) {
    // Safely handle message object
    const messageObj = (() => {
        // If message is a string, convert to proper message object
        if (typeof message === 'string') {
            console.warn('[updateAction] Received string message, converting to object');
            return { 
                content: message, 
                meta: {},
                uuid: uuid()
            };
        }
        
        // Ensure meta object exists
        if (!message.meta) {
            console.warn('[updateAction] Message missing meta property, adding default');
            message.meta = {};
        }
        
        // Ensure UUID exists
        if (!message.uuid) {
            console.warn('[updateAction] Message missing UUID, generating one');
            message.uuid = uuid();
        }
        
        return message;
    })();
    
    // Safely extract properties with defaults
    const task_id = messageObj.meta?.task_id || null;
    const message_uuid = messageObj.uuid;
    
    console.debug('[updateAction] Processing message:', {
        messageId: message_uuid,
        taskId: task_id,
        hasMeta: !!messageObj.meta,
        metaKeys: messageObj.meta ? Object.keys(messageObj.meta) : []
    });
    
    // Handle terminal_run message type
    if (message.meta.action_type === 'terminal_run' && message.content) {
        message.content = Array.isArray(message.content) ? message.content : [message.content];
    }

    // Find the plan message in the conversation
    let plan_message_index = -1;
    let plan = null;
    
    try {
        plan_message_index = messages.findLastIndex(msg => 
            msg && 
            msg.meta && 
            msg.meta.action_type === 'plan'
        );
        
        if (plan_message_index !== -1) {
            plan = messages[plan_message_index];
        }
    } catch (error) {
        console.error('[updateAction] Error finding plan:', error);
    }

    // ULTRA-FAST-PATH: Handle messages without a plan or with invalid plan structure
    if (!plan || plan_message_index === -1 || !plan.meta || !Array.isArray(plan.meta.json)) {
        console.log('[updateAction] No valid plan found - processing as direct message', {
            hasPlan: !!plan,
            hasMeta: !!plan?.meta,
            hasJson: Array.isArray(plan?.meta?.json)
        });
        
        // Ensure message has required structure
        if (!message.meta.json) {
            message.meta.json = [];
        } else if (!Array.isArray(message.meta.json)) {
            message.meta.json = [message.meta.json];
        }
        
        // Ensure each file has an ID
        message.meta.json = message.meta.json.map(file => ({
            id: file.id || uuid(),
            ...file
        }));

        // Update existing message or add new one
        const existing_index = messages.findIndex(msg => 
            msg.uuid === message_uuid && 
            message_uuid && 
            message_uuid !== ''
        );

        if (existing_index !== -1) {
            // Preserve existing content if updating terminal_run
            if (message.meta.action_type === 'terminal_run' && messages[existing_index].content) {
                message.content = [
                    ...(Array.isArray(messages[existing_index].content) ? 
                        messages[existing_index].content : 
                        [messages[existing_index].content]
                    ),
                    ...(Array.isArray(message.content) ? message.content : [message.content])
                ];
            }
            
            // Update existing message
            messages[existing_index] = {
                ...messages[existing_index],
                ...message,
                meta: {
                    ...messages[existing_index].meta,
                    ...message.meta,
                    // Preserve existing json files while adding new ones
                    json: [
                        ...(messages[existing_index].meta?.json || []).filter(f => 
                            !message.meta.json.some(nf => nf.id === f.id)
                        ),
                        ...message.meta.json
                    ]
                }
            };
        } else {
            // Add new message with UUID
            if (window.isChatPanelMounted?.value) {
                messages.push({
                    ...message,
                    uuid: message_uuid
                });
            } else {
                console.log('[updateAction] Blocked push mutation - ChatPanel unmounting');
            }
        }
        return;
    }

    // Process message with a valid plan structure
    try {
        // Find the appropriate task in the plan
        let task_index = -1;
        
        if (task_id) {
            task_index = plan.meta.json.findIndex(task => task && task.id === task_id);
        }
        
        // If task not found by ID, try to find a running task
        if (task_index === -1) {
            task_index = plan.meta.json.findIndex(task => task && task.status === 'running');
        }
        
        // Default to last task if still not found
        if (task_index === -1) {
            task_index = Math.max(0, plan.meta.json.length - 1);
        }
        
        // Ensure task exists and has actions array
        if (!plan.meta.json[task_index]) {
            console.warn('[updateAction] Task not found at index', task_index);
            messages.push(message);
            return;
        }
        
        // Initialize actions array if it doesn't exist
        if (!Array.isArray(plan.meta.json[task_index].actions)) {
            plan.meta.json[task_index].actions = [];
        }
        
        const actions = plan.meta.json[task_index].actions;
        const action_index = actions.findIndex(action => action.uuid === message_uuid);
        
        // Update existing action or add new one
        if (action_index !== -1) {
            // Preserve existing content for terminal_run
            if (message.meta.action_type === 'terminal_run' && actions[action_index].content) {
                message.content = [
                    ...(Array.isArray(actions[action_index].content) ? 
                        actions[action_index].content : 
                        [actions[action_index].content]
                    ),
                    ...(Array.isArray(message.content) ? message.content : [message.content])
                ];
            }
            
            // Update existing action
            actions[action_index] = {
                ...actions[action_index],
                ...message,
                meta: {
                    ...actions[action_index].meta,
                    ...message.meta
                }
            };
        } else {
            // Add new action
            actions.push({
                ...message,
                uuid: message_uuid
            });
        }
    } catch (error) {
        console.error('[updateAction] Error processing message with plan:', error);
        // Fallback to adding message directly if there's an error
        messages.push({
            ...message,
            uuid: message_uuid
        });
    }
}

export default {
    handleMessage
}