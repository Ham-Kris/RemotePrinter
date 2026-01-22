# PM2 部署指南（Windows）

本指南說明如何在 Windows 系統上使用 PM2 部署遠端列印服務。

## 前置需求

1. 已安裝 [Node.js](https://nodejs.org/) (LTS 版本)
2. 專案已放置於 `D:\remoteprinter\`

## 安裝 PM2

以**管理員身份**開啟 PowerShell，執行：

```powershell
npm install -g pm2
```

## 部署步驟

### 1. 停止現有進程（如有）

```powershell
pm2 delete remote-printer
```

### 2. 安裝專案依賴

```powershell
cd D:\remoteprinter
npm install
```

### 3. 使用 PM2 啟動服務

```powershell
npm run pm2:start
```

或直接執行：

```powershell
pm2 start ecosystem.config.js
```

### 4. 驗證服務狀態

```powershell
pm2 status
```

應該會看到 `remote-printer` 狀態為 `online`。

### 5. 查看日誌

```powershell
npm run pm2:logs
```

或：

```powershell
pm2 logs remote-printer
```

日誌檔案位置：`D:\remoteprinter\logs\`

## 常用命令

| 命令 | 說明 |
|------|------|
| `npm run pm2:start` | 啟動服務 |
| `npm run pm2:stop` | 停止服務 |
| `npm run pm2:restart` | 重啟服務 |
| `npm run pm2:logs` | 查看日誌 |
| `npm run pm2:status` | 查看狀態 |

## 設定開機自動啟動

### 方法一：使用 pm2-startup（推薦）

```powershell
# 安裝 pm2-windows-startup
npm install -g pm2-windows-startup

# 設定開機啟動
pm2-startup install

# 保存當前進程列表
pm2 save
```

### 方法二：使用 Windows 工作排程器

1. 打開「工作排程器」(`taskschd.msc`)
2. 點擊「建立基本工作」
3. 名稱輸入：`Remote Printer`
4. 觸發程序選擇：「當電腦啟動時」
5. 動作選擇：「啟動程式」
6. 設定：
   - **程式或指令碼**：`pm2`
   - **引數**：`start D:\remoteprinter\ecosystem.config.js`
   - **起始位置**：`D:\remoteprinter`

## 防火牆設定

如果區域網路無法存取，執行以下命令開放 3000 埠：

```powershell
netsh advfirewall firewall add rule name="Remote Printer" dir=in action=allow protocol=tcp localport=3000
```

## 故障排除

### 問題：PM2 啟動後無法連接

**解決方案**：
1. 確認 `ecosystem.config.js` 中的 `cwd` 路徑正確
2. 檢查日誌：`pm2 logs remote-printer`
3. 確認 Node.js 已加入防火牆例外

### 問題：印表機列表為空

**解決方案**：
1. 確認印表機驅動程式已安裝
2. 以管理員身份執行 PM2

### 問題：服務無法啟動

**解決方案**：
```powershell
# 刪除並重新啟動
pm2 delete remote-printer
pm2 start ecosystem.config.js
```

## 存取方式

- **本機**：http://localhost:3000
- **區域網路**：http://<Windows電腦IP>:3000

使用 `ipconfig` 查看本機 IP 地址。
