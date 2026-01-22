const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const WebSocket = require('ws');
const archiver = require('archiver');

// Conditionally load pdf-to-printer (Windows only)
let printer = null;
try {
  printer = require('pdf-to-printer');
} catch (e) {
  console.warn('pdf-to-printer not available (only works on Windows)');
}

// Helper function to decode UTF-8 filename (multer decodes as Latin-1 by default)
function decodeFilename(filename) {
  try {
    // Convert Latin-1 encoded string back to UTF-8
    const bytes = new Uint8Array([...filename].map(c => c.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    return filename; // Return original if decoding fails
  }
}

// Generate 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists (use absolute path for PM2 compatibility)
const uploadsDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure transfer directory exists
const transferDir = path.resolve(__dirname, 'transfers');
if (!fs.existsSync(transferDir)) {
  fs.mkdirSync(transferDir, { recursive: true });
}

// Ensure logs directory exists for PM2
const logsDir = path.resolve(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ==================== WebSocket Setup ====================
const wss = new WebSocket.Server({ server });

// Store connected clients with their IP
const clients = new Map();
// Chat history (keep last 100 messages)
const chatHistory = [];
const MAX_CHAT_HISTORY = 100;

// Get client IP from request
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
}

// Broadcast to all connected clients
function broadcast(data, excludeWs = null) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      const message = { ...data };
      if (client === excludeWs) {
        message.isSelf = true;
      } else {
        message.isSelf = false;
      }
      client.send(JSON.stringify(message));
    }
  });
}

// Send online count to all clients
function broadcastOnlineCount() {
  const count = wss.clients.size;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'online', count }));
    }
  });
}

wss.on('connection', (ws, req) => {
  const ip = getClientIp(req);
  clients.set(ws, { ip });
  
  console.log(`Client connected: ${ip}`);
  
  // Send online count
  broadcastOnlineCount();
  
  // Send chat history to new client
  const historyForClient = chatHistory.map(msg => ({
    ...msg,
    isSelf: msg.ip === ip
  }));
  ws.send(JSON.stringify({ type: 'history', messages: historyForClient }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'chat' && data.message) {
        const chatMessage = {
          type: 'chat',
          ip: ip,
          message: data.message.substring(0, 500), // Limit message length
          time: new Date().toISOString()
        };
        
        // Add to history
        chatHistory.push({ ip: chatMessage.ip, message: chatMessage.message, time: chatMessage.time });
        if (chatHistory.length > MAX_CHAT_HISTORY) {
          chatHistory.shift();
        }
        
        // Broadcast to all clients
        broadcast(chatMessage, ws);
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected: ${ip}`);
    clients.delete(ws);
    broadcastOnlineCount();
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${ip}:`, error);
    clients.delete(ws);
  });
});

// ==================== File Transfer Storage ====================
// Store transferred files: { code: { filename, originalName, path, uploadedAt } }
const transferredFiles = new Map();

// Configure multer for print uploads
const printStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Configure multer for transfer uploads
const transferStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, transferDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Supported file types for printing
const SUPPORTED_MIMETYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

const printUpload = multer({
  storage: printStorage,
  fileFilter: (req, file, cb) => {
    if (SUPPORTED_MIMETYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('只接受 PDF 或 Word 文件 (.pdf, .doc, .docx)'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

const transferUpload = multer({
  storage: transferStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB limit for transfer
  }
});

// Find LibreOffice executable
function findSoffice() {
  const possiblePaths = [
    'soffice', // If in PATH
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'
  ];

  for (const p of possiblePaths) {
    try {
      if (p === 'soffice' || fs.existsSync(p)) {
        return p;
      }
    } catch (e) { }
  }
  return 'soffice'; // Fallback to PATH
}

const SOFFICE_PATH = findSoffice();
console.log(`LibreOffice path: ${SOFFICE_PATH}`);

// Convert Word document to PDF using LibreOffice command line
async function convertToPdf(inputPath, outputDir) {
  console.log(`Converting ${inputPath} to PDF...`);

  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath
    ];

    execFile(SOFFICE_PATH, args, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('LibreOffice conversion error:', error);
        console.error('stderr:', stderr);
        reject(new Error(`转换失败: ${error.message}`));
        return;
      }

      // Get the output PDF path
      const inputBasename = path.basename(inputPath, path.extname(inputPath));
      const outputPath = path.join(outputDir, inputBasename + '.pdf');

      if (fs.existsSync(outputPath)) {
        console.log(`Conversion successful: ${outputPath}`);
        resolve(outputPath);
      } else {
        console.error('PDF not found after conversion. stdout:', stdout);
        reject(new Error('转换后未找到 PDF 文件'));
      }
    });
  });
}

// Print queue
const printQueue = [];

// Serve static files (use absolute path for PM2 compatibility)
app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.json());

// ==================== Print API ====================

// Get available printers
app.get('/api/printers', async (req, res) => {
  try {
    if (!printer) {
      return res.json({
        printers: [],
        message: '打印功能仅支持 Windows 系统'
      });
    }
    const printers = await printer.getPrinters();

    // Fix Chinese encoding issues on Windows
    const fixedPrinters = printers.map(p => {
      if (p.name) {
        try {
          const bytes = Buffer.from(p.name, 'latin1');
          const utf8Name = bytes.toString('utf8');
          if (!utf8Name.includes('\ufffd') && /[\u4e00-\u9fa5]/.test(utf8Name)) {
            return { ...p, name: utf8Name };
          }
        } catch (e) {
          // Keep original if conversion fails
        }
      }
      return p;
    });

    res.json({ printers: fixedPrinters });
  } catch (error) {
    console.error('Error getting printers:', error);
    res.status(500).json({ error: '无法获取打印机列表' });
  }
});

// Get print queue
app.get('/api/queue', (req, res) => {
  res.json({ queue: printQueue.slice(-50).reverse() }); // Last 50 jobs, newest first
});

// Upload and print document (PDF or Word)
app.post('/api/print', printUpload.single('document'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传文件 (PDF 或 Word)' });
  }

  const jobId = uuidv4();
  let filePath = req.file.path;
  const originalName = decodeFilename(req.file.originalname);
  const fileType = SUPPORTED_MIMETYPES[req.file.mimetype];
  let convertedFilePath = null;
  const selectedPrinter = req.body.printer || null;

  const job = {
    id: jobId,
    filename: originalName,
    status: 'pending',
    createdAt: new Date().toISOString(),
    printer: selectedPrinter || '默认打印机'
  };

  printQueue.push(job);

  try {
    if (!printer) {
      job.status = 'error';
      job.error = '打印功能仅支持 Windows 系统';
      return res.status(500).json({
        error: '打印功能仅支持 Windows 系统',
        job
      });
    }

    // Convert Word files to PDF if needed
    if (fileType === 'doc' || fileType === 'docx') {
      job.status = 'converting';
      try {
        convertedFilePath = await convertToPdf(filePath, uploadsDir);
        // Delete original Word file after conversion
        fs.unlinkSync(filePath);
        filePath = convertedFilePath;
      } catch (convError) {
        job.status = 'error';
        job.error = convError.message || '文档转换失败，请确保已安装 LibreOffice';
        fs.unlink(filePath, () => { });
        return res.status(500).json({
          error: job.error,
          job
        });
      }
    }

    job.status = 'printing';

    const printOptions = {};
    if (selectedPrinter) {
      printOptions.printer = selectedPrinter;
    }

    await printer.print(filePath, printOptions);

    job.status = 'completed';
    job.completedAt = new Date().toISOString();

    // Clean up the uploaded file after printing
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }, 5000);

    res.json({
      success: true,
      message: `文件 "${originalName}" 已发送至打印机`,
      job
    });

  } catch (error) {
    console.error('Print error:', error);
    job.status = 'error';
    job.error = error.message;

    // Clean up on error
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    res.status(500).json({
      error: `打印失败: ${error.message}`,
      job
    });
  }
});

// Clear completed jobs from queue
app.delete('/api/queue/completed', (req, res) => {
  const before = printQueue.length;
  for (let i = printQueue.length - 1; i >= 0; i--) {
    if (printQueue[i].status === 'completed' || printQueue[i].status === 'error') {
      printQueue.splice(i, 1);
    }
  }
  const removed = before - printQueue.length;
  res.json({ success: true, removed });
});

// ==================== File Transfer API ====================

// Upload single file for transfer (legacy support)
app.post('/api/transfer/upload', transferUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传文件' });
  }

  const originalName = decodeFilename(req.file.originalname);
  
  // Generate unique 6-digit code
  let code;
  do {
    code = generateCode();
  } while (transferredFiles.has(code));

  // Store as array for consistency with batch upload
  transferredFiles.set(code, {
    files: [{
      filename: req.file.filename,
      originalName: originalName,
      path: req.file.path,
      size: req.file.size
    }],
    uploadedAt: new Date().toISOString(),
    totalSize: req.file.size,
    fileCount: 1
  });

  console.log(`File uploaded: ${originalName} with code ${code}`);

  res.json({
    success: true,
    code: code,
    filename: originalName
  });
});

// Batch upload multiple files with single code (no file count limit, 10GB max)
app.post('/api/transfer/upload-batch', transferUpload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '请上传文件' });
  }

  // Generate unique 6-digit code
  let code;
  do {
    code = generateCode();
  } while (transferredFiles.has(code));

  const createZip = req.body.createZip === 'true';
  const folderName = req.body.folderName || 'files';
  const relativePaths = req.body.relativePaths || [];
  
  // Ensure relativePaths is an array
  const pathsArray = Array.isArray(relativePaths) ? relativePaths : [relativePaths];

  const files = req.files.map((file, index) => ({
    filename: file.filename,
    originalName: decodeFilename(file.originalname),
    relativePath: pathsArray[index] ? decodeFilename(pathsArray[index]) : decodeFilename(file.originalname),
    path: file.path,
    size: file.size
  }));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  // If folder upload, create a zip file
  if (createZip && files.length > 1) {
    try {
      const zipFilename = `${Date.now()}-${uuidv4()}.zip`;
      const zipPath = path.join(transferDir, zipFilename);
      
      await createZipArchive(files, zipPath, folderName);
      
      // Get zip file size
      const zipStats = fs.statSync(zipPath);
      
      // Delete original files after zipping
      for (const file of files) {
        fs.unlink(file.path, (err) => {
          if (err) console.error('Error deleting original file after zip:', err);
        });
      }
      
      // Store zip file info
      transferredFiles.set(code, {
        files: [{
          filename: zipFilename,
          originalName: `${folderName}.zip`,
          path: zipPath,
          size: zipStats.size
        }],
        uploadedAt: new Date().toISOString(),
        totalSize: zipStats.size,
        fileCount: 1,
        isZipped: true,
        originalFileCount: files.length
      });

      console.log(`Folder upload: ${files.length} files zipped to ${folderName}.zip with code ${code}`);

      res.json({
        success: true,
        code: code,
        files: [{ name: `${folderName}.zip`, size: zipStats.size }],
        totalSize: zipStats.size,
        fileCount: 1,
        isZipped: true,
        originalFileCount: files.length
      });
    } catch (zipError) {
      console.error('Zip creation error:', zipError);
      // Clean up uploaded files on error
      for (const file of files) {
        fs.unlink(file.path, () => {});
      }
      return res.status(500).json({ error: '创建压缩文件失败' });
    }
  } else {
    // Normal multi-file upload (no zipping)
    transferredFiles.set(code, {
      files: files,
      uploadedAt: new Date().toISOString(),
      totalSize: totalSize,
      fileCount: files.length
    });

    console.log(`Batch upload: ${files.length} files with code ${code}`);

    res.json({
      success: true,
      code: code,
      files: files.map(f => ({ name: f.originalName, size: f.size })),
      totalSize: totalSize,
      fileCount: files.length
    });
  }
});

// Create zip archive from files
function createZipArchive(files, outputPath, folderName) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 6 } // Compression level (0-9)
    });

    output.on('close', () => {
      console.log(`Zip created: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add files to archive with their relative paths
    for (const file of files) {
      const relativePath = file.relativePath || file.originalName;
      archive.file(file.path, { name: relativePath });
    }

    archive.finalize();
  });
}

// List transferred files
app.get('/api/transfer/list', (req, res) => {
  const entries = [];
  transferredFiles.forEach((value, code) => {
    // Handle both old format (single file) and new format (array of files)
    if (value.files) {
      // New format with files array
      entries.push({
        code: code,
        files: value.files.map(f => ({ name: f.originalName, size: f.size })),
        filename: value.files.length === 1 ? value.files[0].originalName : `${value.files.length} 个文件`,
        uploadedAt: value.uploadedAt,
        size: value.totalSize,
        fileCount: value.fileCount
      });
    } else {
      // Legacy format (single file)
      entries.push({
        code: code,
        filename: value.originalName,
        uploadedAt: value.uploadedAt,
        size: value.size,
        fileCount: 1
      });
    }
  });
  
  // Sort by upload time, newest first
  entries.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  
  res.json({ files: entries });
});

// Get file info by code
app.get('/api/transfer/info/:code', (req, res) => {
  const code = req.params.code;
  const entry = transferredFiles.get(code);

  if (!entry) {
    return res.status(404).json({ error: '文件不存在或密码错误' });
  }

  if (entry.files) {
    res.json({
      success: true,
      code: code,
      files: entry.files.map(f => ({ name: f.originalName, size: f.size })),
      totalSize: entry.totalSize,
      fileCount: entry.fileCount,
      uploadedAt: entry.uploadedAt
    });
  } else {
    // Legacy format
    res.json({
      success: true,
      code: code,
      files: [{ name: entry.originalName, size: entry.size }],
      totalSize: entry.size,
      fileCount: 1,
      uploadedAt: entry.uploadedAt
    });
  }
});

// Download file by code (single file or specific file from batch)
app.get('/api/transfer/download/:code/:index?', (req, res) => {
  const code = req.params.code;
  const index = parseInt(req.params.index) || 0;
  const entry = transferredFiles.get(code);

  if (!entry) {
    return res.status(404).json({ error: '文件不存在或密码错误' });
  }

  // Handle new format with files array
  if (entry.files) {
    if (index < 0 || index >= entry.files.length) {
      return res.status(404).json({ error: '文件索引无效' });
    }
    
    const file = entry.files[index];
    if (!fs.existsSync(file.path)) {
      // Remove this file from the array
      entry.files.splice(index, 1);
      if (entry.files.length === 0) {
        transferredFiles.delete(code);
      }
      return res.status(404).json({ error: '文件已被删除' });
    }

    console.log(`File downloaded: ${file.originalName} with code ${code}`);
    res.download(file.path, file.originalName);
  } else {
    // Legacy format
    if (!fs.existsSync(entry.path)) {
      transferredFiles.delete(code);
      return res.status(404).json({ error: '文件已被删除' });
    }

    console.log(`File downloaded: ${entry.originalName} with code ${code}`);
    res.download(entry.path, entry.originalName);
  }
});

// Delete files by code
app.delete('/api/transfer/delete/:code', (req, res) => {
  const code = req.params.code;
  const entry = transferredFiles.get(code);

  if (!entry) {
    return res.status(404).json({ error: '文件不存在或密码错误' });
  }

  // Handle new format with files array
  if (entry.files) {
    entry.files.forEach(file => {
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting transfer file:', err);
      });
    });
    console.log(`Batch deleted: ${entry.files.length} files with code ${code}`);
  } else {
    // Legacy format
    fs.unlink(entry.path, (err) => {
      if (err) console.error('Error deleting transfer file:', err);
    });
    console.log(`File deleted: ${entry.originalName} with code ${code}`);
  }

  transferredFiles.delete(code);

  res.json({ success: true, message: '文件已删除' });
});

// ==================== Error Handling ====================

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error.message.includes('只接受')) {
    return res.status(400).json({ error: error.message });
  }
  console.error('Server error:', error);
  res.status(500).json({ error: '服务器错误' });
});

// ==================== Cleanup old transfer files ====================
// Clean up files older than 24 hours
function cleanupOldFiles() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  transferredFiles.forEach((entry, code) => {
    const uploadedAt = new Date(entry.uploadedAt).getTime();
    if (now - uploadedAt > maxAge) {
      // Handle new format with files array
      if (entry.files) {
        entry.files.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err) console.error('Error cleaning up old file:', err);
          });
        });
        console.log(`Cleaned up ${entry.files.length} old files with code ${code}`);
      } else {
        // Legacy format
        fs.unlink(entry.path, (err) => {
          if (err) console.error('Error cleaning up old file:', err);
        });
        console.log(`Cleaned up old file: ${entry.originalName}`);
      }
      transferredFiles.delete(code);
    }
  });
}

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// ==================== Start Server ====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   远程打印服务器 v2.1                       ║
╠═══════════════════════════════════════════════════════════╣
║  服务器已启动！                                             ║
║                                                           ║
║  本机访问:    http://localhost:${PORT}                      ║
║  局域网:      http://<本机IP>:${PORT}                        ║
║                                                           ║
║  功能:                                                     ║
║  - 远程打印 (PDF/Word)                                     ║
║  - 实时聊天 (WebSocket)                                    ║
║  - 文件传输 (6位密码下载)                                   ║
║                                                           ║
║  提示: 使用 ipconfig/ifconfig 查看本机 IP 地址              ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
