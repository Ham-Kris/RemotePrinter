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
const statusIndicator = document.querySelector('.status-indicator');
const toast = document.getElementById('toast');

// Chat Elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const onlineCount = document.getElementById('online-count');

// File Transfer Elements
const transferUploadZone = document.getElementById('transfer-upload-zone');
const transferFileInput = document.getElementById('transfer-file-input');
const transferFolderInput = document.getElementById('transfer-folder-input');
const transferFilesPreview = document.getElementById('transfer-files-preview');
const transferUploadBtn = document.getElementById('transfer-upload-btn');
const uploadBtnText = document.getElementById('upload-btn-text');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadProgressFill = document.getElementById('upload-progress-fill');
const uploadProgressText = document.getElementById('upload-progress-text');
const selectFilesBtn = document.getElementById('select-files-btn');
const selectFolderBtn = document.getElementById('select-folder-btn');
const fileCodeInput = document.getElementById('file-code-input');
const fileFetchBtn = document.getElementById('file-fetch-btn');
const fileDeleteBtn = document.getElementById('file-delete-btn');
const transferFilesList = document.getElementById('transfer-files-list');
const uploadResultsList = document.getElementById('upload-results-list');

// Modal Elements
const uploadSuccessModal = document.getElementById('upload-success-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

// My Files Modal Elements
const myFilesBtn = document.getElementById('my-files-btn');
const myFilesModal = document.getElementById('my-files-modal');
const myFilesList = document.getElementById('my-files-list');
const myFilesCloseBtn = document.getElementById('my-files-close-btn');

let selectedFile = null;
let transferFiles = []; // Changed to array for multi-file support
let uploadResults = []; // Store upload results for modal
let myUploadedFiles = loadMyUploadedFiles(); // Load from localStorage
let ws = null;

// Load my uploaded files from localStorage
function loadMyUploadedFiles() {
    try {
        const stored = localStorage.getItem('myUploadedFiles');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

// Save my uploaded files to localStorage
function saveMyUploadedFiles() {
    try {
        localStorage.setItem('myUploadedFiles', JSON.stringify(myUploadedFiles));
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
}

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
        statusIndicator.classList.remove('disconnected', 'error');
        statusIndicator.classList.add('connected');
        onlineCount.classList.remove('offline');
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        connectionStatus.textContent = '已断开';
        statusIndicator.classList.remove('connected', 'error');
        statusIndicator.classList.add('disconnected');
        onlineCount.textContent = '已离线';
        onlineCount.classList.add('offline');
        // Reconnect after 3 seconds
        setTimeout(initWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectionStatus.textContent = '连接错误';
        statusIndicator.classList.remove('connected', 'disconnected');
        statusIndicator.classList.add('error');
        onlineCount.textContent = '已离线';
        onlineCount.classList.add('offline');
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
            onlineCount.classList.remove('offline');
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

// Select files button
selectFilesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectFilesBtn.classList.add('active');
    selectFolderBtn.classList.remove('active');
    transferFileInput.click();
});

// Select folder button
selectFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectFolderBtn.classList.add('active');
    selectFilesBtn.classList.remove('active');
    transferFolderInput.click();
});

// Click on upload zone (default to file selection)
transferUploadZone.addEventListener('click', (e) => {
    if (e.target === transferUploadZone || e.target.tagName === 'SVG' || e.target.tagName === 'SPAN' || e.target.tagName === 'path' || e.target.tagName === 'line' || e.target.tagName === 'polyline') {
        transferFileInput.click();
    }
});

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
    
    const items = e.dataTransfer.items;
    const files = [];
    
    // Handle both files and folders via DataTransferItemList
    if (items) {
        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i].webkitGetAsEntry();
            if (item) {
                promises.push(traverseFileTree(item));
            }
        }
        Promise.all(promises).then(results => {
            const allFiles = results.flat();
            if (allFiles.length > 0) {
                handleTransferFiles(allFiles);
            }
        });
    } else {
        // Fallback for browsers without DataTransferItemList
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length > 0) {
            handleTransferFiles(droppedFiles);
        }
    }
});

// Recursively traverse file tree for folder drops
function traverseFileTree(item, path = '') {
    return new Promise((resolve) => {
        if (item.isFile) {
            item.file(file => {
                // Add relative path info
                file.relativePath = path + file.name;
                resolve([file]);
            });
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            dirReader.readEntries(entries => {
                const promises = entries.map(entry => 
                    traverseFileTree(entry, path + item.name + '/')
                );
                Promise.all(promises).then(results => {
                    resolve(results.flat());
                });
            });
        } else {
            resolve([]);
        }
    });
}

transferFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleTransferFiles(Array.from(e.target.files));
    }
});

transferFolderInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        // Add relative path from webkitRelativePath
        files.forEach(file => {
            file.relativePath = file.webkitRelativePath || file.name;
        });
        handleTransferFiles(files);
    }
});

function handleTransferFiles(files) {
    const MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024; // 10GB total
    
    let validFiles = [];
    let totalSize = 0;
    let skippedCount = 0;
    
    for (const file of files) {
        if (totalSize + file.size > MAX_TOTAL_SIZE) {
            skippedCount++;
            continue;
        }
        validFiles.push(file);
        totalSize += file.size;
    }
    
    if (skippedCount > 0) {
        showToast(`已跳过 ${skippedCount} 个文件（超过10GB总大小限制）`, 'warning');
    }
    
    if (validFiles.length === 0) {
        showToast('没有有效的文件可上传', 'error');
        return;
    }
    
    transferFiles = validFiles;
    renderTransferFilesPreview();
    updateUploadButton();
}

function renderTransferFilesPreview() {
    if (transferFiles.length === 0) {
        transferFilesPreview.innerHTML = '';
        transferFilesPreview.classList.remove('visible');
        return;
    }
    
    const totalSize = transferFiles.reduce((sum, f) => sum + f.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    let html = `
        <div class="files-preview-header">
            <span class="files-count">${transferFiles.length} 个文件</span>
            <span class="files-size">共 ${totalSizeMB} MB</span>
            <button class="clear-files-btn" id="clear-files-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                清除
            </button>
        </div>
        <div class="files-preview-list">
    `;
    
    // Show first 5 files, then show "+X more"
    const displayFiles = transferFiles.slice(0, 5);
    const moreCount = transferFiles.length - 5;
    
    displayFiles.forEach((file, index) => {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const displayName = file.relativePath || file.name;
        html += `
            <div class="preview-file-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span class="preview-file-name" title="${displayName}">${displayName}</span>
                <span class="preview-file-size">${sizeMB} MB</span>
                <button class="remove-file-btn" data-index="${index}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
    });
    
    if (moreCount > 0) {
        html += `<div class="preview-more-files">还有 ${moreCount} 个文件...</div>`;
    }
    
    html += '</div>';
    
    transferFilesPreview.innerHTML = html;
    transferFilesPreview.classList.add('visible');
    
    // Add event listeners
    document.getElementById('clear-files-btn').addEventListener('click', resetTransferUpload);
    
    transferFilesPreview.querySelectorAll('.remove-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(btn.dataset.index);
            transferFiles.splice(index, 1);
            renderTransferFilesPreview();
            updateUploadButton();
        });
    });
}

function updateUploadButton() {
    if (transferFiles.length === 0) {
        transferUploadBtn.disabled = true;
        uploadBtnText.textContent = '确认上传文件';
    } else {
        transferUploadBtn.disabled = false;
        uploadBtnText.textContent = `上传 ${transferFiles.length} 个文件`;
    }
}

transferUploadBtn.addEventListener('click', async () => {
    if (transferFiles.length === 0) return;
    
    transferUploadBtn.disabled = true;
    uploadProgressContainer.classList.add('visible');
    uploadProgressFill.style.width = '0%';
    uploadProgressText.textContent = `正在上传 ${transferFiles.length} 个文件...`;
    
    // Use batch upload API - all files share one code
    const formData = new FormData();
    
    // Check if this is a folder upload (files have relativePath with directory structure)
    const isFolderUpload = transferFiles.length > 1 && transferFiles.some(f => 
        f.relativePath && f.relativePath.includes('/')
    );
    
    // Get folder name from first file's path if folder upload
    let folderName = '';
    if (isFolderUpload && transferFiles[0].relativePath) {
        folderName = transferFiles[0].relativePath.split('/')[0];
    }
    
    transferFiles.forEach(file => {
        formData.append('files', file);
        // Send relative paths for folder structure
        if (file.relativePath) {
            formData.append('relativePaths', file.relativePath);
        } else {
            formData.append('relativePaths', file.name);
        }
    });
    
    // Tell server to create zip if folder upload
    if (isFolderUpload) {
        formData.append('createZip', 'true');
        formData.append('folderName', folderName);
    }
    
    try {
        // Create XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                uploadProgressFill.style.width = percent + '%';
                uploadProgressText.textContent = `上传中... ${percent}%`;
            }
        });
        
        xhr.addEventListener('load', () => {
            uploadProgressFill.style.width = '100%';
            
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                
                if (data.success) {
                    uploadProgressText.textContent = '上传完成！';
                    
                    // Store upload result with single code
                    uploadResults = [{
                        code: data.code,
                        files: data.files,
                        totalSize: data.totalSize,
                        fileCount: data.fileCount,
                        success: true
                    }];
                    
                    // Add to my uploaded files
                    myUploadedFiles.push({
                        code: data.code,
                        filename: data.fileCount === 1 ? data.files[0].name : `${data.fileCount} 个文件`,
                        files: data.files,
                        size: data.totalSize,
                        fileCount: data.fileCount,
                        uploadTime: new Date().toISOString()
                    });
                    saveMyUploadedFiles();
                    
                    // Show results modal
                    renderUploadResults();
                    uploadSuccessModal.classList.add('visible');
                    
                    // Refresh file list
                    loadTransferFiles();
                } else {
                    uploadProgressText.textContent = '上传失败';
                    showToast(data.error || '上传失败', 'error');
                }
            } else {
                try {
                    const data = JSON.parse(xhr.responseText);
                    uploadProgressText.textContent = '上传失败';
                    showToast(data.error || '上传失败', 'error');
                } catch (e) {
                    uploadProgressText.textContent = '上传失败';
                    showToast('上传失败', 'error');
                }
            }
            
            // Reset after a short delay
            setTimeout(() => {
                uploadProgressContainer.classList.remove('visible');
                resetTransferUpload();
            }, 1500);
        });
        
        xhr.addEventListener('error', () => {
            uploadProgressText.textContent = '连接错误';
            showToast('无法连接到服务器', 'error');
            setTimeout(() => {
                uploadProgressContainer.classList.remove('visible');
                transferUploadBtn.disabled = false;
            }, 2000);
        });
        
        xhr.open('POST', '/api/transfer/upload-batch');
        xhr.send(formData);
        
    } catch (error) {
        console.error('Upload error:', error);
        uploadProgressText.textContent = '上传失败';
        showToast('上传失败', 'error');
        uploadProgressContainer.classList.remove('visible');
        transferUploadBtn.disabled = false;
    }
});

function renderUploadResults() {
    if (uploadResults.length === 0) {
        uploadResultsList.innerHTML = '<p>没有上传结果</p>';
        return;
    }
    
    const result = uploadResults[0]; // Single batch result
    
    if (!result.success) {
        uploadResultsList.innerHTML = `
            <div class="upload-result-item error">
                <div class="result-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </div>
                <div class="result-info">
                    <div class="result-error">${result.error || '上传失败'}</div>
                </div>
            </div>
        `;
        return;
    }
    
    // First show files list, then the code
    let html = `
        <div class="batch-files-summary">
            <span>共 ${result.fileCount} 个文件</span>
            <span>总大小: ${formatFileSize(result.totalSize)}</span>
        </div>
        <div class="batch-files-list">
    `;
    
    // List all uploaded files
    result.files.forEach((file, index) => {
        html += `
            <div class="batch-file-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span class="batch-file-name" title="${file.name}">${file.name}</span>
                <span class="batch-file-size">${formatFileSize(file.size)}</span>
            </div>
        `;
    });
    
    html += `</div>
        <div class="batch-code-display">
            <div class="batch-code-label">取件码</div>
            <div class="batch-code-value">
                <strong>${result.code}</strong>
                <button class="copy-code-btn" onclick="copySingleCode('${result.code}', this)">复制</button>
            </div>
        </div>
    `;
    
    uploadResultsList.innerHTML = html;
}

function copySingleCode(code, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = '复制'; }, 2000);
        }).catch(() => fallbackCopyText(code));
    } else {
        fallbackCopyText(code);
    }
}


function resetTransferUpload() {
    transferFiles = [];
    transferFileInput.value = '';
    transferFolderInput.value = '';
    transferFilesPreview.innerHTML = '';
    transferFilesPreview.classList.remove('visible');
    transferUploadBtn.disabled = true;
    uploadBtnText.textContent = '确认上传文件';
}

// File code operations
fileFetchBtn.addEventListener('click', async () => {
    const code = fileCodeInput.value.trim();
    if (!code || code.length !== 6) {
        showToast('请输入6位数字取件码', 'error');
        return;
    }
    
    // Open download in new tab
    window.open(`/api/transfer/download/${code}`, '_blank');
});

fileDeleteBtn.addEventListener('click', async () => {
    const code = fileCodeInput.value.trim();
    if (!code || code.length !== 6) {
        showToast('请输入6位数字取件码', 'error');
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
            saveMyUploadedFiles();
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
                const fileCount = file.fileCount || 1;
                const icon = fileCount > 1 ? 
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
                    </svg>` :
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>`;
                
                return `
                <div class="transfer-file-item">
                    <div class="file-icon ${fileCount > 1 ? 'multi' : ''}">
                        ${icon}
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

// Fallback copy function using textarea
function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        copyCodeBtn.textContent = '已复制';
        setTimeout(() => {
            copyCodeBtn.textContent = '复制';
        }, 2000);
    } catch (err) {
        console.error('复制失败:', err);
        showToast('复制失败，请手动复制', 'error');
    }
    
    document.body.removeChild(textArea);
}

modalCloseBtn.addEventListener('click', () => {
    uploadSuccessModal.classList.remove('visible');
});

uploadSuccessModal.addEventListener('click', (e) => {
    if (e.target === uploadSuccessModal) {
        uploadSuccessModal.classList.remove('visible');
    }
});

// ==================== My Files Modal ====================
myFilesBtn.addEventListener('click', () => {
    renderMyFilesList();
    myFilesModal.classList.add('visible');
});

myFilesCloseBtn.addEventListener('click', () => {
    myFilesModal.classList.remove('visible');
});

myFilesModal.addEventListener('click', (e) => {
    if (e.target === myFilesModal) {
        myFilesModal.classList.remove('visible');
    }
});

function renderMyFilesList() {
    if (myUploadedFiles.length === 0) {
        myFilesList.innerHTML = `
            <div class="my-files-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p>您还没有上传任何文件</p>
            </div>
        `;
        return;
    }

    myFilesList.innerHTML = myUploadedFiles.map(file => {
        const fileCount = file.fileCount || 1;
        const displayName = file.filename;
        
        // Show file list if multiple files
        let filesHtml = '';
        if (file.files && file.files.length > 1) {
            const displayFiles = file.files.slice(0, 3);
            const moreCount = file.files.length - 3;
            filesHtml = `
                <div class="my-file-list">
                    ${displayFiles.map(f => `<span class="my-file-list-item">${escapeHtml(f.name)}</span>`).join('')}
                    ${moreCount > 0 ? `<span class="my-file-list-more">+${moreCount} 个文件</span>` : ''}
                </div>
            `;
        }
        
        return `
            <div class="my-file-item" data-code="${file.code}">
                <div class="my-file-header">
                    <div class="my-file-name">
                        ${escapeHtml(displayName)}
                    </div>
                    <button class="my-file-delete-btn" onclick="deleteMyFile('${file.code}', this)" title="删除文件">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                        </svg>
                    </button>
                </div>
                ${filesHtml}
                <div class="my-file-info">
                    <span>${formatFileSize(file.size)}</span>
                    <span>🕐 ${formatUploadTime(file.uploadTime)}</span>
                </div>
                <div class="my-file-code">
                    <span>取件码:</span>
                    <strong>${file.code}</strong>
                    <button class="copy-btn" onclick="copyMyFileCode('${file.code}', this)">复制</button>
                </div>
            </div>
        `;
    }).join('');
}

// Delete file from my uploaded files
async function deleteMyFile(code, btn) {
    if (!confirm('确定要删除这个文件吗？')) return;
    
    // Disable button during deletion
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span>';
    
    try {
        const response = await fetch(`/api/transfer/delete/${code}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Remove from my uploaded files
            myUploadedFiles = myUploadedFiles.filter(f => f.code !== code);
            saveMyUploadedFiles();
            
            // Re-render the list
            renderMyFilesList();
            
            // Refresh transfer files list
            loadTransferFiles();
            
            showToast('文件已删除', 'success');
        } else {
            // If file not found on server, still remove from local storage
            if (response.status === 404) {
                myUploadedFiles = myUploadedFiles.filter(f => f.code !== code);
                saveMyUploadedFiles();
                renderMyFilesList();
                showToast('文件已从列表中移除', 'success');
            } else {
                showToast(data.error || '删除失败', 'error');
                btn.disabled = false;
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                </svg>`;
            }
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('删除失败', 'error');
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
        </svg>`;
    }
}

function formatUploadTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function copyMyFileCode(code, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = '复制'; }, 2000);
        }).catch(() => fallbackCopyMyFileCode(code, btn));
    } else {
        fallbackCopyMyFileCode(code, btn);
    }
}

function fallbackCopyMyFileCode(code, btn) {
    const textArea = document.createElement('textarea');
    textArea.value = code;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 2000);
    } catch (err) {
        showToast('复制失败', 'error');
    }
    
    document.body.removeChild(textArea);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
        statusIndicator.classList.remove('disconnected', 'error');
        statusIndicator.classList.add('connected');
    } catch (error) {
        console.error('Failed to load printers:', error);
        connectionStatus.textContent = '连接失败';
        statusIndicator.classList.remove('connected', 'disconnected');
        statusIndicator.classList.add('error');
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
