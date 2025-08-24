# 言葉

ウェブベースの日本語学習ツールです。インタラクティブなインターフェースを通じて、ユーザーが日本語の語彙を練習することができます。学習モードと練習モードの両方をサポートしており、様々なレベルの学習者に適しています。

## 🚀 技术架构与特色

### 核心技术栈
- **PyWebIO** - 现代化的Python Web框架，提供简洁的Web界面开发体验
- **Flask** - 轻量级Web服务器，支持快速部署和扩展
- **pykakasi** - 日语假名转换库，实现汉字到假名、罗马音的智能转换
- **JavaScript** - 前端交互逻辑，支持实时统计和用户体验优化

### 技术亮点
- **智能假名转换** - 使用pykakasi库实现汉字到假名、罗马音的自动转换，支持振り仮名显示
- **多词典系统** - 支持N5-N1词汇、语法、会话、片假名等多个专业词典
- **实时用户统计** - 基于线程安全的在线用户追踪系统
- **响应式设计** - 支持移动端和桌面端，包含iOS软键盘优化
- **URL参数控制** - 通过URL参数实现显示选项的灵活配置
- **本地存储** - 使用localStorage实现学习进度的持久化
- **暗黑模式** - 集成Darkmode.js，支持自动主题切换

### 架构特点
- **模块化设计** - 词典配置、用户管理、界面组件分离
- **线程安全** - 多用户并发访问的用户管理机制
- **配置驱动** - JSON配置文件支持词典和功能的灵活扩展
- **跨平台兼容** - 支持Windows、macOS、Linux等操作系统

![](assets/image-20250105223827741.png)

 [日本語](#japanese) | [English](#english) | [中文](#chinese) 

<a name="japanese"></a>

## 🇯🇵 日本語

### 特徴
- 📚 複数の辞書をサポート
- 🔄 学習モードと練習モード
- ✅ 即時フィードバック
- 📊 進捗状況の追跡
- 🎯 漢字とひらがな入力に対応
- 🌐 ウェブベース、インストール不要

### インストール方法
1. リポジトリをクローン：
```bash
git clone https://github.com/iamcheyan/kotoba
cd kotoba
```

2. 依存関係のインストール：
```bash
pip install -r requirements.txt
```

3. アプリケーションの実行：
```bash
python app.py
```

アプリケーションは `http://localhost:5000` で利用可能になります

### 使用方法
- ブラウザからウェブインターフェースにアクセス
- 使用したい辞書を選択
- 上部のボタンで学習モードと練習モードを切り替え
- 漢字またはひらがなで回答を入力
- 即時フィードバックを確認

### 動作環境
- Python 3.6+
- PyWebIO
- Flask

### ライセンス
MIT License 

---

<a name="english"></a>
## 🇬🇧 English

### Overview
A web-based Japanese language learning tool that helps users practice Japanese vocabulary through an interactive interface. The application supports both study mode and practice mode, making it suitable for learners at different levels.

### Features
- 📚 Multiple dictionary support
- 🔄 Study and practice modes
- ✅ Instant feedback on answers
- 📊 Progress tracking
- 🎯 Support for both kanji and hiragana input
- 🌐 Web-based interface, no installation required

### Installation
1. Clone the repository:
```bash
git clone https://github.com/iamcheyan/kotoba
cd kotoba
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python app.py
```

The application will be available at `http://localhost:5000`

### Usage
- Access the web interface through your browser
- Choose your preferred dictionary
- Toggle between study mode and practice mode using the buttons at the top
- Enter your answer in either kanji or hiragana
- Get instant feedback on your responses

### Requirements
- Python 3.6+
- PyWebIO
- Flask

### License
MIT License

---

<a name="chinese"></a>
## 🇨🇳 中文

### 概述
这是一个基于网页的日语学习工具，通过交互式界面帮助用户练习日语词汇。应用程序支持学习模式和练习模式，适合不同水平的学习者使用。

### 功能特点
- 📚 支持多个词典
- 🔄 学习模式和练习模式
- ✅ 即时答案反馈
- 📊 学习进度追踪
- 🎯 支持汉字和平假名输入
- 🌐 网页端应用，无需安装

### 安装方法
1. 克隆仓库：
```bash
git clone https://github.com/iamcheyan/kotoba
cd kotoba
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 运行应用：
```bash
python app.py
```

应用将在 `http://localhost:5000` 运行

### 使用方法
- 通过浏览器访问网页界面
- 选择想要使用的词典
- 使用顶部按钮切换学习模式和练习模式
- 输入汉字或平假名答案
- 获取即时反馈

### 系统要求
- Python 3.6+
- PyWebIO
- Flask

### 开源协议
MIT License

