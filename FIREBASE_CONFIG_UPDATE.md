# Firebase 配置更新说明

## 更新时间
2025-10-13

## 配置变更

已将 Firebase 配置从 Terebi 项目切换为 Kotoba 专用项目：

### 旧配置 (Terebi)
```javascript
{
  apiKey: "AIzaSyC20d0C0Wj7pXRYPHlbDNXT3UK1PRat14Y",
  authDomain: "terebi-711fb.firebaseapp.com",
  projectId: "terebi-711fb",
  storageBucket: "terebi-711fb.firebasestorage.app",
  messagingSenderId: "54498356451",
  appId: "1:54498356451:web:54522880222619f65669d6",
  measurementId: "G-32G49J90L0"
}
```

### 新配置 (Kotoba)
```javascript
{
  apiKey: "AIzaSyAOp_lGAlIBxP5pFQID_RPelmLE4NTvZ2s",
  authDomain: "kotoba-60aeb.firebaseapp.com",
  projectId: "kotoba-60aeb",
  storageBucket: "kotoba-60aeb.firebasestorage.app",
  messagingSenderId: "367445040315",
  appId: "1:367445040315:web:1b68e59976ac2ab1f91d9e",
  measurementId: "G-CT0R8S7TQG"
}
```

## 新增功能
- ✅ 添加了 Firebase Analytics 支持
- ✅ Analytics 初始化包含错误处理
- ✅ 使用独立的 Kotoba Firebase 项目

## 影响范围

### 数据存储
- **Firestore 数据库**: `kotoba-60aeb`
- **用户集合**: `users/[uid]`

### 存储的数据
1. 学习进度 (correct, wrong)
2. 错题本 (wrongWords)
3. 用户偏好 (词典、语音、主题等)

### 注意事项
1. **数据迁移**: 从 Terebi 项目切换到 Kotoba 项目后，旧数据不会自动迁移
2. **重新登录**: 用户需要重新登录以使用新的 Firebase 项目
3. **本地数据**: 已有的本地数据（localStorage）不受影响
4. **首次同步**: 登录后会将本地数据上传到新的 Kotoba Firebase 项目

## Firebase 服务使用

### Authentication
- Google 登录认证
- 账户管理和切换

### Firestore Database
- 用户数据存储
- 实时同步
- 离线支持

### Analytics (可选)
- 用户行为分析
- 应用使用统计

## 开发者备注

- Firebase SDK 版本: 12.4.0
- 项目 ID: kotoba-60aeb
- Region: us-central (默认)

---

**配置更新完成** ✅

