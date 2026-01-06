
const resolveResultPrompt = async (goal, tasks, generatedFiles = [], staticUrl = null, userId = null) => {

  let newTasks = tasks.map((task) => {
    return {
      title: task.title,
      description: task.description,
      status: task.status,
      result: task.result
    }
  });

  // CRITICAL FIX: Load user profile context for summary
  let profileContext = '';
  if (userId) {
    try {
      const { getProfileContext } = require('@src/services/userProfile');
      profileContext = await getProfileContext(userId);
      if (profileContext) {
        console.log('[Summary] Using profile context:', profileContext.substring(0, 100));
      }
    } catch (error) {
      console.error('[Summary] Failed to load profile:', error.message);
    }
  }

  // 处理生成的文件信息
  let filesInfo = '';
  let exactFileNames = [];
  if (generatedFiles && generatedFiles.length > 0) {
    // 提取文件名
    const fileNames = generatedFiles.map(file => file.filename);
    exactFileNames = fileNames.filter(name => name && !name.endsWith('.py') && name !== 'todo.md');
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

${profileContext ? `**USER PROFILE:**\n${profileContext}\n\n` : ''}Summarize task completion in a CONCISE, CLEAN format:

**FORMAT REQUIREMENTS:**
- Keep it SHORT (1-2 sentences max with personality)
- NO verbose explanations or phase breakdowns
- NO Python code blocks or technical implementation details
- NO file:// links or download instructions (files appear as icons automatically)
- NO unnecessary details or formal language
- NO technical processing notes (e.g., "Updated X with Y", "Loaded existing document")
- Add personality with emojis and casual tone
- Just state what was accomplished - files appear in UI automatically
- Use the user's actual name from profile if available (NEVER use placeholder names)
- **CRITICAL: Use ONLY the exact filenames from the "Generated files" list below - DO NOT invent, modify, or add version suffixes like "_v2" to filenames**

**EXAMPLES (GOOD):**
"✅ Whipped up random_text.md with some sample content! File's ready in your workspace."
"🎯 Built that Excel spreadsheet you wanted. Check your downloads!"
"⚡ Done! Created the document and it's sitting in your workspace waiting for you."

**EXAMPLE (BAD - TOO WORDY):**
"The goal was to create a random Word document and provide it to you. Here's how it went:
Phase 1: Document Creation was successfully completed. This involved generating random text content and creating a Word document with that content.
Phase 2: Delivery was also completed. The document was saved to the specified location, and the deliverable was provided to you..."

**EXAMPLE (BAD - TECHNICAL LEAKAGE):**
"Updated love_document.docx with your name as the author at the top!"

**EXAMPLE (BAD - HALLUCINATED FILENAME):**
"✅ Created celebrity_realtor_landing_v2.html" (when actual file is celebrity_realtor_landing.html)

${exactFileNames.length > 0 ? `**MANDATORY: You MUST reference these EXACT filenames (copy them exactly as shown):**
${exactFileNames.map(name => `- ${name}`).join('\n')}

DO NOT add "_v2", "_updated", or any other suffixes. Use the filenames EXACTLY as listed above.

` : ''}Goal: ${goal}
Tasks: ${JSON.stringify(newTasks)}${filesInfo}

Provide a BRIEF summary in English only.`

  return prompt;
}


module.exports = resolveResultPrompt;