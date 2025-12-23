# 授权码系统使用指南

## 概述

CleanSnap 使用**离线授权验证**系统，无需服务器即可验证授权码。授权码基于设备指纹和加密签名生成，确保安全性。

## 授权码格式

### 新格式（推荐）
```
CLEANSNAP-{DEVICE_ID}-{TIMESTAMP}-{CHECKSUM}
```

示例：
```
CLEANSNAP-UNIVERSAL-1704067200000-A1B2C3D4
CLEANSNAP-ABC123DEF-1704067200000-E5F6G7H8
```

### 旧格式（兼容）
```
CLEANSNAP-XXXX-XXXX-XXXX-XXXX
```

## 生成授权码

### 方法 1：使用脚本生成（推荐）

```bash
# 生成通用授权码（适用于任何设备）
node scripts/generateLicense.js UNIVERSAL

# 生成指定设备的授权码
node scripts/generateLicense.js ABC123DEF

# 生成带时间戳的授权码
node scripts/generateLicense.js UNIVERSAL 1704067200000
```

### 方法 2：手动生成

授权码格式：`CLEANSNAP-{DEVICE_ID}-{TIMESTAMP}-{CHECKSUM}`

1. **设备ID**：
   - `UNIVERSAL` - 通用授权码（适用于任何设备）
   - 或用户的设备指纹（从应用获取）

2. **时间戳**：Unix 时间戳（毫秒）

3. **校验和**：基于 `CLEANSNAP-{DEVICE_ID}-{TIMESTAMP}` + 密钥的哈希值

## 授权码类型

### 1. 通用授权码（Universal）
- 适用于任何设备
- 格式：`CLEANSNAP-UNIVERSAL-{TIMESTAMP}-{CHECKSUM}`
- 适合：批量授权、测试

### 2. 设备绑定授权码
- 绑定到特定设备
- 格式：`CLEANSNAP-{DEVICE_ID}-{TIMESTAMP}-{CHECKSUM}`
- 适合：个人用户、防止滥用

## 安全特性

1. **设备指纹**：基于硬件和系统信息生成唯一设备ID
2. **加密签名**：使用内置密钥生成校验和
3. **离线验证**：无需连接服务器即可验证
4. **防篡改**：每次读取时重新验证授权状态

## 注意事项

⚠️ **重要**：
- 密钥 `LICENSE_SECRET` 必须保密，不要提交到公开仓库
- 建议为不同版本使用不同的密钥
- 定期轮换密钥以提高安全性

## 生产环境建议

1. **密钥管理**：
   - 使用环境变量存储密钥
   - 不同版本使用不同密钥
   - 定期更新密钥

2. **授权码分发**：
   - 通过安全渠道分发（邮箱、加密消息等）
   - 记录每个授权码的生成时间和用途
   - 实现授权码撤销机制（可选）

3. **设备限制**：
   - 可以限制每个授权码的激活次数
   - 实现设备转移功能（需要额外逻辑）
