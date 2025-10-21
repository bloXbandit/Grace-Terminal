
const resolveResultPrompt = (goal, tasks, generatedFiles = [], staticUrl = null) => {

  let newTasks = tasks.map((task) => {
    return {
      title: task.title,
      description: task.description,
      status: task.status,
      result: task.result
    }
  });

  // 处理生成的文件信息
  let filesInfo = '';
  if (generatedFiles && generatedFiles.length > 0) {
    // 提取文件名
    const fileNames = generatedFiles.map(file => file.filename);
    const { getProfileContext } = require('@src/services/userProfile');
    const { MASTER_SYSTEM_PROMPT } = require('./MASTER_SYSTEM_PROMPT');
    filesInfo = `\n3. Generated files: ${JSON.stringify(fileNames)}`;
    
    // 检查是否有HTML文件
    // const htmlFiles = generatedFiles.filter(file => 
    //   file.filename && file.filename.toLowerCase().endsWith('.html')
    // );
    
    // if (htmlFiles.length > 0 && staticUrl) {
    //   // 获取最后一个HTML文件（最终交付的）
    //   const finalHtmlFile = htmlFiles[htmlFiles.length - 1];
    //   const finalUrl = `${staticUrl}/${finalHtmlFile.filename}`;
    //   filesInfo += `\n\n**Important**: The final deliverable HTML file can be accessed via this link: **[Click here to view the result](${finalUrl})**`;
    //   filesInfo += `\nPlease inform the user they can click this link to open in a new tab and view the final results.`;
    // }
  }

  const prompt = `
CRITICAL: You are Grace AI. Respond in ENGLISH ONLY.

Summarize task completion in a CONCISE, CLEAN format:

**FORMAT REQUIREMENTS:**
- Keep it SHORT (1-2 sentences max with personality)
- NO verbose explanations or phase breakdowns
- NO Python code blocks or technical implementation details
- NO file:// links or download instructions (files appear as icons automatically)
- NO unnecessary details or formal language
- Add personality with emojis and casual tone
- Just state what was accomplished - files appear in UI automatically

**EXAMPLES (GOOD):**
"✅ Whipped up random_text.md with some sample content! File's ready in your workspace."
"🎯 Built that Excel spreadsheet you wanted. Check your downloads!"
"⚡ Done! Created the document and it's sitting in your workspace waiting for you."

**EXAMPLE (BAD - TOO WORDY):**
"The goal was to create a random Word document and provide it to you. Here's how it went:
Phase 1: Document Creation was successfully completed. This involved generating random text content and creating a Word document with that content.
Phase 2: Delivery was also completed. The document was saved to the specified location, and the deliverable was provided to you..."

Goal: ${goal}
Tasks: ${JSON.stringify(newTasks)}${filesInfo}

Provide a BRIEF summary in English only.`

  return prompt;
}


module.exports = resolveResultPrompt;