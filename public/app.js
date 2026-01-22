// DOM Elements
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const printerSelect = document.getElementById('printer-select');
const printBtn = document.getElementById('print-btn');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const queueList = document.getElementById('queue-list');
const clearBtn = document.getElementById('clear-btn');
const connectionStatus = document.getElementById('connection-status');
const toast = document.getElementById('toast');

let selectedFile = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPrinters();
    loadQueue();
    setInterval(loadQueue, 5000); // Refresh queue every 5 seconds
});

// Load available printers
async function loadPrinters() {
    try {
        const response = await fetch('/api/printers');
        const data = await response.json();

        if (data.printers && data.printers.length > 0) {
            printerSelect.innerHTML = '<option value="">默认打印机</option>';
            data.printers.forEach(printer => {
                const option = document.createElement('option');
                option.value = printer.name;
                option.textContent = printer.name;
                printerSelect.appendChild(option);
            });
        }

        connectionStatus.textContent = '已连接';
    } catch (error) {
        console.error('Failed to load printers:', error);
        connectionStatus.textContent = '连接失败';
    }
}

// Load print queue
async function loadQueue() {
    try {
        const response = await fetch('/api/queue');
        const data = await response.json();
        renderQueue(data.queue);
    } catch (error) {
        console.error('Failed to load queue:', error);
    }
}

// Render queue list
function renderQueue(queue) {
    if (!queue || queue.length === 0) {
        queueList.innerHTML = `
      <div class="queue-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p>目前没有打印任务</p>
      </div>
    `;
        return;
    }

    queueList.innerHTML = queue.map(job => {
        const statusText = {
            pending: '等待中',
            printing: '打印中',
            completed: '已完成',
            error: '错误'
        };

        const statusIcon = {
            pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
            printing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>',
            completed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
        };

        const timeStr = new Date(job.createdAt).toLocaleTimeString('zh-CN');

        return `
      <div class="queue-item">
        <div class="queue-item-icon ${job.status}">
          ${statusIcon[job.status]}
        </div>
        <div class="queue-item-info">
          <div class="queue-item-name" title="${job.filename}">${job.filename}</div>
          <div class="queue-item-meta">
            <span>${timeStr}</span>
            <span>${job.printer}</span>
            ${job.error ? `<span style="color: var(--error);">${job.error}</span>` : ''}
          </div>
        </div>
        <span class="queue-item-status ${job.status}">${statusText[job.status]}</span>
      </div>
    `;
    }).join('');
}

// File upload handling
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (file.type !== 'application/pdf') {
        showToast('请上传 PDF 文件', 'error');
        return;
    }

    selectedFile = file;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    fileInfo.textContent = `📄 ${file.name} (${sizeMB} MB)`;
    fileInfo.classList.add('visible');
    printBtn.disabled = false;
}

// Print button
printBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('pdf', selectedFile);

    const printerName = printerSelect.value;
    if (printerName) {
        formData.append('printer', printerName);
    }

    printBtn.disabled = true;
    progressContainer.classList.add('visible');
    progressFill.style.width = '0%';
    progressText.textContent = '上傳中...';

    try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = percent + '%';
                progressText.textContent = `上傳中... ${percent}%`;
            }
        });

        xhr.addEventListener('load', () => {
            progressFill.style.width = '100%';

            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                progressText.textContent = '打印任务已发送！';
                showToast(response.message, 'success');
                loadQueue();
            } else {
                const response = JSON.parse(xhr.responseText);
                progressText.textContent = '发送失败';
                showToast(response.error || '打印失败', 'error');
            }

            setTimeout(() => {
                progressContainer.classList.remove('visible');
                resetUpload();
            }, 2000);
        });

        xhr.addEventListener('error', () => {
            progressText.textContent = '连接错误';
            showToast('无法连接到服务器', 'error');
            setTimeout(() => {
                progressContainer.classList.remove('visible');
                printBtn.disabled = false;
            }, 2000);
        });

        xhr.open('POST', '/api/print');
        xhr.send(formData);
    } catch (error) {
        console.error('Upload error:', error);
        showToast('上传失败', 'error');
        progressContainer.classList.remove('visible');
        printBtn.disabled = false;
    }
});

function resetUpload() {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.remove('visible');
    fileInfo.textContent = '';
    printBtn.disabled = true;
}

// Clear completed jobs
clearBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/queue/completed', { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showToast(`已清除 ${data.removed} 个任务`, 'success');
            loadQueue();
        }
    } catch (error) {
        console.error('Failed to clear queue:', error);
        showToast('清除失败', 'error');
    }
});

// Toast notification
function showToast(message, type = 'success') {
    toast.className = `toast ${type}`;
    toast.querySelector('.toast-message').textContent = message;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}
