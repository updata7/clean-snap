# 自动更新配置指南

## 概述

CleanSnap 支持从 **GitHub Releases** 或 **Gitee Releases** 自动检查更新，无需自建服务器。

## 可行性分析

### ✅ GitHub Releases（推荐）

**完全可行** - electron-updater 原生支持 GitHub Releases

**优势：**
- electron-updater 原生支持，配置简单
- 自动处理下载和安装
- 支持增量更新
- 稳定可靠

**配置要求：**
- 在 GitHub 创建 Releases
- 上传构建好的安装包（.dmg, .exe, .AppImage 等）
- 标签格式：`v1.0.0`（必须与 package.json 版本号匹配）

### ⚠️ Gitee Releases

**可行，但需要自定义实现** - electron-updater 不直接支持 Gitee

**实现方式：**
- 使用 Gitee API 检查最新 Release
- 通过 API 获取下载链接
- 手动下载和安装（或提示用户下载）

**优势：**
- 国内访问速度快
- 无需翻墙

**限制：**
- 需要自定义实现
- 不支持 electron-updater 的自动安装功能
- 需要手动处理下载和安装流程

## 配置步骤

### 1. 配置更新源

编辑 `electron/main.ts`，修改 `UPDATE_CONFIG`：

```typescript
const UPDATE_CONFIG = {
  provider: 'github', // 或 'gitee'
  githubRepo: 'your-username/cleansnap-web', // 替换为你的 GitHub 仓库
  giteeRepo: 'your-username/cleansnap-web', // 替换为你的 Gitee 仓库
  githubToken: process.env.GITHUB_TOKEN, // 可选：用于私有仓库或提高速率限制
};
```

### 2. 配置 electron-builder（GitHub）

编辑 `package.json` 的 `build.publish` 配置：

```json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "your-username",
        "repo": "cleansnap-web"
      }
    ]
  }
}
```

### 3. 设置 GitHub Token（可选但推荐）

对于私有仓库或提高 API 速率限制，设置环境变量：

```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

创建 Token：GitHub Settings → Developer settings → Personal access tokens → Generate new token
权限：至少需要 `public_repo`（公开仓库）或 `repo`（私有仓库）

### 4. 发布新版本

#### GitHub Releases

1. **更新版本号**：编辑 `package.json`，修改 `version` 字段（如 `1.0.1`）

2. **构建应用**：
   ```bash
   npm run electron:build
   ```

3. **创建 GitHub Release**：
   - 访问：`https://github.com/your-username/cleansnap-web/releases/new`
   - Tag：`v1.0.1`（必须与版本号匹配，带 `v` 前缀）
   - 标题：`v1.0.1` 或自定义
   - 描述：添加更新说明
   - 上传文件：从 `release/` 目录上传构建好的安装包
     - macOS: `.dmg` 或 `.zip`
     - Windows: `.exe` (NSIS installer)
     - Linux: `.AppImage`

4. **发布 Release**：点击 "Publish release"

#### Gitee Releases

1. **更新版本号**：编辑 `package.json`

2. **构建应用**：
   ```bash
   npm run electron:build
   ```

3. **创建 Gitee Release**：
   - 访问：`https://gitee.com/your-username/cleansnap-web/releases`
   - 点击 "创建新版本"
   - 标签：`v1.0.1`
   - 版本号：`1.0.1`
   - 发布说明：添加更新说明
   - 上传附件：上传构建好的安装包

4. **发布**：点击 "发布"

## 版本号规则

使用语义化版本（Semantic Versioning）：
- 格式：`主版本号.次版本号.修订号`
- 示例：`1.0.0`, `1.0.1`, `1.1.0`, `2.0.0`
- GitHub/Gitee 标签必须带 `v` 前缀：`v1.0.1`

## 自动更新流程

### GitHub（electron-updater）

1. **启动检查**：应用启动 5 秒后自动检查（每天最多一次）
2. **发现更新**：electron-updater 检测到新版本
3. **下载更新**：用户点击"下载更新"后自动下载
4. **安装更新**：下载完成后，应用退出时自动安装

### Gitee（API 方式）

1. **启动检查**：应用启动 5 秒后调用 Gitee API 检查
2. **发现更新**：比较版本号，发现新版本
3. **提示用户**：显示更新提示和下载链接
4. **用户操作**：用户点击链接下载并手动安装

## 测试更新功能

### 开发环境测试

1. 修改 `electron/main.ts` 中的 `UPDATE_CONFIG.provider` 为 `'github'` 或 `'gitee'`
2. 设置测试仓库信息
3. 在测试仓库创建一个版本号更高的 Release（如当前是 1.0.0，创建 v1.0.1）
4. 运行应用，检查更新功能

### 生产环境

1. 确保 `app.isPackaged === true`（打包后的应用）
2. 配置正确的仓库信息
3. 发布 Release 后，用户的应用会自动检测到更新

## 故障排查

### GitHub 更新失败

1. **检查仓库配置**：确认 `githubRepo` 格式正确（`owner/repo`）
2. **检查 Release**：确认已创建 Release 且标签格式正确（`v1.0.0`）
3. **检查 Token**：如果是私有仓库，确保设置了 `GITHUB_TOKEN`
4. **查看日志**：检查 Electron 主进程控制台输出

### Gitee 更新失败

1. **检查仓库配置**：确认 `giteeRepo` 格式正确
2. **检查 Release**：确认已创建 Release
3. **检查网络**：确认可以访问 Gitee API
4. **查看日志**：检查控制台错误信息

## 注意事项

1. **版本号匹配**：GitHub/Gitee 标签必须与 `package.json` 中的版本号匹配（带 `v` 前缀）
2. **安装包格式**：确保上传的安装包格式正确（.dmg, .exe, .AppImage）
3. **首次发布**：首次配置后，需要先发布一个 Release 才能测试更新功能
4. **开发模式**：开发模式下（`npm run electron:dev`）不会检查更新，只有打包后的应用才会

## 高级配置

### 自定义更新服务器

如果需要使用自己的更新服务器，可以修改 `UPDATE_CONFIG.provider` 为 `'custom'` 并设置 `customUrl`。

### 增量更新

electron-updater 支持增量更新（仅下载差异部分），可以显著减少下载大小。这需要配置 `nsis` 或其他支持增量更新的安装程序。
