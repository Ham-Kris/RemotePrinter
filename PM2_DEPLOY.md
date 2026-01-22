# PM2 部署指南（Windows）

本指南说明如何在 Windows 系统上使用 PM2 部署远程打印服务。

## 前置需求

1. 已安装 [Node.js](https://nodejs.org/) (LTS 版本)
2. 项目已放置于 `D:\remoteprinter\`

## 安装 PM2

以**管理员身份**打开 PowerShell，执行：

```powershell
npm install -g pm2
```

## 部署步骤

### 1. 停止现有进程（如有）

```powershell
pm2 delete remote-printer
```

### 2. 安装项目依赖

```powershell
cd D:\remoteprinter
npm install
```

### 3. 使用 PM2 启动服务

```powershell
npm run pm2:start
```

或直接执行：

```powershell
pm2 start ecosystem.config.js
```

### 4. 验证服务状态

```powershell
pm2 status
```

应该会看到 `remote-printer` 状态为 `online`。

### 5. 查看日志

```powershell
npm run pm2:logs
```

或：

```powershell
pm2 logs remote-printer
```

日志文件位置：`D:\remoteprinter\logs\`

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run pm2:start` | 启动服务 |
| `npm run pm2:stop` | 停止服务 |
| `npm run pm2:restart` | 重启服务 |
| `npm run pm2:logs` | 查看日志 |
| `npm run pm2:status` | 查看状态 |

## 设置开机自动启动

### 方法一：使用 pm2-startup（推荐）

```powershell
# 安装 pm2-windows-startup
npm install -g pm2-windows-startup

# 设置开机启动
pm2-startup install

# 保存当前进程列表
pm2 save
```

### 方法二：使用 Windows 任务计划程序

1. 打开「任务计划程序」(`taskschd.msc`)
2. 点击「创建基本任务」
3. 名称输入：`Remote Printer`
4. 触发器选择：「当计算机启动时」
5. 操作选择：「启动程序」
6. 设置：
   - **程序或脚本**：`pm2`
   - **参数**：`start D:\remoteprinter\ecosystem.config.js`
   - **起始位置**：`D:\remoteprinter`

## 防火墙设置

如果局域网无法访问，执行以下命令开放 3000 端口：

```powershell
netsh advfirewall firewall add rule name="Remote Printer" dir=in action=allow protocol=tcp localport=3000
```

## 故障排除

### 问题：PM2 启动后无法连接

**解决方案**：
1. 确认 `ecosystem.config.js` 中的 `cwd` 路径正确
2. 检查日志：`pm2 logs remote-printer`
3. 确认 Node.js 已加入防火墙例外

### 问题：打印机列表为空

**解决方案**：
1. 确认打印机驱动程序已安装
2. 以管理员身份执行 PM2

### 问题：服务无法启动

**解决方案**：
```powershell
# 删除并重新启动
pm2 delete remote-printer
pm2 start ecosystem.config.js
```

## 访问方式

- **本机**：http://localhost:3000
- **局域网**：http://<Windows电脑IP>:3000

使用 `ipconfig` 查看本机 IP 地址。
