(function () {
    'use strict';

    const KUROMOJI_DICT_PATHS = ['/static/kuromoji-dict/'];

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
        voiceSelect: document.getElementById('voice-select'),
        rateSlider: document.getElementById('rate-slider'),
        rateValue: document.getElementById('rate-value'),
        settingsSave: document.getElementById('settings-save'),
        loadingIndicator: document.getElementById('loading-indicator'),
        loadingText: document.querySelector('#loading-indicator .loading-text'),
    };

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
        }));
        if (!state.dictionaries.length) {
            throw new Error('利用可能な辞書が見つかりません');
        }
        const requested = params.get('dict');
        const defaultId = data.default_dictionary || state.dictionaries[0].path;
        const initialId = resolveDictionaryId(requested || defaultId);
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
        state.dictionaries.forEach((item) => {
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

    function updateScoreboard() {
        const correct = parseInt(localStorage.getItem('correct') || '0', 10) || 0;
        const wrong = parseInt(localStorage.getItem('wrong') || '0', 10) || 0;
        if (elements.score) {
            elements.score.textContent = `正解: ${correct} | 不正解: ${wrong} | 総単語: ${state.totalWords}`;
        }
    }

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

    function renderQuestion() {
        const entry = state.currentEntry;
        if (!entry) {
            return;
        }
        if (elements.questionWord) {
            const markup = state.showFurigana
                ? createRubyMarkup(entry.segments)
                : escapeHtml(entry.kanji);
            elements.questionWord.innerHTML = markup;
        }
        if (elements.questionMeaning) {
            elements.questionMeaning.textContent = entry.meaning;
        }
        if (elements.questionReading) {
            elements.questionReading.textContent = entry.reading;
            elements.questionReading.style.display = state.showReading ? 'block' : 'none';
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
        setButtonToAnswer();
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
    }

    async function loadRandomEntry() {
        if (!state.dictionaryId) {
            throw new Error('辞書が選択されていません');
        }
        const dictionary = await ensureDictionaryLoaded(state.dictionaryId);
        if (!dictionary.entries.length) {
            throw new Error('辞書に単語が登録されていません');
        }
        state.totalWords = dictionary.entries.length;
        const randomIndex = Math.floor(Math.random() * dictionary.entries.length);
        const entry = dictionary.entries[randomIndex];
        await computeEntry(entry);
        state.currentEntry = entry;
        updateScoreboard();
        renderQuestion();
    }

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
        return params;
    }

    function bindEvents() {
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
                populateDictionarySelect();
                showModal(elements.dictionaryModal);
            });
        }
        if (elements.settingsButton) {
            elements.settingsButton.addEventListener('click', () => {
                applySettingsToModal();
                showModal(elements.settingsModal);
                // 打开设置面板时，强制刷新一次语音列表（应对延迟加载）
                waitForVoices(1500).then(() => populateVoiceSelect());
            });
        }
        if (elements.dictionarySave) {
            elements.dictionarySave.addEventListener('click', async () => {
                const selected = elements.dictionarySelect.value;
                const params = getParams();
                if (selected) {
                    params.set('dict', selected);
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
        if (elements.settingsSave) {
            elements.settingsSave.addEventListener('click', () => {
                const params = getParams();
                elements.toggleReading.checked ? params.delete('hide_reading') : params.set('hide_reading', '1');
                elements.toggleRomaji.checked ? params.delete('hide_romaji') : params.set('hide_romaji', '1');
                elements.togglePlaceholder.checked ? params.delete('hide_placeholder') : params.set('hide_placeholder', '1');
                elements.toggleKatakana.checked ? params.set('show_katakana_reading', '1') : params.delete('show_katakana_reading');
                elements.toggleFurigana.checked ? params.delete('hide_furigana') : params.set('hide_furigana', '1');
                updateBrowserParams(params);
                hideModals();
                parseSettingsFromParams();
                renderQuestion();
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
    }

    function handleTTSClick() {
        console.log('=== TTS Debug Start ===');
        console.log('TTS button clicked'); // Debug log
        console.log('speechSynthesis object:', speechSynthesis);
        console.log('speechSynthesis.speaking:', speechSynthesis.speaking);
        console.log('speechSynthesis.pending:', speechSynthesis.pending);
        console.log('speechSynthesis.paused:', speechSynthesis.paused);
        
        const questionWord = document.getElementById('question-word');
        if (!questionWord || !questionWord.textContent) {
            console.log('No question word found'); // Debug log
            return;
        }
        
        const word = questionWord.textContent.trim();
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
            return;
        }

        // Only cancel if there's actually something speaking or pending
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            console.log('Canceling existing speech...');
            speechSynthesis.cancel();
            // Wait for cancel to complete before proceeding
            setTimeout(() => {
                loadVoicesAndSpeak();
            }, 100);
        } else {
            // No existing speech, proceed immediately
            loadVoicesAndSpeak();
        }

        function loadVoicesAndSpeak() {
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

            const utterance = new SpeechSynthesisUtterance(text);
            
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

            // Apply speech rate from user settings
            utterance.rate = state.speechRate || 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            console.log('Utterance properties:');
            console.log('- text:', utterance.text);
            console.log('- voice:', utterance.voice ? utterance.voice.name : 'default');
            console.log('- lang:', utterance.lang);
            console.log('- rate:', utterance.rate);
            console.log('- pitch:', utterance.pitch);
            console.log('- volume:', utterance.volume);

            // Event handlers for debugging
            utterance.onstart = function(event) {
                console.log('Speech started successfully!');
            };

            utterance.onend = function(event) {
                console.log('Speech ended');
            };

            utterance.onerror = function(event) {
                console.error('Speech synthesis error:', event.error);
                
                // Handle specific error types
                if (event.error === 'canceled' || event.error === 'interrupted') {
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
                console.log('Speech paused');
            };

            utterance.onresume = function(event) {
                console.log('Speech resumed');
            };

            utterance.onmark = function(event) {
                console.log('Speech mark event:', event);
            };

            utterance.onboundary = function(event) {
                console.log('Speech boundary event:', event);
            };

            // Check system audio settings
            console.log('System audio check:');
            console.log('- speechSynthesis.speaking before speak:', speechSynthesis.speaking);
            console.log('- speechSynthesis.pending before speak:', speechSynthesis.pending);

            // Speak the text
            console.log('Calling speechSynthesis.speak()...');
            try {
                speechSynthesis.speak(utterance);
                console.log('speechSynthesis.speak() called successfully');
                
                // Check status after calling speak
                setTimeout(() => {
                    console.log('Status after 100ms:');
                    console.log('- speechSynthesis.speaking:', speechSynthesis.speaking);
                    console.log('- speechSynthesis.pending:', speechSynthesis.pending);
                    console.log('- speechSynthesis.paused:', speechSynthesis.paused);
                }, 100);
                
            } catch (error) {
                console.error('Error calling speechSynthesis.speak():', error);
            }
            
            console.log('=== TTS Debug End ===');
        }

        // Some browsers need time to load voices
        if (speechSynthesis.getVoices().length === 0) {
            console.log('No voices available yet, waiting for voiceschanged event...');
            speechSynthesis.addEventListener('voiceschanged', function() {
                console.log('voiceschanged event fired');
                loadVoicesAndSpeak();
            }, { once: true });
            
            // Fallback: try again after a short delay
            setTimeout(() => {
                if (speechSynthesis.getVoices().length === 0) {
                    console.log('Still no voices after timeout, trying anyway...');
                    loadVoicesAndSpeak();
                }
            }, 1000);
        } else {
            console.log('Voices already available, proceeding...');
            loadVoicesAndSpeak();
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

    async function init() {
        console.log('=== Application Initialization ===');
        console.log('Starting app initialization...');
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
