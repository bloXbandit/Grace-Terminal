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
const { getProfile } = require('@src/services/userProfile');

const auto_reply = async (goal, conversation_id, user_id = 1, messages = [], profileContext = '', onTokenStream = null, files = [], newlyUploadedFileIds = []) => {
  // Skip auto-reply for voice requests (500-1000ms savings)
  // Check for voice task context in messages array (passed from AgenticAgent)
  const isVoiceRequest = messages && messages.some(msg => 
    msg.content && typeof msg.content === 'string' && 
    (msg.content.includes('x-voice-task: true') || msg.content.includes('voice-task: true'))
  );
  
  // Also check for voice indicator in goal (fallback)
  const hasVoiceIndicator = goal && typeof goal === 'string' && goal.includes('[VOICE_TASK]');
  
  if (isVoiceRequest || hasVoiceIndicator) {
    console.log('[AutoReply] ⚡ Skipping for voice request (500-1000ms saved)');
    return null; // Go straight to agent
  }
  
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
      // Catches: "what's in it?", "show me the content", "lmk contents", "what does it contain",
      // doc-analysis phrasings like "analyze this word doc" or "lmk what it's about",
      // and lightweight overview requests like "check this pdf" or "look into this document".
      const contentBreakdownQuery = goal.match(/what'?s? in (it|the|this|that|the file|the document)|show me (the content|what'?s in|the details)|break(down|) (it|the file|the document|this)|lmk (what'?s in|contents?|the contents?)|tell me (what'?s in|the contents?|contents?)|what (does it|it) contains?|what'?s? (the )?contents?|analy[sz]e (this|the) (document|file|pdf|docx|word doc|word document)|what (is|s|does) (this|it|the document|the file) (about|regarding)|check (this|the) (document|file|pdf|docx|word doc|word document)|look into (this|the) (document|file|pdf|docx|word doc|word document)|peep (this|the) (document|file|pdf|docx|word doc|word document)/i);
      
      // CRITICAL FIX: Check BOTH recent messages AND current upload
      // On initial conversation start, messages is [], so we must check files.length > 0
      const hasRecentFileMessage = files.length > 0 || messages.slice(-3).some(m => 
        m.content && (m.content.includes('.pdf') || m.content.includes('.docx') || m.content.includes('document') || m.content.includes('file'))
      );
      
      if (contentBreakdownQuery && hasRecentFileMessage) {
        console.log('[AutoReply] ⚡ Fast-path: Content breakdown request detected - streaming analysis');
        const { generateStreamingBreakdown } = require('@src/utils/fileAnalyzer');

        // STEP 1: Try to resolve a specific file by name/descriptor in the goal text
        const goalLower = (goal || '').toLowerCase();
        let analysis = null;

        if (files && files.length > 0 && analyses && analyses.length > 0) {
          const candidates = files.map((f) => {
            const fid = f.id || f.dataValues?.id;
            const rawName = (f.name || f.filename || '').toLowerCase();
            const nameOnly = rawName.replace(/.*\//, ''); // strip any path
            const base = nameOnly.replace(/\.[a-z0-9]+$/, '');
            const normalizedBase = base.replace(/[_\-]+/g, ' ').trim();
            return {
              file: f,
              id: fid,
              name: nameOnly,
              base: normalizedBase,
              analysis: f._analysis
            };
          });

          // Match by explicit filename or base name appearing in the goal text
          const nameMatches = candidates.filter(c => {
            if (!c.base || c.base.length < 4) return false; // avoid tiny/ambiguous tokens
            return goalLower.includes(c.base);
          });

          if (nameMatches.length === 1 && nameMatches[0].analysis) {
            analysis = nameMatches[0].analysis;
            console.log('[AutoReply] 📎 Using analysis matched by name/base:', nameMatches[0].name);
          } else if (nameMatches.length > 1) {
            // Multiple files mentioned explicitly – avoid guessing in fast-path
            console.log('[AutoReply] ⚠️ Multiple files matched by name in goal; skipping content-breakdown fast-path');
            return null;
          }
        }

        // STEP 2: If no explicit name match, prefer the most recently uploaded file for this message
        if (!analysis && newlyUploadedFileIds && newlyUploadedFileIds.length > 0 && files && files.length > 0) {
          const newestId = newlyUploadedFileIds[newlyUploadedFileIds.length - 1];
          const newestFile = files.find(f => {
            const fid = f.id || f.dataValues?.id;
            return fid === newestId;
          });
          if (newestFile && newestFile._analysis) {
            analysis = newestFile._analysis;
            console.log('[AutoReply] 📎 Using analysis for newest uploaded file:', newestFile.name || newestFile.filename);
          }
        }

        // STEP 3: Simple fallback: first available analysis if we still couldn't resolve
        if (!analysis && analyses && analyses.length > 0) {
          analysis = analyses[0];
          console.log('[AutoReply] 📎 Using analysis[0] as fallback for content breakdown');
        }

        let breakdown;

        // For text-based docs (PDF, DOCX, DOC, TXT, MD), use a small LLM summary instead of raw content dump
        if (analysis && typeof analysis.content === 'string' && (
          analysis.extension === '.pdf' ||
          analysis.extension === '.docx' ||
          analysis.extension === '.doc' ||
          analysis.extension === '.txt' ||
          analysis.extension === '.md'
        )) {
          const rawContent = analysis.content || '';
          const cleanedSnippet = rawContent.substring(0, 2000);

          const prompt = `You are summarizing a document for the user.

Document filename: ${analysis.filename}
Extracted content (may be truncated):
"""
${cleanedSnippet}
"""

In 3-5 short sentences, explain what this document is about and what main topics it covers.
Be conversational, clear, and direct. Do not use markdown or bullet points.
Do NOT quote the full text; just describe it at a high level.`;

          try {
            breakdown = await call(prompt, conversation_id, 'assistant', { temperature: 0.35, max_tokens: 400 });
            if (typeof onTokenStream === 'function' && breakdown) {
              onTokenStream(breakdown);
            }
          } catch (err) {
            console.log('[AutoReply] ⚠️ LLM summary for file breakdown failed, falling back to structured breakdown:', err.message);
            breakdown = await generateStreamingBreakdown(analysis, onTokenStream);
          }
        } else {
          // Non-text / structured files still use the existing structured breakdown
          breakdown = await generateStreamingBreakdown(analysis, onTokenStream);
        }

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
  // Uses write_code  Python script (PROVEN execution path, same as document edits)
  // Catches conversational patterns with maximum flexibility
  // Prefix variants: "can you", "could you", "would you", "please", "lets", "i wanna", "i want", "i need", "make me", "give me", "build me", "get me"
  // Action verbs: create, make, generate, write, build, produce, draft
  // File types: word doc/document, docx, excel, spreadsheet, pdf document/file, pdf, xlsx, document, doc
  // Trigger words (optional): titled, called, named, with, about, on, for, bout, regarding, concerning
  const simpleFileGenPattern = goal.match(/(?:can you |could you |would you |please |lets |let's |lemme |i wanna |i want to |i want |i need |make me |give me |build me |get me |help me )?(?:(create|make|generate|write|build|produce|draft)(?:\s+\w+){0,3}\s+)?(a |an |the |me |some )?(?:new )?(word do+cument|word doc|excel file|spreadsheet|pdf do+cument|pdf file|docx|excel|xlsx|pdf)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?|(?:do+cument|doc)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?/i);

  // IMPORTANT: If the user explicitly asks to "do research" AND draft a doc, route to full agentic flow
  // Example: "do some research and draft a brief word document about AVICI token"
  const researchAndDocPattern = goal.match(/(do|perform|conduct)\s+some?\s*research.*\b(and|then)\b.*\b(draft|write|create|prepare|build|generate|make)\b.*\b(word doc|word document|document|report|spreadsheet|excel (?:file)?|excel spreadsheet|xlsx|pdf (?:file)?|pdf document)\b/i);
  const wantsResearchThenDoc = !!researchAndDocPattern;

  // IMPORTANT: If the user is asking to EDIT an existing document, skip Ultra and go to full agentic
  // Patterns that indicate editing existing docs, not creating new ones
  const docRevisionPattern = goal.match(/(add|change|update|modify|remove|delete|insert|append|edit|set)\s+(.+?)\s+(to|in|on|at|for|as|with)\s+(the\s+)?(doc|document|word\s+doc|excel\s+file|pdf\s+file|spreadsheet|file)|on\s+(the\s+)?(doc|document|word\s+doc|excel\s+file|pdf\s+file|spreadsheet|file)|to\s+(the\s+)?(doc|document|word\s+doc|excel\s+file|pdf\s+file|spreadsheet|file)|in\s+(the\s+)?(doc|document|word\s+doc|excel\s+file|pdf\s+file|spreadsheet|file)/i);
  const isDocRevision = !!docRevisionPattern;

  // CRITICAL FIX: Fast-path for simple metadata revisions (author, title, etc.)
  // These don't need full agentic planning - can use lightweight execution
  console.log('[AutoReply] DEBUG: Checking goal for metadata revision:', goal);
  const simpleMetadataRevisionPattern = goal.match(/(add|set|put|change|update|make)\s+(.+?)\s+(?:as|to|as the|for the)\s+(author|title|subject|owner)(?:\s+(?:on|in|to|for)\s+(?:the\s+)?(?:doc|document|word\s+doc|file))?/i);

  const isSimpleMetadataRevision = !!simpleMetadataRevisionPattern;
  console.log('[AutoReply] DEBUG: Metadata revision pattern result:', isSimpleMetadataRevision, simpleMetadataRevisionPattern);
  
  if (isSimpleMetadataRevision) {
    console.log('[AutoReply] ⚡⚡ METADATA Fast-path: Simple metadata revision detected');
    
    // Extract metadata type and value from the pattern
    const metadataType = simpleMetadataRevisionPattern[3].toLowerCase(); // author, title, etc.
    let metadataValue = simpleMetadataRevisionPattern[2].trim(); // "Kenny Grey", etc.
    if (metadataType === 'author') {
      const normalized = (metadataValue || '').toLowerCase().trim();
      const isPlaceholderAuthor =
        normalized === 'me' ||
        normalized === 'myself' ||
        normalized === 'mine' ||
        normalized === 'my name' ||
        normalized === 'my full name' ||
        normalized === 'my actual name' ||
        normalized.includes('my name');

      if (isPlaceholderAuthor) {
        let resolvedName = null;
        if (profileContext && typeof profileContext === 'string' && profileContext.toLowerCase().includes('name:')) {
          const nameMatch = profileContext.match(/(?:^|\n)\s*-?\s*name:\s*([^\n]+)/i);
          if (nameMatch && nameMatch[1]) {
            const candidate = nameMatch[1].trim();
            if (candidate && !candidate.toLowerCase().includes('my name')) {
              resolvedName = candidate;
            }
          }
        }
        if (!resolvedName) {
          try {
            const profile = await getProfile(user_id, 'name');
            const candidate = profile?.value || profile?.dataValues?.value;
            if (candidate && typeof candidate === 'string' && !candidate.toLowerCase().includes('my name')) {
              resolvedName = candidate.trim();
            }
          } catch (e) {
          }
        }

        if (resolvedName) {
          metadataValue = resolvedName;
        } else {
          return {
            handledBySpecialist: true,
            specialist: 'general_chat',
            taskType: 'general_chat',
            result: 'What name should I put as the author? (Example: "Kenny Grey")'
          };
        }
      }
    }
    
    console.log(`[AutoReply] Metadata revision: ${metadataType} = "${metadataValue}"`);
    
    // Generate Python script to modify existing document metadata
    const timestamp = Date.now();
    const conversationDir = conversation_id.substring(0, 6); // Use same pattern as AgenticAgent
    
    const actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>update_metadata_${timestamp}.py</path>
  <content><![CDATA[import sys
import os
sys.path.append('/usr/local/lib/python3.11/site-packages')
from docx import Document
import glob
import re

def find_recent_docx():
    # Find the most recent .docx file in the CONVERSATION workspace
    conversation_dir = os.getcwd()
    print(f'🔍 Searching for documents in: {conversation_dir}')
    
    docx_files = []
    for root, dirs, files in os.walk(conversation_dir):
        for file in files:
            if file.endswith('.docx') and not file.endswith('_updated.docx'):
                full_path = os.path.join(root, file)
                mtime = os.path.getmtime(full_path)
                docx_files.append((mtime, full_path, file))
    if not docx_files:
        print('❌ No .docx files found to update in conversation directory')
        return None
    # Return most recent file
    docx_files.sort(reverse=True)
    return docx_files[0][1], docx_files[0][2]

try:
    result = find_recent_docx()
    if not result:
        print('❌ No document found for metadata update')
        exit(1)
    
    original_path, original_name = result
    print(f'📄 Found document: {original_name}')
    print(f'📍 Full path: {original_path}')
    
    # Load the document
    doc = Document(original_path)
    
    # Update metadata based on type
    metadata_type = '${metadataType}'
    metadata_value = '${metadataValue}'
    
    if metadata_type == 'author':
        for p in list(doc.paragraphs):
            if p.text.strip().lower().startswith('author:'):
                p._element.getparent().remove(p._element)

        title_idx = None
        for i, p in enumerate(doc.paragraphs):
            style_name = getattr(p.style, 'name', '')
            if style_name in ['Title', 'Heading 1', 'Heading 2']:
                title_idx = i
                break
        if title_idx is None:
            title_idx = 0 if len(doc.paragraphs) > 0 else None

        author_para = doc.add_paragraph(f'Author: {metadata_value}')
        if title_idx is not None and len(doc.paragraphs) > title_idx:
            title_para = doc.paragraphs[title_idx]
            title_para._element.addnext(author_para._element)

        doc.core_properties.author = metadata_value
        print(f'✅ Author set to: {metadata_value}')
    elif metadata_type == 'title':
        doc.core_properties.title = metadata_value
        print(f'✅ Title set to: {metadata_value}')
    elif metadata_type == 'subject':
        doc.core_properties.subject = metadata_value
        print(f'✅ Subject set to: {metadata_value}')
    elif metadata_type == 'owner':
        doc.core_properties.creator = metadata_value
        print(f'✅ Owner set to: {metadata_value}')
    
    # Save as updated version
    name_without_ext = os.path.splitext(original_name)[0]
    updated_name = f'{name_without_ext}_updated.docx'
    updated_path = os.path.join(os.path.dirname(original_path), updated_name)
    
    doc.save(updated_path)
    print(f'✅ Updated document saved as: {updated_name}')
    
    # Verify the update
    updated_doc = Document(updated_path)
    if metadata_type == 'author':
        verified_author = updated_doc.core_properties.author
        print(f'✅ Verified author: {verified_author}')
    
except Exception as e:
    print(f'❌ Error updating document: {str(e)}')
    import traceback
    traceback.print_exc()
    exit(1)
]]></content>
  <description>Update document metadata (${metadataType} to ${metadataValue})</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>update_metadata_${timestamp}.py</args>
</terminal_run>
</actions>`;

    console.log('[AutoReply] Pre-generated metadata revision XML:', actionXML.substring(0, 250));
    
    // Validate XML before returning
    if (!actionXML || actionXML.length < 50 || !actionXML.includes('<actions>') || !actionXML.includes('<write_code>') || !actionXML.includes('<terminal_run>')) {
      console.log('[AutoReply] ⚠️ Invalid metadata revision XML - falling back to specialist routing');
      return null;
    }
    
    // Return pre-generated action for direct execution
    return {
      needsExecution: true,
      specialistResponse: null,
      specialist: 'data_generation',
      taskType: 'metadata_revision',
      skipPlanning: true,
      directExecution: true,
      preGeneratedAction: actionXML
    };
  }
  
  if (simpleFileGenPattern && !wantsResearchThenDoc && !isDocRevision && !isSimpleMetadataRevision) {
    console.log('[AutoReply] ⚡⚡ ULTRA Fast-path: Simple single-file generation detected');
    console.log('[AutoReply] Pattern matched:', simpleFileGenPattern[0]);
    
    // Extract file type (be robust when only generic "document/doc" is used)
    const matchedText = simpleFileGenPattern[0] ? simpleFileGenPattern[0].toLowerCase() : '';
    const fileTypeGroup = simpleFileGenPattern[3] ? simpleFileGenPattern[3].toLowerCase() : '';
    const fileType = fileTypeGroup || matchedText;
    const isPDF = fileType.includes('pdf');
    const isExcel = fileType.includes('excel') || fileType.includes('spreadsheet') || fileType.includes('xlsx');
    // Word is evaluated LAST so explicit PDF/Excel requests win over generic "document/doc"
    const isWordDoc = !isPDF && !isExcel && (fileType.includes('word') || fileType.includes('docx') || fileType.includes('document') || fileType.endsWith('doc'));
    
    // Extract raw title from request (e.g., "make me a word doc about weight training and nutrition")
    const titleMatch = goal.match(/(?:titled|called|named)\s+["']?([^"']+?)["']?(?:\s+with|\s+about|\s+on|\s+for|$)/i) ||
                       goal.match(/(?:about|on|regarding|concerning|re)\s+([^.!?]+?)(?:\s+with|\s+and|$)/i) ||
                       goal.match(/(?:make|create|generate|write)\s+(?:a|an|the|me)?\s*(?:word|excel)?\s*(?:doc|document|file|spreadsheet)?\s+(?:about\s+)?([^.!?]+?)$/i);
    let rawTitle = titleMatch ? titleMatch[1].trim() : goal.trim();

    // Normalize title and extract up to two topics (e.g., "weight training and nutrition")
    const normalizeTitle = (input) => {
      if (!input) return { title: 'Document', topics: ['Document'] };
      let t = input.trim();
      t = t.replace(/^(about|on|regarding|concerning)\s+/i, '');
      t = t.replace(/^and\s+/i, '');
      t = t.replace(/[.!?]+$/g, '');
      if (!t) return { title: 'Document', topics: ['Document'] };
      const parts = t
        .split(/\s+and\s+|,|\&/i)
        .map(p => p.trim())
        .filter(Boolean)
        .slice(0, 2);
      const capWords = (s) => s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      const topics = (parts.length ? parts : [t]).map(capWords);
      const title = topics.join(' and ');
      return { title, topics };
    };

    const { title, topics } = normalizeTitle(rawTitle);

    // Extract author if present
    const authorMatch = goal.match(/(?:with|by)\s+author\s+["']?([^"']+?)["']?(?:\s|$)/i);
    let author = authorMatch ? authorMatch[1].trim() : null;
    
    // Deterministic, structured content generator for 1–2 topics (fallback)
    const buildContent = (topicList) => {
      const [primary, secondary] = topicList;
      if (topicList.length === 1) {
        const t = primary;
        return (
          `${t} plays a central role in improving overall quality of life. ` +
          `It supports long-term health, confidence, and day-to-day performance in work, training, and personal life.\n\n` +
          `A solid foundation in ${t} begins with understanding basic principles, setting realistic goals, and following a consistent, sustainable routine. ` +
          `By focusing on gradual progress instead of quick fixes, people are more likely to build habits that last.\n\n` +
          `Key considerations for ${t} include proper technique, balanced planning, and adequate recovery. ` +
          `When combined with mindful lifestyle choices, ${t} becomes a powerful tool for building strength, resilience, and long-term well-being.\n\n` +
          `In summary, ${t} is most effective when approached with patience, structure, and clear priorities. ` +
          `A thoughtful plan helps transform short-term effort into lasting results.`
        );
      }
      const a = primary;
      const b = secondary;
      return (
        `${a} and ${b} work together to support long-term health, performance, and daily energy. ` +
        `When they are planned in harmony, they create a strong foundation for progress and recovery.\n\n` +
        `${a} focuses on building strength, stability, and physical capacity. A well-designed approach includes progressive overload, proper technique, and enough rest between sessions. ` +
        `This helps protect joints, improve posture, and increase overall power and endurance.\n\n` +
        `${b} provides the fuel and raw materials the body needs to adapt to training. Balanced meals with adequate protein, complex carbohydrates, and healthy fats support muscle repair, hormone balance, and consistent energy levels. ` +
        `Hydration and micronutrients also play a key role in recovery and performance.\n\n` +
        `Together, ${a} and ${b} create a complete framework for progress. ` +
        `By aligning daily habits, training decisions, and food choices with clear goals, people can build a sustainable routine that supports both short-term results and long-term health.`
      );
    };
    
    // CRITICAL: LLM-based content generation for ultra (DOCX and XLSX)
    // Uses a single LLM call to return structured schema (title + sections/rows)
    // If schema cannot be trusted, fall back to full agentic planner instead of deterministic templates
    
    // NEW: Detect list intent for better schema selection
    const detectListIntent = (goal) => {
      const listPatterns = [
        /list of\s+(all\s+)?\d+\s+\w+/i,           // "list of 50 states"
        /list of\s+all\s+\w+/i,                    // "list of all presidents"
        /all\s+\d+\s+\w+/i,                        // "all 50 states"
        /all\s+\w+\s+(states|presidents|countries)/i, // "all US states"
        /each\s+\w+/i,                             // "each state"
        /bullet\s*(?:points|items)?/i,              // "bullet points"
        /bulleted\s+list/i,                         // "bulleted list"
        /line\s+items?/i                            // "line items"
      ];
      return listPatterns.some(pattern => pattern.test(goal));
    };

    const isListRequest = detectListIntent(goal);
    console.log('[AutoReply] 🎯 Intent detected:', isListRequest ? 'LIST' : 'ESSAY', 'for goal:', goal.substring(0, 80));

    // NEW: Detect style profile based on user phrasing (plain, bullets, numbered, formal)
    const detectStyleProfile = (goal, isList) => {
      const lower = (goal || '').toLowerCase();

      // Explicit plain / no-format hints
      const plainPatterns = [
        /plain black text/,
        /plain text list/,
        /simple list/,
        /no formatting/,
        /no colors?,? no bold/,
        /no colours?,? no bold/,
        /black and white only/,
        /no color/,
        /no colours?/
      ];

      // Bullet list hints
      const bulletPatterns = [
        /as bullet points?/,
        /as bullets?/,
        /bulleted list/,
        /bullet list/
      ];

      // Numbered / ordered list hints
      const numberedPatterns = [
        /numbered list/,
        /ordered list/,
        /as 1\./
      ];

      // Formal / professional report hints (mainly for essays)
      const formalPatterns = [
        /formal report/,
        /professional (document|format)/,
        /executive (summary|style)/
      ];

      const matchesAny = (patterns) => patterns.some((p) => p.test(lower));

      if (isList) {
        if (matchesAny(bulletPatterns)) return 'bullet_list';
        if (matchesAny(numberedPatterns)) return 'numbered_list';
        if (matchesAny(plainPatterns)) return 'plain_list';
        // default list style
        return 'accent_list';
      }

      // Essay / non-list styles
      if (matchesAny(plainPatterns)) return 'plain_essay';
      if (matchesAny(formalPatterns)) return 'formal_report';
      // default essay style
      return 'formal_report';
    };

    const styleProfile = detectStyleProfile(goal, isListRequest);
    console.log('[AutoReply] 🎨 Style profile:', styleProfile, 'for goal:', goal.substring(0, 80));

    let schema = null;
    if (isWordDoc || isPDF) {
      const llmStart = Date.now();
      try {
        // DYNAMIC: Choose prompt based on intent
        const prompt = isListRequest ? `You are generating a LIST document. Return ONLY valid JSON in this exact format:
{
  "title": "Document Title",
  "sections": [
    { "heading": "Item 1", "body": "" },
    { "heading": "Item 2", "body": "" },
    { "heading": "Item 3", "body": "" },
    ...
  ]
}

Each section represents one list item. Use the heading for the item name. Keep body empty or very short. Include ALL items requested.

User goal: "${goal}"
Topics: ${topics.join(', ')}

Generate the complete list now (JSON only):` : `You are writing the actual content of a document. Do NOT describe what you will do or mention tools, files, Python, or docx. Return ONLY valid JSON in this exact format:
{
  "title": "Document Title",
  "sections": [
    { "heading": "Introduction", "body": "..." },
    { "heading": "Topic 1", "body": "..." },
    { "heading": "Topic 2", "body": "..." },
    { "heading": "Conclusion", "body": "..." }
  ]
}

User goal: "${goal}"
Topics: ${topics.join(', ')}

Write the document content now (JSON only):`;

        const rawResponse = await call(prompt, conversation_id, 'assistant', { temperature: 0.5, max_tokens: 2000 });
        const llmEnd = Date.now();
        console.log('[AutoReply] ULTRA timing: LLM_ms =', llmEnd - llmStart, 'chars =', rawResponse?.length || 0);

        // Robustly extract JSON payload from possible ```json fenced output
        let cleaned = (rawResponse || '').trim();
        const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fencedMatch && fencedMatch[1]) {
          cleaned = fencedMatch[1].trim();
        } else {
          // No clear fenced block; strip any stray fences to avoid `Unexpected token '`'`
          cleaned = cleaned.replace(/```/g, '').trim();
        }

        let parsed = null;
        try {
          parsed = JSON.parse(cleaned);
        } catch (err) {
          console.log('[AutoReply] ⚠️ Ultra JSON.parse failed first pass:', err.message);
          // Attempt to salvage JSON object between first '{' and last '}' from the ORIGINAL response
          const source = rawResponse || cleaned;
          const firstBrace = source.indexOf('{');
          const lastBrace = source.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            const candidate = source.slice(firstBrace, lastBrace + 1);
            try {
              parsed = JSON.parse(candidate);
              console.log('[AutoReply] ✅ Ultra JSON salvage succeeded after trimming raw braces');
            } catch (err2) {
              console.log('[AutoReply] ⚠️ Ultra JSON salvage parse failed:', err2.message);
            }
          }
        }

        if (parsed) {
          const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];

          // Very permissive section normalization: accept any reasonable heading/body-like fields
          let validSections = [];
          if (sectionsRaw.length > 0) {
            validSections = sectionsRaw
              .map((s, idx) => {
                if (!s || typeof s !== 'object') return null;

                // Heading fallbacks: heading → title → name → "Section N"
                let heading = null;
                if (typeof s.heading === 'string') heading = s.heading;
                else if (typeof s.title === 'string') heading = s.title;
                else if (typeof s.name === 'string') heading = s.name;
                else heading = `Section ${idx + 1}`;

                // LIST MODE: For list-intent docs, keep only headings and force empty bodies so we never dump JSON
                if (isListRequest) {
                  heading = heading.trim();
                  if (!heading) return null;
                  return { heading, body: '' };
                }

                // Body fallbacks: body/content/text/paragraphs/description, arrays joined
                let body = null;
                if (typeof s.body === 'string') body = s.body;
                else if (Array.isArray(s.body)) body = s.body.join('\n\n');
                else if (typeof s.content === 'string') body = s.content;
                else if (Array.isArray(s.content)) body = s.content.join('\n\n');
                else if (typeof s.text === 'string') body = s.text;
                else if (Array.isArray(s.paragraphs)) body = s.paragraphs.join('\n\n');
                else if (typeof s.description === 'string') body = s.description;

                if (!body) return null;

                heading = heading.trim();
                body = body.trim();
                if (!heading || !body) return null;
                return { heading, body };
              })
              .filter(Boolean);
          }

          let finalTitle = typeof parsed.title === 'string' && parsed.title.trim()
            ? parsed.title.trim()
            : title; // fall back to normalized title from goal

          if (validSections.length > 0) {
            schema = {
              title: finalTitle,
              sections: validSections
            };
            console.log('[AutoReply] ✅ LLM UltraDocumentSchema accepted. sections_kept =', validSections.length, 'sections_total =', sectionsRaw.length);
          } else {
            // No usable structured sections, but we still have parsed JSON: wrap entire payload as one section
            const fallbackBody = (() => {
              if (typeof parsed.body === 'string' && parsed.body.trim()) return parsed.body.trim();
              if (cleaned) return cleaned; // cleaned JSON/text
              if (rawResponse) return rawResponse;
              try {
                return JSON.stringify(parsed, null, 2);
              } catch { return String(parsed); }
            })();

            schema = {
              title: finalTitle,
              sections: [
                {
                  heading: finalTitle || 'Document',
                  body: fallbackBody || ''
                }
              ]
            };
            console.log('[AutoReply] ⚠️ Ultra schema had no structured sections; using single-section fallback from raw content');
          }
        } else {
          // JSON completely failed to parse – still build a single-section schema from raw text
          const fallbackBody = cleaned || rawResponse || '';
          schema = {
            title,
            sections: [
              {
                heading: title,
                body: fallbackBody
              }
            ]
          };
          console.log('[AutoReply] ⚠️ Ultra LLM response could not be parsed as JSON; using raw text as single DOCX section');
        }
      } catch (err) {
        console.log('[AutoReply] ⚠️ LLM call or JSON parse failed:', err.message);
        // Hard failure (network/timeout/etc). Still build a minimal DOCX so the user gets a file.
        const fallbackBody = `Grace encountered an internal error while generating structured content for your document.\n\nOriginal goal:\n${goal}`;
        schema = {
          title,
          sections: [
            {
              heading: title,
              body: fallbackBody
            }
          ]
        };
        console.log('[AutoReply] ⚠️ Ultra fallback: using minimal single-section DOCX from goal text due to LLM error');
      }
    }

    // If DOCX/PDF schema is somehow still unavailable, synthesize a last-resort schema from the goal
    if ((isWordDoc || isPDF) && !schema) {
      console.log('[AutoReply] ⚠️ Ultra DOCX schema was null after LLM block; building last-resort fallback from goal');
      schema = {
        title,
        sections: [
          {
            heading: title,
            body: goal || ''
          }
        ]
      };
    }
    
    // CRITICAL: LLM-based Excel schema generation (similar to DOCX)
    if (isExcel) {
      const llmStart = Date.now();
      try {
        // NEW: Detect if user wants ALL items vs examples
        const isAllItemsRequest = /all\s+\w+/i.test(goal) || /every\s+\w+/i.test(goal) || /complete\s+(?:list|set)/i.test(goal);
        console.log('[AutoReply] 🎯 Excel intent detected:', isAllItemsRequest ? 'ALL_ITEMS' : 'SAMPLE', 'for goal:', goal.substring(0, 80));
        
        const prompt = `You are generating data for an Excel spreadsheet. Return ONLY valid JSON in this exact format:
{
  "title": "Spreadsheet Title",
  "headers": ["Column 1", "Column 2", "Column 3", "Column 4"],
  "rows": [
    ["Data 1A", "Data 1B", "Data 1C", "Data 1D"],
    ["Data 2A", "Data 2B", "Data 2C", "Data 2D"],
    ["Data 3A", "Data 3B", "Data 3C", "Data 3D"]
  ]
}

User goal: "${goal}"
Topics: ${topics.join(', ')}

${isAllItemsRequest ? `IMPORTANT: The user is asking for ALL items (e.g., "all presidents", "all 50 states"). Include EVERY item requested, even if that is 50+ rows. Do not truncate the list.` : `Generate realistic sample data with 10-20 rows showing examples.`}
Use appropriate column headers. JSON only:`;

        const rawResponse = await call(prompt, conversation_id, 'assistant', { temperature: 0.5, max_tokens: 2000 });
        const llmEnd = Date.now();
        console.log('[AutoReply] ULTRA Excel timing: LLM_ms =', llmEnd - llmStart, 'chars =', rawResponse?.length || 0);

        // Robustly extract JSON (same as DOCX)
        let cleaned = (rawResponse || '').trim();
        const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fencedMatch && fencedMatch[1]) {
          cleaned = fencedMatch[1].trim();
        } else {
          cleaned = cleaned.replace(/```/g, '').trim();
        }

        let parsed = null;
        try {
          parsed = JSON.parse(cleaned);
        } catch (err) {
          console.log('[AutoReply] ⚠️ Ultra Excel JSON.parse failed first pass:', err.message);
          const source = rawResponse || cleaned;
          const firstBrace = source.indexOf('{');
          const lastBrace = source.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            const candidate = source.slice(firstBrace, lastBrace + 1);
            try {
              parsed = JSON.parse(candidate);
              console.log('[AutoReply] ✅ Ultra Excel JSON salvage succeeded');
            } catch (err2) {
              console.log('[AutoReply] ⚠️ Ultra Excel JSON salvage failed:', err2.message);
            }
          }
        }

        if (parsed && parsed.headers && Array.isArray(parsed.rows)) {
          schema = {
            title: parsed.title || title,
            headers: parsed.headers,
            rows: parsed.rows
          };
          console.log('[AutoReply] ✅ Ultra Excel schema generated:', schema.headers.length, 'columns,', schema.rows.length, 'rows');
        } else {
          console.log('[AutoReply] ⚠️ Ultra Excel LLM response invalid, using fallback');
        }
      } catch (err) {
        console.log('[AutoReply] ⚠️ Ultra Excel LLM call failed:', err.message);
      }
    }
    
    // If Excel schema unavailable, synthesize fallback
    if (isExcel && !schema) {
      console.log('[AutoReply] ⚠️ Ultra Excel schema was null; building fallback');
      schema = {
        title,
        headers: ['Item', 'Description', 'Category', 'Value'],
        rows: [
          [topics[0] || 'Sample 1', 'Generated data for ' + (topics[0] || 'item'), 'Category A', '100'],
          [topics[1] || 'Sample 2', 'Generated data for ' + (topics[1] || 'item'), 'Category B', '200'],
          ['Sample 3', 'Additional example data', 'Category C', '150']
        ]
      };
    }

    // CRITICAL: Python string escape (for embedding in Python code)
    const pythonEscape = (str) => {
      if (!str) return str;
      return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };
    
    // CRITICAL: Only access schema properties based on file type
    const titlePython = schema ? pythonEscape(schema.title) : pythonEscape(title);
    const authorPython = author ? pythonEscape(author) : null;
    
    const isDocLike = (isWordDoc || isPDF);
    
    // For Word/PDF docs: sections
    const sectionsJSON = (isDocLike && schema) ? JSON.stringify(schema.sections) : null;
    const sections = (isDocLike && schema) ? schema.sections : null;
    
    // For Excel: headers and rows
    const excelDataJSON = (isExcel && schema) ? JSON.stringify({ headers: schema.headers, rows: schema.rows }) : null;

    // Fallback content body (used for non-DOCX formats / legacy templates)
    const contentPython = pythonEscape(buildContent(topics));
    
    // CRITICAL: Pre-generate write_code action XML (PROVEN execution path)
    // Uses Python script → runtime.execute_action → write_code → terminal_run
    // WRAP in <actions> parent tag so XML parser handles multiple actions
    let actionXML = '';
    const timestamp = Date.now();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    if (isPDF) {
      // Generate PDF using reportlab from the same schema as Word
      const schemaTitle = schema?.title || title;
      const cleanSchemaTitle = schemaTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanSchemaTitle}.pdf`;
      const pyPDFScript =
        "import json\n" +
        "from reportlab.lib.pagesizes import letter\n" +
        "from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle\n" +
        "from reportlab.lib.units import inch\n" +
        "from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer\n" +
        "from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY\n" +
        "from reportlab.lib.colors import HexColor\n" +
        "\n" +
        "def sanitize_text(text):\n" +
        "    if not isinstance(text, str):\n" +
        "        return ''\n" +
        "    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')\n" +
        "\n" +
        "def smart_truncate(text, max_len=50000):\n" +
        "    if not isinstance(text, str):\n" +
        "        return ''\n" +
        "    if len(text) <= max_len:\n" +
        "        return text\n" +
        "    return text[:max_len] + '...'\n" +
        "\n" +
        'sections_json = ' + JSON.stringify(sectionsJSON) + '\n' +
        "sections = json.loads(sections_json)\n" +
        "title = '" + titlePython + "'\n" +
        "\n" +
        "doc = SimpleDocTemplate('" + filename + "', pagesize=letter, topMargin=0.75*inch, bottomMargin=0.75*inch)\n" +
        "styles = getSampleStyleSheet()\n" +
        "story = []\n" +
        "\n" +
        "title_style = ParagraphStyle(\n" +
        "    'CustomTitle',\n" +
        "    parent=styles['Title'],\n" +
        "    fontSize=24,\n" +
        "    textColor=HexColor('#1F497D'),\n" +
        "    alignment=TA_CENTER,\n" +
        "    spaceAfter=18,\n" +
        ")\n" +
        "\n" +
        "heading_style = ParagraphStyle(\n" +
        "    'CustomHeading',\n" +
        "    parent=styles['Heading2'],\n" +
        "    fontSize=14,\n" +
        "    textColor=HexColor('#1F497D'),\n" +
        "    spaceBefore=18,\n" +
        "    spaceAfter=6,\n" +
        ")\n" +
        "\n" +
        "body_style = ParagraphStyle(\n" +
        "    'CustomBody',\n" +
        "    parent=styles['BodyText'],\n" +
        "    fontSize=11,\n" +
        "    alignment=TA_JUSTIFY,\n" +
        "    spaceAfter=10,\n" +
        ")\n" +
        "\n" +
        "story.append(Paragraph(sanitize_text(title), title_style))\n" +
        "story.append(Spacer(1, 0.2*inch))\n" +
        "\n" +
        "for section in sections:\n" +
        "    heading = sanitize_text(section.get('heading', ''))\n" +
        "    body = sanitize_text(section.get('body', ''))\n" +
        "    if not heading:\n" +
        "        continue\n" +
        "    story.append(Paragraph(heading, heading_style))\n" +
        "    if body:\n" +
        "        story.append(Paragraph(smart_truncate(body), body_style))\n" +
        "\n" +
        "doc.build(story)\n" +
        "print('✅ Created " + filename + "')\n";

      actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>create_pdf_${timestamp}.py</path>
  <content><![CDATA[${pyPDFScript}]]></content>
  <description>Create PDF document: ${title}</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>create_pdf_${timestamp}.py</args>
</terminal_run>
</actions>`;
    } else if (isWordDoc) {
      // Generate DOCX using python-docx
      // Use LLM schema title for more intuitive filenames, fallback to user input
      const schemaTitle = schema?.title || title;
      const cleanSchemaTitle = schemaTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanSchemaTitle}.docx`;
      const authorLine = authorPython
        ? "doc.core_properties.author = '" + authorPython + "'\n"
        : '';
      const pyDocScript =
        "import sys\n" +
        "import os\n" +
        "sys.path.append('/usr/local/lib/python3.11/site-packages')\n" +
        "from docx import Document\n" +
        "from docx.shared import Pt, RGBColor\n" +
        "from docx.enum.text import WD_PARAGRAPH_ALIGNMENT\n" +
        "import re\n" +
        "\n" +
        "def sanitize_text(text):\n" +
        "    return text.replace('\\x00', '')\n" +
        "\n" +
        "def smart_truncate(text, max_length=8000):\n" +
        "    if len(text) <= max_length:\n" +
        "        return text\n" +
        "    sentences = re.split(r'(?<=[.!?])\\s+', text)\n" +
        "    result = ''\n" +
        "    for sentence in sentences:\n" +
        "        if len(result + sentence) <= max_length:\n" +
        "            result += sentence + ' '\n" +
        "        else:\n" +
        "            break\n" +
        "    return result.strip()\n" +
        "\n" +
        "# LLM-generated UltraDocumentSchema (title + sections)\n" +
        'title = """' + titlePython + '"""\n' +
        'sections_json = ' + JSON.stringify(sectionsJSON) + '\n' +
        'import json\n' +
        'sections = json.loads(sections_json)\n' +
        "\n" +
        "doc = Document()\n" +
        "doc.core_properties.title = sanitize_text(title)\n" +
        authorLine +
        'doc.core_properties.comments = "Generated by GRACE AI Assistant"\n' +
        "\n" +
        "style_profile = '" + styleProfile + "'\n" +
        "is_list = " + (isListRequest ? "True" : "False") + "\n" +
        "\n" +
        "title_para = doc.add_paragraph()\n" +
        "title_run = title_para.add_run(sanitize_text(title))\n" +
        "title_run.bold = True\n" +
        "title_run.font.size = Pt(16)\n" +
        "title_run.font.color.rgb = RGBColor(31, 73, 125)\n" +
        "title_para.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER\n" +
        "title_para.paragraph_format.space_after = Pt(12)\n" +
        "\n" +
        "# Render structured sections\n" +
        "for section in sections:\n" +
        "    heading = sanitize_text(section.get('heading', ''))\n" +
        "    body = sanitize_text(section.get('body', ''))\n" +
        "    if not heading:\n" +
        "        continue\n" +
        "    if is_list:\n" +
        "        if style_profile == 'bullet_list':\n" +
        "            para = doc.add_paragraph(heading, style='List Bullet')\n" +
        "        elif style_profile == 'numbered_list':\n" +
        "            para = doc.add_paragraph(heading, style='List Number')\n" +
        "        elif style_profile == 'plain_list':\n" +
        "            para = doc.add_paragraph(heading)\n" +
        "        else:\n" +
        "            para = doc.add_paragraph()\n" +
        "            run = para.add_run(heading)\n" +
        "            run.bold = True\n" +
        "            run.font.size = Pt(13)\n" +
        "            run.font.color.rgb = RGBColor(31, 73, 125)\n" +
        "            para.paragraph_format.space_before = Pt(18)\n" +
        "            para.paragraph_format.space_after = Pt(6)\n" +
        "    else:\n" +
        "        para = doc.add_paragraph()\n" +
        "        run = para.add_run(heading)\n" +
        "        run.bold = True\n" +
        "        run.font.size = Pt(13)\n" +
        "        if style_profile == 'formal_report':\n" +
        "            run.font.color.rgb = RGBColor(31, 73, 125)\n" +
        "        para.paragraph_format.space_before = Pt(18)\n" +
        "        para.paragraph_format.space_after = Pt(6)\n" +
        "    if body and not is_list:\n" +
        "        body_para = doc.add_paragraph()\n" +
        "        body_para.add_run(smart_truncate(body))\n" +
        "        body_para.paragraph_format.space_after = Pt(10)\n" +
        "\n" +
        "doc.save('" + filename + "')\n" +
        "print('✅ Created " + filename + "')\n";

      actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>create_doc_${timestamp}.py</path>
  <content><![CDATA[${pyDocScript}]]></content>
  <description>Create Word document: ${title}</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>create_doc_${timestamp}.py</args>
</terminal_run>
</actions>`;
    } else if (isExcel) {
      // Generate XLSX using openpyxl with LLM-generated data
      // Use LLM schema title for more intuitive filenames, fallback to user input
      const schemaTitle = schema?.title || title;
      const cleanSchemaTitle = schemaTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanSchemaTitle}.xlsx`;
      const pyExcelScript =
        "import json\n" +
        "from openpyxl import Workbook\n" +
        "from openpyxl.styles import Font, Alignment, PatternFill\n" +
        "\n" +
        "# LLM-generated Excel data (headers + rows)\n" +
        'data_json = """' + excelDataJSON + '"""\n' +
        'data = json.loads(data_json)\n' +
        "\n" +
        "# Create workbook\n" +
        "wb = Workbook()\n" +
        "ws = wb.active\n" +
        "title = '" + titlePython + "'\n" +
        "ws.title = title[:31]  # Excel sheet name limit\n" +
        "\n" +
        "# Add title (row 1, merged)\n" +
        "ws['A1'] = title\n" +
        "ws['A1'].font = Font(size=14, bold=True)\n" +
        "ws['A1'].alignment = Alignment(horizontal='center')\n" +
        "\n" +
        "# Merge title across all columns\n" +
        "headers = data.get('headers', [])\n" +
        "if len(headers) > 1:\n" +
        "    end_col = chr(64 + len(headers))\n" +
        "    ws.merge_cells(f'A1:{end_col}1')\n" +
        "\n" +
        "# Add headers (row 3) with styling\n" +
        "for col_idx, header in enumerate(headers, start=1):\n" +
        "    cell = ws.cell(row=3, column=col_idx, value=header)\n" +
        "    cell.font = Font(bold=True, color='FFFFFF')\n" +
        "    cell.fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')\n" +
        "    cell.alignment = Alignment(horizontal='center')\n" +
        "\n" +
        "# Add data rows (starting from row 4)\n" +
        "rows = data.get('rows', [])\n" +
        "for row_idx, row_data in enumerate(rows, start=4):\n" +
        "    for col_idx, value in enumerate(row_data, start=1):\n" +
        "        ws.cell(row=row_idx, column=col_idx, value=value)\n" +
        "\n" +
        "# Auto-adjust column widths\n" +
        "for col in ws.columns:\n" +
        "    max_length = 0\n" +
        "    # Skip merged cells which don't have column_letter property\n" +
        "    if not hasattr(col[0], 'column_letter'):\n" +
        "        continue\n" +
        "    column = col[0].column_letter\n" +
        "    for cell in col:\n" +
        "        if cell.value:\n" +
        "            max_length = max(max_length, len(str(cell.value)))\n" +
        "    ws.column_dimensions[column].width = min(max_length + 2, 50)\n" +
        "\n" +
        "wb.save('" + filename + "')\n" +
        "print('✅ Created " + filename + "')\n";

      actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>create_excel_${timestamp}.py</path>
  <content><![CDATA[${pyExcelScript}]]></content>
  <description>Create Excel spreadsheet: ${title}</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>create_excel_${timestamp}.py</args>
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
    
    // CRITICAL FIX: If task needs tools, skip specialist in auto_reply
    // Go directly to planning/execution to avoid hallucinated responses
    if (needsTools) {
      console.log(`[AutoReply] Task type ${taskType} requires tools - skipping auto_reply specialist`);
      console.log(`[AutoReply] Continuing directly to planning and execution`);
      return null; // Let AgenticAgent handle planning and execution
    }
    
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
  console.log('[AutoReply] DEBUG: auto_reply function called with goal:', goal);
  // Call the model to get a response in English based on the goal
  const prompt = await resolveAutoReplyPrompt(goal);
  const auto_reply = await call(prompt, conversation_id);

  return auto_reply
}



module.exports = exports = auto_reply;