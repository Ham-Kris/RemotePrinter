const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');

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

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists (use absolute path for PM2 compatibility)
const uploadsDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure logs directory exists for PM2
const logsDir = path.resolve(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Supported file types
const SUPPORTED_MIMETYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

const upload = multer({
  storage: storage,
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
    // Some Windows systems return printer names in system default encoding
    const fixedPrinters = printers.map(p => {
      // Try to detect and fix garbled Chinese characters
      if (p.name) {
        try {
          // If the name appears garbled (contains replacement characters or looks like mis-decoded text)
          // Convert from Latin-1 interpreted bytes back to UTF-8
          const bytes = Buffer.from(p.name, 'latin1');
          const utf8Name = bytes.toString('utf8');
          // Check if conversion produced valid result (no replacement chars)
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
app.post('/api/print', upload.single('document'), async (req, res) => {
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

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制 (最大 50MB)' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error.message.includes('只接受')) {
    return res.status(400).json({ error: error.message });
  }
  console.error('Server error:', error);
  res.status(500).json({ error: '服务器错误' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   远程打印服务器                            ║
╠═══════════════════════════════════════════════════════════╣
║  服务器已启动！                                             ║
║                                                           ║
║  本机访问:    http://localhost:${PORT}                      ║
║  局域网:      http://<本机IP>:${PORT}                        ║
║                                                           ║
║  提示: 使用 ipconfig 查看本机 IP 地址                        ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
