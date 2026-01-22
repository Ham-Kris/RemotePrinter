# 远程打印中心 (Remote Printer)

通过网页界面远程打印 PDF 和 Word 文档到 Windows 电脑上连接的打印机。

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Platform](https://img.shields.io/badge/Platform-Windows%2011-blue)

## 功能特点

- ✅ 拖放或点击上传文件
- ✅ 支持 PDF 和 Word 文档 (.pdf, .doc, .docx)
- ✅ 自动转换 Word 为 PDF 后打印
- ✅ 支持选择不同打印机
- ✅ 打印队列即时显示
- ✅ 现代化深色主题界面
- ✅ 响应式设计（支持手机、平板）

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

1. 打开网页界面
2. 将文件拖放到上传区域，或点击选择文件
   - 支持 PDF 文件 (.pdf)
   - 支持 Word 文档 (.doc, .docx)
3. （可选）从下拉菜单选择特定打印机
4. 点击「打印文件」按钮
5. 等待文件传送到打印机（Word 文档会自动转换为 PDF）

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

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 无法访问网页 | 确认防火墙设置，检查 IP 地址是否正确 |
| 打印机列表为空 | 检查打印机驱动程序是否正确安装 |
| 打印失败 | 确认打印机已开启并有纸张，查看 Windows 打印队列 |
| Word 转换失败 | 确保已安装 LibreOffice，并将 soffice 加入 PATH |
| 支持的文件格式 | PDF (.pdf)、Word (.doc, .docx) |

## 技术信息

- **后端框架**: Express.js
- **PDF 打印**: pdf-to-printer
- **Word 转换**: libreoffice-convert (依赖 LibreOffice)
- **文件上传**: multer
- **前端**: 原生 HTML/CSS/JavaScript

## 授权

MIT License
