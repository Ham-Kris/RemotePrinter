// ==================== DOM Elements ====================
// Print Elements
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

// Chat Elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const onlineCount = document.getElementById('online-count');

// File Transfer Elements
const transferUploadZone = document.getElementById('transfer-upload-zone');
const transferFileInput = document.getElementById('transfer-file-input');
const transferFileInfo = document.getElementById('transfer-file-info');
const transferUploadBtn = document.getElementById('transfer-upload-btn');
const fileCodeInput = document.getElementById('file-code-input');
const fileFetchBtn = document.getElementById('file-fetch-btn');
const fileDeleteBtn = document.getElementById('file-delete-btn');
const transferFilesList = document.getElementById('transfer-files-list');

// Modal Elements
const uploadSuccessModal = document.getElementById('upload-success-modal');
const modalFilename = document.getElementById('modal-filename');
const modalCode = document.getElementById('modal-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const modalCloseBtn = document.getElementById('modal-close-btn');

let selectedFile = null;
let transferFile = null;
let myUploadedFiles = []; // Track files uploaded in this session
let ws = null;

// Supported file types for printing
const SUPPORTED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const SUPPORTED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', () => {
    loadPrinters();
    loadQueue();
    loadTransferFiles();
    initWebSocket();
    setInterval(loadQueue, 5000);
    setInterval(loadTransferFiles, 10000);
});

// ==================== WebSocket Chat ====================
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        connectionStatus.textContent = '已连接';
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        connectionStatus.textContent = '已断开';
        // Reconnect after 3 seconds
        setTimeout(initWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectionStatus.textContent = '连接错误';
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    };
}

function handleWsMessage(data) {
    switch (data.type) {
        case 'chat':
            addChatMessage(data.ip, data.message, data.time, data.isSelf);
            break;
        case 'online':
            onlineCount.textContent = `${data.count} 在线`;
            break;
        case 'history':
            // Load chat history
            chatMessages.innerHTML = '';
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    addChatMessage(msg.ip, msg.message, msg.time, msg.isSelf);
                });
            } else {
                chatMessages.innerHTML = `
                    <div class="chat-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path>
                        </svg>
                        <p>暂无消息</p>
                    </div>
                `;
            }
            break;
    }
}

function addChatMessage(ip, message, time, isSelf) {
    // Remove empty state if exists
    const emptyState = chatMessages.querySelector('.chat-empty');
    if (emptyState) {
        emptyState.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isSelf ? 'self' : 'other'}`;
    
    const timeStr = new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="sender-ip">${ip}</span>
            <span class="message-time">${timeStr}</span>
        </div>
        <div class="message-bubble">${escapeHtml(message)}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'chat',
        message: message
    }));
    
    chatInput.value = '';
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== File Transfer ====================
transferUploadZone.addEventListener('click', () => transferFileInput.click());

transferUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    transferUploadZone.classList.add('dragover');
});

transferUploadZone.addEventListener('dragleave', () => {
    transferUploadZone.classList.remove('dragover');
});

transferUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    transferUploadZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleTransferFile(files[0]);
    }
});

transferFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleTransferFile(e.target.files[0]);
    }
});

function handleTransferFile(file) {
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
        showToast('文件大小超过限制 (最大 100MB)', 'error');
        return;
    }
    
    transferFile = file;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    transferFileInfo.textContent = `📁 ${file.name} (${sizeMB} MB)`;
    transferFileInfo.classList.add('visible');
    transferUploadBtn.disabled = false;
}

transferUploadBtn.addEventListener('click', async () => {
    if (!transferFile) return;
    
    const formData = new FormData();
    formData.append('file', transferFile);
    
    transferUploadBtn.disabled = true;
    transferUploadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
        </svg>
        上传中...
    `;
    
    try {
        const response = await fetch('/api/transfer/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Show success modal with code
            modalFilename.textContent = data.filename;
            modalCode.textContent = data.code;
            uploadSuccessModal.classList.add('visible');
            
            // Add to my uploaded files
            myUploadedFiles.push({
                code: data.code,
                filename: data.filename
            });
            
            // Refresh file list
            loadTransferFiles();
            
            // Reset upload form
            resetTransferUpload();
        } else {
            showToast(data.error || '上传失败', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('上传失败', 'error');
    }
    
    transferUploadBtn.disabled = false;
    transferUploadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        上传文件
    `;
});

function resetTransferUpload() {
    transferFile = null;
    transferFileInput.value = '';
    transferFileInfo.classList.remove('visible');
    transferFileInfo.textContent = '';
    transferUploadBtn.disabled = true;
}

// File code operations
fileFetchBtn.addEventListener('click', async () => {
    const code = fileCodeInput.value.trim();
    if (!code || code.length !== 6) {
        showToast('请输入6位数字密码', 'error');
        return;
    }
    
    // Open download in new tab
    window.open(`/api/transfer/download/${code}`, '_blank');
});

fileDeleteBtn.addEventListener('click', async () => {
    const code = fileCodeInput.value.trim();
    if (!code || code.length !== 6) {
        showToast('请输入6位数字密码', 'error');
        return;
    }
    
    if (!confirm('确定要删除这个文件吗？')) return;
    
    try {
        const response = await fetch(`/api/transfer/delete/${code}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('文件已删除', 'success');
            fileCodeInput.value = '';
            loadTransferFiles();
            
            // Remove from my uploaded files
            myUploadedFiles = myUploadedFiles.filter(f => f.code !== code);
        } else {
            showToast(data.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('删除失败', 'error');
    }
});

// Only allow numbers in code input
fileCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

async function loadTransferFiles() {
    try {
        const response = await fetch('/api/transfer/list');
        const data = await response.json();
        
        if (data.files && data.files.length > 0) {
            transferFilesList.innerHTML = data.files.map(file => {
                const uploadTime = new Date(file.uploadedAt).toLocaleString('zh-CN', { 
                    month: 'numeric', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                return `
                <div class="transfer-file-item">
                    <div class="file-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div class="file-details">
                        <div class="file-name" title="${file.filename}">${file.filename}</div>
                        <div class="file-meta">${sizeMB} MB · ${uploadTime}</div>
                    </div>
                </div>
            `}).join('');
        } else {
            transferFilesList.innerHTML = `
                <div class="transfer-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <p>暂无上传的文件</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load transfer files:', error);
    }
}

// Modal
copyCodeBtn.addEventListener('click', () => {
    const code = modalCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
        copyCodeBtn.textContent = '已复制';
        setTimeout(() => {
            copyCodeBtn.textContent = '复制';
        }, 2000);
    });
});

modalCloseBtn.addEventListener('click', () => {
    uploadSuccessModal.classList.remove('visible');
});

uploadSuccessModal.addEventListener('click', (e) => {
    if (e.target === uploadSuccessModal) {
        uploadSuccessModal.classList.remove('visible');
    }
});

// ==================== Print Functions ====================
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

async function loadQueue() {
    try {
        const response = await fetch('/api/queue');
        const data = await response.json();
        renderQueue(data.queue);
    } catch (error) {
        console.error('Failed to load queue:', error);
    }
}

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
            converting: '转换中',
            printing: '打印中',
            completed: '已完成',
            error: '错误'
        };

        const statusIcon = {
            pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
            converting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"></path></svg>',
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

// File upload handling for print
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
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const isSupported = SUPPORTED_TYPES.includes(file.type) || SUPPORTED_EXTENSIONS.includes(ext);

    if (!isSupported) {
        showToast('请上传 PDF 或 Word 文件 (.pdf, .doc, .docx)', 'error');
        return;
    }

    selectedFile = file;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const icon = file.type === 'application/pdf' ? '📄' : '📝';
    fileInfo.textContent = `${icon} ${file.name} (${sizeMB} MB)`;
    fileInfo.classList.add('visible');
    printBtn.disabled = false;
}

// Print button
printBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('document', selectedFile);

    const printerName = printerSelect.value;
    if (printerName) {
        formData.append('printer', printerName);
    }

    printBtn.disabled = true;
    progressContainer.classList.add('visible');
    progressFill.style.width = '0%';
    progressText.textContent = '上传中...';

    try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = percent + '%';
                progressText.textContent = `上传中... ${percent}%`;
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
