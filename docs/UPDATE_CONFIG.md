# 更新配置指南

## 概述

CleanSnap 支持从 **GitHub** 或 **Gitee** Releases 自动检查更新，无需自建服务器。

## 配置步骤

### 1. 配置更新源

#### 方式 A：使用 GitHub（推荐）

编辑 `services/updateService.ts`：

```typescript
const UPDATE_CONFIG = {
  provider: 'github',
  githubRepo: 'your-username/cleansnap-web', // 替换为你的 GitHub 仓库
  giteeRepo: 'your-username/cleansnap-web',
};
```

编辑 `electron/main.ts`：

```typescript
const UPDATE_CONFIG = {
  provider: 'github',
  githubRepo: 'your-username/cleansnap-web', // 替换为你的 GitHub 仓库
  giteeRepo: 'your-username/cleansnap-web',
};
```

#### 方式 B：使用 Gitee

编辑 `services/updateService.ts`：

```typescript
const UPDATE_CONFIG = {
  provider: 'gitee',
  githubRepo: 'your-username/cleansnap-web',
  giteeRepo: 'your-username/cleansnap-web', // 替换为你的 Gitee 仓库
};
```

### 2. 配置 electron-builder

编辑 `package.json` 的 `build` 配置：

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "cleansnap-web"
    }
  }
}
```

或使用 Gitee（需要自定义配置）：

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://gitee.com/your-username/cleansnap-web/releases"
    }
  }
}
```

### 3. 发布新版本

#### GitHub Releases

1. 更新 `package.json` 中的版本号（如 `1.0.1`）
2. 构建应用：
   ```bash
   npm run electron:build
   ```
3. 在 GitHub 创建 Release：
   - Tag: `v1.0.1`（必须与版本号匹配）
   - 上传构建好的安装包（.dmg, .exe, .AppImage 等）
   - 添加 Release Notes

#### Gitee Releases

1. 更新版本号
2. 构建应用
3. 在 Gitee 创建 Release：
   - 标签：`v1.0.1`
   - 上传安装包
   - 添加发布说明

## 版本号规则

使用语义化版本（Semantic Versioning）：
- 格式：`主版本号.次版本号.修订号`
- 示例：`1.0.0`, `1.0.1`, `1.1.0`, `2.0.0`

## 自动更新流程

1. **启动时检查**：应用启动 3 秒后自动检查（每天最多一次）
2. **手动检查**：用户可在设置菜单中点击"检查更新"
3. **更新提示**：如有新版本，显示更新提示
4. **下载安装**：用户确认后自动下载并安装

## 测试更新功能

### 开发环境测试

1. 修改 `package.json` 版本号为 `1.0.1`
2. 构建并打包应用
3. 在 GitHub/Gitee 创建 Release
4. 运行旧版本应用，应该检测到更新

### 注意事项

- 确保 Release 标签格式为 `v{版本号}`（如 `v1.0.1`）
- 上传的安装包文件名应包含平台信息（如 `CleanSnap-1.0.1-mac.dmg`）
- 首次发布需要配置好 `publish` 设置

## 故障排查

### 更新检查失败

1. **检查网络连接**：确保能访问 GitHub/Gitee API
2. **检查仓库配置**：确认 `githubRepo`/`giteeRepo` 格式正确
3. **检查 Release**：确认已创建 Release 并上传了安装包
4. **查看控制台**：检查错误日志

### 版本号不匹配

- 确保 `package.json` 中的版本号与 Release 标签一致
- Release 标签应去掉 `v` 前缀进行比较（如标签 `v1.0.1` 对应版本 `1.0.1`）
