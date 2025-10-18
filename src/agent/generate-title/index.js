require("module-alias/register");
require("dotenv").config();

const sub_server_request = require('@src/utils/sub_server_request')
const conversation_token_usage = require('@src/utils/get_sub_server_token_usage')

const call = require("@src/utils/llm");
const { getDefaultModel } = require('@src/utils/default_model')
const resolveGenerateTitlePrompt = require("@src/agent/prompt/generate_title");
const resolveThinking = require("@src/utils/thinking");

const generate_title = async (question, conversation_id) => {
    let model_info = await getDefaultModel(conversation_id)
    if (model_info.is_subscribe) {
        let title = await generate_title_server(question, conversation_id)
        return title
    }
    let replay = await generate_title_local(question, conversation_id)
    return replay
}

const generate_title_server = async (question, conversation_id) => {
    // const [res, token_usage] = await sub_server_request('/api/sub_server/generate_title', {
    const res = await sub_server_request('/api/sub_server/generate_title', {
        question,
        conversation_id
    })

    // await conversation_token_usage(token_usage, conversation_id)
    return res
};

const generate_title_local = async (question, conversation_id) => {
    console.log('=== TITLE GENERATION DEBUG ===');
    console.log('Question received:', question);
    console.log('Question length:', question?.length);
    console.log('Question language detection:', question?.substring(0, 50));
    
    const prompt = await resolveGenerateTitlePrompt(question);
    console.log('Generated prompt:', prompt.substring(0, 200));
    
    const content = await call(prompt, conversation_id);
    console.log('LLM returned title:', content);
    console.log('=== END DEBUG ===');
    
    // handle thinking model result
    if (content && content.startsWith('<think>')) {
        const { thinking: _, content: title } = resolveThinking(content);
        return title;
    }
    return content;
}

module.exports = exports = generate_title;
