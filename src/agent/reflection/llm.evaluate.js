const { getDefaultModel } = require('@src/utils/default_model')
const sub_server_request = require('@src/utils/sub_server_request')
const conversation_token_usage = require('@src/utils/get_sub_server_token_usage')

// 评估
const resolveEvaluatePrompt = async (requirement = '', result = '') => {
  const prompt = `Please act as a professional review expert, fully understand the user's requirements and expected results, compare and analyze the execution results, evaluate whether the execution results meet the user's requirements
1. If the execution result fully meets the expected result, return success
2. If the execution result cannot be directly delivered, return failure, and return feedback, missing content, and suggestions for optimization
3. If the execution result partially meets or fails to execute the key steps, return partial, and return suggestions for补充遗漏内容

**Error Analysis (CRITICAL):**
When an execution fails:
1. **Identify the exact error** from stderr/error message (e.g., SyntaxError, FileNotFoundError, ValueError)
2. **Understand why it failed** - Was it syntax? Logic? Missing file? Wrong path?
3. **Generate a DIFFERENT solution** - DO NOT repeat the same code that just failed
4. **Verify your fix** - Explain why the new approach will work

**Common Errors and Fixes:**
- **SyntaxError**: Check language syntax (Python vs Bash) - do not mix echo in Python or print() in Bash
- **FileNotFoundError**: Verify file exists, use correct path, check working directory
- **ImportError**: Check if library is installed in the sandbox
- **ValueError**: Validate input data format and types

**If you've tried the same approach 2+ times:**
- STOP and try a completely different method
- Ask for clarification if needed
- Break the problem into smaller steps
- Consider using a different library or approach

=== Task Goal ===
${requirement}
=== END ===

=== Code Execution Result ===
${result}
=== END ===

=== Return Format === 
<evaluation>
<status>success/failure</status>
<comments>
// evaluation result - if failure, explain the error and suggest a DIFFERENT approach
</comments>
</evaluation>

Start:`
  return prompt;
}

const call = require("@src/utils/llm");
const evaluate_model = 'assistant';

const evaluate = async (requirement, result, conversation_id) => {
  let model_info = await getDefaultModel(conversation_id)
  if (model_info.is_subscribe) {
    let content = await evaluate_server(requirement, result, conversation_id)
    return content
  }
  let content = await evaluate_local(requirement, result, conversation_id)
  return content
}

const evaluate_server = async (requirement, result, conversation_id) => {
  // const [res,token_usage] = await sub_server_request('/api/sub_server/evaluate', {
  const res = await sub_server_request('/api/sub_server/evaluate', {
    requirement,
    result,
    conversation_id
  })
  // await conversation_token_usage(token_usage, conversation_id)

  return res
};

const evaluate_local = async (requirement, result, conversation_id) => {
  const prompt = await resolveEvaluatePrompt(requirement, result);
  console.log('\n === evaluation prompt ===\n', prompt);
  // process.exit(0);
  const content = await call(prompt, conversation_id, evaluate_model);
  return content;
}

module.exports = exports = evaluate;