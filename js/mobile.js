let currentWpm = 300;
let lastTapTime = 0;
let tapCount = 0;
let tapTimeout = null;
let currentMode = 'text';
let currentBookId = null;
let currentBookTitle = "Unknown Title";
let currentBookAuthor = "";
let isContextOpen = false;
let isResetting = false;

const inputText = document.getElementById('inputText');
const wordOutput = document.getElementById('wordOutput');
const btnToggle = document.getElementById('btnToggle');
const btnReset = document.getElementById('btnReset');
const btnFullscreen = document.getElementById('btnFullscreen');
const btnContext = document.getElementById('btnContext');
const readerDisplay = document.getElementById('reader-display');
const toast = document.getElementById('toast');
const contextOverlay = document.getElementById('context-overlay');
const contextPeek = document.getElementById('context-peek');
const progressIndicator = document.getElementById('progress-indicator');
const wpmDisplay = document.getElementById('wpmDisplay');
const fsWpmDisplay = document.getElementById('fsWpmDisplay');
const btnFsExit = document.getElementById('btnFsExit');
const btnFsContext = document.getElementById('btnFsContext');
const feedbackLeft = document.getElementById('feedbackLeft');
const feedbackRight = document.getElementById('feedbackRight');

// EPUB / reader controls
const epubInput = document.getElementById('epubInput');
const chapterSelect = document.getElementById('chapterSelect');
const epubControls = document.getElementById('epub-controls');
const btnPrevChapter = document.getElementById('btnPrevChapter');
const btnNextChapter = document.getElementById('btnNextChapter');
const btnSyncPhrase = document.getElementById('btnSyncPhrase');
const bookMetadata = document.getElementById('book-metadata');

// Settings
const btnSettings = document.getElementById('btnSettings');
const settingsOverlay = document.getElementById('settings-overlay');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const fontSelect = document.getElementById('fontSelect');
const weightSelect = document.getElementById('weightSelect');
const themeSelect = document.getElementById('themeSelect');
const btnFactoryReset = document.getElementById('btnFactoryReset');

// Views + bottom nav
const viewLibrary = document.getElementById('view-library');
const viewReader = document.getElementById('view-reader');
const navLibrary = document.getElementById('nav-library');
const navReader = document.getElementById('nav-reader');
const btnSettingsTop = document.getElementById('btnSettingsTop');

// Library UI
const btnAddLocal = document.getElementById('btnAddLocal');
const libraryHeroSection = document.getElementById('library-hero-section');
const libraryHero = document.getElementById('library-hero');
const libraryGrid = document.getElementById('library-grid');
const btnGridView = document.getElementById('btnGridView');
const btnListView = document.getElementById('btnListView');

// Add modal
const addModal = document.getElementById('add-modal');
const btnCloseAdd = document.getElementById('btnCloseAdd');
const btnAddUpload = document.getElementById('btnAddUpload');
const btnAddPasteToggle = document.getElementById('btnAddPasteToggle');
const pastePanel = document.getElementById('paste-panel');
const pasteTitle = document.getElementById('pasteTitle');
const btnConfirmPaste = document.getElementById('btnConfirmPaste');

const fontConfig = {
    'classic': { family: "'Courier New', Courier, monospace", weights: [400, 700] },
    'opendyslexic': { family: '"OpenDyslexic", "Comic Sans MS", sans-serif', weights: [400, 700] },
    'system': { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', weights: [300, 400, 500, 700] },
    'mono': { family: '"Roboto Mono", monospace', weights: [300, 400, 500, 700] },
    'serif': { family: '"Merriweather", serif', weights: [300, 400, 700, 900] }
};

const weightLabels = { 300: "Light", 400: "Normal", 500: "Medium", 700: "Bold", 900: "Black" };

ReaderEngine.init({
    getWpm: () => currentWpm,
    renderWord: (wordObj) => renderWord(wordObj, wordOutput),
    renderProgress: (text) => { if (progressIndicator) progressIndicator.textContent = text; },
    onStateChange: (playing) => {
        btnToggle.textContent = playing ? "Pause" : "Start";
        saveCurrentState();          // persist on BOTH play and pause
        if (playing) {
            renderPeek(false);       // hide the peek while reading
            startAutosave();         // keep saving mid-read (iOS may kill us anytime)
        } else {
            stopAutosave();
            refreshPeek();           // show surrounding words when paused
        }
    },
    onFinish: () => saveCurrentState()
});

function updateWeightDropdown(fontKey, preferredWeight) {
    if (!weightSelect) return;
    const config = fontConfig[fontKey] || fontConfig['classic'];
    const validWeights = config.weights;
    weightSelect.innerHTML = '';
    validWeights.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = `${weightLabels[w] || w} (${w})`;
        weightSelect.appendChild(opt);
    });
    if (validWeights.includes(parseInt(preferredWeight))) {
        weightSelect.value = preferredWeight;
    } else if (validWeights.includes(400)) {
        weightSelect.value = 400;
    } else {
        weightSelect.value = validWeights[0];
    }
    weightSelect.disabled = validWeights.length < 2;
}

function applySettings(settings) {
    const fontKey = settings.font || 'classic';
    const savedWeight = settings.fontWeight || '400';
    const theme = settings.theme || 'light';

    const metaThemeColor = document.querySelector("meta[name=theme-color]");
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        if(metaThemeColor) metaThemeColor.setAttribute("content", "#121212");
    } else {
        document.body.classList.remove('dark-mode');
        if(metaThemeColor) metaThemeColor.setAttribute("content", "#264653");
    }
    if (themeSelect) themeSelect.value = theme;

    updateWeightDropdown(fontKey, savedWeight);
    const finalWeight = weightSelect ? weightSelect.value : savedWeight;
    const fontFamily = fontConfig[fontKey].family;
    
    document.documentElement.style.setProperty('--font-family', fontFamily);
    document.documentElement.style.setProperty('--font-weight', finalWeight);
    if (fontSelect) fontSelect.value = fontKey;
}

window.addEventListener('DOMContentLoaded', async () => { 
    renderWord("Ready", wordOutput); 
    EpubBridge.init();
    
    const settings = StorageService.getSettings();
    if(settings.wpm) currentWpm = parseInt(settings.wpm);
    if (settings.progressMode !== undefined) ReaderEngine.progressMode = settings.progressMode;
    
    updateDisplays();
    applySettings(settings);
    ReaderEngine.updateProgress();

    await renderLibrary();   // Library is the default landing view
});

/* ---------------- View navigation ---------------- */
async function showView(name) {
    const isLib = (name === 'library');
    viewLibrary.classList.toggle('active', isLib);
    viewReader.classList.toggle('active', !isLib);
    navLibrary.classList.toggle('active', isLib);
    navReader.classList.toggle('active', !isLib);
    if (isLib) {
        ReaderEngine.pause();        // pause if reading (harmless if already paused)
        await persistProgress();     // save latest position BEFORE rendering the library
        renderLibrary();
        window.scrollTo(0, 0);
    }
}
navLibrary.addEventListener('click', () => showView('library'));
navReader.addEventListener('click', () => showView('reader'));

/* ---------------- Library rendering ---------------- */
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function coverIcon(book) { return book.type === 'text' ? 'article' : 'book_2'; }
function statusLabel(book) { return (!book.wordIndex || book.wordIndex === 0) ? 'New' : 'Reading'; }
function lastReadText(book) {
    try { return 'Last read ' + new Date(book.lastRead).toLocaleDateString(); } catch (e) { return ''; }
}
// Global word position within the whole book: text docs use wordIndex directly;
// epubs add the cumulative words before the current chapter (from cached offsets).
function globalWordPos(book) {
    const idx = book.wordIndex || 0;
    if (book.type === 'text') return idx;
    const offsets = book.chapterOffsets;
    if (offsets && book.chapterHref != null && offsets[book.chapterHref] != null) {
        return offsets[book.chapterHref] + idx;
    }
    return idx; // metrics not computed yet
}
function computeProgress(book) {
    const total = book.totalWords;
    if (!total || total <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((globalWordPos(book) / total) * 100)));
}
// Minutes to finish the whole book at the given WPM (~1.3x fudge for punctuation
// pauses, matching the engine's own time estimate). Returns a formatted string.
function estimateTimeLeft(book, wpm) {
    const total = book.totalWords;
    if (!total || total <= 0 || !wpm) return null;
    const remaining = Math.max(0, total - globalWordPos(book));
    if (remaining === 0) return 'Finished';
    const minutes = (remaining * 1.3) / wpm;
    if (minutes < 1) return '< 1 min left';
    if (minutes < 60) return `${Math.round(minutes)} min left`;
    const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return `${h}h ${m}m left`;
}

function buildHeroHTML(book) {
    const pct = computeProgress(book);
    const time = estimateTimeLeft(book, currentWpm);
    const status = statusLabel(book);
    const done = pct === 100;
    const metaRight = (pct != null && time && !done)
        ? `${time} at ${currentWpm} WPM`
        : (done ? 'Finished' : lastReadText(book));
    return `
        <div class="lib-hero-card">
            <div class="lib-hero-cover"><span class="material-symbols-outlined">${coverIcon(book)}</span></div>
            <div class="lib-hero-body">
                <span class="lib-chip">${status === 'New' ? 'Not started' : 'Currently reading'}</span>
                <h3 class="lib-hero-title">${escapeHtml(book.title)}</h3>
                <p class="lib-hero-meta">${escapeHtml(book.author || (book.type === 'text' ? 'Text' : ''))}</p>
                <div class="lib-progress-row">
                    <span class="lib-progress-pct">${pct != null ? pct + '%' : status}</span>
                    <span class="lib-progress-meta">${escapeHtml(metaRight)}</span>
                </div>
                <div class="lib-progress-track"><div class="lib-progress-fill${done ? ' done' : ''}" style="width:${pct != null ? pct : 0}%"></div></div>
            </div>
            <button class="lib-hero-play" aria-label="Continue"><span class="material-symbols-outlined">play_arrow</span></button>
        </div>`;
}
function buildCardHTML(book) {
    const pct = computeProgress(book);
    const time = estimateTimeLeft(book, currentWpm);
    const status = statusLabel(book);
    const done = pct === 100;
    const sub = book.type === 'text' ? 'Text' : (book.author || 'eBook');
    const foot = (pct != null) ? (pct + '%' + (time && !done ? ' · ' + time : '')) : status;
    return `
        <div class="lib-card" data-id="${escapeHtml(book.id)}">
            <div class="lib-card-cover">
                <div class="cover-tint"></div>
                <span class="material-symbols-outlined cover-icon">${coverIcon(book)}</span>
                <button class="lib-card-menu" aria-label="Delete document"><span class="material-symbols-outlined">more_vert</span></button>
            </div>
            <div class="lib-card-body">
                <h4 class="lib-card-title">${escapeHtml(book.title)}</h4>
                <p class="lib-card-sub">${escapeHtml(sub)}</p>
                <div class="lib-card-foot">
                    <div class="lib-progress-track"><div class="lib-progress-fill${done ? ' done' : ''}" style="width:${pct != null ? pct : 0}%"></div></div>
                    <p class="lib-progress-meta" style="margin:6px 0 0;">${escapeHtml(foot)}</p>
                </div>
            </div>
        </div>`;
}
function buildAddTileHTML() {
    return `
        <button class="lib-add-tile">
            <span class="add-badge"><span class="material-symbols-outlined">add</span></span>
            <strong>Add Document</strong>
            <small>EPUB or Text</small>
        </button>`;
}

async function renderLibrary() {
    const books = await StorageService.getLibrary();

    if (books.length > 0) {
        libraryHeroSection.style.display = 'block';
        libraryHero.innerHTML = buildHeroHTML(books[0]);
        libraryHero.querySelector('.lib-hero-card').addEventListener('click', () => openDocument(books[0]));
    } else {
        libraryHeroSection.style.display = 'none';
        libraryHero.innerHTML = '';
    }

    const rest = books.slice(1);
    libraryGrid.innerHTML = rest.map(buildCardHTML).join('') + buildAddTileHTML();

    libraryGrid.querySelectorAll('.lib-card').forEach(el => {
        const book = books.find(b => b.id === el.dataset.id);
        if (!book) return;
        el.addEventListener('click', (e) => {
            if (e.target.closest('.lib-card-menu')) return;
            openDocument(book);
        });
        const menu = el.querySelector('.lib-card-menu');
        if (menu) menu.addEventListener('click', (e) => { e.stopPropagation(); deleteBookFromLibrary(book.id); });
    });
    const addTile = libraryGrid.querySelector('.lib-add-tile');
    if (addTile) addTile.addEventListener('click', openAddModal);
}

/* ---------------- Opening documents ---------------- */
function openDocument(book) {
    closeAddModal();
    if (book.type === 'text') openTextDocument(book);
    else loadBookFromLibrary(book.id);
}

async function loadBookFromLibrary(bookId) {
    const fileBlob = await StorageService.loadBookFile(bookId);
    if (fileBlob) {
        currentBookId = bookId;
        currentMode = 'epub';
        showToast("Loading book...", toast);
        EpubBridge.loadBook(fileBlob);   // epubChaptersLoaded → switches to Reader view
    } else {
        alert("Error loading book data.");
    }
}

async function openTextDocument(book) {
    const blob = await StorageService.loadBookFile(book.id);
    if (!blob) { alert("Error loading document."); return; }
    const text = await blob.text();
    currentBookId = book.id;
    currentMode = 'text';
    currentBookTitle = book.title;
    bookMetadata.textContent = book.title;
    bookMetadata.style.display = 'block';
    epubControls.style.display = 'none';
    const words = parseContent(text);
    const startIndex = (book.wordIndex > 0) ? Math.min(words.length - 1, book.wordIndex) : 0;
    ReaderEngine.loadContent(words, startIndex);
    renderWord(words.length > 0 ? words[startIndex] : "Empty", wordOutput);
    showView('reader');
    refreshPeek();
}

async function deleteBookFromLibrary(bookId) {
    if (confirm("Delete this document?")) {
        await StorageService.deleteBook(bookId);
        if (currentBookId === bookId) {
            currentBookId = null;
            ReaderEngine.reset();
            ReaderEngine.loadContent([]);
            renderWord("Ready", wordOutput);
            bookMetadata.style.display = 'none';
            epubControls.style.display = 'none';
        }
        await renderLibrary();
    }
}

/* ---------------- Add modal ---------------- */
function openAddModal() { if (pastePanel) pastePanel.style.display = 'none'; addModal.classList.add('active'); }
function closeAddModal() { addModal.classList.remove('active'); }

btnAddLocal.addEventListener('click', openAddModal);
btnCloseAdd.addEventListener('click', closeAddModal);
addModal.addEventListener('click', (e) => { if (e.target === addModal) closeAddModal(); });
btnAddUpload.addEventListener('click', () => epubInput.click());
btnAddPasteToggle.addEventListener('click', () => {
    const showing = pastePanel.style.display === 'flex';
    pastePanel.style.display = showing ? 'none' : 'flex';
    if (!showing) inputText.focus();
});
btnConfirmPaste.addEventListener('click', handlePasteConfirm);

async function handlePasteConfirm() {
    const text = inputText.value.trim();
    if (!text) { alert('Please paste some text first.'); return; }
    const title = pasteTitle.value.trim() || ('Text — ' + new Date().toLocaleDateString());
    const book = await StorageService.addTextDocument(text, title, parseContent(text).length);
    inputText.value = '';
    pasteTitle.value = '';
    closeAddModal();
    if (book) {
        await openTextDocument(book);
    } else {
        // Storage unavailable — read without saving.
        currentMode = 'text';
        const words = parseContent(text);
        ReaderEngine.loadContent(words);
        renderWord(words.length ? words[0] : "Empty", wordOutput);
        showView('reader');
        refreshPeek();
    }
}

/* ---------------- Grid / list toggle ---------------- */
btnGridView.addEventListener('click', () => {
    libraryGrid.classList.remove('list-view');
    btnGridView.classList.add('active');
    btnListView.classList.remove('active');
});
btnListView.addEventListener('click', () => {
    libraryGrid.classList.add('list-view');
    btnListView.classList.add('active');
    btnGridView.classList.remove('active');
});

function openSettings() {
    settingsOverlay.classList.add('active');
    if (ReaderEngine.isPlaying) ReaderEngine.pause();
}
if (btnSettings) btnSettings.addEventListener('click', openSettings);
if (btnSettingsTop) btnSettingsTop.addEventListener('click', openSettings);
function closeSettings() { settingsOverlay.classList.remove('active'); }
if(btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
if(btnSaveSettings) btnSaveSettings.addEventListener('click', closeSettings);

if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
        const newTheme = e.target.value;
        const currentFont = fontSelect ? fontSelect.value : 'classic';
        const currentWeight = weightSelect ? weightSelect.value : '400';
        StorageService.saveSettings(currentWpm, currentMode, currentFont, currentWeight, newTheme, ReaderEngine.progressMode);
        applySettings({ wpm: currentWpm, mode: currentMode, font: currentFont, fontWeight: currentWeight, theme: newTheme });
    });
}

if (fontSelect) {
    fontSelect.addEventListener('change', (e) => {
        const newFont = e.target.value;
        const currentWeight = weightSelect ? weightSelect.value : '400';
        const currentTheme = themeSelect ? themeSelect.value : 'light';
        updateWeightDropdown(newFont, currentWeight);
        const newValidWeight = weightSelect.value;
        StorageService.saveSettings(currentWpm, currentMode, newFont, newValidWeight, currentTheme, ReaderEngine.progressMode);
        document.documentElement.style.setProperty('--font-family', fontConfig[newFont].family);
        document.documentElement.style.setProperty('--font-weight', newValidWeight);
    });
}

if (weightSelect) {
    weightSelect.addEventListener('change', (e) => {
        const newWeight = e.target.value;
        const currentFont = fontSelect ? fontSelect.value : 'classic';
        const currentTheme = themeSelect ? themeSelect.value : 'light';
        StorageService.saveSettings(currentWpm, currentMode, currentFont, newWeight, currentTheme, ReaderEngine.progressMode);
        document.documentElement.style.setProperty('--font-weight', newWeight);
    });
}

if(btnFactoryReset) {
    btnFactoryReset.addEventListener('click', () => {
        if(confirm("Reset all settings?")) {
            isResetting = true;
            StorageService.clearSettings();
            location.reload();
        }
    });
}
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });

epubInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        closeAddModal();
        currentMode = 'epub';
        showToast("Processing...", toast);
        const reader = new FileReader();
        reader.onload = (e) => EpubBridge.loadBook(e.target.result);
        reader.readAsArrayBuffer(file);
        window.tempUploadFile = file;
    }
});

EpubBridge.onMetadataReady = async (title, author) => {
    currentBookTitle = title || "Unknown Title";
    currentBookAuthor = author || "";
    bookMetadata.textContent = `${currentBookTitle}`;
    bookMetadata.style.display = 'block';
    if (window.tempUploadFile) {
        const newBook = await StorageService.addBook(window.tempUploadFile, currentBookTitle, currentBookAuthor);
        currentBookId = newBook.id;
        window.tempUploadFile = null;
        showToast("Saved to Library", toast);
        renderLibrary();
    }
};

document.addEventListener('epubChaptersLoaded', (e) => {
    const chapters = e.detail;
    chapterSelect.innerHTML = "";
    chapters.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.href;
        opt.textContent = ch.label;
        chapterSelect.appendChild(opt);
    });
    StorageService.getLibrary().then(lib => {
        const book = lib.find(b => b.id === currentBookId);
        if (book && book.chapterHref) {
            chapterSelect.value = book.chapterHref;
            EpubBridge.loadChapter(book.chapterHref);
            window.tempWordIndex = book.wordIndex;
        } else {
            if(chapters.length > 0) EpubBridge.loadChapter(chapters[0].href);
        }
        // Compute whole-book length once (background) so the library can show
        // accurate progress % and time-left.
        if (book && !book.totalWords) ensureBookMetrics(currentBookId);
    });
    epubControls.style.display = 'flex';
    showView('reader');
});

// One-time, background whole-book word count. Delayed so the current chapter
// renders first; result cached on the library entry.
let metricsInFlight = null;
function ensureBookMetrics(bookId) {
    if (metricsInFlight === bookId) return;
    metricsInFlight = bookId;
    setTimeout(async () => {
        try {
            const m = await EpubBridge.computeBookMetrics();
            if (m && m.totalWords > 0) await StorageService.saveBookMetrics(bookId, m.totalWords, m.chapterOffsets);
        } catch (e) { console.warn('Book metrics failed:', e); }
        finally { if (metricsInFlight === bookId) metricsInFlight = null; }
    }, 1500);
}

chapterSelect.addEventListener('change', (e) => {
    ReaderEngine.pause();
    EpubBridge.loadChapter(e.target.value);
});

EpubBridge.onChapterReady = (htmlContent) => {
    const words = parseHTMLToRSVP(htmlContent);
    let targetIndex = 0;
    if (window.tempWordIndex !== undefined) {
        targetIndex = window.tempWordIndex;
        window.tempWordIndex = undefined;
    }
    const startIndex = (targetIndex > 0) ? Math.min(words.length - 1, targetIndex) : 0;
    ReaderEngine.loadContent(words, startIndex);
    
    if (startIndex > 0) showToast(`Resumed at word ${startIndex}`, toast);
    else showToast("Chapter Loaded", toast);
    
    if (words.length > 0) renderWord(words[startIndex], wordOutput);
    else renderWord("Empty", wordOutput);

    refreshPeek(); // show context around the resumed position (reader is paused)
};

// Persist the current reading position for the open document (epub OR text).
// Returns a promise so callers (e.g. leaving the reader) can await the write.
function persistProgress() {
    if (!currentBookId) return Promise.resolve();
    if (currentMode === 'epub' && EpubBridge.book) {
        return StorageService.saveProgress(currentBookId, chapterSelect.value, ReaderEngine.currentIndex);
    }
    if (currentMode === 'text') {
        return StorageService.saveProgress(currentBookId, null, ReaderEngine.currentIndex);
    }
    return Promise.resolve();
}

function saveCurrentState() {
    persistProgress();
    const currentFont = fontSelect ? fontSelect.value : 'classic';
    const currentWeight = weightSelect ? weightSelect.value : '400';
    const currentTheme = themeSelect ? themeSelect.value : 'light';
    StorageService.saveSettings(currentWpm, currentMode, currentFont, currentWeight, currentTheme, ReaderEngine.progressMode);
}

// Autosave while reading so a background/kill (common on iOS) never loses much.
let autosaveTimer = null;
function startAutosave() {
    stopAutosave();
    autosaveTimer = setInterval(saveCurrentState, 2000);
}
function stopAutosave() {
    if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
}

// iOS Safari fires visibilitychange/pagehide reliably (beforeunload often not),
// so persist the moment the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => { if (document.hidden) saveCurrentState(); });
window.addEventListener('pagehide', () => { if (!isResetting) saveCurrentState(); });
window.addEventListener('beforeunload', () => { if (!isResetting) saveCurrentState(); });

// Peek: show a few words before/after the current one while paused.
const PEEK_RADIUS = 4;
function renderPeek(show) {
    if (!contextPeek) return;
    const words = ReaderEngine.words;
    if (!show || !words || words.length === 0) {
        contextPeek.classList.remove('visible');
        contextPeek.innerHTML = '';
        return;
    }
    // Match the context-overlay convention: the displayed word is currentIndex-1
    // once reading has advanced past the start.
    let cur = ReaderEngine.currentIndex > 0 ? ReaderEngine.currentIndex - 1 : 0;
    cur = Math.max(0, Math.min(words.length - 1, cur));

    const frag = document.createDocumentFragment();
    for (let i = cur - PEEK_RADIUS; i <= cur + PEEK_RADIUS; i++) {
        if (i < 0 || i >= words.length) continue;
        const w = words[i];
        const span = document.createElement('span');
        if (w.type === 'break') {
            span.className = 'peek-break';
            span.textContent = '¶';
        } else {
            span.className = (i === cur) ? 'peek-word peek-current' : 'peek-word';
            span.textContent = w.text;
        }
        frag.appendChild(span);
    }
    contextPeek.innerHTML = '';
    contextPeek.appendChild(frag);
    contextPeek.classList.add('visible');
}
function refreshPeek() {
    renderPeek(!ReaderEngine.isPlaying && ReaderEngine.words.length > 0);
}

btnPrevChapter.addEventListener('click', () => {
    const prev = EpubBridge.getPreviousChapter();
    if (prev) { chapterSelect.value = prev; EpubBridge.loadChapter(prev); }
});
btnNextChapter.addEventListener('click', () => {
    const next = EpubBridge.getNextChapter();
    if (next) { chapterSelect.value = next; EpubBridge.loadChapter(next); }
});
btnSyncPhrase.addEventListener('click', () => {
    const phrase = prompt("Find phrase (3+ words):");
    if (phrase) {
        const idx = EpubBridge.findPhraseIndex(ReaderEngine.words, phrase);
        if (idx !== -1) {
            ReaderEngine.currentIndex = idx;
            renderWord(ReaderEngine.words[idx], wordOutput);
            ReaderEngine.updateProgress();
            showToast("Synced!", toast);
        } else { alert("Not found."); }
    }
});

function initData() {
    if (currentMode === 'epub') {
        if (ReaderEngine.words.length > 0) return true;
        alert("Load an EPUB first.");
        return false;
    }
    const rawText = inputText.value.trim();
    if (!rawText) { alert("Please enter some text."); return false; }
    const words = parseContent(rawText);
    ReaderEngine.loadContent(words);
    return true;
}

window.changeSpeedGlobal = function(delta) {
    currentWpm += delta;
    if (currentWpm < 60) currentWpm = 60;
    if (currentWpm > 1200) currentWpm = 1200;
    updateDisplays();
    showToast(`${currentWpm} WPM`, toast);
}

function updateDisplays() {
    wpmDisplay.textContent = currentWpm;
    fsWpmDisplay.textContent = currentWpm;
}

function flashFeedback(side) {
    const el = side === 'left' ? feedbackLeft : feedbackRight;
    el.classList.add('active'); setTimeout(() => el.classList.remove('active'), 300);
}

// iOS Safari only grants real fullscreen to <video>, so requestFullscreen is
// unavailable/rejected on iPhone. Fall back to a CSS-class pseudo-fullscreen there.
const canNativeFS = !!readerDisplay.requestFullscreen;
let isPseudoFullscreen = false;

// Shared "entered/exited fullscreen" UI updates. The fullscreenchange event only
// fires on the native path, so the pseudo path calls this directly.
function applyFullscreenUI(active) {
    document.body.classList.toggle('fullscreen-active', active);
    if (active) {
        if (screen.orientation && screen.orientation.lock) {
            try { screen.orientation.lock('landscape'); } catch (e) { console.warn(e); }
        }
    } else {
        if (screen.orientation && screen.orientation.unlock) {
            try { screen.orientation.unlock(); } catch (e) { /* no-op on iOS */ }
        }
    }
    updateDisplays();
}

function toggleFullscreen() {
    if (canNativeFS) {
        if (!document.fullscreenElement) {
            readerDisplay.requestFullscreen().catch(err => alert(err));
            applyFullscreenUI(true);
        } else {
            document.exitFullscreen();
            applyFullscreenUI(false);
        }
    } else {
        // Pseudo-fullscreen fallback (iOS): drive the immersive layout with a class.
        isPseudoFullscreen = !isPseudoFullscreen;
        readerDisplay.classList.toggle('pseudo-fullscreen', isPseudoFullscreen);
        applyFullscreenUI(isPseudoFullscreen);
        if (isPseudoFullscreen) window.scrollTo(0, 1); // nudge the URL bar away
    }
    saveCurrentState(); // persist position whenever entering/leaving fullscreen
}
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        applyFullscreenUI(false);
    }
});

readerDisplay.addEventListener('touchend', (e) => {
    if (e.target.closest('#mobile-fs-toolbar') || 
        e.target.tagName === 'BUTTON' || 
        e.target.closest('#context-overlay') || 
        e.target.closest('#progress-indicator')) return;

    const now = Date.now();
    const rect = readerDisplay.getBoundingClientRect();
    const x = e.changedTouches[0].clientX - rect.left;
    const y = e.changedTouches[0].clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    let zone = 'center';
    if (x < width * 0.25) zone = 'left';
    else if (x > width * 0.75) zone = 'right';

    if (zone === 'center') {
        const yRatio = y / height;
        if (yRatio < 0.20 || yRatio > 0.80) return; 
    }

    if (zone === 'center') {
        clearTimeout(tapTimeout);
        tapCount = 0;
        if (ReaderEngine.words.length === 0) { if (!initData()) return; }
        if (isContextOpen) { toggleContextView(); ReaderEngine.start(); }
        else ReaderEngine.toggle();
        e.preventDefault();
        return;
    }

    if (now - lastTapTime < 400) tapCount++;
    else tapCount = 1;
    lastTapTime = now;

    clearTimeout(tapTimeout);

    if (tapCount === 1) {
        tapTimeout = setTimeout(() => { tapCount = 0; }, 400);
    } else if (tapCount === 2) {
        if (zone === 'left') {
            const jump = ReaderEngine.skipWords('left');
            showToast(`⏪ -${jump}`, toast);
            flashFeedback('left');
        } else if (zone === 'right') {
            const jump = ReaderEngine.skipWords('right');
            showToast(`⏩ +${jump}`, toast);
            flashFeedback('right');
        }
        refreshPeek(); // update surrounding-words preview after a skip
    } else if (tapCount === 3) {
        if (zone === 'left') {
            ReaderEngine.skipParagraph('prev');
            showToast("⏮ Paragraph Start", toast);
            flashFeedback('left');
        }
        refreshPeek();
        tapCount = 0;
    }
    e.preventDefault();
});

btnToggle.addEventListener('click', () => {
    if (ReaderEngine.words.length === 0) { if (!initData()) return; }
    if (isContextOpen) { toggleContextView(); ReaderEngine.start(); }
    else ReaderEngine.toggle();
});

btnReset.addEventListener('click', () => {
    ReaderEngine.reset();
    if (currentMode === 'text') {
        ReaderEngine.loadContent([]);
        renderWord("Ready", wordOutput);
    }
    refreshPeek();
});

btnContext.addEventListener('click', toggleContextView);
btnFullscreen.addEventListener('click', toggleFullscreen);
btnFsExit.addEventListener('click', toggleFullscreen);
btnFsContext.addEventListener('click', toggleContextView);

readerDisplay.addEventListener('click', (e) => { 
    if (e.target.closest('#context-overlay') || 
        e.target.closest('#progress-indicator') ||
        e.target.closest('#mobile-fs-toolbar') ||
        e.target.tagName === 'BUTTON') return; 
    ReaderEngine.toggle(); 
});

progressIndicator.addEventListener('click', (e) => {
    e.stopPropagation();
    ReaderEngine.cycleProgressMode();
    saveCurrentState();
});

function toggleContextView() {
    if (ReaderEngine.words.length === 0) { if (!initData()) return; }
    isContextOpen = !isContextOpen;
    if (isContextOpen) {
        ReaderEngine.pause();
        contextOverlay.innerHTML = '<button class="close-ctx-btn">Close X</button>';
        contextOverlay.querySelector('.close-ctx-btn').onclick = toggleContextView;
        ReaderEngine.words.forEach((wordObj, index) => {
            if (wordObj.type === 'break') {
                const br = document.createElement('div'); br.className = 'ctx-break'; contextOverlay.appendChild(br);
            } else {
                const span = document.createElement('span'); span.textContent = wordObj.text + " "; span.className = 'ctx-word';
                if (wordObj.bold) span.style.fontWeight = 'bold';
                if (wordObj.italic) span.style.fontStyle = 'italic';
                if (wordObj.header) { 
                    span.style.fontWeight = 'bold'; span.style.color = '#2a9d8f'; span.style.display = 'inline-block';
                    if (wordObj.headerLevel === 1) { span.style.fontSize = '1.6em'; span.style.color = '#e76f51'; span.style.marginTop = '10px'; }
                    else if (wordObj.headerLevel === 2) { span.style.fontSize = '1.3em'; span.style.marginTop = '8px'; }
                }
                if (index === ReaderEngine.currentIndex - 1 && ReaderEngine.currentIndex > 0) { 
                    span.classList.add('current'); 
                    setTimeout(() => span.scrollIntoView({block: "center", behavior: "smooth"}), 50); 
                }
                span.onclick = () => { 
                    ReaderEngine.currentIndex = index + 1;
                    renderWord(ReaderEngine.words[index], wordOutput); 
                    ReaderEngine.updateProgress();
                    showToast("Jump", toast); 
                    toggleContextView(); 
                };
                contextOverlay.appendChild(span);
            }
        });
        contextOverlay.classList.add('active');
        renderPeek(false); // full-text overlay is open; hide the inline peek
    } else {
        contextOverlay.classList.remove('active');
        refreshPeek();
    }
}
