# 遠端列印中心 (Remote Printer)

透過網頁界面遠端列印 PDF 文件到 Windows 電腦上連接的印表機。

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Platform](https://img.shields.io/badge/Platform-Windows%2011-blue)

## 功能特點

- ✅ 拖放或點擊上傳 PDF 文件
- ✅ 自動發送到印表機列印
- ✅ 支援選擇不同印表機
- ✅ 列印佇列即時顯示
- ✅ 現代化深色主題界面
- ✅ 響應式設計（支援手機、平板）

## 系統需求

- **作業系統**: Windows 11 (或 Windows 10)
- **Node.js**: 18.x 或更新版本
- **印表機**: 已安裝驅動程式並連接到電腦

## 安裝步驟

### 1. 安裝 Node.js

前往 [Node.js 官網](https://nodejs.org/) 下載並安裝 LTS 版本。

### 2. 下載專案

將此專案資料夾複製到 Windows 電腦上的任意位置，例如：
```
C:\RemotePrinter
```

### 3. 安裝依賴

打開命令提示字元 (CMD) 或 PowerShell，切換到專案目錄：

```powershell
cd C:\RemotePrinter
npm install
```

### 4. 啟動伺服器

```powershell
npm start
```

成功啟動後會顯示：
```
╔═══════════════════════════════════════════════════════════╗
║                   遠端列印伺服器                            ║
╠═══════════════════════════════════════════════════════════╣
║  伺服器已啟動！                                             ║
║                                                           ║
║  本機存取:    http://localhost:3000                        ║
║  區域網路:    http://<本機IP>:3000                          ║
║                                                           ║
║  提示: 使用 ipconfig 查看本機 IP 地址                        ║
╚═══════════════════════════════════════════════════════════╝
```

### 5. 查看本機 IP 地址

在命令提示字元執行：
```powershell
ipconfig
```

找到「無線區域網路介面卡 Wi-Fi」或「乙太網路介面卡」下的 **IPv4 位址**，例如 `192.168.1.100`。

### 6. 從其他設備存取

在同一區域網路內的設備（手機、平板、其他電腦），打開瀏覽器，輸入：
```
http://192.168.1.100:3000
```
（將 IP 替換為你的實際 IP 地址）

## 使用方法

1. 打開網頁界面
2. 將 PDF 文件拖放到上傳區域，或點擊選擇文件
3. （可選）從下拉選單選擇特定印表機
4. 點擊「列印文件」按鈕
5. 等待文件傳送到印表機

## 防火牆設定

如果區域網路內的設備無法存取，可能需要設定 Windows 防火牆：

1. 打開「Windows 安全性」→「防火牆與網路保護」
2. 點擊「允許應用程式通過防火牆」
3. 點擊「變更設定」→「允許其他應用程式」
4. 瀏覽並選擇 `node.exe`（通常在 `C:\Program Files\nodejs\node.exe`）
5. 勾選「私人」和「公用」网络
6. 點擊「確定」

或者直接用管理員身份 PowerShell 執行：
```powershell
netsh advfirewall firewall add rule name="Remote Printer" dir=in action=allow protocol=tcp localport=3000
```

## 開機自動啟動（可選）

### 方法一：使用 Windows 工作排程器

1. 打開「工作排程器」
2. 建立基本工作
3. 設定觸發程序為「當電腦啟動時」
4. 動作選擇「啟動程式」
5. 程式設定：
   - 程式: `node`
   - 引數: `server.js`
   - 起始位置: `C:\RemotePrinter`

### 方法二：建立批次檔

建立 `start-printer.bat`：
```batch
@echo off
cd /d C:\RemotePrinter
node server.js
```

將此批次檔放入啟動資料夾：
`C:\Users\<用戶名>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

## 故障排除

| 問題 | 解決方案 |
|------|----------|
| 無法存取網頁 | 確認防火牆設定，檢查 IP 地址是否正確 |
| 印表機列表為空 | 檢查印表機驅動程式是否正確安裝 |
| 列印失敗 | 確認印表機已開啟並有紙張，查看 Windows 列印佇列 |
| 只接受 PDF | 本系統僅支援 PDF 文件，其他格式請先轉換 |

## 技術資訊

- **後端框架**: Express.js
- **PDF 列印**: pdf-to-printer
- **文件上傳**: multer
- **前端**: 原生 HTML/CSS/JavaScript

## 授權

MIT License
