(function () {
    'use strict';

    const KUROMOJI_DICT_PATHS = ['/static/kuromoji-dict/'];
    const DEFAULT_THEME = 'classic';
    const THEMES = {
        classic: { name: 'Classic' },
        sakura: { name: 'Sakura Blossom' },
    };
    const THEME_STORAGE_KEY = 'kotoba.theme';

    const PROGRESS_STORAGE_PREFIX = 'kotoba.progress.';

    const state = {
        kuroshiro: null,
        kuroshiroReady: false,
        dictionaries: [],
        dictionaryId: null,
        dictionaryMap: new Map(),
        dictionaryName: '',
        totalWords: 0,
        currentEntry: null,
        showReading: true,
        showRomaji: true,
        showPlaceholder: true,
        showKatakanaReading: false,
        showFurigana: true,
        selectedVoice: null,
        speechRate: 1.0,
        awaitingNext: false,
        autoPronunciation: false,
        theme: DEFAULT_THEME,
        pendingTheme: DEFAULT_THEME,
        previewPlaying: false,
        userCancelledSpeech: false,
        masteredEntries: new Set(),
        progressDictionaryId: null,
        dictionaryCompleted: false,
        completionCelebrated: false,
    };

    const CHAR_RANGE = {
        kanji: [0x4e00, 0x9fff],
        katakana: [0x30a0, 0x30ff],
    };

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function updatePreviewButton() {
        if (!elements.voicePreview) return;
        elements.voicePreview.textContent = state.previewPlaying ? '⏹ 停止' : '▶︎ 試聴';
        elements.voicePreview.classList.toggle('is-playing', state.previewPlaying);
    }

    function startVoicePreview() {
        const sample = 'こんにちは、音声サンプルです。';
        try { speechSynthesis.cancel(); } catch (_) {}
        state.previewPlaying = true;
        updatePreviewButton();
        const utter = new SpeechSynthesisUtterance(sample);
        const voices = speechSynthesis.getVoices();
        let selected = null;
        if (state.selectedVoice) {
            selected = voices.find(v => v.name === state.selectedVoice) || null;
        }
        if (!selected) {
            selected = voices.find(v => (v.lang || '').toLowerCase().startsWith('ja')) || voices.find(v => v.default) || voices[0] || null;
        }
        if (selected) {
            utter.voice = selected;
            utter.lang = selected.lang || 'ja-JP';
        } else {
            utter.lang = 'ja-JP';
        }
        utter.rate = state.speechRate || 1.0;
        utter.onend = () => { state.previewPlaying = false; updatePreviewButton(); };
        utter.onerror = () => { state.previewPlaying = false; updatePreviewButton(); };
        try {
            speechSynthesis.speak(utter);
        } catch (_) {
            state.previewPlaying = false;
            updatePreviewButton();
        }
    }
    function isKanji(char) {
        if (!char) {
            return false;
        }
        const code = char.codePointAt(0);
        return code >= CHAR_RANGE.kanji[0] && code <= CHAR_RANGE.kanji[1];
    }

    function isKatakana(char) {
        if (!char) {
            return false;
        }
        const code = char.codePointAt(0);
        return code >= CHAR_RANGE.katakana[0] && code <= CHAR_RANGE.katakana[1];
    }

    function hasKanji(text) {
        return [...text].some(isKanji);
    }

    function hasKatakana(text) {
        return [...text].some(isKatakana);
    }

    const elements = {
        dictionaryName: document.getElementById('dictionary-name'),
        score: document.getElementById('score'),
        questionWord: document.getElementById('question-word'),
        questionMeaning: document.getElementById('question-meaning'),
        questionReading: document.getElementById('question-reading'),
        questionRomaji: document.getElementById('question-romaji'),
        questionSection: document.getElementById('question'),
        answerForm: document.getElementById('answer-form'),
        answerInput: document.getElementById('answer-input'),
        answerSubmit: document.getElementById('answer-submit'),
        skipButton: document.getElementById('skip-button'),
        alerts: document.getElementById('alerts'),
        dictionaryButton: document.getElementById('dictionary-button'),
        settingsButton: document.getElementById('settings-button'),
        modalBackdrop: document.getElementById('modal-backdrop'),
        dictionaryModal: document.getElementById('dictionary-modal'),
        dictionarySelect: document.getElementById('dictionary-select'),
        dictionarySave: document.getElementById('dictionary-save'),
        settingsModal: document.getElementById('settings-modal'),
        toggleReading: document.getElementById('toggle-reading'),
        toggleRomaji: document.getElementById('toggle-romaji'),
        togglePlaceholder: document.getElementById('toggle-placeholder'),
        toggleKatakana: document.getElementById('toggle-katakana'),
        toggleFurigana: document.getElementById('toggle-furigana'),
        toggleAutoPronunciation: document.getElementById('toggle-auto-pronunciation'),
        themeRadios: Array.from(document.querySelectorAll('input[name="theme"]')),
        voiceSelect: document.getElementById('voice-select'),
        voicePreview: document.getElementById('voice-preview'),
        rateSlider: document.getElementById('rate-slider'),
        rateValue: document.getElementById('rate-value'),
        settingsSave: document.getElementById('settings-save'),
        loadingIndicator: document.getElementById('loading-indicator'),
        loadingText: document.querySelector('#loading-indicator .loading-text'),
        progressContainer: document.getElementById('progress-container'),
        progressBar: document.getElementById('progress-bar'),
        progressFill: document.getElementById('progress-fill'),
        progressText: document.getElementById('progress-text'),
        progressReset: document.getElementById('progress-reset'),
        // 游戏化元素
        levelBadge: document.getElementById('level-badge'),
        expBar: document.getElementById('exp-bar'),
        expFill: document.getElementById('exp-fill'),
        expText: document.getElementById('exp-text'),
        correctStat: document.getElementById('correct-stat'),
        wrongStat: document.getElementById('wrong-stat'),
        comboStat: document.getElementById('combo-stat'),
        totalStat: document.getElementById('total-stat'),
        progressFraction: document.getElementById('progress-fraction'),
        progressPercentage: document.getElementById('progress-percentage'),
    };

    function isSupportedTheme(theme) {
        return typeof theme === 'string' && Object.prototype.hasOwnProperty.call(THEMES, theme);
    }

    function updateThemeOptionUI(theme) {
        if (!elements.themeRadios || !elements.themeRadios.length) {
            return;
        }
        elements.themeRadios.forEach((radio) => {
            const isActive = radio.value === theme;
            radio.checked = isActive;
            const option = radio.closest('.theme-option');
            if (option) {
                option.classList.toggle('is-active', isActive);
            }
        });
    }

    function applyTheme(theme, { persist = true } = {}) {
        const targetTheme = isSupportedTheme(theme) ? theme : DEFAULT_THEME;
        const body = document.body;
        if (body) {
            Object.keys(THEMES).forEach((name) => {
                body.classList.toggle(`theme-${name}`, name === targetTheme);
            });
            body.dataset.theme = targetTheme;
        }
        state.theme = targetTheme;
        state.pendingTheme = targetTheme;
        if (persist) {
            try {
                localStorage.setItem(THEME_STORAGE_KEY, targetTheme);
            } catch (error) {
                console.warn('[Theme] Failed to persist selection', error);
            }
        }
        updateThemeOptionUI(targetTheme);
    }

    function initTheme() {
        let savedTheme = null;
        try {
            savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        } catch (error) {
            console.warn('[Theme] Failed to read stored selection', error);
        }
        const initialTheme = isSupportedTheme(savedTheme) ? savedTheme : DEFAULT_THEME;
        applyTheme(initialTheme, { persist: false });
    }

    function setButtonToAnswer() {
        state.awaitingNext = false;
        if (elements.answerSubmit) {
            elements.answerSubmit.disabled = false;
            elements.answerSubmit.textContent = '回答';
        }
        if (elements.answerInput) {
            elements.answerInput.readOnly = false;
        }
    }

    function setButtonToNext() {
        state.awaitingNext = true;
        if (elements.answerSubmit) {
            elements.answerSubmit.disabled = false;
            elements.answerSubmit.textContent = '次へ';
        }
        if (elements.answerInput) {
            elements.answerInput.readOnly = true;
        }
    }

    function showLoading(message) {
        state.awaitingNext = false;
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.remove('hidden');
        }
        if (elements.questionSection) {
            elements.questionSection.classList.add('hidden');
        }
        if (elements.loadingText) {
            elements.loadingText.textContent = message || '読み込み中…';
        }
        if (elements.answerSubmit) {
            elements.answerSubmit.disabled = true;
            elements.answerSubmit.textContent = '読み込み中…';
        }
        if (elements.answerInput) {
            elements.answerInput.readOnly = true;
            elements.answerInput.value = '';
        }
    }

    function hideLoading() {
        if (elements.loadingIndicator) {
            elements.loadingIndicator.classList.add('hidden');
        }
        if (elements.questionSection) {
            elements.questionSection.classList.remove('hidden');
        }
        if (elements.answerSubmit) {
            elements.answerSubmit.disabled = state.awaitingNext;
            elements.answerSubmit.textContent = state.awaitingNext ? '次へ' : '回答';
        }
        if (elements.answerInput) {
            elements.answerInput.readOnly = state.awaitingNext;
        }
        if (state.dictionaryCompleted) {
            if (elements.answerSubmit) {
                elements.answerSubmit.disabled = true;
                elements.answerSubmit.textContent = '完了';
            }
            if (elements.answerInput) {
                elements.answerInput.readOnly = true;
            }
            if (elements.skipButton) {
                elements.skipButton.disabled = true;
            }
        }
    }

    if (elements.onlineCount) {
        elements.onlineCount.textContent = 'オフラインモード';
    }

    function getParams() {
        return new URLSearchParams(window.location.search);
    }

    function updateBrowserParams(params) {
        const search = params.toString();
        const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
        window.history.replaceState({}, '', url);
    }

    function normalizeMeaning(value) {
        if (typeof value !== 'string') {
            return value;
        }
        const asciiStart = value.indexOf('(');
        const asciiEnd = value.indexOf(')');
        const fullStart = value.indexOf('（');
        const fullEnd = value.indexOf('）');
        if (asciiStart !== -1 && asciiEnd !== -1 && asciiEnd > asciiStart) {
            return value.slice(asciiEnd + 1).trim();
        }
        if (fullStart !== -1 && fullEnd !== -1 && fullEnd > fullStart) {
            return value.slice(fullEnd + 1).trim();
        }
        return value.trim();
    }

    function fallbackHiragana(text) {
        if (window.wanakana) {
            return window.wanakana.toHiragana(text);
        }
        return text;
    }

    function fallbackRomaji(text) {
        if (window.wanakana) {
            return window.wanakana.toRomaji(text);
        }
        return text;
    }

    function makeSegment(text, reading) {
        const safeText = text || '';
        let segmentReading = reading || '';
        if (!segmentReading) {
            segmentReading = fallbackHiragana(safeText);
        }
        const romaji = fallbackRomaji(segmentReading || safeText);
        return {
            text: safeText,
            reading: segmentReading,
            romaji,
            hasKanji: hasKanji(safeText),
            hasKatakana: hasKatakana(safeText),
        };
    }

    function parseRubySegments(html, fallbackText) {
        if (!html) {
            return [makeSegment(fallbackText, '')];
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const segments = [];

        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || '';
                if (text.trim()) {
                    segments.push(makeSegment(text, ''));
                }
                return;
            }

            if (node.nodeName === 'RUBY') {
                let baseText = '';
                let reading = '';
                node.childNodes.forEach((child) => {
                    if (child.nodeName === 'RT' && !reading) {
                        reading = child.textContent || '';
                    } else if (child.nodeName === 'RP') {
                        // ignore
                    } else if (child.nodeName === 'RUBY') {
                        walk(child);
                    } else {
                        baseText += child.textContent || '';
                    }
                });
                if (baseText) {
                    segments.push(makeSegment(baseText, reading));
                }
                return;
            }

            if (node.childNodes && node.childNodes.length) {
                node.childNodes.forEach((child) => walk(child));
            }
        }

        doc.body.childNodes.forEach((child) => walk(child));
        if (!segments.length) {
            segments.push(makeSegment(fallbackText, ''));
        }
        return segments;
    }

    function createRubyMarkup(segments) {
        if (!Array.isArray(segments)) {
            return '';
        }
        return segments
            .map((segment) => {
                const text = escapeHtml(segment.text);
                const reading = escapeHtml(segment.reading);
                const shouldShowRuby =
                    state.showFurigana &&
                    (segment.hasKanji || (state.showKatakanaReading && segment.hasKatakana));
                if (shouldShowRuby && reading) {
                    return `<ruby>${text}<rt>${reading}</rt></ruby>`;
                }
                return text;
            })
            .join('');
    }

    function resolveGlobalConstructor(globalObj, fallbackName) {
        if (!globalObj) {
            return null;
        }
        if (typeof globalObj === 'function') {
            return globalObj;
        }
        if (globalObj.default && typeof globalObj.default === 'function') {
            return globalObj.default;
        }
        if (fallbackName && globalObj[fallbackName] && typeof globalObj[fallbackName] === 'function') {
            return globalObj[fallbackName];
        }
        return null;
    }

    async function initKuroshiro() {
        const KuroshiroCtor = resolveGlobalConstructor(window.Kuroshiro);
        const AnalyzerCtor = resolveGlobalConstructor(window.KuromojiAnalyzer, 'KuromojiAnalyzer');
        if (!KuroshiroCtor || !AnalyzerCtor) {
            throw new Error('Kuroshiro の読み込みに失敗しました');
        }
        const kuroshiro = new KuroshiroCtor();
        let lastError = null;
        for (const path of KUROMOJI_DICT_PATHS) {
            try {
                const analyzer = new AnalyzerCtor({ dictPath: path });
                await kuroshiro.init(analyzer);
                state.kuroshiro = kuroshiro;
                state.kuroshiroReady = true;
                console.info(`[Kuroshiro] dictionary loaded from ${path}`);
                return;
            } catch (error) {
                console.warn(`[Kuroshiro] failed to init with ${path}`, error);
                lastError = error;
            }
        }
        state.kuroshiroReady = false;
        throw lastError || new Error('Kuroshiro の読み込みに失敗しました');
    }

    function resolveDictionaryId(requested) {
        if (!state.dictionaries.length) {
            return null;
        }
        if (!requested) {
            return state.dictionaries[0].path;
        }
        const exact = state.dictionaries.find((item) => item.path === requested);
        if (exact) {
            return exact.path;
        }
        const byId = state.dictionaries.find((item) => item.id === requested);
        if (byId) {
            return byId.path;
        }
        const byName = state.dictionaries.find((item) => item.name === requested);
        if (byName) {
            return byName.path;
        }
        const basenameMatch = state.dictionaries.find((item) => item.path.endsWith(requested));
        if (basenameMatch) {
            return basenameMatch.path;
        }
        return state.dictionaries[0].path;
    }

    function getConfigCandidates() {
        const fallback = ['/config.json', 'config.json', '/static/config.json'];
        const seen = new Set();
        const result = [];
        const pushUnique = (value) => {
            if (!value) {
                return;
            }
            if (!seen.has(value)) {
                seen.add(value);
                result.push(value);
            }
        };

        // Try to infer config.json relative to the loaded app.js to avoid guaranteed 404s
        const script = document.currentScript || document.querySelector('script[src*="app.js"]');
        if (script && script.src) {
            try {
                const scriptUrl = new URL(script.src, window.location.href);
                pushUnique(new URL('config.json', scriptUrl).href);
            } catch (error) {
                console.warn('[Config] failed to derive config path from script src:', error);
            }
        }

        fallback.forEach((candidate) => pushUnique(candidate));
        return result;
    }

    async function loadConfig(params) {
        const candidates = getConfigCandidates();
        let response = null;
        for (const url of candidates) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (res && res.ok) {
                    response = res;
                    console.log('[Config] loaded from', url);
                    break;
                } else {
                    console.log('[Config] try', url, '->', res ? res.status : 'no response');
                }
            } catch (e) {
                console.log('[Config] fetch failed for', url, e);
            }
        }
        if (!response || !response.ok) {
            throw new Error(`設定の取得に失敗しました (HTTP ${response ? response.status : 'N/A'})`);
        }
        const data = await response.json();
        state.dictionaries = (data.dictionaries || []).map((item) => ({
            id: item.id || item.path || item.name,
            path: item.path || item.id,
            name: item.name || item.id || item.path,
            isWrongWords: item.isWrongWords || false,
        }));
        if (!state.dictionaries.length) {
            throw new Error('利用可能な辞書が見つかりません');
        }
        const requested = params.get('dict');
        // 尝试从 localStorage 读取上次选择的词典
        let lastSelected = null;
        try {
            lastSelected = localStorage.getItem('lastSelectedDictionary');
        } catch (error) {
            console.warn('Failed to read last selected dictionary from localStorage', error);
        }
        // 优先级：URL参数 > 上次选择 > 配置默认值 > 第一个词典
        const defaultId = data.default_dictionary || state.dictionaries[0].path;
        const initialId = resolveDictionaryId(requested || lastSelected || defaultId);
        state.dictionaryId = initialId;
        updateDictionaryLabel();
        populateDictionarySelect();
    }

    function populateDictionarySelect() {
        const select = elements.dictionarySelect;
        if (!select) {
            return;
        }
        select.innerHTML = '';
        
        // 检查用户是否已登录
        const isLoggedIn = window.firebaseAuth && window.firebaseAuth.currentUser;
        
        state.dictionaries.forEach((item) => {
            // 如果是错题本且用户未登录，则跳过
            if (item.isWrongWords && !isLoggedIn) {
                return;
            }
            
            const option = document.createElement('option');
            option.value = item.path;
            option.textContent = item.name;
            if (item.path === state.dictionaryId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    function updateDictionaryLabel() {
        const meta = state.dictionaries.find((item) => item.path === state.dictionaryId);
        state.dictionaryName = meta ? meta.name : '';
        if (elements.dictionaryName) {
            elements.dictionaryName.textContent = state.dictionaryName ? `（${state.dictionaryName}）` : '';
        }
    }

    // 游戏化系统：等级和连击
    let currentCombo = 0;
    
    function calculateLevel(correct) {
        // 每100个正确答案升一级
        return Math.floor(correct / 100) + 1;
    }
    
    function calculateExpInLevel(correct) {
        // 当前等级内的经验值
        return correct % 100;
    }
    
    function updateScoreboard() {
        const correct = parseInt(localStorage.getItem('correct') || '0', 10) || 0;
        const wrong = parseInt(localStorage.getItem('wrong') || '0', 10) || 0;
        const total = correct + wrong;
        
        // 更新等级徽章
        const level = calculateLevel(correct);
        if (elements.levelBadge) {
            elements.levelBadge.textContent = `Lv.${level}`;
        }
        
        // 更新经验条
        const expInLevel = calculateExpInLevel(correct);
        const expPercent = expInLevel; // 0-100
        if (elements.expFill) {
            elements.expFill.style.width = `${expPercent}%`;
        }
        if (elements.expText) {
            elements.expText.textContent = `${expInLevel} / 100`;
        }
        
        // 更新统计数据
        if (elements.correctStat) {
            elements.correctStat.textContent = correct;
        }
        if (elements.wrongStat) {
            elements.wrongStat.textContent = wrong;
        }
        if (elements.comboStat) {
            elements.comboStat.textContent = currentCombo;
        }
        if (elements.totalStat) {
            elements.totalStat.textContent = total;
        }
        
        // 保持旧的score元素更新（如果存在）
        if (elements.score) {
            elements.score.textContent = `正解: ${correct}`;
        }
    }
    
    function incrementCombo() {
        currentCombo++;
        if (elements.comboStat) {
            elements.comboStat.textContent = currentCombo;
            // 触发连击动画
            const comboItem = elements.comboStat.closest('.stat-item');
            if (comboItem) {
                comboItem.classList.add('active');
                setTimeout(() => {
                    comboItem.classList.remove('active');
                }, 600);
            }
        }
    }
    
    function resetCombo() {
        currentCombo = 0;
        if (elements.comboStat) {
            elements.comboStat.textContent = '0';
        }
    }

    function getProgressStorageKey(dictPath) {
        return `${PROGRESS_STORAGE_PREFIX}${dictPath}`;
    }

    function getEntryKey(entry) {
        if (!entry || !entry.kanji) {
            return '';
        }
        return entry.kanji.trim();
    }

    function loadProgressForDictionary(dictPath, dictionary) {
        state.progressDictionaryId = dictPath;
        if (dictPath === 'wrong-words') {
            state.masteredEntries = new Set();
            state.dictionaryCompleted = false;
            updateProgressUI();
            return;
        }
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(getProgressStorageKey(dictPath)) || 'null');
        } catch (error) {
            console.warn('[Progress] Failed to parse progress data', error);
        }
        let masteredList = [];
        if (Array.isArray(stored)) {
            masteredList = stored;
        } else if (stored && Array.isArray(stored.mastered)) {
            masteredList = stored.mastered;
        }
        const validKeys = new Set(dictionary.entries.map(getEntryKey));
        const sanitized = masteredList.filter((key) => validKeys.has(key));
        state.masteredEntries = new Set(sanitized);
        state.dictionaryCompleted = validKeys.size > 0 && state.masteredEntries.size >= validKeys.size;
        if (sanitized.length !== masteredList.length) {
            saveProgress(dictPath);
        } else {
            updateProgressUI();
        }
    }

    function saveProgress(dictPath) {
        if (!dictPath || dictPath === 'wrong-words') {
            updateProgressUI();
            return;
        }
        const payload = { mastered: Array.from(state.masteredEntries) };
        try {
            localStorage.setItem(getProgressStorageKey(dictPath), JSON.stringify(payload));
            if (window.autoSyncData) {
                window.autoSyncData();
            }
        } catch (error) {
            console.warn('[Progress] Failed to save progress', error);
        }
        updateProgressUI();
    }

    function isEntryMastered(entry) {
        if (!state.masteredEntries || !state.masteredEntries.size) {
            return false;
        }
        const key = getEntryKey(entry);
        return key ? state.masteredEntries.has(key) : false;
    }

    function removeFromWrongWords(entry) {
        if (!entry || !entry.kanji) {
            return;
        }
        try {
            const wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
            const filtered = wrongWords.filter((item) => item.kanji !== entry.kanji);
            if (filtered.length !== wrongWords.length) {
                localStorage.setItem('wrongWords', JSON.stringify(filtered));
                if (window.autoSyncData) {
                    window.autoSyncData();
                }
            }
        } catch (error) {
            console.warn('[Progress] Failed to update wrong words list', error);
        }
    }

    function markEntryMastered(entry) {
        if (!entry) {
            return;
        }
        removeFromWrongWords(entry);
        if (state.dictionaryId === 'wrong-words') {
            return;
        }
        const key = getEntryKey(entry);
        if (!key || state.masteredEntries.has(key)) {
            return;
        }
        state.masteredEntries.add(key);
        saveProgress(state.dictionaryId);
    }

    function updateProgressUI() {
        const isWrongWords = state.dictionaryId === 'wrong-words';
        const total = state.totalWords || 0;
        const mastered = state.masteredEntries ? state.masteredEntries.size : 0;
        const percent = total ? Math.round((mastered / total) * 100) : 0;
        
        // 更新进度文本信息
        if (elements.progressFraction) {
            if (!state.dictionaryId || isWrongWords || total === 0) {
                elements.progressFraction.textContent = '0 / 0';
            } else {
                elements.progressFraction.textContent = `${mastered} / ${total}`;
            }
        }
        
        if (elements.progressPercentage) {
            if (!state.dictionaryId || isWrongWords || total === 0) {
                elements.progressPercentage.textContent = '0%';
            } else {
                elements.progressPercentage.textContent = `${percent}%`;
            }
        }
        
        // 保持旧的进度容器兼容（如果存在）
        const container = elements.progressContainer;
        if (container) {
            if (!state.dictionaryId || isWrongWords || total === 0) {
                container.classList.add('hidden');
                if (elements.progressReset) {
                    elements.progressReset.classList.add('hidden');
                }
            } else {
                container.classList.remove('hidden');
                if (elements.progressReset) {
                    elements.progressReset.classList.remove('hidden');
                    elements.progressReset.disabled = total === 0;
                }
                if (elements.progressFill) {
                    elements.progressFill.style.width = `${Math.min(100, percent)}%`;
                }
                if (elements.progressBar) {
                    elements.progressBar.setAttribute('aria-valuemin', '0');
                    elements.progressBar.setAttribute('aria-valuemax', String(total));
                    elements.progressBar.setAttribute('aria-valuenow', String(mastered));
                }
                if (elements.progressText) {
                    elements.progressText.textContent = `${mastered} / ${total}（${percent}%）`;
                }
                container.classList.toggle('is-complete', total > 0 && mastered >= total);
            }
        }
    }

    function clearProgressForCurrentDictionary() {
        if (!state.dictionaryId || state.dictionaryId === 'wrong-words') {
            return false;
        }
        try {
            localStorage.removeItem(getProgressStorageKey(state.dictionaryId));
            if (window.autoSyncData) {
                window.autoSyncData();
            }
        } catch (error) {
            console.warn('[Progress] Failed to clear progress', error);
        }
        state.masteredEntries = new Set();
        state.dictionaryCompleted = false;
        state.completionCelebrated = false;
        updateProgressUI();
        return true;
    }

    function showDictionaryCompletedState() {
        state.dictionaryCompleted = true;
        state.awaitingNext = false;
        if (elements.questionWord) {
            elements.questionWord.innerHTML = '<span class="completion-badge">🎉</span>';
            elements.questionWord.removeAttribute('data-tts');
        }
        if (elements.questionMeaning) {
            const dictLabel = state.dictionaryName || 'この辞書';
            elements.questionMeaning.textContent = `${dictLabel} をコンプリートしました！`;
        }
        if (elements.questionReading) {
            elements.questionReading.style.display = 'none';
        }
        if (elements.questionRomaji) {
            elements.questionRomaji.style.display = 'none';
        }
        if (elements.answerInput) {
            elements.answerInput.value = '';
            elements.answerInput.placeholder = '';
            elements.answerInput.readOnly = true;
        }
        if (elements.answerSubmit) {
            elements.answerSubmit.disabled = true;
            elements.answerSubmit.textContent = '完了';
        }
        if (elements.skipButton) {
            elements.skipButton.disabled = true;
        }
        updateProgressUI();
        if (!state.completionCelebrated) {
            showAlert('success', '🎉 コンプリート！おめでとうございます！', true);
            state.completionCelebrated = true;
        }
    }
    
    // Make updateScoreboard globally available for Firebase integration
    window.updateScoreboard = updateScoreboard;
    window.populateDictionarySelect = populateDictionarySelect;

    function clearAlerts() {
        if (elements.alerts) {
            elements.alerts.innerHTML = '';
        }
    }

    function showAlert(type, message, isCelebration = false) {
        clearAlerts();
        const div = document.createElement('div');
        div.className = `alert ${type === 'error' ? 'alert-error' : 'alert-success'}`;
        if (isCelebration) {
            div.classList.add('alert-celebration');
        }
        div.textContent = message;
        elements.alerts.appendChild(div);
        
        if (isCelebration) {
            // 添加庆祝效果
            triggerCelebration();
        }
    }

    function triggerCelebration() {
        // 播放庆祝音效
        playCelebrationSound();
        
        // 创建彩纸效果
        createConfetti();
        
        // 为卡片添加庆祝动画
        const card = document.querySelector('.card');
        if (card) {
            card.classList.add('celebration-bounce', 'celebration-glow');
            
            // 移除动画类
            setTimeout(() => {
                card.classList.remove('celebration-bounce', 'celebration-glow');
            }, 1500);
        }
        
        // 为分数显示添加动画
        const score = document.getElementById('score');
        if (score) {
            score.classList.add('celebration-bounce');
            setTimeout(() => {
                score.classList.remove('celebration-bounce');
            }, 600);
        }
        
        // 为品牌标题添加庆祝效果
        const branding = document.querySelector('.branding-title');
        if (branding) {
            branding.classList.add('celebration-bounce');
            setTimeout(() => {
                branding.classList.remove('celebration-bounce');
            }, 600);
        }
    }

    function playCelebrationSound() {
        try {
            // 创建音频上下文
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 创建庆祝音效 - 上升音阶
            const frequencies = [523.25, 587.33, 659.25, 698.46, 783.99]; // C5, D5, E5, F5, G5
            
            frequencies.forEach((freq, index) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
                
                oscillator.start(audioContext.currentTime + index * 0.1);
                oscillator.stop(audioContext.currentTime + index * 0.1 + 0.3);
            });
        } catch (error) {
            // 静默处理音频错误，不影响主要功能
            console.debug('Audio playback not available:', error);
        }
    }

    function createConfetti() {
        // 移除现有的庆祝覆盖层
        const existingOverlay = document.querySelector('.celebration-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'celebration-overlay';
        
        // 创建70个彩纸片，增加密度
        for (let i = 0; i < 70; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'celebration-confetti';
            
            // 随机位置
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 2 + 's';
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            
            // 随机大小
            const size = Math.random() * 8 + 6; // 6-14px
            confetti.style.width = size + 'px';
            confetti.style.height = size + 'px';
            
            // 随机形状
            if (Math.random() > 0.6) {
                confetti.style.borderRadius = '50%';
            } else if (Math.random() > 0.8) {
                confetti.style.borderRadius = '2px';
            }
            
            // 随机旋转
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            
            overlay.appendChild(confetti);
        }
        
        document.body.appendChild(overlay);
        
        // 4秒后移除覆盖层
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.remove();
            }
        }, 4000);
    }

    function showIncorrectFeedback(answer, entry) {
        clearAlerts();
        const wrongLine = document.createElement('div');
        wrongLine.className = 'alert alert-error';
        wrongLine.textContent = `❎ ${(answer || '').replace(/\s+/g, '')}`;
        elements.alerts.appendChild(wrongLine);

        const correctLine = document.createElement('div');
        correctLine.className = 'alert alert-success';
        const reading = (entry.reading || '').replace(/\s+/g, '');
        const romaji = (entry.romaji || '').replace(/\s+/g, '');
        correctLine.textContent = `✅ ${entry.kanji}/${reading}/${romaji}`;
        elements.alerts.appendChild(correctLine);
    }

    async function ensureDictionaryLoaded(dictPath) {
        if (state.dictionaryMap.has(dictPath)) {
            return state.dictionaryMap.get(dictPath);
        }
        const response = await fetch('/static/' + dictPath, { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`辞書の読み込みに失敗しました (HTTP ${response.status})`);
        }
        const raw = await response.json();
        const entries = Object.entries(raw).map(([kanji, meaning]) => ({
            kanji,
            meaning: normalizeMeaning(meaning),
        }));
        const record = { entries };
        console.info(`Loaded dictionary: ${dictPath} (${entries.length} entries)`);
        state.dictionaryMap.set(dictPath, record);
        return record;
    }

    function fallbackHiragana(text) {
        if (window.wanakana) {
            return window.wanakana.toHiragana(text);
        }
        return text;
    }

    function fallbackRomaji(text) {
        if (window.wanakana) {
            return window.wanakana.toRomaji(text);
        }
        return text;
    }

    async function computeEntry(entry) {
        if (entry.__computed) {
            return entry;
        }
        const kuroshiro = state.kuroshiroReady ? state.kuroshiro : null;
        let reading = '';
        let romaji = '';
        let furigana = '';
        if (kuroshiro) {
            try {
                reading = await kuroshiro.convert(entry.kanji, { to: 'hiragana', mode: 'normal' });
                romaji = await kuroshiro.convert(entry.kanji, { to: 'romaji', romajiSystem: 'hepburn' });
                furigana = await kuroshiro.convert(entry.kanji, { to: 'hiragana', mode: 'furigana' });
            } catch (error) {
                console.warn('Kuroshiro conversion failed, fallback to Wanakana', error);
            }
        }
        if (!reading) {
            reading = fallbackHiragana(entry.kanji);
        }
        if (!romaji) {
            romaji = fallbackRomaji(reading || entry.kanji);
        }
        if (!furigana) {
            furigana = entry.kanji;
        }
        entry.reading = reading || entry.kanji;
        entry.romaji = romaji || entry.kanji;
        entry.furigana = furigana;
        entry.normalizedKanji = entry.kanji.replace(/\s+/g, '').toLowerCase();
        entry.normalizedReading = (reading || '').replace(/\s+/g, '').toLowerCase();
        entry.normalizedRomaji = (romaji || '').replace(/\s+/g, '').toLowerCase();
        entry.segments = parseRubySegments(furigana, entry.kanji);
        entry.__computed = true;
        return entry;
    }

    // 检查是否应该显示读音（假名）
    function shouldShowReading(entry) {
        if (!entry.reading) return false;
        
        // 如果reading和kanji完全相同，不显示
        if (entry.reading === entry.kanji) return false;
        
        // 检查是否只包含英文字母、数字、空格和常见符号（纯英文/罗马字）
        const isOnlyRomanChars = /^[a-zA-Z0-9\s\-._,!?'"()]+$/.test(entry.reading);
        if (isOnlyRomanChars) return false;
        
        return true;
    }

    function renderQuestion() {
        const entry = state.currentEntry;
        if (!entry) {
            return;
        }
        state.dictionaryCompleted = false;
        if (elements.questionWord) {
            const markup = state.showFurigana
                ? createRubyMarkup(entry.segments)
                : escapeHtml(entry.kanji);
            elements.questionWord.innerHTML = markup;
            // 添加data-tts属性，存储TTS应该读取的纯文本
            elements.questionWord.setAttribute('data-tts', entry.kanji);
            
            // 动态调整字体大小
            adjustFontSize(elements.questionWord, entry.kanji);
        }
        if (elements.questionMeaning) {
            elements.questionMeaning.textContent = entry.meaning;
        }
        if (elements.questionReading) {
            elements.questionReading.textContent = entry.reading;
            // 只有在设置开启且有有效的假名读音时才显示
            const hasValidReading = shouldShowReading(entry);
            elements.questionReading.style.display = (state.showReading && hasValidReading) ? 'block' : 'none';
        }
        if (elements.questionRomaji) {
            elements.questionRomaji.textContent = entry.romaji;
            elements.questionRomaji.style.display = state.showRomaji ? 'block' : 'none';
        }
        if (elements.answerInput) {
            elements.answerInput.placeholder = state.showPlaceholder ? entry.reading : '';
            elements.answerInput.value = '';
            elements.answerInput.readOnly = false;
            elements.answerInput.focus({ preventScroll: true });
        }
        if (elements.skipButton) {
            elements.skipButton.disabled = false;
        }
        setButtonToAnswer();
        
        // 如果启用了自动发音，则自动播放
        if (state.autoPronunciation) {
            // 延迟一点时间确保DOM更新完成
            setTimeout(() => {
                playTTS();
            }, 100);
        }
        clearAlerts();
    }

    function setLoading(isLoading) {
        if (!elements.answerSubmit) {
            return;
        }
        elements.answerSubmit.disabled = isLoading;
        if (isLoading) {
            elements.answerSubmit.textContent = '送信中…';
        } else {
            elements.answerSubmit.textContent = state.awaitingNext ? '次へ' : '回答';
        }
    }

    function incrementCounter(key) {
        const value = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        localStorage.setItem(key, String(value + 1));
        
        // 自动同步到云端
        if (window.autoSyncData) {
            window.autoSyncData();
        }
    }

    async function loadWrongWordsDict() {
        try {
            const wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
            
            if (wrongWords.length === 0) {
                throw new Error('錯題本に単語がありません。まず問題を解いてみましょう！');
            }
            
            // 将错题本转换为标准词典格式
            const entries = wrongWords.map(word => ({
                kanji: word.kanji,
                meaning: word.meaning || '',
                reading: word.reading || '',
                __computed: false
            }));
            
            console.log(`错题本已加载: ${entries.length} 个单词`);
            return { entries };
        } catch (error) {
            console.error('加载错题本失败:', error);
            throw error;
        }
    }

    async function loadRandomEntry() {
        if (!state.dictionaryId) {
            throw new Error('辞書が選択されていません');
        }
        
        let dictionary;
        
        // 检查是否选择了错题本
        if (state.dictionaryId === 'wrong-words') {
            dictionary = await loadWrongWordsDict();
        } else {
            dictionary = await ensureDictionaryLoaded(state.dictionaryId);
        }
        
        if (!dictionary.entries.length) {
            if (state.dictionaryId === 'wrong-words') {
                throw new Error('錯題本に単語がありません。まず問題を解いてみましょう！');
            } else {
                throw new Error('辞書に単語が登録されていません');
            }
        }
        state.totalWords = dictionary.entries.length;
        const isNewDictionary = state.progressDictionaryId !== state.dictionaryId;
        if (state.dictionaryId === 'wrong-words') {
            if (isNewDictionary) {
                state.completionCelebrated = false;
            }
            state.masteredEntries = new Set();
            state.dictionaryCompleted = false;
            state.progressDictionaryId = state.dictionaryId;
            updateProgressUI();
        } else {
            if (isNewDictionary) {
                state.completionCelebrated = false;
            }
            loadProgressForDictionary(state.dictionaryId, dictionary);
        }

        let pool = dictionary.entries;
        if (state.dictionaryId !== 'wrong-words') {
            pool = dictionary.entries.filter((entry) => !isEntryMastered(entry));
        }

        if (!pool.length) {
            state.currentEntry = null;
            showDictionaryCompletedState();
            return;
        }

        state.dictionaryCompleted = false;
        const randomIndex = Math.floor(Math.random() * pool.length);
        const entry = pool[randomIndex];
        await computeEntry(entry);
        state.currentEntry = entry;
        updateScoreboard();
        updateProgressUI();
        renderQuestion();
    }

    function addToWrongWords(entry) {
        if (!entry || !entry.kanji) return;
        
        try {
            let wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
            
            // 查找是否已存在相同的单词
            const existingIndex = wrongWords.findIndex(word => word.kanji === entry.kanji);
            
            if (existingIndex !== -1) {
                // 如果已存在，只更新时间（保持在同一位置）
                wrongWords[existingIndex].addedAt = new Date().toISOString();
                console.log('更新错题本时间:', entry.kanji);
            } else {
                // 如果不存在，添加新错题
                wrongWords.push({
                    kanji: entry.kanji,
                    meaning: entry.meaning,
                    reading: entry.reading,
                    addedAt: new Date().toISOString(),
                    source: state.dictionaryName || '未知词典'
                });
                console.log('已添加到错题本:', entry.kanji);
            }
            
            localStorage.setItem('wrongWords', JSON.stringify(wrongWords));
            
            // 自动同步到云端
            if (window.autoSyncData) {
                window.autoSyncData();
            }
        } catch (error) {
            console.error('添加到错题本失败:', error);
        }
    }

    // 显示错题本面板
    function showWrongWordsModal() {
        const modal = document.getElementById('wrong-words-modal');
        const backdrop = elements.modalBackdrop;
        const userMenu = document.getElementById('userMenu');
        
        // 清理重复数据
        cleanupDuplicateWrongWords();
        
        // 隐藏用户菜单
        if (userMenu) {
            userMenu.classList.remove('show');
        }
        
        if (modal && backdrop) {
            modal.classList.remove('hidden');
            backdrop.classList.remove('hidden');
            
            // 重置到第一页
            wrongWordsPagination.currentPage = 1;
            displayWrongWords(1);
            
            // 添加ESC键和背景点击关闭支持
            document.addEventListener('keydown', handleWrongWordsEscape);
            backdrop.addEventListener('click', handleBackdropClick);
        }
    }
    
    // 处理ESC键关闭错题本
    function handleWrongWordsEscape(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('wrong-words-modal');
            if (modal && !modal.classList.contains('hidden')) {
                hideWrongWordsModal();
            }
        }
    }
    
    // 隐藏错题本面板
    function hideWrongWordsModal() {
        const modal = document.getElementById('wrong-words-modal');
        const backdrop = elements.modalBackdrop;
        
        if (modal) modal.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        
        // 移除ESC键和背景点击监听
        document.removeEventListener('keydown', handleWrongWordsEscape);
        if (backdrop) {
            backdrop.removeEventListener('click', handleBackdropClick);
        }
    }

    // 错题本分页状态
    const wrongWordsPagination = {
        currentPage: 1,
        itemsPerPage: 10,
        totalItems: 0
    };

    // 清理错题本中的重复数据
    function cleanupDuplicateWrongWords() {
        try {
            const wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
            if (wrongWords.length === 0) return;
            
            // 去重：保留每个单词的最新记录
            const uniqueWords = [];
            const seenKanji = new Set();
            
            // 按时间倒序排序，保留最新的记录
            const sortedByTime = [...wrongWords].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
            
            for (const word of sortedByTime) {
                if (!seenKanji.has(word.kanji)) {
                    uniqueWords.push(word);
                    seenKanji.add(word.kanji);
                }
            }
            
            // 如果有重复，更新 localStorage
            if (uniqueWords.length < wrongWords.length) {
                localStorage.setItem('wrongWords', JSON.stringify(uniqueWords));
                console.log(`清理了 ${wrongWords.length - uniqueWords.length} 个重复的错题`);
                
                // 同步到云端
                if (window.autoSyncData) {
                    window.autoSyncData();
                }
            }
        } catch (error) {
            console.error('清理重复错题失败:', error);
        }
    }

    // 显示错题本列表
    function displayWrongWords(page = 1) {
        const wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
        const listContainer = document.getElementById('wrong-words-list');
        const correctElement = document.getElementById('correct-count');
        const wrongElement = document.getElementById('wrong-count');
        const paginationElement = document.getElementById('wrong-words-pagination');
        
        if (!listContainer) return;
        
        // 去重：保留每个单词的最新记录
        const uniqueWords = [];
        const seenKanji = new Set();
        
        // 先按时间倒序排序，这样遇到重复时会保留最新的
        const sortedByTime = [...wrongWords].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
        
        for (const word of sortedByTime) {
            if (!seenKanji.has(word.kanji)) {
                uniqueWords.push(word);
                seenKanji.add(word.kanji);
            }
        }
        
        // 更新统计信息 - 使用去重后的单词数
        const correct = parseInt(localStorage.getItem('correct') || '0', 10) || 0;
        const wrongWordsCount = uniqueWords.length; // 去重后的单词数量
        
        if (correctElement) correctElement.textContent = correct;
        if (wrongElement) wrongElement.textContent = wrongWordsCount;
        
        // 清空列表
        listContainer.innerHTML = '';
        
        if (uniqueWords.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-wrong-words">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    </svg>
                    <div class="empty-wrong-words-title">錯題本は空です</div>
                    <div class="empty-wrong-words-desc">間違えた単語がここに記録されます</div>
                </div>
            `;
            // 隐藏分页
            if (paginationElement) {
                paginationElement.classList.add('hidden');
            }
            return;
        }
        
        // 使用去重后的数组（已经是按时间倒序）
        const sortedWords = uniqueWords;
        
        // 计算分页
        wrongWordsPagination.totalItems = sortedWords.length;
        wrongWordsPagination.currentPage = page;
        const totalPages = Math.ceil(sortedWords.length / wrongWordsPagination.itemsPerPage);
        const startIndex = (page - 1) * wrongWordsPagination.itemsPerPage;
        const endIndex = Math.min(startIndex + wrongWordsPagination.itemsPerPage, sortedWords.length);
        const currentPageWords = sortedWords.slice(startIndex, endIndex);
        
        // 显示或隐藏分页控件
        if (paginationElement) {
            if (totalPages > 1) {
                paginationElement.classList.remove('hidden');
                updatePaginationControls(page, totalPages);
            } else {
                paginationElement.classList.add('hidden');
            }
        }
        
        currentPageWords.forEach((word, index) => {
            const wordElement = document.createElement('div');
            wordElement.className = 'wrong-word-item';
            
            // 检查是否应该显示读音
            const showReading = shouldShowReading(word);
            
            // 构建读音行HTML（如果需要显示）
            const readingRowHTML = showReading ? `
                <div class="wrong-word-row">
                    <div class="wrong-word-label">読み方:</div>
                    <div class="wrong-word-value">${escapeHtml(word.reading || '-')}</div>
                </div>
            ` : '';
            
            wordElement.innerHTML = `
                <div class="wrong-word-header">
                    <div class="wrong-word-kanji">${escapeHtml(word.kanji)}</div>
                    <div class="wrong-word-actions">
                        <button class="wrong-word-btn delete-btn" data-kanji="${escapeHtml(word.kanji)}" title="削除">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            削除
                        </button>
                    </div>
                </div>
                <div class="wrong-word-info">
                    <div class="wrong-word-row">
                        <div class="wrong-word-label">意味:</div>
                        <div class="wrong-word-value">${escapeHtml(word.meaning || '-')}</div>
                    </div>
                    ${readingRowHTML}
                </div>
                <div class="wrong-word-meta">
                    <div class="wrong-word-time">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        ${formatWrongWordTime(word.addedAt)}
                    </div>
                    <div class="wrong-word-source">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                        </svg>
                        ${escapeHtml(word.source || '未知词典')}
                    </div>
                </div>
            `;
            
            listContainer.appendChild(wordElement);
        });
        
        // 添加事件监听
        listContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const kanji = this.getAttribute('data-kanji');
                deleteWrongWord(kanji);
            });
        });
    }
    
    // 更新分页控件
    function updatePaginationControls(currentPage, totalPages) {
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const currentPageEl = document.getElementById('current-page');
        const totalPagesEl = document.getElementById('total-pages');
        
        if (currentPageEl) currentPageEl.textContent = currentPage;
        if (totalPagesEl) totalPagesEl.textContent = totalPages;
        
        if (prevBtn) {
            prevBtn.disabled = currentPage <= 1;
        }
        
        if (nextBtn) {
            nextBtn.disabled = currentPage >= totalPages;
        }
    }

    // 格式化错题时间
    function formatWrongWordTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'たった今';
        if (diffMins < 60) return `${diffMins}分前`;
        if (diffHours < 24) return `${diffHours}時間前`;
        if (diffDays < 7) return `${diffDays}日前`;
        
        return date.toLocaleDateString('ja-JP', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    // 删除单个错题
    function deleteWrongWord(kanji) {
        if (!confirm(`「${kanji}」を錯題本から削除しますか？`)) return;
        
        try {
            const wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
            const filtered = wrongWords.filter(word => word.kanji !== kanji);
            localStorage.setItem('wrongWords', JSON.stringify(filtered));
            
            console.log('已从错题本删除:', kanji);
            
            // 检查当前页是否还有数据，如果没有则回到上一页
            const currentPage = wrongWordsPagination.currentPage;
            const totalPages = Math.ceil(filtered.length / wrongWordsPagination.itemsPerPage);
            const newPage = currentPage > totalPages ? Math.max(1, totalPages) : currentPage;
            
            displayWrongWords(newPage);
            
            // 自动同步到云端
            if (window.autoSyncData) {
                window.autoSyncData();
            }
        } catch (error) {
            console.error('删除错题失败:', error);
        }
    }

    // 清空所有错题
    function clearAllWrongWords() {
        const wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
        if (wrongWords.length === 0) return;
        
        if (!confirm(`すべての錯題（${wrongWords.length}件）を削除しますか？この操作は取り消せません。`)) return;
        
        try {
            localStorage.setItem('wrongWords', '[]');
            console.log('已清空错题本');
            displayWrongWords();
            
            // 自动同步到云端
            if (window.autoSyncData) {
                window.autoSyncData();
            }
        } catch (error) {
            console.error('清空错题本失败:', error);
        }
    }

    // 处理点击背景关闭错题本
    function handleBackdropClick(e) {
        const modal = document.getElementById('wrong-words-modal');
        if (modal && !modal.classList.contains('hidden')) {
            // 确保点击的是backdrop本身，而不是modal内容
            if (e.target === elements.modalBackdrop) {
                hideWrongWordsModal();
            }
        }
    }

    // 开始练习错题本
    function startPracticeWrongWords() {
        const wrongWords = JSON.parse(localStorage.getItem('wrongWords') || '[]');
        
        if (wrongWords.length === 0) {
            alert('錯題本に単語がありません。まず問題を解いてみましょう！');
            return;
        }
        
        // 隐藏用户菜单
        const userMenu = document.getElementById('userMenu');
        if (userMenu) {
            userMenu.classList.remove('show');
        }
        
        // 切换到错题本词典
        const params = new URLSearchParams(window.location.search);
        params.set('dict', 'wrong-words');
        window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
        
        // 重新加载
        window.location.reload();
    }

    // 初始化错题本按钮事件
    document.addEventListener('DOMContentLoaded', function() {
        const viewWrongWordsButton = document.getElementById('viewWrongWordsButton');
        const practiceButton = document.getElementById('practice-wrong-words');
        const practiceWrongWordsButton = document.getElementById('practiceWrongWordsButton');
        const clearAllButton = document.getElementById('clear-all-wrong-words');
        const wrongWordsModal = document.getElementById('wrong-words-modal');
        const prevPageBtn = document.getElementById('prev-page');
        const nextPageBtn = document.getElementById('next-page');
        const dictionaryButtonMenu = document.getElementById('dictionaryButtonMenu');
        const settingsButtonMenu = document.getElementById('settingsButtonMenu');
        
        if (viewWrongWordsButton) {
            viewWrongWordsButton.addEventListener('click', function() {
                showWrongWordsModal();
            });
        }
        
        if (practiceButton) {
            practiceButton.addEventListener('click', function() {
                startPracticeWrongWords();
            });
        }
        
        if (practiceWrongWordsButton) {
            practiceWrongWordsButton.addEventListener('click', function() {
                startPracticeWrongWords();
            });
        }
        
        if (clearAllButton) {
            clearAllButton.addEventListener('click', clearAllWrongWords);
        }
        
        // 错题本面板的关闭按钮
        if (wrongWordsModal) {
            const closeBtn = wrongWordsModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', hideWrongWordsModal);
            }
        }
        
        // 分页按钮
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', function() {
                if (wrongWordsPagination.currentPage > 1) {
                    displayWrongWords(wrongWordsPagination.currentPage - 1);
                }
            });
        }
        
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(wrongWordsPagination.totalItems / wrongWordsPagination.itemsPerPage);
                if (wrongWordsPagination.currentPage < totalPages) {
                    displayWrongWords(wrongWordsPagination.currentPage + 1);
                }
            });
        }
        
        // 菜单中的辞書切换按钮
        if (dictionaryButtonMenu) {
            dictionaryButtonMenu.addEventListener('click', function() {
                // 直接触发模态框
                const dictionaryModal = document.getElementById('dictionary-modal');
                const backdrop = document.getElementById('modal-backdrop');
                if (dictionaryModal) {
                    dictionaryModal.classList.remove('hidden');
                }
                if (backdrop) {
                    backdrop.classList.remove('hidden');
                }
                // 关闭用户菜单
                const userMenu = document.getElementById('userMenu');
                if (userMenu) {
                    userMenu.classList.remove('show');
                }
            });
        }
        
        // 菜单中的设定按钮
        if (settingsButtonMenu) {
            settingsButtonMenu.addEventListener('click', function() {
                // 直接触发模态框
                const settingsModal = document.getElementById('settings-modal');
                const backdrop = document.getElementById('modal-backdrop');
                if (settingsModal) {
                    settingsModal.classList.remove('hidden');
                }
                if (backdrop) {
                    backdrop.classList.remove('hidden');
                }
                // 关闭用户菜单
                const userMenu = document.getElementById('userMenu');
                if (userMenu) {
                    userMenu.classList.remove('show');
                }
            });
        }
    });

    async function evaluateAnswer(answer) {
        const entry = state.currentEntry;
        if (!entry) {
            throw new Error('問題が読み込まれていません');
        }
        const trimmed = (answer || '').replace(/\s+/g, '').trim();
        if (!trimmed) {
            return { correct: false, match: null, userRomaji: '' };
        }
        if (trimmed.toLowerCase() === entry.normalizedKanji) {
            return { correct: true, match: 'kanji', userRomaji: entry.normalizedRomaji };
        }
        let romajiInput = '';
        try {
            if (state.kuroshiroReady) {
                romajiInput = await state.kuroshiro.convert(answer, { to: 'romaji', romajiSystem: 'hepburn' });
            }
        } catch (error) {
            if (window.wanakana) {
                romajiInput = window.wanakana.toRomaji(answer);
            } else {
                romajiInput = trimmed;
            }
        }
        if (!romajiInput && window.wanakana) {
            romajiInput = window.wanakana.toRomaji(answer);
        }
        if (!romajiInput) {
            romajiInput = trimmed;
        }
        const normalizedRomaji = (romajiInput || '').replace(/\s+/g, '').toLowerCase();
        if (normalizedRomaji === entry.normalizedRomaji) {
            return { correct: true, match: 'romaji', userRomaji: normalizedRomaji };
        }
        const hiraganaInput = window.wanakana ? window.wanakana.toHiragana(answer) : answer;
        const normalizedReading = (hiraganaInput || '').replace(/\s+/g, '').toLowerCase();
        if (normalizedReading === entry.normalizedReading) {
            return { correct: true, match: 'reading', userRomaji: normalizedRomaji };
        }
        
        // 答错时添加到错题本
        addToWrongWords(entry);
        
        return { correct: false, match: null, userRomaji: normalizedRomaji };
    }

    async function handleAnswerSubmit(event) {
        event.preventDefault();

        if (state.awaitingNext) {
            setButtonToAnswer();
            setLoading(true);
            try {
                await loadRandomEntry();
            } catch (error) {
                showAlert('error', error.message || String(error));
            } finally {
                setLoading(false);
            }
            return;
        }

        const value = elements.answerInput ? elements.answerInput.value : '';
        if (!value.trim()) {
            try {
                await loadRandomEntry();
            } catch (error) {
                showAlert('error', error.message || String(error));
            }
            return;
        }

        setLoading(true);
        try {
            const result = await evaluateAnswer(value);
            if (result.correct) {
                markEntryMastered(state.currentEntry);
                incrementCounter('correct');
                updateScoreboard();
                
                // 根据连续正确次数显示不同的庆祝消息
                const correctCount = parseInt(localStorage.getItem('correct') || '0', 10);
                let celebrationMessage = '👏 正解です！';
                
                if (correctCount % 10 === 0 && correctCount > 0) {
                    celebrationMessage = '🎉 すごい！10問連続正解！';
                } else if (correctCount % 5 === 0 && correctCount > 0) {
                    celebrationMessage = '✨ 素晴らしい！5問連続正解！';
                } else if (correctCount === 1) {
                    celebrationMessage = '🎯 初回正解！おめでとう！';
                }
                
                showAlert('success', celebrationMessage, true); // 第三个参数启用庆祝效果
                
                // 延迟加载下一个问题，让用户有时间享受庆祝效果
                setTimeout(async () => {
                    try {
                        await loadRandomEntry();
                    } catch (error) {
                        showAlert('error', error.message || String(error));
                    }
                }, 1500);
            } else {
                incrementCounter('wrong');
                updateScoreboard();
                showIncorrectFeedback(value, state.currentEntry);
                setButtonToNext();
            }
        } catch (error) {
            showAlert('error', error.message || String(error));
        } finally {
            setLoading(false);
        }
    }

    function applySettingsToModal() {
        if (!elements.settingsModal) {
            return;
        }
        elements.toggleReading.checked = state.showReading;
        elements.toggleRomaji.checked = state.showRomaji;
        elements.togglePlaceholder.checked = state.showPlaceholder;
        elements.toggleKatakana.checked = state.showKatakanaReading;
        elements.toggleFurigana.checked = state.showFurigana;
        elements.toggleAutoPronunciation.checked = state.autoPronunciation;
        state.pendingTheme = state.theme;
        updateThemeOptionUI(state.pendingTheme);
    }

    function hideModals() {
        [elements.dictionaryModal, elements.settingsModal].forEach((modal) => {
            if (modal) {
                modal.classList.add('hidden');
            }
        });
        if (elements.modalBackdrop) {
            elements.modalBackdrop.classList.add('hidden');
        }
        state.pendingTheme = state.theme;
        updateThemeOptionUI(state.theme);
    }

    function showModal(modal) {
        if (!modal) {
            return;
        }
        modal.classList.remove('hidden');
        if (elements.modalBackdrop) {
            elements.modalBackdrop.classList.remove('hidden');
        }
    }

    function parseSettingsFromParams() {
        const params = getParams();
        state.showReading = !params.has('hide_reading');
        state.showRomaji = !params.has('hide_romaji');
        state.showPlaceholder = !params.has('hide_placeholder');
        state.showKatakanaReading = params.get('show_katakana_reading') === '1';
        state.showFurigana = !params.has('hide_furigana');
        state.autoPronunciation = params.get('auto_pronunciation') === '1';
        return params;
    }

    function bindEvents() {
        // 标记用户首次交互，绕过浏览器自动播放限制
        function markInteracted() {
            if (!window.hasUserInteracted) {
                window.hasUserInteracted = true;
                try { speechSynthesis.resume(); } catch (_) {}
            }
        }
        ['pointerdown','click','keydown','touchstart'].forEach((evt) => {
            window.addEventListener(evt, markInteracted, { once: true, capture: true });
        });
        if (elements.answerInput) {
            elements.answerInput.addEventListener('focus', markInteracted, { once: true, capture: true });
        }
        if (elements.answerForm) {
            elements.answerForm.addEventListener('submit', handleAnswerSubmit);
        }
        if (elements.skipButton) {
            elements.skipButton.addEventListener('click', async () => {
                setButtonToAnswer();
                setLoading(true);
                try {
                    await loadRandomEntry();
                } catch (error) {
                    showAlert('error', error.message || String(error));
                } finally {
                    setLoading(false);
                }
            });
        }
        if (elements.dictionaryButton) {
            elements.dictionaryButton.addEventListener('click', () => {
                hideModals();
                populateDictionarySelect();
                showModal(elements.dictionaryModal);
                waitForVoices(1500).then(() => populateVoiceSelect());
            });
        }
        if (elements.settingsButton) {
            elements.settingsButton.addEventListener('click', () => {
                hideModals();
                applySettingsToModal();
                showModal(elements.settingsModal);
            });
        }
        if (elements.themeRadios && elements.themeRadios.length) {
            elements.themeRadios.forEach((radio) => {
                radio.addEventListener('change', () => {
                    const value = radio.value;
                    state.pendingTheme = isSupportedTheme(value) ? value : DEFAULT_THEME;
                    updateThemeOptionUI(state.pendingTheme);
                });
            });
        }
        if (elements.dictionarySave) {
            elements.dictionarySave.addEventListener('click', async () => {
                const selected = elements.dictionarySelect.value;
                const params = getParams();
                if (selected) {
                    params.set('dict', selected);
                        // 保存到 localStorage 以记住用户选择
                    try {
                        localStorage.setItem('lastSelectedDictionary', selected);
                        
                        // 自动同步到云端
                        if (window.autoSyncData) {
                            window.autoSyncData();
                        }
                    } catch (error) {
                        console.warn('Failed to save dictionary selection to localStorage', error);
                    }
                } else {
                    params.delete('dict');
                }
                updateBrowserParams(params);
                hideModals();
                state.dictionaryId = resolveDictionaryId(selected || state.dictionaryId);
                updateDictionaryLabel();
                populateDictionarySelect();
                try {
                    showLoading('新しい辞書を読み込んでいます…');
                    await loadRandomEntry();
                } catch (error) {
                    showAlert('error', error.message || String(error));
                } finally {
                    hideLoading();
                }
            });
        }
        if (elements.progressReset) {
            elements.progressReset.addEventListener('click', async () => {
                if (!state.dictionaryId || state.dictionaryId === 'wrong-words' || !state.totalWords) {
                    return;
                }
                const confirmed = window.confirm('現在の辞書の進捗をリセットしますか？');
                if (!confirmed) {
                    return;
                }
                const cleared = clearProgressForCurrentDictionary();
                if (!cleared) {
                    return;
                }
                showLoading('進捗をリセットしています…');
                try {
                    await loadRandomEntry();
                } catch (error) {
                    showAlert('error', error.message || String(error));
                } finally {
                    hideLoading();
                }
            });
        }
        if (elements.settingsSave) {
            elements.settingsSave.addEventListener('click', () => {
                const params = getParams();
                elements.toggleReading.checked ? params.delete('hide_reading') : params.set('hide_reading', '1');
                elements.toggleRomaji.checked ? params.delete('hide_romaji') : params.set('hide_romaji', '1');
                elements.togglePlaceholder.checked ? params.delete('hide_placeholder') : params.set('hide_placeholder', '1');
                elements.toggleKatakana.checked ? params.set('show_katakana_reading', '1') : params.delete('show_katakana_reading');
                elements.toggleFurigana.checked ? params.delete('hide_furigana') : params.set('hide_furigana', '1');
                elements.toggleAutoPronunciation.checked ? params.set('auto_pronunciation', '1') : params.delete('auto_pronunciation');
                updateBrowserParams(params);
                const selectedTheme = isSupportedTheme(state.pendingTheme) ? state.pendingTheme : state.theme;
                applyTheme(selectedTheme);
                hideModals();
                parseSettingsFromParams();
                renderQuestion();
                
                // 自动同步设置到云端
                if (window.autoSyncData) {
                    window.autoSyncData();
                }
            });
        }
        if (elements.modalBackdrop) {
            elements.modalBackdrop.addEventListener('click', hideModals);
        }
        document.querySelectorAll('[data-close="modal"]').forEach((node) => {
            node.addEventListener('click', hideModals);
        });
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                hideModals();
            }
        });
        if (elements.voicePreview) {
            elements.voicePreview.addEventListener('click', () => {
                if (state.previewPlaying) {
                    try { speechSynthesis.cancel(); } catch (_) {}
                    state.previewPlaying = false;
                    updatePreviewButton();
                    return;
                }
                startVoicePreview();
            });
        }
        
        // TTS button event listener
        const ttsButton = document.getElementById('tts-button');
        console.log('=== TTS Button Binding Debug ===');
        console.log('TTS button found:', !!ttsButton);
        console.log('TTS button element:', ttsButton);
        if (ttsButton) {
            console.log('Adding TTS click event listener...');
            ttsButton.addEventListener('click', handleTTSClick);
            console.log('TTS event listener added successfully');
        } else {
            console.error('TTS button not found in DOM!');
            console.log('Available elements with id containing "tts":', Array.from(document.querySelectorAll('[id*="tts"]')));
        }

        // WanaKana input conversion for answer input
        // Use setTimeout to ensure WanaKana is fully loaded
        setTimeout(() => {
            if (elements.answerInput && window.wanakana) {
                console.log('Binding WanaKana to answer input...');
                window.wanakana.bind(elements.answerInput);
                console.log('WanaKana bound successfully to answer input');
            } else {
                console.warn('WanaKana binding failed:', {
                    answerInput: !!elements.answerInput,
                    wanakana: !!window.wanakana
                });
                // Retry after a longer delay
                setTimeout(() => {
                    if (elements.answerInput && window.wanakana) {
                        console.log('Retrying WanaKana binding...');
                        window.wanakana.bind(elements.answerInput);
                        console.log('WanaKana bound successfully on retry');
                    } else {
                        console.error('WanaKana binding failed after retry:', {
                            answerInput: !!elements.answerInput,
                            wanakana: !!window.wanakana
                        });
                    }
                }, 1000);
            }
        }, 100);
    }

    function handleTTSClick() {
        console.log('=== TTS Debug Start ===');
        console.log('TTS button clicked'); // Debug log
        
        // Mark user interaction immediately when TTS button is clicked
        if (!window.hasUserInteracted) {
            window.hasUserInteracted = true;
            console.log('User interaction detected via TTS button - TTS now allowed');
        }
        
        console.log('speechSynthesis object:', speechSynthesis);
        console.log('speechSynthesis.speaking:', speechSynthesis.speaking);
        console.log('speechSynthesis.pending:', speechSynthesis.pending);
        console.log('speechSynthesis.paused:', speechSynthesis.paused);
        
        // 如果正在发音，则暂停或停止
        if (speechSynthesis.speaking) {
            console.log('Speech is currently playing, stopping...');
            state.userCancelledSpeech = true;
            try { speechSynthesis.cancel(); } catch (_) {}
            return;
        }
        
        // 如果暂停中，则恢复
        if (speechSynthesis.paused) {
            console.log('Speech is paused, resuming...');
            speechSynthesis.resume();
            return;
        }
        
        // 否则开始新的发音
        playTTS();
    }

    function playTTS() {
        const questionWord = document.getElementById('question-word');
        if (!questionWord) {
            console.log('No question word element found'); // Debug log
            return;
        }
        
        // 优先读取data-tts属性，如果没有则使用textContent
        const word = questionWord.getAttribute('data-tts') || questionWord.textContent.trim();
        if (!word) {
            console.log('No text to speak found'); // Debug log
            return;
        }
        
        console.log('Speaking word:', word); // Debug log
        speakJapanese(word);
    }

    function speakJapanese(text) {
        console.log('=== TTS Debug Information ===');
        console.log('Text to speak:', text);
        console.log('speechSynthesis object:', speechSynthesis);
        console.log('speechSynthesis.speaking:', speechSynthesis.speaking);
        console.log('speechSynthesis.pending:', speechSynthesis.pending);
        console.log('speechSynthesis.paused:', speechSynthesis.paused);
        console.log('User agent:', navigator.userAgent);
        
        if (!speechSynthesis) {
            console.error('speechSynthesis not supported');
            showAlert('error', 'お使いのブラウザは音声合成をサポートしていません');
            return;
        }

        // Check if user has interacted with the page (required for autoplay policy)
        if (!window.hasUserInteracted) {
            console.warn('TTS blocked: User has not interacted with the page yet');
            showAlert('warning', 'ブラウザの自動再生ポリシーにより、最初にページをクリックしてから音声を再生してください');
            return;
        }

        // Only cancel if there's actually something speaking or pending
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            console.log('Canceling existing speech...');
            speechSynthesis.cancel();
            // Wait for cancel to complete before proceeding
            setTimeout(() => {
                if (!state.userCancelledSpeech) {
                    loadVoicesAndSpeakSingle();
                }
            }, 100);
        } else {
            // No existing speech, proceed immediately
            loadVoicesAndSpeakSingle();
        }

        // 单次播放
        function loadVoicesAndSpeakSingle() {
            const voices = speechSynthesis.getVoices();
            console.log('All available voices:', voices.map(v => `${v.name} (${v.lang})`));
            
            const japaneseVoices = voices.filter(voice => 
                voice.lang.startsWith('ja') || 
                voice.name.toLowerCase().includes('japanese') ||
                voice.name.toLowerCase().includes('japan')
            );
            
            console.log('Japanese voices found:', japaneseVoices.map(v => ({
                name: v.name,
                lang: v.lang,
                default: v.default,
                localService: v.localService
            })));

            let selectedVoice = null;
            
            // Use user's selected voice if available
            if (state.selectedVoice) {
                selectedVoice = voices.find(voice => voice.name === state.selectedVoice);
                console.log('User selected voice:', state.selectedVoice);
                console.log('Found selected voice:', selectedVoice);
            }
            
            // Fallback to preferred Japanese voice if selected voice not found
            if (!selectedVoice && japaneseVoices.length > 0) {
                // Try to find Kyoko or other preferred voices
                const kyokoVoice = japaneseVoices.find(voice => 
                    /kyoko/i.test(voice.name || '') && 
                    (voice.lang || '').toLowerCase().startsWith('ja')
                );
                selectedVoice = kyokoVoice || japaneseVoices[0];
                console.log('Using fallback voice:', selectedVoice.name);
            }
            
            // 创建并播放（使用当前设置的速率）
            const utter = createUtterance(text, selectedVoice, voices, state.speechRate || 1.0);
            console.log('Starting single speech (rate ' + (state.speechRate || 1.0) + 'x)...');
            try {
                speechSynthesis.speak(utter);
            } catch (error) {
                console.error('Error starting speech:', error);
            }
        }
        
        function createUtterance(text, selectedVoice, voices, rate) {
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Apply voice settings
            try {
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                    utterance.lang = selectedVoice.lang || 'ja-JP';
                    console.log('Voice set to:', selectedVoice.name, selectedVoice.lang);
                } else {
                    console.warn('No Japanese voice found, using default');
                    // Try to use any available voice as fallback
                    const fallbackVoice = voices.find(v => v.default) || voices[0];
                    if (fallbackVoice) {
                        utterance.voice = fallbackVoice;
                        console.log('Using fallback voice:', fallbackVoice.name);
                    } else {
                        utterance.lang = 'ja-JP';
                    }
                }
            } catch (e) {
                console.warn('Error setting voice:', e);
                utterance.lang = 'ja-JP';
            }

            // Apply speech settings
            utterance.rate = rate;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            console.log('Utterance properties (rate: ' + rate + '):');
            console.log('- text:', utterance.text);
            console.log('- voice:', utterance.voice ? utterance.voice.name : 'default');
            console.log('- lang:', utterance.lang);
            console.log('- rate:', utterance.rate);
            console.log('- pitch:', utterance.pitch);
            console.log('- volume:', utterance.volume);

            // Event handlers for debugging
            utterance.onstart = function(event) {
                console.log('Speech started successfully! (rate: ' + rate + ')');
            };

            utterance.onend = function(event) {
                console.log('Speech ended (rate: ' + rate + ')');
            };

            utterance.onerror = function(event) {
                console.error('Speech synthesis error (rate: ' + rate + '):', event.error);
                
                // Handle specific error types
                if (event.error === 'canceled' || event.error === 'interrupted') {
                    if (state.userCancelledSpeech) {
                        // 用户手动取消，重置标记并且不重试
                        state.userCancelledSpeech = false;
                        return;
                    }
                    console.log('Speech was canceled/interrupted, attempting retry...');
                    // Wait a bit and retry once
                    setTimeout(() => {
                        try {
                            speechSynthesis.cancel(); // Clear any pending speech
                            const retryUtterance = new SpeechSynthesisUtterance(text);
                            retryUtterance.voice = utterance.voice;
                            retryUtterance.lang = utterance.lang;
                            retryUtterance.rate = utterance.rate;
                            retryUtterance.pitch = utterance.pitch;
                            retryUtterance.volume = utterance.volume;
                            
                            retryUtterance.onerror = function(retryEvent) {
                                console.error('Retry also failed:', retryEvent.error);
                                showAlert('error', '音声の再生中にエラーが発生しました: ' + retryEvent.error);
                            };
                            
                            retryUtterance.onstart = function() {
                                console.log('Retry speech started successfully!');
                            };
                            
                            speechSynthesis.speak(retryUtterance);
                        } catch (retryError) {
                            console.error('Error during retry:', retryError);
                            showAlert('error', '音声の再生中にエラーが発生しました: ' + event.error);
                        }
                    }, 200);
                } else {
                    showAlert('error', '音声の再生中にエラーが発生しました: ' + event.error);
                }
            };

            utterance.onpause = function(event) {
                console.log('Speech paused (rate: ' + rate + ')');
            };

            utterance.onresume = function(event) {
                console.log('Speech resumed (rate: ' + rate + ')');
            };

            utterance.onmark = function(event) {
                console.log('Speech mark event (rate: ' + rate + '):', event);
            };

            utterance.onboundary = function(event) {
                console.log('Speech boundary event (rate: ' + rate + '):', event);
            };
            
            return utterance;
        }

        // Some browsers need time to load voices
        if (speechSynthesis.getVoices().length === 0) {
            console.log('No voices available yet, waiting for voiceschanged event...');
            speechSynthesis.addEventListener('voiceschanged', function() {
                console.log('voiceschanged event fired');
                loadVoicesAndSpeakSingle();
            }, { once: true });
            
            // Fallback: try again after a short delay
            setTimeout(() => {
                if (speechSynthesis.getVoices().length === 0) {
                    console.log('Still no voices after timeout, trying anyway...');
                    loadVoicesAndSpeakSingle();
                }
            }, 1000);
        } else {
            console.log('Voices already available, proceeding...');
            loadVoicesAndSpeakSingle();
        }
    }

    function initFooterFavicon() {
        const link = document.querySelector('link[rel="icon"]') || document.createElement('link');
        link.setAttribute('rel', 'icon');
        link.setAttribute('type', 'image/svg+xml');
        link.setAttribute('href', '/static/favicon.svg?v=1');
        if (!link.parentNode) {
            document.head.appendChild(link);
        }
    }

    function populateVoiceSelect() {
        if (!elements.voiceSelect) {
            return;
        }

        const voices = speechSynthesis.getVoices();
        console.log('[TTS] populateVoiceSelect: voices length =', voices ? voices.length : 'null');
        const japaneseVoices = voices.filter(voice => 
            voice.lang.startsWith('ja') || 
            voice.name.toLowerCase().includes('japanese') ||
            voice.name.toLowerCase().includes('japan')
        ).sort((a, b) => {
            // Prioritize Japanese voices
            const jaA = (a.lang || '').toLowerCase().startsWith('ja') ? 0 : 1;
            const jaB = (b.lang || '').toLowerCase().startsWith('ja') ? 0 : 1;
            if (jaA !== jaB) return jaA - jaB;
            
            // Prioritize default voices
            if (a.default && !b.default) return -1;
            if (!a.default && b.default) return 1;
            
            // Sort by name
            return (a.name || '').localeCompare(b.name || '');
        });

        // Clear existing options
        elements.voiceSelect.innerHTML = '';
        console.log('[TTS] japaneseVoices length =', japaneseVoices.length);

        // 当下没有可用日语声音时，提供回退选项，仍可朗读
        if (japaneseVoices.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '自動 (ja-JP) — 音声未検出';
            option.selected = true;
            elements.voiceSelect.appendChild(option);
            state.selectedVoice = '';
            console.log('[TTS] No Japanese voices found, fallback option inserted');
            return;
        }

        // Find preferred voice (Kyoko or similar)
        const savedVoice = localStorage.getItem('selectedVoice');
        const kyokoVoice = japaneseVoices.find(voice => 
            /kyoko/i.test(voice.name || '') && 
            (voice.lang || '').toLowerCase().startsWith('ja')
        );
        const preferredVoice = 
            japaneseVoices.find(voice => (voice.voiceURI || voice.name) === savedVoice) ||
            kyokoVoice ||
            japaneseVoices.find(voice => (voice.lang || '').toLowerCase().startsWith('ja')) ||
            japaneseVoices[0];

        // Add Japanese voices
        japaneseVoices.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} — ${voice.lang}${voice.default ? ' (默认)' : ''}`;
            if (preferredVoice && voice.name === preferredVoice.name) {
                option.selected = true;
                state.selectedVoice = voice.name;
            }
            elements.voiceSelect.appendChild(option);
        });
        console.log('[TTS] Voice select populated. Selected =', state.selectedVoice);
    }

    // 轮询等待浏览器加载 voices，避免某些环境下 voiceschanged 不触发
    function waitForVoices(maxWaitMs = 3000) {
        console.log('[TTS] waitForVoices start, maxWaitMs =', maxWaitMs);
        return new Promise((resolve) => {
            const start = Date.now();
            function check() {
                const list = speechSynthesis.getVoices();
                console.log('[TTS] waitForVoices poll, length =', list ? list.length : 'null');
                if (list && list.length > 0) {
                    resolve(list);
                    return;
                }
                if (Date.now() - start >= maxWaitMs) {
                    console.log('[TTS] waitForVoices timeout');
                    resolve(list);
                    return;
                }
                setTimeout(check, 150);
            }
            // 事件 + 轮询双保险
            const handler = () => resolve(speechSynthesis.getVoices());
            try {
                speechSynthesis.addEventListener('voiceschanged', () => {
                    console.log('[TTS] voiceschanged fired');
                    handler();
                }, { once: true });
            } catch (_) {
                // 忽略旧浏览器异常
            }
            check();
        });
    }

    function printVoicesLog() {
        const list = speechSynthesis.getVoices() || [];
        const ja = list.filter(v => /^(ja)/i.test(v.lang) || /japan|japanese/i.test(v.name));
        console.group('[TTS] Voices');
        console.log('Total =', list.length);
        try { console.table(list.map(v => ({ name: v.name, lang: v.lang, default: v.default, local: v.localService }))); } catch (_) { /* console.table 可能不可用 */ }
        console.log('Japanese =', ja.length);
        try { console.table(ja.map(v => ({ name: v.name, lang: v.lang, default: v.default, local: v.localService }))); } catch (_) { /* 忽略错误 */ }
        console.groupEnd();
    }

    function initVoiceSelection() {
        console.log('[TTS] initVoiceSelection');
        // 立即打印一次（可能为 0），便于观察后续变化
        printVoicesLog();
        // Load saved voice preference
        const savedVoice = localStorage.getItem('selectedVoice');
        if (savedVoice) {
            state.selectedVoice = savedVoice;
        }

        // Load saved speech rate
        const savedRate = localStorage.getItem('speechRate');
        if (savedRate) {
            state.speechRate = Math.min(2, Math.max(0.5, parseFloat(savedRate) || 1));
        }

        // Initialize rate slider
        if (elements.rateSlider) {
            elements.rateSlider.value = String(state.speechRate);
        }
        if (elements.rateValue) {
            elements.rateValue.textContent = `${state.speechRate.toFixed(1)}x`;
        }

        // Populate voice select when voices are available（事件 + 轮询）
        waitForVoices(3000).then(() => {
            console.log('[TTS] initVoiceSelection -> populateVoiceSelect');
            populateVoiceSelect();
            printVoicesLog();
        });

        // Add event listener for voice selection change
        if (elements.voiceSelect) {
            elements.voiceSelect.addEventListener('change', function() {
                state.selectedVoice = this.value;
                localStorage.setItem('selectedVoice', this.value);
                // 如果正在试听，切换声音后立即用新声音重播
                if (state.previewPlaying) {
                    startVoicePreview();
                }
                // 自动同步到云端
                if (window.autoSyncData) {
                    window.autoSyncData();
                }
            });
        }

        // Add event listener for rate slider change
        if (elements.rateSlider) {
            elements.rateSlider.addEventListener('input', function() {
                state.speechRate = Math.min(2, Math.max(0.5, parseFloat(this.value) || 1));
                if (elements.rateValue) {
                    elements.rateValue.textContent = `${state.speechRate.toFixed(1)}x`;
                }
                localStorage.setItem('speechRate', String(state.speechRate));
                // 自动同步到云端
                if (window.autoSyncData) {
                    window.autoSyncData();
                }
            });
        }
    }

    // 暴露手动刷新接口，便于控制台调试
    window.__refreshVoices = function () {
        console.log('[TTS] __refreshVoices called');
        return waitForVoices(2000).then(() => populateVoiceSelect());
    };

    // 暴露打印接口
    window.__printVoices = function () {
        printVoicesLog();
    };

    // 动态调整字体大小函数
    function adjustFontSize(element, text) {
        if (!element || !text) return;
        
        // 移除之前的字体大小类
        element.classList.remove('long-text', 'very-long-text');
        
        // 根据文本长度判断应用哪个类
        const textLength = text.length;
        
        if (textLength > 15) {
            // 超过15个字符，使用最小字体
            element.classList.add('very-long-text');
            console.log('Applied very-long-text class for text length:', textLength);
        } else if (textLength > 8) {
            // 超过8个字符，使用中等字体
            element.classList.add('long-text');
            console.log('Applied long-text class for text length:', textLength);
        } else {
            console.log('Using default font size for text length:', textLength);
        }
    }

    async function init() {
        console.log('=== Application Initialization ===');
        console.log('Starting app initialization...');
        initTheme();
        console.log('Theme initialized');
        bindEvents();
        console.log('Events bound successfully');
        initFooterFavicon();
        console.log('Footer favicon initialized');
        initVoiceSelection();
        console.log('Voice selection initialized');
        const params = parseSettingsFromParams();
        showLoading('辞書を読み込んでいます…');
        try {
            await initKuroshiro();
        } catch (error) {
            console.warn('Kuroshiro failed to initialize, falling back to Wanakana only', error);
        }
        try {
            await loadConfig(params);
            updateScoreboard();
            await loadRandomEntry();
        } catch (error) {
            showAlert('error', error.message || String(error));
        } finally {
            hideLoading();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
