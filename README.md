# 言葉 | Kotoba Vocabulary Trainer

[🇯🇵 日本語](#japanese) | [🇺🇸 English](#english) | [🇨🇳 中文](#chinese)

## ⭐ Star History

If you find Kotoba useful, please consider giving it a star! ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=iamcheyan/kotoba&type=Date)](https://star-history.com/#iamcheyan/kotoba&Date)

---

## <a id="japanese"></a>🇯🇵 日本語

### 🎯 **フロントエンド日本語語彙学習アプリ** - JSONファイルを読み込むためのシンプルなHTTPサーバーが必要です

## ✨ 主な機能

### 🎉 豊富な学習体験
- **お祝いフィードバックシステム** - 正解時に紙吹雪アニメーション、効果音、バウンス効果を発動
- **スマートお祝いメッセージ** - 連続正解数に応じて異なるお祝いメッセージを表示
- **即時フィードバック** - 漢字、ひらがな、ローマ字など複数の入力方式をサポート

### 📚 複数辞書サポート
- **基礎語彙** - N5-N1レベルの日本語語彙
- **文法練習** - 日本語文法のポイント
- **会話語彙** - 日常会話でよく使われる単語
- **カタカナ語彙** - 外来語専用練習

### ⚙️ パーソナライズ設定
- **表示オプション** - 読み方、ローマ字、振り仮名の表示切り替え
- **入力ヒント** - スマート入力ヒントのオン/オフ
- **進捗追跡** - 正誤統計の自動記録

### 🔊 音声機能
- **TTS（テキスト読み上げ）** - 日本語音声による単語の発音
- **二重再生** - 最初にゆっくり、次に通常速度で再生
- **音声設定** - 再生速度とボリュームの調整可能

## 🚀 クイックスタート

### 必須：ローカルサーバーの起動
アプリケーションはJSON設定ファイルを読み込む必要があるため、HTTPサーバー経由で実行する必要があります：

```bash
# プロジェクトをクローン
git clone https://github.com/iamcheyan/kotoba
cd kotoba

# 方法1：Node.js serveを使用
npx serve .

# 方法2：Python内蔵サーバーを使用
python3 -m http.server 3000

# 方法3：その他の静的サーバー
# PHP: php -S localhost:3000
# Ruby: ruby -run -e httpd . -p 3000
```

その後、ブラウザで `http://localhost:3000` にアクセスして学習を開始してください！

> ⚠️ **重要な注意**：`index.html`を直接ダブルクリックして開くことはできません。ブラウザのセキュリティポリシーによりローカルJSONファイルへの直接アクセスが許可されていないため、HTTPサーバー経由でアクセスする必要があります。

## 🎨 技術的特徴

- **純粋なフロントエンドアーキテクチャ** - 複雑なバックエンドサービス不要、シンプルな静的HTTPサーバーで十分
- **スマートかな変換** - Kuroshiroベースのブラウザ側変換
- **レスポンシブデザイン** - デスクトップとモバイルデバイスに完璧対応
- **オフライン対応** - 初期読み込み以外はネットワーク接続不要

---

## <a id="english"></a>🇺🇸 English

### 🎯 **Pure Frontend Japanese Vocabulary Learning App** - Requires a simple HTTP server to load JSON files

## ✨ Key Features

### 🎉 Rich Learning Experience
- **Celebration Feedback System** - Triggers confetti animation, sound effects, and bounce effects when answering correctly
- **Smart Celebration Messages** - Displays different celebration messages based on consecutive correct answers
- **Instant Feedback** - Supports multiple input methods including Kanji, Hiragana, and Romaji

### 📚 Multiple Dictionary Support
- **Basic Vocabulary** - N5-N1 level Japanese vocabulary
- **Grammar Practice** - Japanese grammar key points
- **Conversation Vocabulary** - Common words used in daily conversation
- **Katakana Vocabulary** - Dedicated practice for foreign loanwords

### ⚙️ Personalized Settings
- **Display Options** - Toggle reading, romaji, and furigana display
- **Input Hints** - Smart input hint toggle
- **Progress Tracking** - Automatic recording of correct/incorrect statistics

### 🔊 Audio Features
- **TTS (Text-to-Speech)** - Japanese voice pronunciation of words
- **Double Playback** - First plays slowly, then at normal speed
- **Audio Settings** - Adjustable playback speed and volume

## 🚀 Quick Start

### Required: Start Local Server
Since the application needs to load JSON configuration files, it must be run through an HTTP server:

```bash
# Clone the project
git clone https://github.com/iamcheyan/kotoba
cd kotoba

# Method 1: Using Node.js serve
npx serve .

# Method 2: Using Python built-in server
python3 -m http.server 3000

# Method 3: Using other static servers
# PHP: php -S localhost:3000
# Ruby: ruby -run -e httpd . -p 3000
```

Then access `http://localhost:3000` in your browser to start learning!

> ⚠️ **Important Note**: You cannot directly double-click to open `index.html`. Due to browser security policies that don't allow direct access to local JSON files, you must access it through an HTTP server.

## 🎨 Technical Features

- **Pure Frontend Architecture** - No complex backend services needed, simple static HTTP server is sufficient
- **Smart Kana Conversion** - Browser-side conversion based on Kuroshiro
- **Responsive Design** - Perfect adaptation to desktop and mobile devices
- **Offline Friendly** - No network connection required except for initial loading

## 🎊 Celebration Effects

When you answer correctly, the app triggers:

1. **Confetti Fall** - 70 colorful paper pieces falling from the top of the screen
2. **Sound Effects** - Ascending scale celebration sound
3. **Visual Animations** - Card bounce and glow effects
4. **Smart Messages**:
   - Regular correct: 👏 正解です！(Correct!)
   - First-time correct: 🎯 初回正解！おめでとう！(First-time correct! Congratulations!)
   - 5 consecutive: ✨ 素晴らしい！5問連続正解！(Excellent! 5 consecutive correct!)
   - 10 consecutive: 🎉 すごい！10問連続正解！(Amazing! 10 consecutive correct!)

---

## <a id="chinese"></a>🇨🇳 中文

### 🎯 **纯前端日语词汇学习应用** - 需要简单的HTTP服务器来加载JSON文件

## ✨ 主要功能

### 🎉 丰富的学习体验
- **庆祝反馈系统** - 回答正确时触发彩纸动画、音效和弹跳效果
- **智能庆祝消息** - 根据连续正确次数显示不同的庆祝提示
- **即时反馈** - 支持汉字、假名、罗马音多种输入方式

### 📚 多词典支持
- **基础词汇** - N5-N1级别日语词汇
- **语法练习** - 日语语法要点
- **会话词汇** - 日常对话常用词
- **片假名词汇** - 外来语专用练习

### ⚙️ 个性化设置
- **显示选项** - 可切换读音、罗马音、振假名显示
- **输入提示** - 智能输入提示开关
- **进度追踪** - 自动记录正误统计

### 🔊 语音功能
- **TTS（文本转语音）** - 日语语音朗读单词
- **双重播放** - 先慢速播放，再正常速度播放
- **语音设置** - 可调节播放速度和音量

## 🚀 快速开始

### 必需：启动本地服务器
由于应用需要加载JSON配置文件，必须通过HTTP服务器运行：

```bash
# 克隆项目
git clone https://github.com/iamcheyan/kotoba
cd kotoba

# 方法一：使用Node.js serve
npx serve .

# 方法二：使用Python内置服务器
python3 -m http.server 3000

# 方法三：使用其他静态服务器
# PHP: php -S localhost:3000
# Ruby: ruby -run -e httpd . -p 3000
```

然后在浏览器中访问 `http://localhost:3000` 开始学习！

> ⚠️ **重要提示**：不能直接双击打开 `index.html`，必须通过HTTP服务器访问，因为浏览器安全策略不允许直接访问本地JSON文件。

## 🎨 技术特色

- **纯前端架构** - 无需复杂的后端服务，简单的静态HTTP服务器即可
- **智能假名转换** - 基于Kuroshiro的浏览器端转换
- **响应式设计** - 完美适配桌面和移动设备
- **离线友好** - 除初始加载外无需网络连接

## 🎊 庆祝效果展示

当您回答正确时，应用会触发：

1. **彩纸飘落** - 70个彩色纸片从屏幕顶部飘落
2. **音效反馈** - 上升音阶的庆祝音效
3. **视觉动画** - 卡片弹跳、发光效果
4. **智能消息**：
   - 普通正解：👏 正解です！
   - 初回正解：🎯 初回正解！おめでとう！
   - 5问连续：✨ 素晴らしい！5問連続正解！
   - 10问连续：🎉 すごい！10問連続正解！

---

## 📁 项目结构 | Project Structure | プロジェクト構造

```
Kotoba/
├── index.html              # 主页面 | Main page | メインページ
├── static/
│   ├── app.js             # 应用逻辑 | App logic | アプリロジック
│   ├── styles.css         # 样式文件 | Style file | スタイルファイル
│   ├── vendor/            # JavaScript库 | JS libraries | JSライブラリ
│   └── kuromoji-dict/     # 日语词典数据 | Japanese dict data | 日本語辞書データ
└── dictionaries/          # 词汇数据文件 | Vocabulary data | 語彙データ
    ├── base.json          # 基础词汇 | Basic vocab | 基礎語彙
    ├── grammar.json       # 语法词汇 | Grammar vocab | 文法語彙
    ├── conversation.json  # 会话词汇 | Conversation vocab | 会話語彙
    └── katakana.json      # 片假名词汇 | Katakana vocab | カタカナ語彙
```

## 🌟 使用技巧 | Usage Tips | 使用のコツ

1. **多种输入方式** | **Multiple Input Methods** | **複数の入力方法** - 可以用汉字、平假名、片假名或罗马音回答 | Answer with Kanji, Hiragana, Katakana, or Romaji | 漢字、ひらがな、カタカナ、ローマ字で回答可能
2. **设置调优** | **Settings Optimization** | **設定の最適化** - 根据学习阶段调整显示选项 | Adjust display options based on learning stage | 学習段階に応じて表示オプションを調整
3. **进度追踪** | **Progress Tracking** | **進捗追跡** - 查看右上角的统计信息 | Check statistics in the top right corner | 右上角の統計情報を確認
4. **词典切换** | **Dictionary Switching** | **辞書切り替え** - 点击"📘 辞書"按钮切换不同词库 | Click "📘 辞書" button to switch dictionaries | 「📘 辞書」ボタンをクリックして辞書を切り替え

## 🔧 系统要求 | System Requirements | システム要件

- 现代浏览器 | Modern browsers | モダンブラウザ（Chrome、Firefox、Safari、Edge）
- 支持JavaScript和CSS3动画 | JavaScript and CSS3 animation support | JavaScriptとCSS3アニメーションサポート
- 建议使用最新版本浏览器 | Latest browser version recommended | 最新版ブラウザ推奨

## 📄 开源协议 | License | ライセンス

MIT License - 自由使用、修改和分发 | Free to use, modify and distribute | 自由に使用、変更、配布可能

---

**立即开始您的日语学习之旅！** | **Start your Japanese learning journey now!** | **今すぐ日本語学習の旅を始めましょう！** 🎌

启动本地服务器后，在浏览器中访问应用，享受互动式的学习体验和令人愉悦的庆祝反馈！
After starting the local server, access the app in your browser and enjoy an interactive learning experience with delightful celebration feedback!
ローカルサーバーを起動した後、ブラウザでアプリにアクセスして、インタラクティブな学習体験と楽しいお祝いフィードバックをお楽しみください！