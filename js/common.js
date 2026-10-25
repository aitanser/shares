// ==================== 转义 ====================
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTypeChineseName(type) {
    return ({ web: '网页', software: '软件', file: '文件', article: '文章' })[type] || type;
}

// ==================== 防复制（仅绑定一次） ====================
function initCopyProtection(options = {}) {
    if (window.__copyProtectionInited) return;
    window.__copyProtectionInited = true;

    const cfg = {
        disableContextMenu: true,
        disableSelection: true,
        disableDevTools: true,
        disableCopy: true,
        ...options
    };

    if (cfg.disableContextMenu) {
        document.addEventListener('contextmenu', e => e.preventDefault());
    }
    if (cfg.disableSelection) {
        document.addEventListener('selectstart', e => e.preventDefault());
    }
    if (cfg.disableCopy) {
        document.addEventListener('copy', e => e.preventDefault());
    }
    if (cfg.disableDevTools) {
        document.addEventListener('keydown', e => {
            const key = (e.key || '').toUpperCase();
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(key)) ||
                (e.ctrlKey && key === 'U')
            ) {
                e.preventDefault();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => initCopyProtection());

// ==================== data-index.json ====================
async function loadDataIndex(cacheBuster = '') {
    const resp = await fetch('data-index.json' + cacheBuster);
    if (!resp.ok) throw new Error(`data-index.json 加载失败 [${resp.status}]`);
    return resp.json();
}

// ==================== YAML 解析（优先 js-yaml） ====================
let jsyamlPromise = null;

function ensureJsYaml() {
    if (typeof jsyaml !== 'undefined') return Promise.resolve(jsyaml);
    if (!jsyamlPromise) {
        jsyamlPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js';
            s.onload = () => resolve(window.jsyaml);
            s.onerror = () => reject(new Error('js-yaml CDN 加载失败'));
            document.head.appendChild(s);
        });
    }
    return jsyamlPromise;
}

function parseYamlFallback(yaml) {
    // 简易回退：仅处理扁平 key: value 和简单数组，不保证嵌套对象
    const result = {};
    let currentKey = null;
    for (const rawLine of yaml.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf(':');
        if (idx > 0 && !line.startsWith('-')) {
            const key = line.slice(0, idx).trim();
            let value = line.slice(idx + 1).trim();
            if (value === '') {
                result[key] = [];
                currentKey = key;
            } else if (value.startsWith('[') && value.endsWith(']')) {
                try { result[key] = JSON.parse(value); }
                catch { result[key] = value.slice(1, -1).split(',').map(v => v.trim()); }
                currentKey = null;
            } else {
                result[key] = value.replace(/^['"]|['"]$/g, '');
                currentKey = null;
            }
        } else if (currentKey && line.startsWith('-')) {
            result[currentKey].push(line.slice(1).trim().replace(/^['"]|['"]$/g, ''));
        }
    }
    return result;
}

async function parseFrontMatter(text, filePath) {
    const lines = text.split('\n');
    if (lines[0]?.trim() !== '---') return { meta: {}, content: text };

    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') { endIndex = i; break; }
    }
    if (endIndex <= 0) return { meta: {}, content: text };

    const fm = lines.slice(1, endIndex).join('\n');
    const content = lines.slice(endIndex + 1).join('\n').trim();

    try {
        const yaml = await ensureJsYaml();
        return { meta: yaml.load(fm) || {}, content };
    } catch (e) {
        console.warn(`js-yaml 不可用，回退简易解析: ${filePath}`, e);
        return { meta: parseYamlFallback(fm), content };
    }
}

// ==================== 加载单张卡片 ====================
async function loadMarkdownFile(filePath, cacheBuster = '') {
    try {
        const resp = await fetch(filePath + cacheBuster);
        if (!resp.ok) {
            console.error(`❌ 卡片加载失败 [${resp.status}] ${filePath}`);
            return null;
        }
        const text = await resp.text();
        const parsed = await parseFrontMatter(text, filePath);
        if (parsed.meta._error) console.error(`❌ YAML 解析失败 ${filePath}`);
        return parsed;
    } catch (e) {
        console.error(`❌ 网络错误 ${filePath}:`, e);
        return null;
    }
}

// ==================== 加载全部卡片 ====================
async function loadAllResources(cacheBuster = '') {
    const index = await loadDataIndex(cacheBuster);
    const paths = index.cards || [];
    console.log(`📋 data-index.json 声明了 ${paths.length} 张卡片`);

    const results = await Promise.all(
        paths.map(async p => {
            const parsed = await loadMarkdownFile(p, cacheBuster);
            return parsed && parsed.meta && !parsed.meta._error ? parsed : null;
        })
    );
    const ok = results.filter(Boolean);
    console.log(`✅ 成功加载 ${ok.length}/${paths.length} 张卡片`);
    return ok;
}

// ==================== 缓存 ====================
const CACHE_KEY = 'starsea_resources_v2';
const CACHE_TIME_KEY = 'starsea_resources_time_v2';
const CACHE_TTL = 30 * 60 * 1000;

async function loadAllResourcesCached(cacheBuster = '') {
    const cached = sessionStorage.getItem(CACHE_KEY);
    const cachedTime = sessionStorage.getItem(CACHE_TIME_KEY);
    if (cached && cachedTime && Date.now() - Number(cachedTime) < CACHE_TTL) {
        return JSON.parse(cached);
    }
    const resources = await loadAllResources(cacheBuster);
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(resources));
        sessionStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    } catch {}
    return resources;
}

// ==================== 主题 / 深色模式 ====================
function initThemeAndDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
    const theme = localStorage.getItem('theme') || 'cyan';
    document.body.classList.add(`theme-${theme}`);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.innerHTML = document.body.classList.contains('dark-mode')
            ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        toggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const dark = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', String(dark));
            toggle.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        });
    }

    const paletteBtn = document.getElementById('themePaletteBtn');
    const dropdown = document.getElementById('themeDropdown');
    if (paletteBtn && dropdown) {
        paletteBtn.addEventListener('click', e => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        document.addEventListener('click', e => {
            if (!dropdown.contains(e.target) && !paletteBtn.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
        dropdown.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const t = opt.dataset.theme;
                if (!t) return;
                document.body.classList.remove(
                    'theme-cyan', 'theme-violet', 'theme-mint', 'theme-sunset', 'theme-sakura'
                );
                document.body.classList.add(`theme-${t}`);
                localStorage.setItem('theme', t);
                dropdown.querySelectorAll('.theme-option')
                    .forEach(o => o.classList.toggle('active', o.dataset.theme === t));
                dropdown.classList.remove('show');
            });
        });
    }
}

// ==================== Header / Footer ====================
async function loadHeader() {
    try {
        const resp = await fetch('header.html');
        if (!resp.ok) throw new Error(`header.html [${resp.status}]`);
        document.body.insertAdjacentHTML('afterbegin', await resp.text());
        highlightCurrentNav();
        initMobileMenu();
        initThemeAndDarkMode();
    } catch (e) {
        console.warn('头部加载失败', e);
    }
}

async function loadFooter() {
    try {
        const resp = await fetch('footer.html');
        if (!resp.ok) throw new Error(`footer.html [${resp.status}]`);
        document.body.insertAdjacentHTML('beforeend', await resp.text());
    } catch (e) {
        console.warn('底部加载失败', e);
    }
}

function highlightCurrentNav() {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.main-nav a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === current);
    });
}

function initMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const nav = document.getElementById('mainNav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
        nav.classList.toggle('show');
        toggle.querySelector('i').className =
            nav.classList.contains('show') ? 'fas fa-times' : 'fas fa-bars';
    });
}

// ==================== 面包屑 ====================
function renderBreadcrumb(pageType, detailMeta = null) {
    const el = document.getElementById('breadcrumb');
    if (!el) return;

    const map = {
        index: '首页', web: '网页资源', software: '软件资源', file: '文件资源',
        article: '文章资源', search: '搜索', tags: '标签浏览', hot: '热门排行榜',
        catalog: '全站目录', about: '关于', help: '帮助中心', changelog: '更新日志',
        links: '友情链接', privacy: '隐私政策', terms: '用户协议', status: '站点状态'
    };

    let html = '<a href="index.html">首页</a> <i class="fas fa-chevron-right"></i> ';
    if (pageType === 'detail' && detailMeta) {
        html += `<a href="${detailMeta.type}.html">${getTypeChineseName(detailMeta.type)}</a> `;
        html += `<i class="fas fa-chevron-right"></i> <span>${escapeHtml(detailMeta.title || '详情')}</span>`;
    } else {
        html += `<span>${map[pageType] || escapeHtml(pageType)}</span>`;
    }
    el.innerHTML = html;
}