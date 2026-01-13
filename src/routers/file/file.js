const router = require("koa-router")();

const path = require('path');
const fs = require('fs');
const File = require("@src/models/File");
const { getDirpath } = require('@src/utils/electron');

/**
 * @swagger
 * /api/file/upload:
 *   post:
 *     summary: Upload multiple files
 *     tags:  
 *       - File
 *     description: This endpoint uploads multiple files to the workspace directory.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: The files to be uploaded
 *               conversation_id:
 *                 type: string
 *                 description: Conversation id
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: './schemas/file.json'
 *                 code:
 *                   type: integer
 *                   description: Status code
 *                 msg:
 *                   type: string
 *                   description: Message
 *                 
 */
router.post("/upload", async ({ state, request, response }) => {
  try {
    const files = request.files?.files;
    const { conversation_id = '' } = request.body;

    if (!files) {
      return response.error("No files provided");
    }

    // Handle both single and multiple file uploads
    const fileArray = Array.isArray(files) ? files : [files];
    
    if (fileArray.length === 0) {
      return response.error("No files provided");
    }

    const uploadedFiles = [];
    const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', state.user.id);
    
    // PHASE 2: Use FileRegistry for unified file management
    const FileRegistry = require('@src/context/FileRegistry');
    const registry = new FileRegistry(conversation_id, state.user.id);

    for (const file of fileArray) {
      try {
        const uploadDir = path.join(WORKSPACE_DIR, 'upload');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filePath = path.join(uploadDir, file.originalFilename);

        fs.copyFileSync(file.filepath, filePath);

        // Use FileRegistry to register the file
        const fileDoc = await registry.register(filePath, file.originalFilename);
        
        // Add workspace_dir for backward compatibility
        fileDoc.workspace_dir = WORKSPACE_DIR;

        uploadedFiles.push(fileDoc);
      } catch (fileError) {
        console.error('[File API] Error processing file:', file?.originalFilename, fileError);
        // Continue with other files, don't fail the entire upload
      }
    }

    return response.success(uploadedFiles);
  } catch (error) {
    console.error('[File API] Upload error:', error);
    return response.fail("Failed to upload files: " + error.message);
  }
});

/**
 * @swagger
 * /api/file:
 *   put:
 *     summary: Update file's conversation_id
 *     tags:  
 *       - File
 *     description: Update the conversation_id of a file by its id.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 description: The id of the file to update
 *               conversation_id:
 *                 type: string
 *                 description: The new conversation id
 *     responses:
 *       200:
 *         description: File updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: './schemas/file.json'
 *                 code:
 *                   type: integer
 *                   description: Status code
 *                 msg:
 *                   type: string
 *                   description: Message
 */
router.put("/", async ({ request, response }) => {
  try {
    const { id, conversation_id } = request.body || {};
    
    if (!id || !conversation_id) {
      console.warn('[File API] Missing required fields:', { id, conversation_id });
      return response.error("Missing id or conversation_id");
    }

    const file = await File.findOne({ where: { id } });
    if (!file) {
      console.warn('[File API] File not found:', id);
      return response.error("File does not exist");
    }
    
    file.conversation_id = conversation_id;
    await file.save();
    
    console.log('[File API] Updated file conversation_id:', { id, conversation_id });
    return response.success(file, "File updated successfully");
  } catch (error) {
    console.error('[File API] Update error:', error);
    return response.fail("Failed to update file: " + error.message);
  }
});


/**
 * @swagger
 * /api/file/delete/{file_id}:
 *   delete:
 *     summary: Delete file
 *     tags:  
 *       - File
 *     description: This endpoint deletes a specified file.
 *     parameters:
 *       - in: path
 *         name: file_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The id of the file to be deleted
 *     responses:
 *       200:
 *         description: File deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: './schemas/file.json'
 *                 code:
 *                   type: integer
 *                   description: Status code
 *                 msg:
 *                   type: string
 *                   description: Message
 */
router.delete("/delete/:file_id", async ({ state, params, request, response }) => {

  const { file_id } = params;
  // 假设 conversation_id 通过 query 传递
  const { conversation_id } = request.query || {};

  const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', state.user.id);
  try {
    const file = await File.findOne({
      where: { id: file_id }
    });
    if (!file) {
      return response.error("File does not exist");
    }
    await file.destroy();

    // conversation_id 存在时拼接 Conversation_xxxxx
    let filePath;
    if (conversation_id) {
      filePath = path.join(WORKSPACE_DIR, `Conversation_${conversation_id.slice(0, 6)}`, file.name);
    } else {
      filePath = path.join(WORKSPACE_DIR, 'upload', file.name);
    }

    fs.unlinkSync(filePath);
    return response.success(null, "File deleted successfully");
  } catch (error) {
    console.error(error);
    return response.error("Failed to delete file");
  }
});

/**
 * @swagger
 * /api/file/list:
 *   get:
 *     summary: Get file list
 *     tags:  
 *       - File
 *     description: This endpoint returns the list of all files in the public/files directory.
 *     responses:
 *       200:
 *         description: File list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: './schemas/file.json'
 *                 code:
 *                   type: integer
 *                   description: Status code
 *                 msg:
 *                   type: string
 *                   description: Message
 */
router.get("/list", async ({ response }) => {
  const files = await File.findAll();

  return response.success(files);
});

// preview file by path (primarily for images/media)
router.get('/preview', async ({ request, response }) => {
  const { path: filePath } = request.query || {};

  if (!filePath) {
    response.fail(null, 'File path is required');
    return;
  }
  if (!fs.existsSync(filePath)) {
    response.fail(null, 'File does not exist');
    return;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.tiff': 'image/tiff',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4'
    };

    const stream = fs.createReadStream(filePath);
    const filename = path.basename(filePath);

    if (contentTypes[ext]) {
      response.set('Content-Type', contentTypes[ext]);
      response.set('Cache-Control', 'public, max-age=3600');
    }

    response.file(filename, stream);
  } catch (err) {
    console.error(err);
    response.fail(null, 'Failed to preview file');
  }
});

// read file by path
/**
 * @swagger
 * /api/file/read:
 *   post:
 *     summary: Read file
 *     tags:  
 *       - File
 *     description: This endpoint reads a specified file and returns it as a stream.
 *     parameters:
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The path of the file to be read
 *     responses:
 *       200:
 *         description: File read successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/read', async ({ request, response }) => {
  const { path: filePath, version_id } = request.body;
  
  // CRITICAL FIX: If version_id provided, read from FileVersion table (specific version)
  if (version_id) {
    try {
      const FileVersion = require('@src/models/FileVersion');
      const version = await FileVersion.findOne({ where: { id: version_id } });
      
      if (!version) {
        response.fail(null, 'File version not found');
        return;
      }
      
      // Return version content as buffer
      const buffer = Buffer.from(version.content, 'utf-8');
      const filename = path.basename(version.filepath);
      response.file(filename, buffer);
      return;
    } catch (err) {
      console.error('[FileRead] Failed to read version:', err);
      response.fail(null, 'Failed to read file version');
      return;
    }
  }
  
  // Original behavior: Read from filesystem
  if (!filePath) {
    response.fail(null, 'File path is required');
    return;
  }
  if (!fs.existsSync(filePath)) {
    response.fail(null, 'File does not exist');
    return;
  }
  try {
    const stream = fs.createReadStream(filePath);
    response.file(path.basename(filePath), stream);
  } catch (err) {
    console.error(err);
    response.fail(null, 'Failed to read file');
  }
});

module.exports = exports = router.routes()
/**
 * @swagger
 * /api/file/save:
 *   post:
 *     summary: Save/update file content
 *     tags:  
 *       - File
 *     description: Save or update file content (used by GrapesJS editor)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filepath:
 *                 type: string
 *                 description: Absolute file path
 *               content:
 *                 type: string
 *                 description: File content to save
 *     responses:
 *       200:
 *         description: File saved successfully
 */
router.post("/save", async ({ state, request, response }) => {
  const { filepath, content } = request.body;

  if (!filepath) {
    return response.fail(null, 'File path is required');
  }

  if (content === undefined || content === null) {
    return response.fail(null, 'Content is required');
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file content
    fs.writeFileSync(filepath, content, 'utf8');

    console.log('[File API] Saved file:', filepath, `(${content.length} bytes)`);

    // Update file version in database if it exists
    try {
      const FileRegistry = require('@src/context/FileRegistry');
      const conversationId = filepath.match(/Conversation_([^/]+)/)?.[1];
      
      if (conversationId) {
        const registry = new FileRegistry(conversationId, state.user.id);
        await registry.register(filepath, path.basename(filepath));
        console.log('[File API] Updated file version in database');
      }
    } catch (dbError) {
      console.warn('[File API] Failed to update file version:', dbError.message);
      // Don't fail the request if DB update fails
    }

    return response.success({
      filepath: filepath,
      size: content.length,
      saved: true
    });
  } catch (err) {
    console.error('[File API] Failed to save file:', err);
    return response.fail(null, 'Failed to save file: ' + err.message);
  }
});
