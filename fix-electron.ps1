# Windows 上修复 Electron 安装的脚本
# 使用方法: .\fix-electron.ps1

Write-Host "正在修复 Electron 安装..." -ForegroundColor Yellow

# 1. 停止可能占用文件的进程
Write-Host "`n1. 停止相关进程..." -ForegroundColor Cyan
Get-Process | Where-Object {
    $_.ProcessName -like "*node*" -or 
    $_.ProcessName -like "*electron*"
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. 删除 Electron
Write-Host "`n2. 删除旧的 Electron 安装..." -ForegroundColor Cyan
pnpm remove electron 2>$null

# 3. 清理缓存
Write-Host "`n3. 清理 pnpm 缓存..." -ForegroundColor Cyan
pnpm store prune

# 4. 重新安装 Electron（允许运行脚本）
Write-Host "`n4. 重新安装 Electron（这可能需要几分钟，请耐心等待）..." -ForegroundColor Cyan
Write-Host "   正在下载 Electron 二进制文件（约 100MB）..." -ForegroundColor Gray
$env:CI = 'true'
pnpm add -D electron@33.4.11 --ignore-scripts=false

# 5. 验证安装
Write-Host "`n5. 验证 Electron 安装..." -ForegroundColor Cyan
$version = pnpm exec electron --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Electron 安装成功！版本: $version" -ForegroundColor Green
    Write-Host "`n现在可以运行: pnpm run electron:dev" -ForegroundColor Green
} else {
    Write-Host "`n❌ Electron 安装失败，请检查网络连接或手动运行安装脚本" -ForegroundColor Red
    Write-Host "`n可以尝试手动运行:" -ForegroundColor Yellow
    Write-Host "   cd node_modules\.pnpm\electron@33.4.11\node_modules\electron" -ForegroundColor Gray
    Write-Host "   node install.js" -ForegroundColor Gray
}

