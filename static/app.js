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
        answerForm: document.getElementById('answer-form'),
        answerInput: document.getElementById('answer-input'),
        answerSubmit: document.getElementById('answer-submit'),
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

    async function loadConfig(params) {
        const response = await fetch('config.json', { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`設定の取得に失敗しました (HTTP ${response.status})`);
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
        const response = await fetch(dictPath, { cache: 'no-cache' });
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

    async function init() {
        bindEvents();
        initFooterFavicon();
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
