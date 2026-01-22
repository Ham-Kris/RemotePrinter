# 远程打印中心 (Remote Printer)

通过网页界面远程打印 PDF 和 Word 文档到 Windows 电脑上连接的打印机，同时支持局域网文件传输和实时聊天。

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Platform](https://img.shields.io/badge/Platform-Windows%2011-blue)

## 功能特点

### 打印服务
- ✅ 拖放或点击上传文件
- ✅ 支持 PDF 和 Word 文档 (.pdf, .doc, .docx)
- ✅ 自动转换 Word 为 PDF 后打印
- ✅ 支持选择不同打印机
- ✅ 打印队列即时显示

### 文件传输
- ✅ 局域网快速文件传输
- ✅ 6位数字密码分享文件
- ✅ 支持多文件批量上传（不限数量，总计最大10GB）
- ✅ 支持整个文件夹上传（自动打包成 ZIP）
- ✅ 拖放文件/文件夹上传
- ✅ "我上传的文件"本地记录（存储在浏览器中）

### 实时聊天
- ✅ WebSocket 实时通讯
- ✅ 局域网内多设备群聊
- ✅ 在线人数显示
- ✅ 聊天记录同步

### 界面设计
- ✅ 现代化简约主题界面
- ✅ 响应式设计（支持手机、平板）
- ✅ 三栏布局（文件传输 / 打印 / 聊天）

## 系统需求

- **操作系统**: Windows 11 (或 Windows 10)
- **Node.js**: 18.x 或更新版本
- **LibreOffice**: 用于 Word 转换（可选，仅打印 Word 文档时需要）
- **打印机**: 已安装驱动程序并连接到电脑

## 安装步骤

### 1. 安装 Node.js

前往 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

### 2. 下载项目

将此项目文件夹复制到 Windows 电脑上的任意位置，例如：
```
C:\RemotePrinter
```

### 3. 安装依赖

打开命令提示符 (CMD) 或 PowerShell，切换到项目目录：

```powershell
cd C:\RemotePrinter
npm install
```

### 4. 启动服务器

```powershell
npm start
```

成功启动后会显示：
```
╔═══════════════════════════════════════════════════════════╗
║                   远程打印服务器                            ║
╠═══════════════════════════════════════════════════════════╣
║  服务器已启动！                                             ║
║                                                           ║
║  本机访问:    http://localhost:3000                        ║
║  局域网:      http://<本机IP>:3000                          ║
║                                                           ║
║  提示: 使用 ipconfig 查看本机 IP 地址                        ║
╚═══════════════════════════════════════════════════════════╝
```

### 5. 查看本机 IP 地址

在命令提示符执行：
```powershell
ipconfig
```

找到「无线局域网适配器 Wi-Fi」或「以太网适配器」下的 **IPv4 地址**，例如 `192.168.1.100`。

### 6. 从其他设备访问

在同一局域网内的设备（手机、平板、其他电脑），打开浏览器，输入：
```
http://192.168.1.100:3000
```
（将 IP 替换为你的实际 IP 地址）

## 使用方法

### 打印文档

1. 打开网页界面，进入中间的「打印服务」区域
2. 将文件拖放到上传区域，或点击选择文件
   - 支持 PDF 文件 (.pdf)
   - 支持 Word 文档 (.doc, .docx)
3. （可选）从下拉菜单选择特定打印机
4. 点击「打印文件」按钮
5. 等待文件传送到打印机（Word 文档会自动转换为 PDF）

### 文件传输

**上传文件：**
1. 在左侧「文件传输」区域，点击或拖放文件到上传区
2. 可选择「选择文件」（多选）或「选择文件夹」上传整个文件夹
3. 点击「确认上传文件」按钮
4. 上传成功后会显示6位数字密码，分享给他人即可下载

**下载文件：**
1. 在「使用密码获取文件」区域输入6位密码
2. 点击「下载」按钮即可获取文件

**查看我的上传：**
- 点击右上角「我上传的」按钮，可查看本设备上传过的所有文件及对应密码

### 实时聊天

1. 在右侧「实时聊天」区域输入消息
2. 按回车或点击发送按钮
3. 局域网内所有在线设备都可以看到消息

## 防火墙设置

如果局域网内的设备无法访问，可能需要设置 Windows 防火墙：

1. 打开「Windows 安全中心」→「防火墙和网络保护」
2. 点击「允许应用通过防火墙」
3. 点击「更改设置」→「允许其他应用」
4. 浏览并选择 `node.exe`（通常在 `C:\Program Files\nodejs\node.exe`）
5. 勾选「专用」和「公用」网络
6. 点击「确定」

或者直接用管理员身份 PowerShell 执行：
```powershell
netsh advfirewall firewall add rule name="Remote Printer" dir=in action=allow protocol=tcp localport=3000
```

## 开机自动启动（可选）

### 方法一：使用 Windows 任务计划程序

1. 打开「任务计划程序」
2. 创建基本任务
3. 设置触发器为「当计算机启动时」
4. 操作选择「启动程序」
5. 程序设置：
   - 程序: `node`
   - 参数: `server.js`
   - 起始位置: `C:\RemotePrinter`

### 方法二：创建批处理文件

创建 `start-printer.bat`：
```batch
@echo off
cd /d C:\RemotePrinter
node server.js
```

将此批处理文件放入启动文件夹：
`C:\Users\<用户名>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

### 方法三：使用pm2:

- 参见`PM2_DEPLOY.md`

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 无法访问网页 | 确认防火墙设置，检查 IP 地址是否正确 |
| 打印机列表为空 | 检查打印机驱动程序是否正确安装 |
| 打印失败 | 确认打印机已开启并有纸张，查看 Windows 打印队列 |
| Word 转换失败 | 确保已安装 LibreOffice，并将 soffice 加入 PATH |
| 打印支持的格式 | PDF (.pdf)、Word (.doc, .docx) |
| 文件上传失败 | 总计最大 10GB，文件夹上传会自动打包成 ZIP |
| 密码无效 | 确认输入的是6位数字密码，文件可能已被删除或过期 |
| 聊天断开连接 | WebSocket 会自动重连，刷新页面可手动重连 |

## 技术信息

- **后端框架**: Express.js
- **实时通讯**: WebSocket (ws)
- **PDF 打印**: pdf-to-printer
- **Word 转换**: libreoffice-convert (依赖 LibreOffice)
- **文件上传**: multer
- **ZIP 压缩**: archiver
- **前端**: 原生 HTML/CSS/JavaScript
- **进程管理**: PM2 (可选，用于部署)

## 授权

MIT License
