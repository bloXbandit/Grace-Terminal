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
  const files = request.files.files;
  const { conversation_id = '' } = request.body;

  // Handle both single and multiple file uploads
  const fileArray = Array.isArray(files) ? files : [files];

  const uploadedFiles = [];

  const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', state.user.id);
  
  // PHASE 2: Use FileRegistry for unified file management
  const FileRegistry = require('@src/context/FileRegistry');
  const registry = new FileRegistry(conversation_id, state.user.id);

  for (const file of fileArray) {
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
  }

  return response.success(uploadedFiles);
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
  const { id, conversation_id } = request.body || {};
  if (!id || !conversation_id) {
    return response.error("Missing id or conversation_id");
  }

  try {
    const file = await File.findOne({ where: { id } });
    if (!file) {
      return response.error("File does not exist");
    }
    file.conversation_id = conversation_id;
    await file.save();
    return response.success(file, "File updated successfully");
  } catch (error) {
    return response.fail("Failed to update file");
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