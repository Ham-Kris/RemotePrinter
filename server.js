const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只接受 PDF 文件'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

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
        message: '列印功能僅支援 Windows 系統'
      });
    }
    const printers = await printer.getPrinters();
    res.json({ printers });
  } catch (error) {
    console.error('Error getting printers:', error);
    res.status(500).json({ error: '無法取得印表機列表' });
  }
});

// Get print queue
app.get('/api/queue', (req, res) => {
  res.json({ queue: printQueue.slice(-50).reverse() }); // Last 50 jobs, newest first
});

// Upload and print PDF
app.post('/api/print', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請上傳 PDF 文件' });
  }

  const jobId = uuidv4();
  const filePath = req.file.path;
  const originalName = decodeFilename(req.file.originalname);
  const selectedPrinter = req.body.printer || null;

  const job = {
    id: jobId,
    filename: originalName,
    status: 'pending',
    createdAt: new Date().toISOString(),
    printer: selectedPrinter || '預設印表機'
  };

  printQueue.push(job);

  try {
    if (!printer) {
      job.status = 'error';
      job.error = '列印功能僅支援 Windows 系統';
      return res.status(500).json({
        error: '列印功能僅支援 Windows 系統',
        job
      });
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
      message: `文件 "${originalName}" 已發送至印表機`,
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
      error: `列印失敗: ${error.message}`,
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
      return res.status(400).json({ error: '文件大小超過限制 (最大 50MB)' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error.message === '只接受 PDF 文件') {
    return res.status(400).json({ error: error.message });
  }
  console.error('Server error:', error);
  res.status(500).json({ error: '伺服器錯誤' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   遠端列印伺服器                            ║
╠═══════════════════════════════════════════════════════════╣
║  伺服器已啟動！                                             ║
║                                                           ║
║  本機存取:    http://localhost:${PORT}                      ║
║  區域網路:    http://<本機IP>:${PORT}                        ║
║                                                           ║
║  提示: 使用 ipconfig 查看本機 IP 地址                        ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
