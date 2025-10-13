# PWA 设置指南

## ✅ 已完成的功能

### 1. PWA 核心功能
- ✅ Service Worker 注册
- ✅ 离线缓存支持
- ✅ Manifest 配置
- ✅ 安装提示

### 2. 用户体验
- ✅ 安装进度显示（3个步骤）
  1. 清除旧缓存
  2. 下载资源
  3. 安装提示
- ✅ iOS 安装说明
- ✅ 菜单中的安装入口（登录/未登录都有）

### 3. 特殊功能
- ✅ 安装前清空本地缓存
- ✅ 进度条显示
- ✅ iOS桌面支持（需要图标）

## 📱 iOS 图标设置

由于 iOS 需要 PNG 格式的图标，请按照以下步骤创建：

### 方法 1: 使用在线工具

1. 访问 [RealFaviconGenerator](https://realfavicongenerator.net/)
2. 上传项目的 SVG 图标（`static/favicon.svg`）
3. 生成 192x192 的 PNG 图标
4. 下载并保存为 `/Users/tetsuya/Dev/Kotoba/static/icon-192.png`

### 方法 2: 使用命令行工具

如果你已安装 ImageMagick：

```bash
cd /Users/tetsuya/Dev/Kotoba
# 将 SVG 转换为 PNG
convert static/favicon.svg -resize 192x192 static/icon-192.png
```

### 方法 3: 临时解决方案

暂时使用 favicon.svg，但 iOS 可能无法正确显示。建议尽快创建 PNG 版本。

## 🚀 部署检查清单

### 1. 必需文件
- [x] `/manifest.json` - PWA 配置
- [x] `/sw.js` - Service Worker
- [ ] `/static/icon-192.png` - iOS 图标（需要手动创建）

### 2. HTML Meta 标签
- [x] `<link rel="manifest">`
- [x] `<link rel="apple-touch-icon">`
- [x] `<meta name="apple-mobile-web-app-capable">`
- [x] `<meta name="theme-color">`

### 3. 功能测试
- [ ] Chrome DevTools > Application > Manifest
- [ ] Chrome DevTools > Application > Service Workers
- [ ] 测试离线访问
- [ ] 测试安装提示
- [ ] iOS Safari 测试"添加到主屏幕"

## 📝 使用说明

### 安装 PWA（Android/Chrome）

1. 打开网站
2. 点击右上角菜单按钮（三点或用户头像）
3. 选择"アプリをインストール"
4. 按照进度提示操作：
   - 步骤 1: 清除缓存
   - 步骤 2: 下载资源
   - 步骤 3: 点击"ホーム画面に追加"

### 安装 PWA（iOS）

1. 在 Safari 中打开网站
2. 点击分享按钮 ↗️
3. 选择"ホーム画面に追加"
4. 点击"追加"

或者：

1. 点击右上角菜单
2. 选择"アプリをインストール"
3. 按照 iOS 安装说明操作

## 🔧 开发笔记

### Service Worker 缓存策略

- **缓存优先**: HTML, CSS, JS 文件
- **网络优先**: API 请求和动态内容
- **安装时清除**: 确保使用最新资源

### 文件清单

缓存的资源：
```javascript
[
  '/',
  '/index.html',
  '/static/app.js',
  '/static/styles.css',
  '/static/config.json',
  '/static/favicon.svg'
]
```

### 自定义安装流程

本项目的特殊之处：
1. **安装前清空缓存** - 确保最新版本
2. **进度可视化** - 3个步骤的进度条
3. **平台检测** - 自动识别 iOS 并显示适配说明

## 🐛 故障排除

### 问题: Service Worker 未注册

**解决方案:**
- 确保在 HTTPS 环境下（或 localhost）
- 检查浏览器控制台错误
- 清除浏览器缓存重试

### 问题: iOS 图标不显示

**解决方案:**
- 确保创建了 `static/icon-192.png`
- 图标必须是 PNG 格式
- 建议尺寸：192x192 或更大

### 问题: 离线模式不工作

**解决方案:**
- 检查 Service Worker 是否激活
- 查看缓存列表: DevTools > Application > Cache Storage
- 尝试注销并重新注册 Service Worker

## 📚 相关链接

- [PWA 文档](https://web.dev/progressive-web-apps/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [iOS PWA 支持](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)

