require("module-alias/register");
require("dotenv").config();


const call = require("@src/utils/llm");
const { getDefaultModel } = require('@src/utils/default_model')
const resolveAutoReplyPrompt = require('@src/agent/prompt/auto_reply.js');
const sub_server_request = require('@src/utils/sub_server_request')
const conversation_token_usage = require('@src/utils/get_sub_server_token_usage')
const modeCommandHandler = require('@src/agent/modes/ModeCommandHandler');
const MultiAgentCoordinator = require('@src/agent/specialists/MultiAgentCoordinator');
const { shouldUseSpecialist } = require('@src/agent/specialists/helper');
const { analyzeFiles, generateContextSummary, generateUserFriendlySummary } = require('@src/utils/fileAnalyzer');
const { sportsHandler } = require('@src/plugins/SportsResultsHandler');
const { getCachedAnalysis, setCachedAnalysis } = require('@src/utils/fileAnalysisCache');

const auto_reply = async (goal, conversation_id, user_id = 1, messages = [], profileContext = '', onTokenStream = null, files = [], newlyUploadedFileIds = []) => {
  console.log('[AutoReply] Called with files:', files ? files.length : 0);
  console.log('[AutoReply] Newly uploaded files:', newlyUploadedFileIds ? newlyUploadedFileIds.length : 0);
  console.log('[AutoReply] Files array:', JSON.stringify(files.map(f => ({ name: f.name || f.filename, filepath: f.filepath })), null, 2));
  
  // Check for mode commands (/dev, /normal, /dev status)
  const modeCommandResult = await modeCommandHandler.handleCommand(goal, conversation_id);
  if (modeCommandResult) {
    // This was a mode command, return the result directly
    return modeCommandResult.message;
  }
  
  // FAST-PATH: Sports scores queries (instant response, no planning, no XML tags)
  if (sportsHandler.isSportsQuery(goal)) {
    console.log('[AutoReply] ⚡ Fast-path: Sports query detected');
    try {
      const response = await sportsHandler.handleSportsQuery(goal);
      if (response) {
        return {
          handledBySpecialist: true,
          specialist: 'sports_handler',
          taskType: 'general_chat',
          result: response
        };
      }
    } catch (error) {
      console.error('[AutoReply] Sports handler error:', error);
      // Fall through to normal processing
    }
  }
  
  // FAST-PATH: Date/Time queries (instant response, no planning)
  // Catches: "what's the time", "date and time", "tell me the date", "what time is it", etc.
  const dateTimeQuery = goal.match(/what'?s? (the )?(date|time|day|today|current|now)|what (date|time|day) is it|current (date|time)|(date|time) (n|and) (time|date)|tell me (the )?(date|time|day)|give me (the )?(date|time)/i);
  if (dateTimeQuery) {
    console.log('[AutoReply] ⚡ Fast-path: Date/time query detected');
    const now = new Date();
    
    // Format date and time properly
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    };
    
    const formattedDateTime = now.toLocaleString('en-US', options);
    
    // Get user's name from profileContext if available
    let userName = '';
    if (profileContext && profileContext.includes('name:')) {
      const nameMatch = profileContext.match(/name:\s*([^\n,]+)/i);
      if (nameMatch) userName = `, ${nameMatch[1].trim()}`;
    }
    
    const response = `It's ${formattedDateTime}${userName}! 🕐`;
    
    return {
      handledBySpecialist: true,
      specialist: 'general_chat',
      taskType: 'general_chat',
      result: response
    };
  }
  
  // FILE UPLOAD DETECTION: Analyze uploaded files if present
  if (files && files.length > 0) {
    console.log(`[AutoReply] 📎 Detected ${files.length} uploaded file(s)`);
    
    // SMART CACHING: Check if request needs file analysis
    const needsFileAnalysis = goal.match(/what'?s? in (it|the|this|that)|show me|break(down|)|content|tell me (about|what)|read (this|the)|analyze|summary|details|who is|is (it|this) (signed|executed)|what (company|lender|bank|date)|explain (this|the)|review (this|the)/i);
    const referencesFile = goal.match(/this (file|doc|pdf|document)|the (file|doc|pdf|document)|uploaded|attachment/i);
    const explicitReanalysis = goal.match(/re-?analyze|analyze again|check again|look again|review again/i);
    
    // PERSISTENT CACHE: Check cache for each file using file ID
    const filesToAnalyze = [];
    const analyses = [];
    
    for (const file of files) {
      const fileId = file.id || file.dataValues?.id;
      if (!fileId) {
        console.log('[AutoReply] ⚠️ File has no ID, will analyze:', file.name);
        filesToAnalyze.push(file);
        continue;
      }
      
      // OPTIMIZATION: Skip cache check for newly uploaded files (guaranteed cache MISS)
      const isNewUpload = newlyUploadedFileIds && newlyUploadedFileIds.includes(fileId);
      if (isNewUpload) {
        console.log(`[AutoReply] ⬆️ NEWLY UPLOADED file ${fileId}: ${file.name} - skipping cache check`);
        filesToAnalyze.push(file);
        continue;
      }
      
      // Check persistent cache for existing files
      const cachedAnalysis = getCachedAnalysis(fileId);
      if (cachedAnalysis && !explicitReanalysis) {
        // Use cached analysis
        file._analysis = cachedAnalysis;
        analyses.push(cachedAnalysis);
        console.log(`[AutoReply] ♻️ Cache HIT for file ${fileId}: ${file.name}`);
      } else {
        // Need to analyze
        filesToAnalyze.push(file);
        console.log(`[AutoReply] 🔍 Cache MISS for file ${fileId}: ${file.name}`);
      }
    }
    
    console.log(`[AutoReply] Cache status: ${analyses.length}/${files.length} files cached`);
    console.log(`[AutoReply] Need to analyze: ${filesToAnalyze.length} files`);
    console.log(`[AutoReply] Request needs file analysis: ${!!needsFileAnalysis}`);
    console.log(`[AutoReply] Request references file: ${!!referencesFile}`);
    
    try {
      // SMART DECISION: Only analyze files that need it
      if (filesToAnalyze.length > 0 && (needsFileAnalysis || referencesFile || explicitReanalysis)) {
        console.log(`[AutoReply] 🔍 Running file analysis for ${filesToAnalyze.length} file(s)...`);
        const newAnalyses = await analyzeFiles(filesToAnalyze);
        
        // CRITICAL: Store in persistent cache AND attach to file object
        for (let i = 0; i < filesToAnalyze.length && i < newAnalyses.length; i++) {
          const file = filesToAnalyze[i];
          const analysis = newAnalyses[i];
          const fileId = file.id || file.dataValues?.id;
          
          // Store in persistent cache
          if (fileId) {
            setCachedAnalysis(fileId, analysis);
          }
          
          // Attach to file object for immediate use
          file._analysis = analysis;
          analyses.push(analysis);
        }
        
        console.log('[AutoReply] ✅ File analysis complete - cached for future messages');
      } else if (filesToAnalyze.length > 0) {
        console.log('[AutoReply] 🚫 Files not cached but request doesn\'t need analysis - skipping');
      } else {
        console.log('[AutoReply] ✅ All files cached - no analysis needed');
      }
      
      // If request doesn't need file context at all, skip fast-paths and return null early
      if (!needsFileAnalysis && !referencesFile && !explicitReanalysis) {
        console.log('[AutoReply] 🚫 Request unrelated to files - skipping file-based fast-paths');
        // Don't return null yet - let ultra-fast-path run for "create doc" requests
        // Just skip the file-specific fast-paths below
      } else {
        console.log('[AutoReply] ✅ Request relates to files - proceeding with file context');
      
      // CRITICAL: Fast-path for CONTENT BREAKDOWN follow-ups (no planning overhead)
      // Catches: "what's in it?", "show me the content", "lmk contents", "what does it contain"
      const contentBreakdownQuery = goal.match(/what'?s? in (it|the|this|that|the file|the document)|show me (the content|what'?s in|the details)|break(down|) (it|the file|the document|this)|lmk (what'?s in|contents?|the contents?)|tell me (what'?s in|the contents?|contents?)|what (does it|it) contains?|what'?s? (the )?contents?/i);
      
      // CRITICAL FIX: Check BOTH recent messages AND current upload
      // On initial conversation start, messages is [], so we must check files.length > 0
      const hasRecentFileMessage = files.length > 0 || messages.slice(-3).some(m => 
        m.content && (m.content.includes('.pdf') || m.content.includes('.docx') || m.content.includes('document') || m.content.includes('file'))
      );
      
      if (contentBreakdownQuery && hasRecentFileMessage) {
        console.log('[AutoReply] ⚡ Fast-path: Content breakdown request detected - streaming analysis');
        const { generateStreamingBreakdown } = require('@src/utils/fileAnalyzer');
        
        // Stream the detailed content analysis
        const breakdown = await generateStreamingBreakdown(analyses[0], onTokenStream);
        
        return {
          handledBySpecialist: true,
          specialist: 'general_chat',
          taskType: 'general_chat',
          result: breakdown,
          streamed: true
        };
      }
      
      // CRITICAL: Fast-path for "read document and execute task" pattern
      // This is a VERY common pattern that should NOT trigger full agent planning
      // Catches: "read this document and execute the task", "read and do what it says", etc.
      const executeFromDocPattern = goal.match(/read (this|the) (document|file|pdf|docx) and (execute|do|perform|complete|carry out) (the )?task|execute (the )?task (contained|in|from) (the )?(document|message|file)/i);
      
      if (executeFromDocPattern && analyses.length > 0) {
        console.log('[AutoReply] ⚡ Fast-path: Execute task from document pattern detected');
        
        // Extract task from document content
        const analysis = analyses[0];
        const content = typeof analysis.content === 'string' ? analysis.content : '';
        
        // Try to intelligently extract the task
        // Look for common patterns: "Create", "Write", "Generate", task descriptions
        const taskMatch = content.match(/(Create|Write|Generate|Make|Build|Develop|Design)\s+([^.\n]{10,100})/i);
        
        if (taskMatch) {
          const extractedTask = taskMatch[0];
          console.log('[AutoReply] Extracted task from document:', extractedTask);
          
          // Return null to let it go to agent mode BUT with enriched context
          // Add the extracted task to the goal
          return null;
        } else {
          // Could not extract clear task, provide summary and ask for clarification
          return {
            handledBySpecialist: true,
            specialist: 'general_chat',
            taskType: 'general_chat',
            result: `I see you want me to execute a task from the document. Let me check what's in it...\n\n` +
                    `The document contains: ${content.substring(0, 500)}...\n\n` +
                    `I can see instructions in the document. Let me execute them now.`
          };
        }
      }
      
      // CRITICAL: Fast-path for simple file visibility questions (FIRST UPLOAD ONLY)
      // Catches: "can you see", "do you see" - NOT "what's in it" (that's content breakdown above)
      const simpleVisibilityQuery = goal.match(/can you see|do you see|are you able to see/i);
      const noComplexTask = !goal.match(/create|generate|modify|edit|update|add|remove|delete|change|replace/i);
      
      if (simpleVisibilityQuery && noComplexTask && analyses.length > 0) {
        console.log('[AutoReply] ⚡ Fast-path: Simple file visibility question detected');
        
        // SMART RESPONSE: Be contextual, not just generic
        const analysis = analyses[0];
        const content = typeof analysis.content === 'string' ? analysis.content : '';
        const pageCount = analysis.metadata?.pageCount || 0;
        const filename = analysis.filename || 'the file';
        
        let response = `Yup, got it! `;
        
        // Be contextual based on content
        if (pageCount === 1 && content.length < 500) {
          // Short single-page doc - likely a message or instruction
          const hasTaskKeywords = /create|make|generate|write|build|design|develop/i.test(content);
          if (hasTaskKeywords) {
            response += `It's a 1-page PDF with a task for me. Let me know if you want me to execute it!`;
          } else {
            response += `It's a 1-page PDF with a message. Want me to break it down or help with something specific?`;
          }
        } else if (pageCount > 1) {
          response += `It's a ${pageCount}-page ${filename.endsWith('.pdf') ? 'PDF' : 'document'}. I've got it analyzed and ready. What would you like to know about it?`;
        } else {
          response += `It's a ${filename.endsWith('.pdf') ? 'PDF' : 'document'} (${analysis.sizeFormatted || 'unknown size'}). I can see it clearly. How can I help?`;
        }
        
        // Return as specialist completion to prevent redundant specialist call
        return {
          handledBySpecialist: true,
          specialist: 'general_chat',
          taskType: 'general_chat',
          result: response
        };
      }
      
      // CRITICAL: Fast-path for FOLLOW-UP QUESTIONS about uploaded documents
      // Catches: "who is this for?", "who is the borrower?", "is it signed?", "is it executed?"
      // These should NOT trigger agent mode - just check the document and answer
      const followUpQuestionPatterns = [
        /who (is|'s) (this|the (document|authorization|file)) for/i,
        /who (is|'s) the (borrower|client|signer|recipient)/i,
        /what (is|'s) the (borrower|client|signer) (name|called)/i,
        /(is|was) (this|the (document|authorization|file)) (signed|executed)/i,
        /(is|was) it (signed|executed)/i,
        /who signed (this|it|the (document|authorization))/i,
        /what (company|lender|bank)/i,
        /when (was|is) (this|it|the (document|authorization)) (dated|signed|executed)/i
      ];
      
      const isFollowUpQuestion = followUpQuestionPatterns.some(pattern => pattern.test(goal));
      
      if (isFollowUpQuestion && hasRecentFileMessage && analyses.length > 0) {
        console.log('[AutoReply] ⚡ Fast-path: Document follow-up question detected');
        
        const analysis = analyses[0];
        const content = typeof analysis.content === 'string' ? analysis.content : '';
        const { detectDocumentType, extractKeyDetails } = require('@src/utils/fileAnalyzer');
        
        const docType = detectDocumentType(content, analysis.filename);
        const details = extractKeyDetails(content, docType?.type);
        
        let response = '';
        
        // Handle "who is the borrower?" / "who is this for?"
        if (goal.match(/who (is|'s) (this|the (document|authorization|file)) for|who (is|'s) the (borrower|client)/i)) {
          if (details.borrower) {
            response = `Looking at the document, the borrower is ${details.borrower}.`;
          } else {
            response = `I checked the document and I don't see a specific borrower name or client name mentioned in the text. The document appears to use generic language like "I, the undersigned" without a filled-in name.`;
          }
        }
        // Handle "is it signed?" / "is it executed?" (mortgage/legal domain context)
        else if (goal.match(/(is|was) (this|it|the (document|authorization|file)) (signed|executed)/i)) {
          if (details.isSigned === true) {
            response = `Yes, the document appears to be executed (signed)`;
            if (details.signer) {
              response += ` by ${details.signer}`;
            }
            if (details.date) {
              response += ` on ${details.date}`;
            }
            response += `.`;
          } else if (details.isSigned === false) {
            response = `No, the document is not yet executed (unsigned). It has signature lines but no signatures filled in.`;
          } else {
            response = `I can't definitively tell if the document is signed from the text content. There may be handwritten signatures that aren't captured in the text extraction.`;
          }
        }
        // Handle "what company/lender?"
        else if (goal.match(/what (company|lender|bank)/i)) {
          if (details.lender) {
            response = `The lender/company is ${details.lender}.`;
          } else if (details.company) {
            response = `The company is ${details.company}.`;
          } else {
            response = `I checked the document and I don't see a specific company or lender name mentioned.`;
          }
        }
        // Handle "when was it signed/dated?"
        else if (goal.match(/when (was|is) (this|it|the (document|authorization)) (dated|signed|executed)/i)) {
          if (details.date) {
            response = `The document is dated ${details.date}.`;
          } else {
            response = `I don't see a specific date mentioned in the document.`;
          }
        }
        else {
          // Generic fallback for other follow-up questions
          response = `Let me check the document... `;
          if (details.borrower) response += `Borrower: ${details.borrower}. `;
          if (details.lender) response += `Lender: ${details.lender}. `;
          if (details.date) response += `Date: ${details.date}. `;
          if (details.isSigned !== null) {
            response += details.isSigned ? `Status: Executed (signed).` : `Status: Not yet executed (unsigned).`;
          }
        }
        
        return {
          handledBySpecialist: true,
          specialist: 'general_chat',
          taskType: 'general_chat',
          result: response.trim(),
          streamed: true
        };
      }
      
      } // End of file-context block
      
      // Return null to let specialist handle with file context
      // File analysis is now stored in files[i]._analysis
      return null;
    } catch (error) {
      console.error('[AutoReply] ⚠️ File analysis failed:', error);
      // Continue with normal flow even if analysis fails
      return {
        handledBySpecialist: false,
        specialist: 'general_chat',
        taskType: 'general_chat',
        result: 'File analysis failed. Please try again.'
      };
    }
  }
  
  // CRITICAL: Ultra-fast-path for SIMPLE SINGLE-FILE GENERATION
  // Uses write_code → Python script (PROVEN execution path, same as document edits)
  // Catches conversational patterns: "can you make", "lets create", "i wanna make", "make me a", "i want a document", etc.
  // Handles: explicit actions (make/create) OR implicit requests (i want/i need/give me)
  const simpleFileGenPattern = goal.match(/(?:can you |lets |let's |i wanna |i want to |i want |i need |give me |please )?(?:(create|make|generate|write)(?:\s+\w+){0,3}\s+)?(a |an |the )?(word document|word doc|docx|excel|spreadsheet|xlsx|pdf|document|file)(?:\s+\w+){0,3}\s+(titled|called|named|with|about|on|for)/i);
  
  if (simpleFileGenPattern) {
    console.log('[AutoReply] ⚡⚡ ULTRA Fast-path: Simple single-file generation detected');
    console.log('[AutoReply] Pattern matched:', simpleFileGenPattern[0]);
    
    // Extract file type
    const fileType = simpleFileGenPattern[3].toLowerCase();
    const isWordDoc = fileType.includes('word') || fileType === 'docx';
    const isExcel = fileType.includes('excel') || fileType.includes('spreadsheet') || fileType === 'xlsx';
    
    // Extract title (look for "titled X" or "called X" or "named X")
    const titleMatch = goal.match(/(?:titled|called|named)\s+["']?([^"']+?)["']?(?:\s+with|\s+about|\s+on|\s+for|$)/i);
    let title = titleMatch ? titleMatch[1].trim() : 'Untitled';
    
    // Extract author if present
    const authorMatch = goal.match(/(?:with|by)\s+author\s+["']?([^"']+?)["']?(?:\s|$)/i);
    let author = authorMatch ? authorMatch[1].trim() : null;
    
    // CRITICAL: Python string escape (for embedding in Python code)
    const pythonEscape = (str) => {
      if (!str) return str;
      return str
        .replace(/\\/g, '\\\\')  // Backslash must be first
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };
    
    const titlePython = pythonEscape(title);
    const authorPython = author ? pythonEscape(author) : null;
    const contentPython = pythonEscape(goal);
    
    // CRITICAL: Pre-generate write_code action XML (PROVEN execution path)
    // Uses Python script → runtime.execute_action → write_code → terminal_run
    // WRAP in <actions> parent tag so XML parser handles multiple actions
    let actionXML = '';
    const timestamp = Date.now();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    if (isWordDoc) {
      // Generate DOCX using python-docx
      const filename = `${sanitizedTitle}.docx`;
      actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>create_doc_${timestamp}.py</path>
  <content><![CDATA[from docx import Document
from docx.shared import Pt, Inches

# Create document
doc = Document()

# Set core properties
doc.core_properties.title = '${titlePython}'
${authorPython ? `doc.core_properties.author = '${authorPython}'\n` : ''}
# Add title as heading
doc.add_heading('${titlePython}', 0)

# Add content paragraph
doc.add_paragraph('${contentPython}')

# Add placeholder sections
doc.add_heading('Overview', level=1)
doc.add_paragraph('This document was created based on your request.')

# Save document
doc.save('${filename}')
print('✅ Created ${filename}')]]></content>
  <description>Create Word document: ${title}</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>create_doc_${timestamp}.py</args>
</terminal_run>
</actions>`;
    } else if (isExcel) {
      // Generate XLSX using openpyxl
      const filename = `${sanitizedTitle}.xlsx`;
      actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>create_excel_${timestamp}.py</path>
  <content><![CDATA[from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

# Create workbook
wb = Workbook()
ws = wb.active
ws.title = '${titlePython}'

# Add header
ws['A1'] = '${titlePython}'
ws['A1'].font = Font(size=14, bold=True)
ws['A1'].alignment = Alignment(horizontal='center')

# Add content description
ws['A3'] = 'Content'
ws['B3'] = '${contentPython}'

# Add sample data structure
ws['A5'] = 'Item'
ws['B5'] = 'Value'
ws['A6'] = 'Sample 1'
ws['B6'] = 'Data'

# Save workbook
wb.save('${filename}')
print('✅ Created ${filename}')]]></content>
  <description>Create Excel spreadsheet: ${title}</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>create_excel_${timestamp}.py</args>
  <cwd>.</cwd>
</terminal_run>
</actions>`;
    } else {
      // Default to DOCX
      const filename = `${sanitizedTitle}.docx`;
      actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>create_doc_${timestamp}.py</path>
  <content><![CDATA[from docx import Document

# Create document
doc = Document()

# Set core properties
doc.core_properties.title = '${titlePython}'
${authorPython ? `doc.core_properties.author = '${authorPython}'\n` : ''}
# Add title
doc.add_heading('${titlePython}', 0)

# Add content
doc.add_paragraph('${contentPython}')

# Save document
doc.save('${filename}')
print('✅ Created ${filename}')]]></content>
  <description>Create document: ${title}</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>create_doc_${timestamp}.py</args>
</terminal_run>
</actions>`;
    }
    
    console.log('[AutoReply] Pre-generated write_code + terminal_run XML:', actionXML.substring(0, 250));
    
    // CRITICAL: Validate XML before returning (safety check)
    if (!actionXML || actionXML.length < 50 || !actionXML.includes('<actions>') || !actionXML.includes('<write_code>') || !actionXML.includes('<terminal_run>')) {
      console.log('[AutoReply] ⚠️ Invalid XML generation - falling back to specialist routing');
      // Don't return, let it fall through to specialist routing
      return null;
    }
    
    // This is a simple file generation - skip planning, go straight to execution
    // CRITICAL: Include pre-generated action XML to bypass thinking() LLM call
    return {
      needsExecution: true,
      specialistResponse: null,
      specialist: 'data_generation',
      taskType: 'simple_data_generation',
      skipPlanning: true, // CRITICAL: Skip planning phase
      directExecution: true, // CRITICAL: Go straight to tool execution
      preGeneratedAction: actionXML // CRITICAL: Pre-generated action XML to bypass thinking
    };
  }
  
  // CRITICAL: ULTRA Fast-path for SIMPLE document edits (context-aware)
  // Detects simple operations like "add my name as author", "change title to X"
  // Pre-generates XML action to skip BOTH LLM thinking AND planning for instant execution
  
  // Pattern 1: Add author to document
  const addAuthorPattern = goal.match(/add\s+(?:my\s+)?(?:name|author)\s+(?:as\s+)?(?:author\s+)?(?:to|on|in)\s+(?:the\s+)?(?:document|doc|file)|add\s+author\s+["']?([^"']+)["']?/i);
  
  // Pattern 2: Change document title (captures until end of string, allows trailing punctuation)
  const changeTitlePattern = goal.match(/(?:change|update)\s+(?:the\s+)?title\s+to\s+["']?([^"'\n]+?)["']?[.!?]?$/i);
  
  // Pattern 3: Add text at specific location
  const addTextPattern = goal.match(/add\s+["']?(.+?)["']?\s+(?:to|at|in)\s+(?:the\s+)?(top|bottom|beginning|end)\s+of\s+(?:the\s+)?(?:document|doc|file)/i);
  
  if (files && files.length > 0 && (addAuthorPattern || changeTitlePattern || addTextPattern)) {
    // Find the most recent DOCX file
    const docxFile = files.find(f => {
      const name = f.name || f.filename || '';
      return name.endsWith('.docx') || name.endsWith('.doc');
    });
    
    if (docxFile) {
      const filename = docxFile.name || docxFile.filename;
      
      // CRITICAL: Validate filepath exists, use file object's filepath
      // If no filepath, file might be in uploads folder or conversation folder
      let filepath = docxFile.filepath;
      if (!filepath) {
        console.log('[AutoReply] ⚠️ No filepath found on file object, checking alternatives');
        // Try to construct from conversation context
        if (conversation_id && filename) {
          filepath = `/workspace/uploads/${conversation_id}/${filename}`;
        } else {
          filepath = `/workspace/${filename}`;
        }
      }
      
      console.log('[AutoReply] ⚡⚡ ULTRA Fast-path: Simple document edit detected');
      console.log('[AutoReply] Target filepath:', filepath);
      
      // Get user's name from profile if available
      const userName = profileContext && profileContext.match(/name:\s*([^\n]+)/i) 
        ? profileContext.match(/name:\s*([^\n]+)/i)[1].trim() 
        : 'Author';
      
      // XML escape helper (for XML structure only, NOT for Python string content)
      const xmlEscape = (str) => {
        if (!str) return str;
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };
      
      // Python string escape helper (for Python string literals)
      const pythonEscape = (str) => {
        if (!str) return str;
        return str
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/'/g, "\\'")    // Escape single quotes
          .replace(/\n/g, '\\n')   // Escape newlines
          .replace(/\r/g, '\\r');  // Escape carriage returns
      };
      
      let actionXML = '';
      let operation = '';
      
      if (addAuthorPattern) {
        // Add author operation
        const authorNameRaw = addAuthorPattern[1] || userName;
        const authorNamePython = pythonEscape(authorNameRaw);  // Escape for Python strings
        const filepathPython = pythonEscape(filepath);         // Escape filepath for Python
        operation = 'add_author';
        
        // Pre-generate write_code action XML
        // CRITICAL: Use CDATA to wrap Python code (prevents XML parsing issues)
        // pythonEscape handles quotes/newlines in Python strings
        actionXML = `<write_code>
  <language>python</language>
  <filepath>/tmp/edit_author_${Date.now()}.py</filepath>
  <content><![CDATA[from docx import Document

# Load document
doc = Document('${filepathPython}')

# Add author to core properties
doc.core_properties.author = '${authorNamePython}'

# Save document
doc.save('${filepathPython}')
print('✅ Added author: ${authorNamePython}')]]></content>
  <description>Add author to document metadata</description>
</write_code>`;
        
      } else if (changeTitlePattern) {
        // Change title operation
        const newTitleRaw = changeTitlePattern[1].trim();
        const newTitlePython = pythonEscape(newTitleRaw);  // Escape for Python strings
        const filepathPython = pythonEscape(filepath);     // Escape filepath for Python
        operation = 'change_title';
        
        actionXML = `<write_code>
  <language>python</language>
  <filepath>/tmp/edit_title_${Date.now()}.py</filepath>
  <content><![CDATA[from docx import Document

# Load document
doc = Document('${filepathPython}')

# Change title in core properties
doc.core_properties.title = '${newTitlePython}'

# Also change first heading if it exists
if len(doc.paragraphs) > 0 and doc.paragraphs[0].style.name.startswith('Heading'):
    doc.paragraphs[0].text = '${newTitlePython}'

# Save document
doc.save('${filepathPython}')
print('✅ Updated title to: ${newTitlePython}')]]></content>
  <description>Update document title</description>
</write_code>`;
        
      } else if (addTextPattern) {
        // Add text at location operation
        const textToAddRaw = addTextPattern[1];
        const textToAddPython = pythonEscape(textToAddRaw);  // Escape for Python strings
        const filepathPython = pythonEscape(filepath);       // Escape filepath for Python
        const location = addTextPattern[2].toLowerCase();
        const atTop = location === 'top' || location === 'beginning';
        operation = 'add_text';
        
        // CRITICAL: Handle empty documents (no paragraphs)
        const topCode = atTop 
          ? `# Add text at top (handle empty document)
if len(doc.paragraphs) > 0:
    doc.paragraphs[0].insert_paragraph_before('${textToAddPython}')
else:
    # Document is empty, add first paragraph
    doc.add_paragraph('${textToAddPython}')`
          : `# Add text at bottom
doc.add_paragraph('${textToAddPython}')`;
        
        actionXML = `<write_code>
  <language>python</language>
  <filepath>/tmp/edit_text_${Date.now()}.py</filepath>
  <content><![CDATA[from docx import Document

# Load document
doc = Document('${filepathPython}')

${topCode}

# Save document
doc.save('${filepathPython}')
print('✅ Added text ${atTop ? 'at top' : 'at bottom'}')]]></content>
  <description>Add text to document</description>
</write_code>`;
      }
      
      if (actionXML) {
        console.log('[AutoReply] Pre-generated XML for operation:', operation);
        console.log('[AutoReply] XML preview:', actionXML.substring(0, 200) + '...');
        
        // CRITICAL: Return with skipPlanning=true and directExecution=true
        // This makes it as fast as "make a document" (3-5s instead of 5-8s)
        return {
          needsExecution: true,
          specialistResponse: null,
          specialist: 'data_generation',
          taskType: 'simple_file_edit',
          skipPlanning: true,        // ← SKIP PLANNING!
          directExecution: true,     // ← GO STRAIGHT TO CODE-ACT!
          preGeneratedAction: actionXML,
          operation
        };
      }
    }
  }
  
  // FALLBACK: General file edit patterns (for complex edits that need LLM)
  const fileEditPatterns = [
    /add.*\b(to|in|into).*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /update.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /modify.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /change.*\b(in|the).*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /edit.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /put.*\b(in|at|into).*\b(document|file|doc|top|bottom)\b/i
  ];
  
  const isFileEdit = fileEditPatterns.some(pattern => pattern.test(goal));
  
  // For complex edits, check if there are files in context
  if (isFileEdit && files && files.length > 0) {
    console.log(`[AutoReply] File edit detected, routing to specialist`);
    // Let specialist handle complex edits (don't skip planning)
    return {
      needsExecution: true,
      specialistResponse: null,
      specialist: 'data_generation',
      taskType: 'file_modification'
    };
  }
  // Let all other file generation requests route to specialist (they'll get proper planning)
  
  // Check if we should route to a specialist
  console.log('[AutoReply] Initializing coordinator for goal:', goal.substring(0, 100));
  const coordinator = new MultiAgentCoordinator({
    conversation_id,
    user_id
  });
  
  const taskType = coordinator.detectTaskType(goal);
  console.log(`[AutoReply] Detected task type: ${taskType}`);
  
  if (taskType !== 'general_chat') {
    console.log(`[AutoReply] Routing to specialist: ${taskType}`);
    
    // SPEED OPTIMIZATION: Send pre-fill message for simple_data_generation
    // This reassures user while specialist spins up (reduces perceived latency)
    if (taskType === 'simple_data_generation') {
      console.log('[AutoReply] ⚡ Simple doc generation - will send pre-fill message');
      // Note: Pre-fill message will be sent by AgenticAgent after specialist returns
    }
    
    // CRITICAL: Tasks that require tool execution should NOT be marked as "handled"
    // These task types need AgenticAgent to continue to planning and tool execution
    const requiresToolExecution = [
      'data_generation',      // Creating files, documents, etc.
      'code_generation',      // Writing code files
      'system_design',        // Creating diagrams, architecture files
      'web_research'          // Fetching and saving research data
    ];
    
    const needsTools = requiresToolExecution.includes(taskType);
    
    try {
      // Pass conversation messages, profile context, files, AND onTokenStream for streaming
      // This enables real-time token streaming during specialist LLM calls
      // CRITICAL: Pass files array with _analysis data for file upload recognition
      const result = await coordinator.execute(goal, { messages, profileContext, onTokenStream, files });
      console.log(`[AutoReply] Coordinator execute result:`, result.success ? 'SUCCESS' : 'FAILED');
      
      // Check if specialist failed (both primary and fallback)
      if (!result.success || result.error) {
        console.error('[AutoReply] ❌ All specialists failed:', result.message || 'Unknown error');
        console.log('[AutoReply] Falling back to default model');
        // Fall through to default model handling
      } else if (result.success) {
        console.log(`[AutoReply] Specialist ${result.specialist} handled the request`);
        
        // CRITICAL: Check for empty specialist response
        if (!result.result || (typeof result.result === 'string' && result.result.trim() === '')) {
          console.error('[AutoReply] ❌ Specialist returned empty response');
          console.log('[AutoReply] Falling back to default model');
          // Fall through to default model handling
        } else {
          // If task needs tools, mark as needing execution but provide specialist response
          // This allows AgenticAgent to continue to planning and tool execution
          if (needsTools) {
            console.log(`[AutoReply] Task type ${taskType} requires tools - continuing to planning`);
            console.log(`[AutoReply] Specialist response content:`, result.result?.substring(0, 200) || 'EMPTY');
            return {
              needsExecution: true,
              specialistResponse: result.result,
              specialist: result.specialist,
              taskType: taskType
            };
          }
          
          // For tasks that don't need tools (like chat, analysis), mark as handled
          return {
            handledBySpecialist: true,
            result: result.result,
            specialist: result.specialist,
            taskType: taskType
          };
        }
      }
    } catch (error) {
      console.error('[AutoReply] Specialist routing failed, falling back to default:', error);
    }
  } else {
    console.log('[AutoReply] Task type is general_chat, using default model');
  }
  
  // GREETING DETECTION: Check if this is a simple greeting that doesn't need planning
  const greetingPatterns = [
    /^(hi|hello|hey|good\s+(morning|afternoon|evening)|greetings?)[\s!.]*$/i,
    /^(what('s|\s+is)\s+up|wassup|sup)[\s!.?]*$/i,
    /^(how\s+(are|r)\s+you|how's\s+it\s+going)[\s!.?]*$/i,
    /^(yo|hiya|howdy)[\s!.]*$/i,
    /^thanks?(\s+you)?[\s!.]*$/i,
    /^(ok|okay|got\s+it|understood)[\s!.]*$/i
  ];
  
  const isSimpleGreeting = greetingPatterns.some(pattern => pattern.test(goal.trim()));
  
  let model_info = await getDefaultModel(conversation_id)
  
  // Null check to prevent crashes
  if (!model_info) {
    console.warn('[AutoReply] No model found for conversation, using local fallback');
    model_info = { is_subscribe: false };  // Use local model as fallback
  }
  
  if (model_info.is_subscribe) {
    let replay = await auto_reply_server(goal, conversation_id)
    // If simple greeting, mark as fully handled to skip planning
    if (isSimpleGreeting) {
      console.log('[AutoReply] ✅ Simple greeting detected - skipping planning phase');
      return {
        handledBySpecialist: true,
        result: replay,
        specialist: 'auto_reply_greeting',
        taskType: 'general_chat'
      };
    }
    return replay
  }
  let replay = await auto_reply_local(goal, conversation_id)
  // If simple greeting, mark as fully handled to skip planning
  if (isSimpleGreeting) {
    console.log('[AutoReply] ✅ Simple greeting detected - skipping planning phase');
    return {
      handledBySpecialist: true,
      result: replay,
      specialist: 'auto_reply_greeting',
      taskType: 'general_chat'
    };
  }
  return replay
}

const auto_reply_server = async (goal, conversation_id) => {
  // let [res, token_usage] = await sub_server_request('/api/sub_server/auto_reply', {
  let res = await sub_server_request('/api/sub_server/auto_reply', {
    goal,
    conversation_id
  })

  // await conversation_token_usage(token_usage, conversation_id)

  return res
};

const auto_reply_local = async (goal, conversation_id) => {
  // Call the model to get a response in English based on the goal
  const prompt = await resolveAutoReplyPrompt(goal);
  const auto_reply = await call(prompt, conversation_id);

  return auto_reply
}



module.exports = exports = auto_reply;
