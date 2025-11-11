const { resolveTemplate, loadTemplate } = require("@src/utils/template");
const { resolvePlanningKnowledge } = require("@src/knowledge/index");

const describeUploadFiles = files => {
  let content = ''
  for (let file of files) {
    // CRITICAL: Handle both file.name and file.filename (different sources)
    const filename = file.name || file.filename || 'unknown';
    content += 'upload/' + filename + "\n"
  }
  return content;
}

const resolveTemplateFilename = (planning_mode) => {
  if (planning_mode === 'base') {
    return 'planning.txt'
  }
  return `planning.${planning_mode}.txt`
}

const resolvePlanningPrompt = async (goal, options) => {
  const { files, previousResult, agent_id, planning_mode } = options;

  const templateFilename = resolveTemplateFilename(planning_mode);
  const promptTemplate = await loadTemplate(templateFilename);
  
  // Provide explicit date context to help LLM with date calculations (e.g., "last Sunday")
  const now = new Date();
  const dateFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  const formattedDate = now.toLocaleString('en-US', dateFormatOptions);
  const system = `Current Time: ${formattedDate}\nToday is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
  
  const uploadFileDescription = describeUploadFiles(files);
  // 尝试不使用experience
  // const experiencePrompt = await resolveExperiencePrompt(goal, conversation_id)
  const experiencePrompt = ''
  const best_practice_knowledge = await resolvePlanningKnowledge({ agent_id });
  const prompt = await resolveTemplate(promptTemplate, {
    goal,
    files: uploadFileDescription,
    previous: previousResult,
    system,
    experiencePrompt,
    best_practice_knowledge,
  })
  return prompt;
}

module.exports = exports = resolvePlanningPrompt;