const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const WebSocket = require('ws');

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
    fileSize: 100 * 1024 * 1024 // 100MB limit for transfer
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

// Upload file for transfer
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

  transferredFiles.set(code, {
    filename: req.file.filename,
    originalName: originalName,
    path: req.file.path,
    uploadedAt: new Date().toISOString(),
    size: req.file.size
  });

  console.log(`File uploaded: ${originalName} with code ${code}`);

  res.json({
    success: true,
    code: code,
    filename: originalName
  });
});

// List transferred files
app.get('/api/transfer/list', (req, res) => {
  const files = [];
  transferredFiles.forEach((value, code) => {
    files.push({
      code: code,
      filename: value.originalName,
      uploadedAt: value.uploadedAt,
      size: value.size
    });
  });
  
  // Sort by upload time, newest first
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  
  res.json({ files });
});

// Download file by code
app.get('/api/transfer/download/:code', (req, res) => {
  const code = req.params.code;
  const file = transferredFiles.get(code);

  if (!file) {
    return res.status(404).json({ error: '文件不存在或密码错误' });
  }

  if (!fs.existsSync(file.path)) {
    transferredFiles.delete(code);
    return res.status(404).json({ error: '文件已被删除' });
  }

  console.log(`File downloaded: ${file.originalName} with code ${code}`);
  
  res.download(file.path, file.originalName);
});

// Delete file by code
app.delete('/api/transfer/delete/:code', (req, res) => {
  const code = req.params.code;
  const file = transferredFiles.get(code);

  if (!file) {
    return res.status(404).json({ error: '文件不存在或密码错误' });
  }

  // Delete the file
  fs.unlink(file.path, (err) => {
    if (err) {
      console.error('Error deleting transfer file:', err);
    }
  });

  transferredFiles.delete(code);
  console.log(`File deleted: ${file.originalName} with code ${code}`);

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

  transferredFiles.forEach((file, code) => {
    const uploadedAt = new Date(file.uploadedAt).getTime();
    if (now - uploadedAt > maxAge) {
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error cleaning up old file:', err);
      });
      transferredFiles.delete(code);
      console.log(`Cleaned up old file: ${file.originalName}`);
    }
  });
}

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// ==================== Start Server ====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   远程打印服务器 v2.0                       ║
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
║  提示: 使用 ipconfig 查看本机 IP 地址                        ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
