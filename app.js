// ══════════════════════════════════════════════
//  OuterSchool — app.js  (v3)
// ══════════════════════════════════════════════

// ══════════════════════════════════════════════
//  APP STATE & DATA
// ══════════════════════════════════════════════
const APP = {
  currentView: 'home',
  currentCatId: null,
  currentProgramId: null,
  currentLinkType: 'youtube',
  currentProgTab: 'html',
  currentNtTab: 'notes',
  sidebarOpen: false,
};

const DEFAULT_DATA = {
  profile: {
    displayName: 'مستخدم',
    username: 'user',
    email: '',
    avatar: null,
    theme: 'github',
    font: 'Cairo',
    backgroundImage: null,
    bgBlur: 0,
    bgOpacity: 50,
  },
  categories: [],
  links: [],
  cloud: [],
  programs: [],
  notes: [],
  todos: [],
  customThemes: [],
  customFonts: [],
  settings: {
    particles: false,
    matrix: false,
    bubbles: false,
    downloaderUrl: '',
    fontScale: 100,
    layoutIdx: 3,
    catLayout: 'cards',
    linkLayout: 'list',
  }
};

let DB = JSON.parse(JSON.stringify(DEFAULT_DATA));

// ══════════════════════════════════════════════
//  INDEXEDDB STORAGE LAYER (replaces localStorage)
// ══════════════════════════════════════════════
const IDB_NAME = 'OuterSchoolDB';
const IDB_STORE = 'kv';
const IDB_KEY = 'outerschool_v2';
let _idbConn = null;

function idbOpen() {
  if (_idbConn) return _idbConn;
  _idbConn = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _idbConn;
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDB() {
  let data = null;
  try {
    data = await idbGet(IDB_KEY);
  } catch (e) {
    console.error('IndexedDB read error', e);
  }

  // One-time migration from the old localStorage-based version
  if (!data) {
    try {
      const oldRaw = localStorage.getItem('outerschool_v2');
      if (oldRaw) {
        data = JSON.parse(oldRaw);
        // carry over the old separate UI-pref keys into settings
        data.settings = data.settings || {};
        const oldFont = localStorage.getItem('os_fontScale');
        const oldLayoutIdx = localStorage.getItem('os_layoutIdx');
        const oldCatLayout = localStorage.getItem('os_catLayout');
        if (oldFont != null) data.settings.fontScale = parseInt(oldFont, 10);
        if (oldLayoutIdx != null) data.settings.layoutIdx = parseInt(oldLayoutIdx, 10);
        if (oldCatLayout != null) data.settings.catLayout = oldCatLayout;
        // clean up old storage now that it's been migrated
        localStorage.removeItem('outerschool_v2');
        localStorage.removeItem('os_fontScale');
        localStorage.removeItem('os_layoutIdx');
        localStorage.removeItem('os_catLayout');
      }
    } catch (e) {
      console.error('localStorage migration error', e);
    }
  }

  if (!data) data = JSON.parse(JSON.stringify(DEFAULT_DATA));

  try {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
    for (const key in fresh) {
      if (!(key in data)) data[key] = fresh[key];
    }
    for (const key in fresh.settings) {
      if (!(key in data.settings)) data.settings[key] = fresh.settings[key];
    }
    for (const key in fresh.profile) {
      if (!(key in data.profile)) data.profile[key] = fresh.profile[key];
    }
    // migrate old single-file programs ({html}) to workspace ({files:{html,css,js}})
    data.programs = (data.programs || []).map(p => {
      if (p.files) return p;
      return { id: p.id, name: p.name, desc: p.desc, files: { html: p.html || '', css: '', js: '' }, createdAt: p.createdAt };
    });
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  return data;
}

function saveDB() {
  idbSet(IDB_KEY, DB).catch(e => {
    console.error('IndexedDB save error', e);
    showToast('تعذر حفظ البيانات', 'error');
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

// ══════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════
function navigate(view, id) {
  // always clean up any in-DOM injected sub-program before leaving/entering a view
  cleanupInjectedProgram();

  document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + view);
  if (navEl) navEl.classList.add('active');

  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));

  APP.currentView = view;

  if (view === 'home') {
    document.getElementById('view-home').classList.add('active');
    renderHome();
  } else if (view === 'category') {
    APP.currentCatId = id;
    document.getElementById('view-category').classList.add('active');
    renderCategoryView(id);
  } else if (view === 'cloud') {
    document.getElementById('nav-cloud').classList.add('active');
    document.getElementById('view-cloud').classList.add('active');
    renderCloud();
  } else if (view === 'programs') {
    document.getElementById('view-programs').classList.add('active');
    renderProgramsView();
  } else if (view === 'program-run') {
    APP.currentProgramId = id;
    document.getElementById('view-program-run').classList.add('active');
    runProgram(id);
    } else if (view === 'notes') {
    document.getElementById('nav-notes').classList.add('active');
    document.getElementById('view-notes').classList.add('active');
    renderNotesView();
  } else if (view === 'settings') {
    document.getElementById('nav-settings').classList.add('active');
    document.getElementById('view-settings').classList.add('active');
    renderSettings();
  } else if (view === 'search') {
    document.getElementById('view-search').classList.add('active');
  }

  closeSidebar();
  window.scrollTo({top:0, behavior:'smooth'});
}

// ══════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════
function toggleSidebar() {
  APP.sidebarOpen ? closeSidebar() : openSidebar();
}
function openSidebar() {
  APP.sidebarOpen = true;
  const sb = document.getElementById('sidebar');
  sb.classList.add('open');
  sb.classList.add('sb-animating');
  setTimeout(() => sb.classList.remove('sb-animating'), 400);
  document.getElementById('overlay').classList.add('show');
}
function closeSidebar() {
  APP.sidebarOpen = false;
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

function buildSidebarCats() {
  const menu = document.getElementById('sbCatMenu');
  menu.innerHTML = '';
  const roots = DB.categories.filter(c => !c.parentId);
  roots.forEach(cat => {
    menu.appendChild(buildSbCatItem(cat, 0));
  });
}

// Fixed: clicking the row navigates to the category; clicking the arrow
// (separate hit target with stopPropagation) toggles the sub-category dropdown.
function buildSbCatItem(cat, depth) {
  const children = DB.categories.filter(c => c.parentId === cat.id);
  const hasChildren = children.length > 0;
  const wrapper = document.createElement('div');

  const item = document.createElement('div');
  item.className = 'sb-item';
  item.style.paddingRight = (18 + depth * 16) + 'px';
  item.innerHTML = `
    <i class="fas ${cat.icon || 'fa-folder'}" style="color:${cat.color || 'var(--accent)'};"></i>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(cat.name)}</span>
    ${hasChildren ? '<i class="fas fa-chevron-left sb-arrow"></i>' : ''}
  `;
  item.addEventListener('click', () => navigate('category', cat.id));

  wrapper.appendChild(item);

  if (hasChildren) {
    const drop = document.createElement('div');
    drop.className = 'sb-dropdown';
    children.forEach(child => {
      drop.appendChild(buildSbCatItem(child, depth + 1));
    });
    wrapper.appendChild(drop);

    const arrowEl = item.querySelector('.sb-arrow');
    arrowEl.addEventListener('click', (e) => {
      e.stopPropagation();
      item.classList.toggle('expanded');
      drop.classList.toggle('open');
    });
  }

  return wrapper;
}

function buildSidebarPrograms() {
  const menu = document.getElementById('sbProgramsMenu');
  if (DB.programs.length === 0) {
    menu.innerHTML = `<div class="sb-item" style="color:var(--muted);font-size:.82rem;cursor:default;">لا يوجد برامج بعد</div>`;
    return;
  }
  menu.innerHTML = DB.programs.map(p => `
    <div class="sb-item" onclick="navigate('program-run','${p.id}')">
      <i class="fas fa-cube" style="color:var(--gold);"></i> <span>${escHtml(p.name)}</span>
    </div>
  `).join('');
}


document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nav-cloud').addEventListener('click', function(e) {
    e.stopPropagation();
    this.classList.toggle('expanded');
    document.getElementById('sbCloudDrop').classList.toggle('open');
  });
  document.getElementById('nav-programs-toggle').addEventListener('click', function(e) {
    e.stopPropagation();
    this.classList.toggle('expanded');
    document.getElementById('sbProgramsDrop').classList.toggle('open');
  });
});

// ══════════════════════════════════════════════
//  HOME VIEW
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
//  LAYOUT TOGGLE (cards / boxes / list) — used for both
//  categories (data-store="catLayout") and links (data-store="linkLayout")
// ══════════════════════════════════════════════
const LAYOUT_DEFAULTS = { catLayout: 'cards', linkLayout: 'list' };

function getLayoutPref(store) {
  return (DB.settings && DB.settings[store]) || LAYOUT_DEFAULTS[store] || 'cards';
}
function setLayoutPref(store, mode) {
  DB.settings[store] = mode;
  saveDB();
  applyAllLayouts();
}
// Kept for backwards compatibility with any external calls
function getCatLayout() { return getLayoutPref('catLayout'); }
function setCatLayout(mode) { setLayoutPref('catLayout', mode); }
function applyCatLayout() { applyAllLayouts(); }

function applyAllLayouts() {
  document.querySelectorAll('.cat-layout-toggle').forEach(toggle => {
    const store = toggle.getAttribute('data-store') || 'catLayout';
    const mode = getLayoutPref(store);
    const targetId = toggle.getAttribute('data-target');
    const target = document.getElementById(targetId);
    toggle.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    if (target) {
      target.classList.remove('layout-cards', 'layout-boxes', 'layout-list');
      if (mode !== 'cards') target.classList.add('layout-' + mode);
    }
  });
}
document.addEventListener('click', e => {
  const btn = e.target.closest('.cat-layout-toggle button');
  if (!btn) return;
  const toggle = btn.closest('.cat-layout-toggle');
  const store = toggle.getAttribute('data-store') || 'catLayout';
  setLayoutPref(store, btn.getAttribute('data-mode'));
});

function renderHome() {
  document.getElementById('homeWelcomeName').textContent = DB.profile.displayName || 'مستخدم';

  const statsEl = document.getElementById('homeStats');
  const totalLinks = DB.links.length;
  const totalCats = DB.categories.length;
  const totalCloud = DB.cloud.length;
  const ytCount = DB.links.filter(l => l.type === 'youtube').length;
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8)"><i class="fas fa-link"></i></div>
      <div class="stat-info"><div class="stat-num">${totalLinks}</div><div class="stat-lbl">رابط</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:linear-gradient(135deg,#22c55e,#15803d)"><i class="fas fa-folder"></i></div>
      <div class="stat-info"><div class="stat-num">${totalCats}</div><div class="stat-lbl">تصنيف</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:linear-gradient(135deg,#ff4444,#dc2626)"><i class="fab fa-youtube"></i></div>
      <div class="stat-info"><div class="stat-num">${ytCount}</div><div class="stat-lbl">فيديو</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:linear-gradient(135deg,#4285f4,#0061ff)"><i class="fas fa-cloud"></i></div>
      <div class="stat-info"><div class="stat-num">${totalCloud}</div><div class="stat-lbl">ملف سحابي</div></div>
    </div>
  `;

  const catGrid = document.getElementById('homeCatGrid');
  const rootCats = DB.categories.filter(c => !c.parentId);
  if (rootCats.length === 0) {
    catGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:30px 0;">
      <i class="fas fa-folder-open"></i>
      <h3>لا يوجد تصنيفات بعد</h3>
      <p>ابدأ بإضافة تصنيف جديد</p>
    </div>`;
  } else {
    catGrid.innerHTML = rootCats.map(cat => {
      const childCount = DB.categories.filter(c => c.parentId === cat.id).length;
      const linkCount = DB.links.filter(l => l.catId === cat.id).length;
      const totalCount = childCount + linkCount;
      const catNeonStyle = cat.neon ? `box-shadow:0 0 16px rgba(${cat.neon.r},${cat.neon.g},${cat.neon.b},0.7),0 0 32px rgba(${cat.neon.r},${cat.neon.g},${cat.neon.b},0.3);border-color:rgba(${cat.neon.r},${cat.neon.g},${cat.neon.b},0.6);` : '';
      return `<div class="cat-card" style="--card-color:${cat.color || 'var(--accent)'};${catNeonStyle}" onclick="navigate('category','${cat.id}')">
        <div class="cat-icon" style="background:${cat.color || 'var(--accent)'};">
          <i class="fas ${cat.icon || 'fa-folder'}"></i>
        </div>
        <div class="cat-name">${escHtml(cat.name)}</div>
        <div class="cat-meta">${totalCount} عنصر</div>
        ${cat.desc ? `<div class="cat-meta" style="color:var(--muted);font-size:.73rem;">${escHtml(cat.desc)}</div>` : ''}
      </div>`;
    }).join('');
  }

  renderProgramsGrid(document.getElementById('homeProgramsGrid'), 6);
  renderHomeNtWidget();

  const recentEl = document.getElementById('homeRecentList');
  const recent = [...DB.links].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0, 12);
  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-state">
      <i class="fas fa-inbox"></i>
      <h3>لا يوجد روابط بعد</h3>
      <p>ابدأ بإضافة أول رابط تعليمي</p>
    </div>`;
  } else {
    recentEl.innerHTML = recent.map(link => renderLinkRow(link, true)).join('');
  }
  applyCatLayout();
}

// ══════════════════════════════════════════════
//  LINK ROW RENDERER
// ══════════════════════════════════════════════
function renderLinkRow(link, showCat = false) {
  const cat = DB.categories.find(c => c.id === link.catId);
  let thumb = '', badge = '', action = '';
  if (link.type === 'youtube') {
    const vid = extractYtId(link.url);
    thumb = vid ? `<img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" loading="lazy">` : '<i class="fab fa-youtube"></i>';
    badge = '<span class="item-type-badge badge-yt"><i class="fab fa-youtube"></i> يوتيوب</span>';
    action = `onclick="openVideoModal('${link.id}')"`;
  } else if (link.type === 'playlist') {
    thumb = '<i class="fas fa-list" style="color:var(--gold)"></i>';
    badge = '<span class="item-type-badge badge-playlist"><i class="fas fa-list"></i> قائمة</span>';
    action = `onclick="openUrl('${encodeURIComponent(link.url)}')"`;
  } else {
    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=32`;
    thumb = `<img src="${favicon}" loading="lazy" style="width:24px;height:24px;object-fit:contain;">`;
    badge = '<span class="item-type-badge badge-link"><i class="fas fa-globe"></i> موقع</span>';
    action = `onclick="openUrl('${encodeURIComponent(link.url)}')"`;
  }
  const catBadge = showCat && cat ? `<span style="font-size:.72rem;padding:2px 7px;border-radius:8px;background:${cat.color||'var(--accent)'}22;color:${cat.color||'var(--accent)'}">${escHtml(cat.name)}</span>` : '';
  return `<div class="item-row" ${action} style="cursor:pointer;">
    <div class="item-thumb">${thumb}</div>
    <div class="item-info">
      <div class="item-title">${escHtml(link.title)}</div>
      <div class="item-meta">${badge}${catBadge}${link.notes ? `<span>${escHtml(link.notes)}</span>` : ''}</div>
    </div>
    <div class="item-actions" onclick="event.stopPropagation()">
      <button class="btn-icon btn btn-sm" onclick="editLink('${link.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
      <button class="btn-icon btn btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="deleteLink('${link.id}')" title="حذف"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
//  VIDEO MODAL (in-app OR external tab)
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
//  YOUTUBE IFRAME PLAYER API (single videos + browsable playlists)
// ══════════════════════════════════════════════
let ytApiReady = false;
let ytApiLoading = false;
let ytPlayer = null;
let _ytPendingCb = null;

function ensureYtApi(cb) {
  if (ytApiReady && window.YT && YT.Player) { cb(); return; }
  _ytPendingCb = cb;
  if (ytApiLoading) return;
  ytApiLoading = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}
// Required global callback name — called automatically by the YouTube API script
function onYouTubeIframeAPIReady() {
  ytApiReady = true;
  if (_ytPendingCb) { const cb = _ytPendingCb; _ytPendingCb = null; cb(); }
}

function extractYtPlaylistId(url) {
  if (!url) return null;
  const m = url.match(/[?&]list=([^&#]+)/);
  return m ? m[1] : null;
}

function openVideoModal(linkId) {
  const link = DB.links.find(l => l.id === linkId);
  if (!link) return;
  const vid = extractYtId(link.url);
  if (!vid) { openUrl(encodeURIComponent(link.url)); return; }

  document.getElementById('videoModalBox').classList.remove('playlist-mode');
  document.getElementById('videoModalHint').style.display = 'none';
  document.getElementById('videoModalTitle').textContent = link.title;
  document.getElementById('videoModalExternalBtn').onclick = () => window.open(link.url, '_blank', 'noopener');
  document.getElementById('videoModalCopyBtn').onclick = () => copyCurrentVideoLink(link.url);
  document.getElementById('videoModalDownloadBtn').onclick = () => downloadCurrentVideo(link.url);
  document.getElementById('videoModal').classList.add('show');

  ensureYtApi(() => {
    if (!ytPlayer) {
      ytPlayer = new YT.Player('videoModalFrame', { height: '100%', width: '100%', videoId: vid, playerVars: { rel: 0 } });
    } else {
      ytPlayer.loadVideoById(vid);
    }
  });
}

function openPlaylistModal(linkId) {
  const link = DB.links.find(l => l.id === linkId);
  if (!link) return;
  const listId = extractYtPlaylistId(link.url);
  if (!listId) { openUrl(encodeURIComponent(link.url)); return; }

  document.getElementById('videoModalBox').classList.add('playlist-mode');
  document.getElementById('videoModalHint').style.display = 'block';
  document.getElementById('videoModalTitle').textContent = link.title;
  document.getElementById('videoModalExternalBtn').onclick = () => window.open(link.url, '_blank', 'noopener');
  document.getElementById('videoModalCopyBtn').onclick = () => copyCurrentVideoLink(link.url);
  document.getElementById('videoModalDownloadBtn').onclick = () => downloadCurrentVideo(link.url);
  document.getElementById('videoModal').classList.add('show');

  ensureYtApi(() => {
    if (!ytPlayer) {
      ytPlayer = new YT.Player('videoModalFrame', { height: '100%', width: '100%', playerVars: { listType: 'playlist', list: listId, rel: 0 } });
    } else {
      ytPlayer.loadPlaylist({ listType: 'playlist', list: listId });
    }
  });
}

function closeVideoModal() {
  document.getElementById('videoModal').classList.remove('show');
  try { if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo(); } catch (e) {}
}

// Returns the URL of whichever video is currently loaded in the player
// (falls back to the link's own URL — e.g. before the player has fully loaded)
function getCurrentVideoUrl(fallbackUrl) {
  try {
    if (ytPlayer && typeof ytPlayer.getVideoUrl === 'function') {
      const url = ytPlayer.getVideoUrl();
      if (url) return url;
    }
  } catch (e) {}
  return fallbackUrl;
}

function copyCurrentVideoLink(fallbackUrl) {
  const url = getCurrentVideoUrl(fallbackUrl);
  copyTextToClipboard(url);
  showToast('تم نسخ رابط الفيديو ✓ الصقه في شريط البحث بالموقع', 'success');
}

function downloadCurrentVideo(fallbackUrl) {
  const url = getCurrentVideoUrl(fallbackUrl);
  openDownloader(encodeURIComponent(url));
}

// ══════════════════════════════════════════════
//  CLIPBOARD HELPER
// ══════════════════════════════════════════════
function copyTextToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
  } else {
    fallbackCopyText(text);
  }
}
function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

// ══════════════════════════════════════════════
//  CATEGORY VIEW
// ══════════════════════════════════════════════
function renderCategoryView(catId) {
  const cat = DB.categories.find(c => c.id === catId);
  if (!cat) { navigate('home'); return; }

  const crumbEl = document.getElementById('catBreadcrumb');
  const crumbs = buildBreadcrumb(catId);
  crumbEl.innerHTML = `<span onclick="navigate('home')"><i class="fas fa-home"></i></span>` +
    crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      return `<span class="sep">/</span>${isLast
        ? `<span class="current">${escHtml(c.name)}</span>`
        : `<span onclick="navigate('category','${c.id}')">${escHtml(c.name)}</span>`}`;
    }).join('');

  const headerEl = document.getElementById('catViewHeader');
  const childCount = DB.categories.filter(c => c.parentId === catId).length;
  const linkCount = DB.links.filter(l => l.catId === catId).length;
  headerEl.innerHTML = `
    <div class="cat-view-icon" style="background:${cat.color||'var(--accent)'};">
      <i class="fas ${cat.icon||'fa-folder'}"></i>
    </div>
    <div class="cat-view-info">
      <h2>${escHtml(cat.name)}</h2>
      ${cat.desc ? `<p>${escHtml(cat.desc)}</p>` : ''}
      <div class="cat-view-stats">
        <div class="cat-view-stat"><i class="fas fa-link"></i> ${linkCount} رابط</div>
        <div class="cat-view-stat"><i class="fas fa-folder"></i> ${childCount} تصنيف فرعي</div>
      </div>
    </div>
  `;

  const subGrid = document.getElementById('catSubGrid');
  const children = DB.categories.filter(c => c.parentId === catId);
  if (children.length > 0) {
    subGrid.innerHTML = `<div class="sec-heading">
        <i class="fas fa-folder-open" style="color:var(--gold);"></i> التصنيفات الفرعية
        <div class="cat-layout-toggle" data-target="catSubGridInner">
          <button data-mode="cards" title="عرض بطاقات"><i class="fas fa-th-large"></i></button>
          <button data-mode="boxes" title="عرض مربعات"><i class="fas fa-th"></i></button>
          <button data-mode="list" title="عرض قائمة"><i class="fas fa-list"></i></button>
        </div>
      </div>
      <div class="cat-grid" id="catSubGridInner">${children.map(child => {
        const cl = DB.links.filter(l => l.catId === child.id).length;
        return `<div class="cat-card" style="--card-color:${child.color||'var(--accent)'};" onclick="navigate('category','${child.id}')">
          <div class="cat-icon" style="background:${child.color||'var(--accent)'};">
            <i class="fas ${child.icon||'fa-folder'}"></i>
          </div>
          <div class="cat-name">${escHtml(child.name)}</div>
          <div class="cat-meta">${cl} رابط</div>
        </div>`;
      }).join('')}</div>`;
  } else {
    subGrid.innerHTML = '';
  }

  const itemsEl = document.getElementById('catItemsList');
  const links = DB.links.filter(l => l.catId === catId);

  if (links.length === 0) {
    itemsEl.innerHTML = `<div class="empty-state">
      <i class="fas fa-inbox"></i>
      <h3>لا يوجد روابط في هذا التصنيف</h3>
      <p>اضغط "إضافة رابط" لإضافة أول عنصر</p>
    </div>`;
  } else {
    const playlists = links.filter(l => l.type === 'playlist');
    const others = links.filter(l => l.type !== 'playlist');

    let html = '';
    if (playlists.length > 0) {
      html += `<div class="sec-heading"><i class="fas fa-list" style="color:var(--gold);"></i> قوائم التشغيل</div>`;
      html += `<div class="items-list">${playlists.map(pl => renderPlaylistRow(pl)).join('')}</div>`;
    }
    if (others.length > 0) {
      html += `<div class="sec-heading" style="margin-top:${playlists.length?'20px':'0'};">
        <i class="fas fa-link" style="color:var(--accent);"></i> الروابط والفيديوهات
        <div class="cat-layout-toggle" data-target="catItemsListLinks" data-store="linkLayout">
          <button data-mode="list" title="عرض قائمة"><i class="fas fa-list"></i></button>
          <button data-mode="boxes" title="عرض مربعات"><i class="fas fa-th"></i></button>
          <button data-mode="cards" title="عرض بطاقات"><i class="fas fa-th-large"></i></button>
        </div>
      </div>
      <div class="items-list" id="catItemsListLinks">${others.map(link => renderLinkRow(link, false)).join('')}</div>`;
    }
    itemsEl.innerHTML = html;
  }
  applyCatLayout();
}

function renderPlaylistRow(link) {
  return `<div class="playlist-wrap">
    <div class="playlist-header" onclick="togglePlaylistHeader(this)">
      <div style="font-size:1.5rem;">📋</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:.93rem;">${escHtml(link.title)}</div>
        ${link.desc ? `<div style="font-size:.8rem;color:var(--muted);">${escHtml(link.desc)}</div>` : ''}
      </div>
      <div class="item-actions" onclick="event.stopPropagation()">
        <a href="${escHtml(link.url)}" target="_blank" rel="noopener" class="btn btn-sm" title="فتح في يوتيوب"><i class="fab fa-youtube"></i></a>
        <button class="btn-icon btn btn-sm" onclick="editLink('${link.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-icon btn btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="deleteLink('${link.id}')"><i class="fas fa-trash"></i></button>
      </div>
      <i class="fas fa-chevron-left playlist-toggle"></i>
    </div>
    <div class="playlist-body">
      <div class="playlist-item" onclick="openPlaylistModal('${link.id}')">
        <div class="playlist-item-num"><i class="fas fa-play"></i></div>
        <div>تصفح القائمة واختر فيديو (داخل التطبيق)</div>
        <i class="fas fa-chevron-left" style="color:var(--muted);margin-right:auto;"></i>
      </div>
      <div class="playlist-item" onclick="openUrl('${encodeURIComponent(link.url)}')">
        <div class="playlist-item-num">▶</div>
        <div>فتح قائمة التشغيل كاملة في تاب خارجي</div>
        <i class="fas fa-external-link-alt" style="color:var(--muted);margin-right:auto;"></i>
      </div>
    </div>
  </div>`;
}

function togglePlaylistHeader(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

function buildBreadcrumb(catId) {
  const result = [];
  let current = DB.categories.find(c => c.id === catId);
  while (current) {
    result.unshift(current);
    current = DB.categories.find(c => c.id === current.parentId);
  }
  return result;
}

function extractYtId(url) {
  if (!url) return null;
  const patterns = [
    /[?&]v=([^&#]+)/,
    /youtu\.be\/([^?#]+)/,
    /embed\/([^?#]+)/,
    /shorts\/([^?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function openUrl(encodedUrl) {
  window.open(decodeURIComponent(encodedUrl), '_blank', 'noopener');
}

// ══════════════════════════════════════════════
//  CLOUD VIEW
// ══════════════════════════════════════════════
function renderCloud() {
  const grid = document.getElementById('cloudGrid');
  if (DB.cloud.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <i class="fas fa-cloud"></i>
      <h3>لا يوجد ملفات سحابية</h3>
      <p>أضف روابط Google Drive أو Dropbox</p>
    </div>`;
    return;
  }
  grid.innerHTML = DB.cloud.map(item => {
    let icon = '☁️', tagClass = 'tag-other', tagLabel = 'رابط';
    if (item.type === 'drive') { icon = '<i class="fab fa-google-drive" style="color:#4285f4;font-size:1.8rem;"></i>'; tagClass='tag-drive'; tagLabel='Google Drive'; }
    else if (item.type === 'dropbox') { icon = '<i class="fab fa-dropbox" style="color:#0061ff;font-size:1.8rem;"></i>'; tagClass='tag-dropbox'; tagLabel='Dropbox'; }
    return `<div class="cloud-card">
      <div class="cloud-card-icon">${icon}</div>
      <h4>${escHtml(item.name)}</h4>
      <p>${escHtml(item.desc||'لا يوجد وصف')}</p>
      <span class="cloud-tag ${tagClass}">${tagLabel}</span>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <a href="${escHtml(item.url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="flex:1;justify-content:center;">
          <i class="fas fa-external-link-alt"></i> فتح
        </a>
        <button class="btn btn-sm" onclick="editCloud('${item.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="deleteCloud('${item.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
//  PROGRAMS — full workspace (HTML/CSS/JS), merged directly into the DOM
// ══════════════════════════════════════════════
function renderProgramsGrid(container, limit) {
  if (!container) return;
  const list = limit ? DB.programs.slice(0, limit) : DB.programs;
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:30px 0;">
      <i class="fas fa-cubes"></i>
      <h3>لا يوجد برامج فرعية بعد</h3>
      <p>أضف برنامجك الأول بلصق أو رفع ملفات HTML / CSS / JS</p>
    </div>`;
    return;
  }
  container.innerHTML = list.map(p => `
    <div class="cloud-card">
      <div class="cloud-card-icon"><i class="fas fa-cube" style="color:#f59e0b;"></i></div>
      <h4>${escHtml(p.name)}</h4>
      <p>${escHtml(p.desc||'لا يوجد وصف')}</p>
      <span class="cloud-tag tag-program">برنامج فرعي</span>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center;" onclick="navigate('program-run','${p.id}')">
          <i class="fas fa-play"></i> تشغيل
        </button>
        <button class="btn btn-sm" onclick="editProgram('${p.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="deleteProgram('${p.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function renderProgramsView() {
  renderProgramsGrid(document.getElementById('programsGrid'), null);
}

// ── Program runner — sandboxed iframe ──
function runProgram(id) {
  const p = DB.programs.find(x => x.id === id);
  if (!p) { navigate('programs'); return; }
  document.getElementById('programRunTitle').textContent = p.name;

  // Build a full HTML doc and inject via srcdoc
  const full = buildProgramHtml(p);
  const frame = document.getElementById('programFrame');
  frame.srcdoc = full;

  // Restore last chosen size
  const sel = document.getElementById('iframeSizeSelect');
  sel.value = DB.settings.lastIframeSize || 'full';
  applyIframeSize(sel.value);
}

function buildProgramHtml(p) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(p.name)}</title>
<style>${p.files.css || ''}
/* ══════════════════════════════════════════════
   ✨ BEAUTIFUL EFFECTS — v4
══════════════════════════════════════════════ */

/* ── Ripple effect on buttons ── */
.btn, .cat-card, .stat-card, .cloud-card, .item-row, .sb-item {
  position: relative;
  overflow: hidden;
}
.ripple-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255,255,255,0.25);
  transform: scale(0);
  animation: ripple-anim 0.55s ease-out forwards;
  pointer-events: none;
  z-index: 10;
}
@keyframes ripple-anim {
  to { transform: scale(4); opacity: 0; }
}

/* ── Glow pulse on accent buttons ── */
.btn-primary {
  animation: glow-pulse 3s ease-in-out infinite;
}
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--accent-glow); }
  50% { box-shadow: 0 0 20px var(--accent-glow), 0 0 40px var(--accent-glow); }
}
.btn-primary:hover {
  animation: none;
  box-shadow: 0 0 25px var(--accent-glow), 0 6px 20px rgba(0,0,0,0.3) !important;
  transform: translateY(-1px);
}

/* ── Shimmer loading effect for stat cards ── */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.stat-card {
  background: var(--surface);
  position: relative;
  overflow: hidden;
}
.stat-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
  background-size: 400px 100%;
  animation: shimmer 3s linear infinite;
  pointer-events: none;
}

/* ── Floating animation for logo icon ── */
.logo-icon {
  animation: float-logo 4s ease-in-out infinite;
}
@keyframes float-logo {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
}

/* ── Slide-in animation for views ── */
@keyframes slideInUp {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
.view.active {
  animation: slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* ── Card hover with glow border ── */
.cat-card:hover {
  box-shadow: 0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px var(--accent), 0 0 20px var(--accent-glow) !important;
}
.stat-card:hover {
  box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 0 15px var(--accent-glow) !important;
}
.cloud-card:hover {
  box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 0 12px var(--accent-glow) !important;
}

/* ── Toast enhanced with slide + scale ── */
.toast.show {
  transform: translateX(-50%) translateY(0) scale(1) !important;
}
.toast {
  transform: translateX(-50%) translateY(80px) scale(0.9) !important;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

/* ── Sidebar items slide in when sidebar opens ── */
.sidebar.open .sb-item {
  animation: sbItemIn 0.3s ease both;
}
.sidebar.open .sb-section:nth-child(1) .sb-item { animation-delay: 0.05s; }
.sidebar.open .sb-section:nth-child(2) .sb-item { animation-delay: 0.08s; }
.sidebar.open .sb-section:nth-child(3) .sb-item { animation-delay: 0.11s; }
.sidebar.open .sb-section:nth-child(4) .sb-item { animation-delay: 0.14s; }
.sidebar.open .sb-section:nth-child(5) .sb-item { animation-delay: 0.17s; }
@keyframes sbItemIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ── Topbar logo text shimmer ── */
.topbar-logo .logo-outer {
  background: linear-gradient(90deg, var(--gold), #fff, var(--gold));
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: text-shimmer 3s linear infinite;
}
@keyframes text-shimmer {
  to { background-position: 200% center; }
}

/* ── Stats counter animation (number count-up feel) ── */
.stat-num {
  display: inline-block;
  animation: countUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes countUp {
  from { opacity: 0; transform: translateY(10px) scale(0.8); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Modal slide-in enhanced ── */
.modal-bg.show .modal {
  animation: modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(30px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Item rows slide in staggered ── */
.items-list .item-row {
  animation: itemRowIn 0.3s ease both;
}
.items-list .item-row:nth-child(1) { animation-delay: 0s; }
.items-list .item-row:nth-child(2) { animation-delay: 0.04s; }
.items-list .item-row:nth-child(3) { animation-delay: 0.08s; }
.items-list .item-row:nth-child(4) { animation-delay: 0.12s; }
.items-list .item-row:nth-child(5) { animation-delay: 0.16s; }
.items-list .item-row:nth-child(6) { animation-delay: 0.20s; }
@keyframes itemRowIn {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ── Cat grid cards stagger-in ── */
.cat-grid .cat-card {
  animation: catCardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.cat-grid .cat-card:nth-child(1) { animation-delay: 0s; }
.cat-grid .cat-card:nth-child(2) { animation-delay: 0.05s; }
.cat-grid .cat-card:nth-child(3) { animation-delay: 0.10s; }
.cat-grid .cat-card:nth-child(4) { animation-delay: 0.15s; }
.cat-grid .cat-card:nth-child(5) { animation-delay: 0.20s; }
.cat-grid .cat-card:nth-child(6) { animation-delay: 0.25s; }
.cat-grid .cat-card:nth-child(n+7) { animation-delay: 0.30s; }
@keyframes catCardIn {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* ── Active sidebar item indicator pulse ── */
.sb-item.active::before {
  animation: indicatorPulse 2s ease-in-out infinite;
}
@keyframes indicatorPulse {
  0%, 100% { box-shadow: 0 0 4px var(--accent); opacity: 1; }
  50% { box-shadow: 0 0 12px var(--accent); opacity: 0.8; }
}

/* ── HSL/RGB picker swatch glow ── */
.hsl-preview-swatch {
  transition: background .15s, box-shadow .15s !important;
}
.hsl-preview-swatch:not([style*="background: rgb(0, 0, 0)"]) {
  box-shadow: 0 4px 16px currentColor, 0 0 0 2px var(--border) !important;
}

/* ── Note cards bounce in ── */
.note-card {
  animation: noteIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes noteIn {
  from { opacity: 0; transform: scale(0.92) rotate(-1deg); }
  to { opacity: 1; transform: scale(1) rotate(0); }
}

/* ── Theme cards hover scale ── */
.theme-card:hover {
  transform: translateY(-4px) scale(1.04) !important;
  box-shadow: 0 8px 20px rgba(0,0,0,0.4) !important;
}

/* ── Scroll-triggered subtle parallax for page header icon ── */
.page-title-icon {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.page-title-icon:hover {
  transform: rotate(-5deg) scale(1.1);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 20px var(--accent-glow);
}

/* ── Settings card hover ── */
.settings-card {
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition) !important;
}
.settings-card:hover {
  border-color: var(--accent) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 10px var(--accent-glow) !important;
  transform: translateY(-1px);
}

/* ── Topbar subtle glow on scroll ── */
.topbar {
  transition: box-shadow 0.3s ease !important;
}

/* ── Input focus ring animation ── */
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  animation: focusRing 0.3s ease !important;
}
@keyframes focusRing {
  from { box-shadow: 0 0 0 0 var(--accent-glow); }
  to { box-shadow: 0 0 0 3px var(--accent-glow); }
}

/* ── Neon scan line effect for Matrix theme ── */
[data-theme="matrix"] .topbar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,255,65,0.03) 2px,
    rgba(0,255,65,0.03) 4px
  );
  pointer-events: none;
}
[data-theme="neon"] .btn-primary {
  text-shadow: 0 0 10px rgba(255,255,255,0.6);
}

/* ── Smooth color transition on all themed elements ── */
.cat-card, .stat-card, .cloud-card, .item-row, .settings-card,
.sidebar, .topbar, .modal, .note-card, .todo-item {
  transition: 
    background var(--transition),
    border-color var(--transition),
    color var(--transition),
    box-shadow 0.3s ease,
    transform 0.25s ease !important;
}


</style>
</head>
<body>
${p.files.html || ''}
<script>${p.files.js || ''}<\/script>
</body></html>`;
}

function cleanupInjectedProgram() {
  // With srcdoc iframe we just need to clear the src on navigate away
  const frame = document.getElementById('programFrame');
  if (frame) frame.srcdoc = '';
}

// ── iframe layout size controls ──
const IFRAME_SIZES = {
  full:  { w: '100%',   h: '78vh' },
  xl:    { w: '1200px', h: '78vh' },
  lg:    { w: '960px',  h: '78vh' },
  md:    { w: '720px',  h: '78vh' },
  sm:    { w: '480px',  h: '78vh' },
  xs:    { w: '360px',  h: '78vh' },
};

function applyIframeSize(val) {
  const outer = document.getElementById('programIframeOuter');
  const frame = document.getElementById('programFrame');
  const customWrap = document.getElementById('iframeCustomWrap');
  if (!outer || !frame) return;

  if (val === 'custom') {
    customWrap.classList.add('visible');
    return;
  }
  customWrap.classList.remove('visible');

  const size = IFRAME_SIZES[val] || IFRAME_SIZES.full;
  frame.style.width = size.w;
  frame.style.height = size.h;

  DB.settings.lastIframeSize = val;
  saveDB();
}

function applyCustomIframeSize() {
  const w = parseInt(document.getElementById('iframeCustomW').value, 10);
  const h = parseInt(document.getElementById('iframeCustomH').value, 10);
  const frame = document.getElementById('programFrame');
  if (!frame) return;
  if (w && w >= 200) frame.style.width = w + 'px';
  if (h && h >= 200) frame.style.height = h + 'px';
}

function openProgramNewTab(id) {
  const p = DB.programs.find(x => x.id === id);
  if (!p) return;
  const full = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${escHtml(p.name)}</title><style>${p.files.css||''}
/* ══════════════════════════════════════════════
   ✨ BEAUTIFUL EFFECTS — v4
══════════════════════════════════════════════ */

/* ── Ripple effect on buttons ── */
.btn, .cat-card, .stat-card, .cloud-card, .item-row, .sb-item {
  position: relative;
  overflow: hidden;
}
.ripple-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255,255,255,0.25);
  transform: scale(0);
  animation: ripple-anim 0.55s ease-out forwards;
  pointer-events: none;
  z-index: 10;
}
@keyframes ripple-anim {
  to { transform: scale(4); opacity: 0; }
}

/* ── Glow pulse on accent buttons ── */
.btn-primary {
  animation: glow-pulse 3s ease-in-out infinite;
}
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--accent-glow); }
  50% { box-shadow: 0 0 20px var(--accent-glow), 0 0 40px var(--accent-glow); }
}
.btn-primary:hover {
  animation: none;
  box-shadow: 0 0 25px var(--accent-glow), 0 6px 20px rgba(0,0,0,0.3) !important;
  transform: translateY(-1px);
}

/* ── Shimmer loading effect for stat cards ── */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.stat-card {
  background: var(--surface);
  position: relative;
  overflow: hidden;
}
.stat-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
  background-size: 400px 100%;
  animation: shimmer 3s linear infinite;
  pointer-events: none;
}

/* ── Floating animation for logo icon ── */
.logo-icon {
  animation: float-logo 4s ease-in-out infinite;
}
@keyframes float-logo {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
}

/* ── Slide-in animation for views ── */
@keyframes slideInUp {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
.view.active {
  animation: slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* ── Card hover with glow border ── */
.cat-card:hover {
  box-shadow: 0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px var(--accent), 0 0 20px var(--accent-glow) !important;
}
.stat-card:hover {
  box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 0 15px var(--accent-glow) !important;
}
.cloud-card:hover {
  box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 0 12px var(--accent-glow) !important;
}

/* ── Toast enhanced with slide + scale ── */
.toast.show {
  transform: translateX(-50%) translateY(0) scale(1) !important;
}
.toast {
  transform: translateX(-50%) translateY(80px) scale(0.9) !important;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

/* ── Sidebar items slide in when sidebar opens ── */
.sidebar.open .sb-item {
  animation: sbItemIn 0.3s ease both;
}
.sidebar.open .sb-section:nth-child(1) .sb-item { animation-delay: 0.05s; }
.sidebar.open .sb-section:nth-child(2) .sb-item { animation-delay: 0.08s; }
.sidebar.open .sb-section:nth-child(3) .sb-item { animation-delay: 0.11s; }
.sidebar.open .sb-section:nth-child(4) .sb-item { animation-delay: 0.14s; }
.sidebar.open .sb-section:nth-child(5) .sb-item { animation-delay: 0.17s; }
@keyframes sbItemIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ── Topbar logo text shimmer ── */
.topbar-logo .logo-outer {
  background: linear-gradient(90deg, var(--gold), #fff, var(--gold));
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: text-shimmer 3s linear infinite;
}
@keyframes text-shimmer {
  to { background-position: 200% center; }
}

/* ── Stats counter animation (number count-up feel) ── */
.stat-num {
  display: inline-block;
  animation: countUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes countUp {
  from { opacity: 0; transform: translateY(10px) scale(0.8); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Modal slide-in enhanced ── */
.modal-bg.show .modal {
  animation: modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(30px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Item rows slide in staggered ── */
.items-list .item-row {
  animation: itemRowIn 0.3s ease both;
}
.items-list .item-row:nth-child(1) { animation-delay: 0s; }
.items-list .item-row:nth-child(2) { animation-delay: 0.04s; }
.items-list .item-row:nth-child(3) { animation-delay: 0.08s; }
.items-list .item-row:nth-child(4) { animation-delay: 0.12s; }
.items-list .item-row:nth-child(5) { animation-delay: 0.16s; }
.items-list .item-row:nth-child(6) { animation-delay: 0.20s; }
@keyframes itemRowIn {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ── Cat grid cards stagger-in ── */
.cat-grid .cat-card {
  animation: catCardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.cat-grid .cat-card:nth-child(1) { animation-delay: 0s; }
.cat-grid .cat-card:nth-child(2) { animation-delay: 0.05s; }
.cat-grid .cat-card:nth-child(3) { animation-delay: 0.10s; }
.cat-grid .cat-card:nth-child(4) { animation-delay: 0.15s; }
.cat-grid .cat-card:nth-child(5) { animation-delay: 0.20s; }
.cat-grid .cat-card:nth-child(6) { animation-delay: 0.25s; }
.cat-grid .cat-card:nth-child(n+7) { animation-delay: 0.30s; }
@keyframes catCardIn {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* ── Active sidebar item indicator pulse ── */
.sb-item.active::before {
  animation: indicatorPulse 2s ease-in-out infinite;
}
@keyframes indicatorPulse {
  0%, 100% { box-shadow: 0 0 4px var(--accent); opacity: 1; }
  50% { box-shadow: 0 0 12px var(--accent); opacity: 0.8; }
}

/* ── HSL/RGB picker swatch glow ── */
.hsl-preview-swatch {
  transition: background .15s, box-shadow .15s !important;
}
.hsl-preview-swatch:not([style*="background: rgb(0, 0, 0)"]) {
  box-shadow: 0 4px 16px currentColor, 0 0 0 2px var(--border) !important;
}

/* ── Note cards bounce in ── */
.note-card {
  animation: noteIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes noteIn {
  from { opacity: 0; transform: scale(0.92) rotate(-1deg); }
  to { opacity: 1; transform: scale(1) rotate(0); }
}

/* ── Theme cards hover scale ── */
.theme-card:hover {
  transform: translateY(-4px) scale(1.04) !important;
  box-shadow: 0 8px 20px rgba(0,0,0,0.4) !important;
}

/* ── Scroll-triggered subtle parallax for page header icon ── */
.page-title-icon {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.page-title-icon:hover {
  transform: rotate(-5deg) scale(1.1);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 20px var(--accent-glow);
}

/* ── Settings card hover ── */
.settings-card {
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition) !important;
}
.settings-card:hover {
  border-color: var(--accent) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 10px var(--accent-glow) !important;
  transform: translateY(-1px);
}

/* ── Topbar subtle glow on scroll ── */
.topbar {
  transition: box-shadow 0.3s ease !important;
}

/* ── Input focus ring animation ── */
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  animation: focusRing 0.3s ease !important;
}
@keyframes focusRing {
  from { box-shadow: 0 0 0 0 var(--accent-glow); }
  to { box-shadow: 0 0 0 3px var(--accent-glow); }
}

/* ── Neon scan line effect for Matrix theme ── */
[data-theme="matrix"] .topbar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,255,65,0.03) 2px,
    rgba(0,255,65,0.03) 4px
  );
  pointer-events: none;
}
[data-theme="neon"] .btn-primary {
  text-shadow: 0 0 10px rgba(255,255,255,0.6);
}

/* ── Smooth color transition on all themed elements ── */
.cat-card, .stat-card, .cloud-card, .item-row, .settings-card,
.sidebar, .topbar, .modal, .note-card, .todo-item {
  transition: 
    background var(--transition),
    border-color var(--transition),
    color var(--transition),
    box-shadow 0.3s ease,
    transform 0.25s ease !important;
}


</style></head><body>${p.files.html||''}<script>${p.files.js||''}<\/script></body></html>`;
  const blob = new Blob([full], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ══════════════════════════════════════════════
//  REAL CODE EDITOR (CodeMirror) FOR SUB-PROGRAMS
// ══════════════════════════════════════════════
let cmHtml, cmCss, cmJs;

function initProgramEditors() {
  if (cmHtml) return; // already initialised
  const commonOpts = {
    lineNumbers: true,
    theme: 'material-darker',
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
      Tab: cm => cm.replaceSelection('  ', 'end'),
      'Shift-Tab': cm => cm.execCommand('indentLess'),
    },
  };
  cmHtml = CodeMirror.fromTextArea(document.getElementById('progHtmlContent'), { ...commonOpts, mode: 'htmlmixed', autoCloseTags: true });
  cmCss = CodeMirror.fromTextArea(document.getElementById('progCssContent'), { ...commonOpts, mode: 'css' });
  cmJs = CodeMirror.fromTextArea(document.getElementById('progJsContent'), { ...commonOpts, mode: 'javascript' });
}

function getProgEditor(kind) {
  return kind === 'html' ? cmHtml : kind === 'css' ? cmCss : cmJs;
}

function formatProgCode(kind) {
  const cm = getProgEditor(kind);
  if (!cm) return;
  cm.operation(() => {
    for (let i = 0; i < cm.lineCount(); i++) cm.indentLine(i, 'smart');
  });
  showToast('تم تنسيق الكود ✓', 'success');
}

function openAddProgramModal() {
  initProgramEditors();
  document.getElementById('editProgramId').value = '';
  document.getElementById('addProgramModalTitle').textContent = 'إضافة برنامج فرعي';
  document.getElementById('progName').value = '';
  document.getElementById('progDesc').value = '';
  cmHtml.setValue('');
  cmCss.setValue('');
  cmJs.setValue('');
  document.getElementById('progHtmlFilename').textContent = 'لم يتم اختيار ملف';
  document.getElementById('progCssFilename').textContent = 'لم يتم اختيار ملف';
  document.getElementById('progJsFilename').textContent = 'لم يتم اختيار ملف';
  document.querySelectorAll('#modalAddProgram .upload-filename').forEach(el => el.classList.remove('has-file'));
  switchProgTab('html');
  openModal('modalAddProgram');
  setTimeout(() => cmHtml.refresh(), 50);
}

function switchProgTab(tab) {
  APP.currentProgTab = tab;
  document.querySelectorAll('#modalAddProgram .type-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#modalAddProgram .type-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('ptab-' + tab).classList.add('active');
  document.getElementById('ppanel-' + tab).classList.add('active');
  const cm = getProgEditor(tab);
  if (cm) setTimeout(() => cm.refresh(), 10);
}

function handleProgFile(input, kind) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const cm = getProgEditor(kind);
    if (cm) cm.setValue(e.target.result);
    const fnEl = document.getElementById('prog' + kind[0].toUpperCase() + kind.slice(1) + 'Filename');
    fnEl.textContent = file.name;
    fnEl.classList.add('has-file');
    if (kind === 'html' && !document.getElementById('progName').value.trim()) {
      document.getElementById('progName').value = file.name.replace(/\.html?$/i, '');
    }
  };
  reader.readAsText(file);
}

function saveProgram() {
  const name = document.getElementById('progName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم البرنامج', 'error'); return; }
  const html = cmHtml.getValue();
  const css = cmCss.getValue();
  const js = cmJs.getValue();
  if (!html.trim() && !js.trim()) { showToast('أضف كود HTML أو JavaScript على الأقل', 'error'); return; }
  const desc = document.getElementById('progDesc').value.trim();
  const editId = document.getElementById('editProgramId').value;
  const files = { html, css, js };

  if (editId) {
    const p = DB.programs.find(x => x.id === editId);
    if (p) { p.name = name; p.desc = desc; p.files = files; }
    showToast('تم تعديل البرنامج ✓', 'success');
  } else {
    DB.programs.push({ id: genId(), name, desc, files, createdAt: Date.now() });
    showToast('تم إضافة البرنامج ✓', 'success');
  }
  saveDB();
  closeModal('modalAddProgram');
  buildSidebarPrograms();
  if (APP.currentView === 'home') renderHome();
  else if (APP.currentView === 'programs') renderProgramsView();
}

function editProgram(id) {
  const p = DB.programs.find(x => x.id === id);
  if (!p) return;
  initProgramEditors();
  closeModal('modalConfirm');
  document.getElementById('editProgramId').value = p.id;
  document.getElementById('addProgramModalTitle').textContent = 'تعديل البرنامج';
  document.getElementById('progName').value = p.name;
  document.getElementById('progDesc').value = p.desc || '';
  cmHtml.setValue(p.files.html || '');
  cmCss.setValue(p.files.css || '');
  cmJs.setValue(p.files.js || '');
  document.getElementById('progHtmlFilename').textContent = 'لم يتم اختيار ملف جديد';
  document.getElementById('progCssFilename').textContent = 'لم يتم اختيار ملف جديد';
  document.getElementById('progJsFilename').textContent = 'لم يتم اختيار ملف جديد';
  switchProgTab('html');
  openModal('modalAddProgram');
  setTimeout(() => cmHtml.refresh(), 50);
}

function deleteProgram(id) {
  confirmAction('حذف البرنامج', 'هل تريد حذف هذا البرنامج الفرعي؟', () => {
    DB.programs = DB.programs.filter(x => x.id !== id);
    saveDB();
    buildSidebarPrograms();
    if (APP.currentView === 'home') renderHome();
    else navigate('programs');
    showToast('تم الحذف ✓', 'success');
  });
}

// ══════════════════════════════════════════════
//  NOTES & TODO
// ══════════════════════════════════════════════
const NOTE_COLORS = ['#3B82F622','#22C55E22','#F59E0B22','#EF444422','#A78BFA22','#EC489922','#14B8A622'];
const NOTE_BORDERS = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#A78BFA','#EC4899','#14B8A6'];

function switchNtTab(tab) {
  APP.currentNtTab = tab;
  document.querySelectorAll('.nt-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nt-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('ntTab-' + tab).classList.add('active');
  document.getElementById('ntPanel-' + tab).classList.add('active');
}

function renderNotesView() {
  renderNotesGrid();
  renderTodoList();
}

function renderNotesGrid() {
  const grid = document.getElementById('notesGrid');
  if (!grid) return;
  if (DB.notes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <i class="fas fa-note-sticky"></i>
      <h3>لا يوجد ملاحظات بعد</h3>
      <p>اكتب ملاحظتك الأولى بالأعلى</p>
    </div>`;
    return;
  }
  const sorted = [...DB.notes].sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  grid.innerHTML = sorted.map(n => {
    const idx = n.colorIdx || 0;
    return `<div class="note-card" style="background:${NOTE_COLORS[idx % NOTE_COLORS.length]};border-color:${NOTE_BORDERS[idx % NOTE_BORDERS.length]}55;">
      <div class="note-actions">
        <button onclick="editNote('${n.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
        <button onclick="deleteNote('${n.id}')" title="حذف"><i class="fas fa-trash"></i></button>
      </div>
      <p>${escHtml(n.text)}</p>
      <div class="note-date">${new Date(n.createdAt).toLocaleDateString('ar-EG')}</div>
    </div>`;
  }).join('');
}

function addQuickNote() {
  const input = document.getElementById('quickNoteInput');
  const text = input.value.trim();
  if (!text) return;
  DB.notes.push({ id: genId(), text, colorIdx: DB.notes.length % NOTE_COLORS.length, createdAt: Date.now() });
  saveDB();
  input.value = '';
  renderNotesGrid();
  if (APP.currentView === 'home') renderHomeNtWidget();
  showToast('تمت إضافة الملاحظة ✓', 'success');
}

function editNote(id) {
  const n = DB.notes.find(x => x.id === id);
  if (!n) return;
  const newText = prompt('تعديل الملاحظة:', n.text);
  if (newText === null) return;
  const trimmed = newText.trim();
  if (!trimmed) { showToast('لا يمكن ترك الملاحظة فارغة', 'error'); return; }
  n.text = trimmed;
  saveDB();
  renderNotesGrid();
  if (APP.currentView === 'home') renderHomeNtWidget();
}

function deleteNote(id) {
  confirmAction('حذف الملاحظة', 'هل تريد حذف هذه الملاحظة؟', () => {
    DB.notes = DB.notes.filter(x => x.id !== id);
    saveDB();
    renderNotesGrid();
    if (APP.currentView === 'home') renderHomeNtWidget();
    showToast('تم الحذف ✓', 'success');
  });
}

function renderTodoList() {
  const list = document.getElementById('todoList');
  if (!list) return;
  if (DB.todos.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <i class="fas fa-list-check"></i>
      <h3>لا يوجد مهام بعد</h3>
      <p>أضف مهمتك الأولى بالأعلى</p>
    </div>`;
    return;
  }
  const sorted = [...DB.todos].sort((a,b) => (a.done - b.done) || ((b.createdAt||0)-(a.createdAt||0)));
  list.innerHTML = sorted.map(t => `
    <div class="todo-item ${t.done ? 'done' : ''}">
      <div class="todo-check ${t.done ? 'done' : ''}" onclick="toggleTodo('${t.id}')"><i class="fas fa-check"></i></div>
      <div class="todo-text">${escHtml(t.text)}</div>
      <button class="todo-del" onclick="deleteTodo('${t.id}')"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}

function addQuickTodo() {
  const input = document.getElementById('quickTodoInput');
  const text = input.value.trim();
  if (!text) return;
  DB.todos.push({ id: genId(), text, done:false, createdAt: Date.now() });
  saveDB();
  input.value = '';
  renderTodoList();
  if (APP.currentView === 'home') renderHomeNtWidget();
  showToast('تمت إضافة المهمة ✓', 'success');
}

function toggleTodo(id) {
  const t = DB.todos.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveDB();
  renderTodoList();
  if (APP.currentView === 'home') renderHomeNtWidget();
}

function deleteTodo(id) {
  DB.todos = DB.todos.filter(x => x.id !== id);
  saveDB();
  renderTodoList();
  if (APP.currentView === 'home') renderHomeNtWidget();
}

function renderHomeNtWidget() {
  const el = document.getElementById('homeNtWidget');
  if (!el) return;
  const recentNotes = [...DB.notes].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0,3);
  const pendingTodos = [...DB.todos].filter(t=>!t.done).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,5);

  const notesHtml = recentNotes.length === 0
    ? `<div class="nt-widget-empty">لا يوجد ملاحظات بعد</div>`
    : recentNotes.map(n => `<div class="note-card" style="background:${NOTE_COLORS[(n.colorIdx||0) % NOTE_COLORS.length]};border-color:${NOTE_BORDERS[(n.colorIdx||0) % NOTE_BORDERS.length]}55;margin-bottom:8px;min-height:auto;padding:10px 12px;">
        <p style="font-size:.82rem;">${escHtml(n.text.length > 80 ? n.text.slice(0,80)+'…' : n.text)}</p>
      </div>`).join('');

  const todosHtml = pendingTodos.length === 0
    ? `<div class="nt-widget-empty">لا يوجد مهام معلقة 🎉</div>`
    : pendingTodos.map(t => `<div class="todo-item" style="padding:8px 10px;margin-bottom:6px;">
        <div class="todo-check" onclick="toggleTodo('${t.id}');renderHomeNtWidget();"><i class="fas fa-check"></i></div>
        <div class="todo-text" style="font-size:.85rem;">${escHtml(t.text)}</div>
      </div>`).join('');

  el.innerHTML = `
    <div class="nt-widget-card">
      <h4><i class="fas fa-note-sticky" style="color:#a78bfa;"></i> أحدث الملاحظات <span class="sec-action" style="margin-right:auto;" onclick="navigate('notes')">عرض الكل</span></h4>
      ${notesHtml}
    </div>
    <div class="nt-widget-card">
      <h4><i class="fas fa-list-check" style="color:#22c55e;"></i> المهام المعلقة <span class="sec-action" style="margin-right:auto;" onclick="navigate('notes');switchNtTab('todo')">عرض الكل</span></h4>
      ${todosHtml}
    </div>
  `;
}

// ══════════════════════════════════════════════
//  SETTINGS VIEW
// ══════════════════════════════════════════════
const THEMES = [
  { id:'github',  label:'GitHub',  bg:'#0D1117', accent:'#58A6FF', surface:'#161B22' },
  { id:'matrix',  label:'Matrix',  bg:'#010a01', accent:'#00ff41', surface:'#001800' },
  { id:'neon',    label:'Neon',    bg:'#050010', accent:'#b44dff', surface:'rgba(100,0,255,0.1)' },
  { id:'glass',   label:'Glass',   bg:'#05060f', accent:'#60a5fa', surface:'rgba(255,255,255,0.06)' },
  { id:'linux',   label:'Linux',   bg:'#2E3440', accent:'#88C0D0', surface:'#3B4252' },
  { id:'ocean',   label:'Ocean',   bg:'#010d1f', accent:'#00b4d8', surface:'#052040' },
  { id:'sunset',  label:'Sunset',  bg:'#1a0f0a', accent:'#ff7849', surface:'#2b1710' },
  { id:'forest',  label:'Forest',  bg:'#0a140d', accent:'#4ade80', surface:'#122117' },
  { id:'rose',    label:'Rose',    bg:'#1a0a12', accent:'#fb7185', surface:'#2b1220' },
  { id:'mono',    label:'Mono',    bg:'#111111', accent:'#e5e5e5', surface:'#1a1a1a' },
];

const BUILT_IN_FONTS = ['Cairo','Tajawal','IBM Plex Sans Arabic','JetBrains Mono','Inter'];

function renderSettings() {
  document.getElementById('settDisplayName').value = DB.profile.displayName || '';
  document.getElementById('settUsername').value = DB.profile.username || '';
  document.getElementById('settEmail').value = DB.profile.email || '';
  updateAvatarDisplay();

  renderThemeGrid();
  renderFontSelector();
  renderCustomFontsList();

  document.getElementById('toggleParticles').checked = DB.settings.particles;
  document.getElementById('toggleMatrix').checked = DB.settings.matrix;
  document.getElementById('toggleBubbles').checked = DB.settings.bubbles;
  document.getElementById('settDownloaderUrl').value = DB.settings.downloaderUrl || '';

  document.getElementById('bgBlurRange').value = DB.profile.bgBlur || 0;
  document.getElementById('bgBlurVal').textContent = (DB.profile.bgBlur || 0) + 'px';
  document.getElementById('bgOpacityRange').value = DB.profile.bgOpacity != null ? DB.profile.bgOpacity : 50;
  document.getElementById('bgOpacityVal').textContent = (DB.profile.bgOpacity != null ? DB.profile.bgOpacity : 50) + '%';
  refreshBgPreview();

  // Attach data-field to CT tabs and add colour dot
  const CT_FIELDS = [
    { id: 'ctBg', label: 'خلفية', default: '#0d1117' },
    { id: 'ctSurface', label: 'سطح', default: '#161b22' },
    { id: 'ctAccent', label: 'رئيسي', default: '#3b82f6' },
    { id: 'ctGold', label: 'ثانوي', default: '#f59e0b' },
    { id: 'ctText', label: 'نص', default: '#e6edf3' },
  ];
  const tabs = document.querySelectorAll('.ct-ctab');
  tabs.forEach((tab, i) => {
    const field = CT_FIELDS[i];
    if (!field) return;
    tab.setAttribute('data-field', field.id);
    const currentVal = document.getElementById(field.id).value || field.default;
    // Ensure hidden input has a value
    document.getElementById(field.id).value = currentVal;
    // Add a dot
    if (!tab.querySelector('.ct-dot')) {
      const dot = document.createElement('span');
      dot.className = 'ct-dot';
      dot.style.cssText = `width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:5px;background:${currentVal};border:1px solid rgba(255,255,255,0.3);`;
      tab.prepend(dot);
    } else {
      tab.querySelector('.ct-dot').style.background = document.getElementById(field.id).value;
    }
  });
  // Init CT RGB picker with first field (ctBg)
  _ctActiveField = 'ctBg';
  tabs[0]?.classList.add('active');
  tabs.forEach((t,i) => { if(i>0) t.classList.remove('active'); });
  initHslPicker('ct', document.getElementById('ctBg').value || '#0d1117');
  _hslRenderPresets('ct');
}

function renderThemeGrid() {
  const themeGrid = document.getElementById('themeGrid');
  const builtInHtml = THEMES.map(t => `
    <div class="theme-card ${DB.profile.theme === t.id ? 'active' : ''}" onclick="changeTheme('${t.id}')">
      <div class="theme-preview" style="background:${t.bg};">
        <div style="position:absolute;top:6px;right:6px;bottom:6px;left:6px;border-radius:6px;background:${t.surface};border:1px solid ${t.accent}44;">
          <div style="height:4px;background:${t.accent};border-radius:3px 3px 0 0;"></div>
          <div style="display:flex;gap:3px;padding:4px;">
            ${[1,2,3].map(()=>`<div style="flex:1;height:14px;border-radius:3px;background:${t.accent}22;"></div>`).join('')}
          </div>
        </div>
      </div>
      <span>${t.label}</span>
    </div>
  `).join('');

  const customHtml = DB.customThemes.map(t => `
    <div class="theme-card ${DB.profile.theme === ('custom-'+t.id) ? 'active' : ''}" onclick="changeTheme('custom-${t.id}')">
      <div class="theme-del" onclick="event.stopPropagation();deleteCustomTheme('${t.id}')" title="حذف"><i class="fas fa-times"></i></div>
      <div class="theme-preview" style="background:${t.bg};">
        <div style="position:absolute;top:6px;right:6px;bottom:6px;left:6px;border-radius:6px;background:${hexToRgba(t.surface, (t.opacity||100)/100)};border:1px solid ${t.accent}44;">
          <div style="height:4px;background:${t.accent};border-radius:3px 3px 0 0;"></div>
          <div style="display:flex;gap:3px;padding:4px;">
            ${[1,2,3].map(()=>`<div style="flex:1;height:14px;border-radius:3px;background:${t.accent}22;"></div>`).join('')}
          </div>
        </div>
      </div>
      <span>${escHtml(t.name)}</span>
    </div>
  `).join('');

  themeGrid.innerHTML = builtInHtml + customHtml;
}

// ══════════════════════════════════════════════
//  DOWNLOAD TOOL (settings-configured website, opened in iframe)
// ══════════════════════════════════════════════
function saveDownloaderUrl() {
  const val = document.getElementById('settDownloaderUrl').value.trim();
  DB.settings.downloaderUrl = val;
  saveDB();
  showToast('تم حفظ رابط أداة التحميل ✓', 'success');
}

let _downloaderTimer = null;

function openDownloader(encodedUrl) {
  const link = decodeURIComponent(encodedUrl);
  const template = (DB.settings.downloaderUrl || '').trim();
  if (!template) {
    showToast('أضف رابط أداة التحميل من الإعدادات أولاً', 'error');
    navigate('settings');
    return;
  }
  const finalUrl = template.includes('{url}')
    ? template.replace(/\{url\}/g, encodeURIComponent(link))
    : template + (template.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(link);

  copyTextToClipboard(link);

  const frame = document.getElementById('downloaderFrame');
  const loadingEl = document.getElementById('downloaderLoading');
  const fallbackEl = document.getElementById('downloaderFallback');

  fallbackEl.classList.remove('show');
  loadingEl.classList.remove('hide');
  clearTimeout(_downloaderTimer);

  frame.onload = () => {
    loadingEl.classList.add('hide');
  };
  frame.src = finalUrl;

  // Many sites block being framed (X-Frame-Options / CSP frame-ancestors);
  // the browser enforces this silently, so we can't reliably detect it —
  // surface a fallback after a reasonable timeout so the user isn't stuck
  // staring at a blank panel.
  _downloaderTimer = setTimeout(() => {
    loadingEl.classList.add('hide');
    fallbackEl.classList.add('show');
  }, 6000);

  document.getElementById('downloaderExternalBtn').onclick = () => window.open(finalUrl, '_blank', 'noopener');
  document.getElementById('downloaderModal').classList.add('show');
  showToast('تم نسخ رابط الفيديو ✓ الصقه في شريط البحث بالموقع', 'success');
}

function closeDownloaderModal() {
  clearTimeout(_downloaderTimer);
  document.getElementById('downloaderModal').classList.remove('show');
  document.getElementById('downloaderFrame').src = '';
  document.getElementById('downloaderFallback').classList.remove('show');
}

function saveProfile() {
  DB.profile.displayName = document.getElementById('settDisplayName').value.trim() || 'مستخدم';
  DB.profile.username = document.getElementById('settUsername').value.trim() || 'user';
  DB.profile.email = document.getElementById('settEmail').value.trim();
  saveDB();
  updateHeaderUser();
  showToast('تم حفظ الملف الشخصي ✓', 'success');
}

function updateHeaderUser() {
  const name = DB.profile.displayName || 'م';
  document.getElementById('topUsername').textContent = name;
  const initial = name.charAt(0);
  const avBig = document.getElementById('profileAvatarInitial');
  if (avBig) avBig.textContent = initial;
  document.getElementById('topUserAvatar').textContent = initial;
  if (DB.profile.avatar) {
    document.getElementById('topUserAvatar').style.backgroundImage = `url(${DB.profile.avatar})`;
    document.getElementById('topUserAvatar').style.backgroundSize = 'cover';
    document.getElementById('topUserAvatar').textContent = '';
  }
  document.getElementById('homeWelcomeName').textContent = DB.profile.displayName || 'مستخدم';
}

function updateAvatarDisplay() {
  const bigEl = document.getElementById('profileAvatarBig');
  const initEl = document.getElementById('profileAvatarInitial');
  if (DB.profile.avatar) {
    bigEl.style.backgroundImage = `url(${DB.profile.avatar})`;
    bigEl.style.backgroundSize = 'cover';
    if (initEl) initEl.style.display = 'none';
  } else {
    bigEl.style.backgroundImage = '';
    if (initEl) { initEl.style.display = ''; initEl.textContent = (DB.profile.displayName||'م').charAt(0); }
  }
}

function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    DB.profile.avatar = e.target.result;
    saveDB();
    updateAvatarDisplay();
    updateHeaderUser();
    showToast('تم تحديث الصورة ✓', 'success');
  };
  reader.readAsDataURL(file);
}

// (old syncColorField / syncColorHex replaced by HSL picker system)

// ══════════════════════════════════════════════
//  THEME & FONT
// ══════════════════════════════════════════════
const CUSTOM_THEME_VARS = ['--bg','--surface','--surface2','--surface3','--border','--accent','--accent-glow','--gold','--text','--muted','--ui-blur'];

function clearCustomThemeInlineStyle() {
  CUSTOM_THEME_VARS.forEach(v => document.body.style.removeProperty(v));
}

function hexToRgba(hex, alpha) {
  hex = (hex || '#000000').replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  const r = parseInt(hex.substring(0,2),16) || 0;
  const g = parseInt(hex.substring(2,4),16) || 0;
  const b = parseInt(hex.substring(4,6),16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function changeTheme(themeId) {
  if (themeId.startsWith('custom-')) {
    const cid = themeId.slice(7);
    const theme = DB.customThemes.find(t => t.id === cid);
    if (!theme) return;
    applyCustomTheme(theme);
  } else {
    clearCustomThemeInlineStyle();
    document.body.setAttribute('data-theme', themeId);
  }
  DB.profile.theme = themeId;
  saveDB();
  renderThemeGrid();
}

function applyCustomTheme(theme) {
  document.body.setAttribute('data-theme', 'custom-' + theme.id);
  const alpha = (theme.opacity != null ? theme.opacity : 100) / 100;
  document.body.style.setProperty('--bg', theme.bg);
  document.body.style.setProperty('--surface', hexToRgba(theme.surface, alpha));
  document.body.style.setProperty('--surface2', hexToRgba(theme.surface, Math.min(1, alpha + 0.06)));
  document.body.style.setProperty('--surface3', hexToRgba(theme.surface, Math.min(1, alpha + 0.12)));
  document.body.style.setProperty('--border', hexToRgba(theme.accent, 0.3));
  document.body.style.setProperty('--accent', theme.accent);
  document.body.style.setProperty('--accent-glow', hexToRgba(theme.accent, 0.25));
  document.body.style.setProperty('--gold', theme.gold);
  document.body.style.setProperty('--text', theme.text);
  document.body.style.setProperty('--muted', hexToRgba(theme.text, 0.55));
  document.body.style.setProperty('--ui-blur', (theme.blur || 0) + 'px');
}

function saveCustomTheme() {
  const name = document.getElementById('ctName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم الثيم', 'error'); return; }
  const theme = {
    id: genId(),
    name,
    bg: document.getElementById('ctBg').value,
    surface: document.getElementById('ctSurface').value,
    accent: document.getElementById('ctAccent').value,
    gold: document.getElementById('ctGold').value,
    text: document.getElementById('ctText').value,
    opacity: parseInt(document.getElementById('ctOpacity').value, 10),
    blur: parseInt(document.getElementById('ctBlur').value, 10),
  };
  DB.customThemes.push(theme);
  DB.profile.theme = 'custom-' + theme.id;
  saveDB();
  applyCustomTheme(theme);
  renderThemeGrid();
  document.getElementById('ctName').value = '';
  showToast('تم إنشاء وتطبيق الثيم ✓', 'success');
}

function deleteCustomTheme(id) {
  confirmAction('حذف الثيم', 'هل تريد حذف هذا الثيم المخصص؟', () => {
    const wasActive = DB.profile.theme === ('custom-' + id);
    DB.customThemes = DB.customThemes.filter(t => t.id !== id);
    saveDB();
    if (wasActive) changeTheme('github');
    else renderThemeGrid();
    showToast('تم الحذف ✓', 'success');
  });
}

function changeFont(fontName) {
  document.body.style.fontFamily = `'${fontName}', sans-serif`;
  document.documentElement.style.setProperty('--font', `'${fontName}', sans-serif`);
  DB.profile.font = fontName;
  saveDB();
}

function renderFontSelector() {
  const sel = document.getElementById('fontSelector');
  if (!sel) return;
  let html = BUILT_IN_FONTS.map(f => `<option value="${f}">${f}</option>`).join('');
  DB.customFonts.forEach(f => { html += `<option value="${escHtml(f)}">${escHtml(f)} (مستورد)</option>`; });
  sel.innerHTML = html;
  sel.value = DB.profile.font || 'Cairo';
}

// ══════════════════════════════════════════════
//  GOOGLE FONTS IMPORT
// ══════════════════════════════════════════════
function loadGoogleFont(name) {
  const id = 'gfont-' + name.replace(/\s+/g, '-');
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g,'+')}:wght@300;400;500;700;900&display=swap`;
  document.head.appendChild(link);
}

function importGoogleFont() {
  const input = document.getElementById('gfontName');
  const name = input.value.trim();
  if (!name) { showToast('من فضلك اكتب اسم الخط', 'error'); return; }
  loadGoogleFont(name);
  if (!DB.customFonts.includes(name)) DB.customFonts.push(name);
  saveDB();
  renderFontSelector();
  renderCustomFontsList();
  changeFont(name);
  input.value = '';
  showToast('تم استيراد الخط وتطبيقه ✓ (قد يستغرق ثوانٍ للتحميل)', 'success');
}

function renderCustomFontsList() {
  const el = document.getElementById('customFontsList');
  if (!el) return;
  if (DB.customFonts.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = DB.customFonts.map(f => `
    <span class="custom-font-chip" style="font-family:'${f}',sans-serif;">
      ${escHtml(f)}
      <button onclick="removeCustomFont('${escHtml(f).replace(/'/g,"\\'")}')" title="حذف"><i class="fas fa-times"></i></button>
    </span>
  `).join('');
}

function removeCustomFont(name) {
  DB.customFonts = DB.customFonts.filter(f => f !== name);
  if (DB.profile.font === name) changeFont('Cairo');
  saveDB();
  renderFontSelector();
  renderCustomFontsList();
}

// ══════════════════════════════════════════════
//  APP BACKGROUND IMAGE
// ══════════════════════════════════════════════
function applyBgImage() {
  const imgEl = document.getElementById('appBgImage');
  const overlayEl = document.getElementById('appBgOverlay');
  if (DB.profile.backgroundImage) {
    imgEl.style.backgroundImage = `url(${DB.profile.backgroundImage})`;
    imgEl.style.filter = `blur(${DB.profile.bgBlur || 0}px)`;
    imgEl.classList.add('active');
    overlayEl.style.setProperty('--bg-overlay-opacity', 1 - (DB.profile.bgOpacity != null ? DB.profile.bgOpacity : 50) / 100);
    overlayEl.classList.add('active');
  } else {
    imgEl.classList.remove('active');
    overlayEl.classList.remove('active');
    imgEl.style.backgroundImage = '';
  }
}

function refreshBgPreview() {
  const preview = document.getElementById('bgPreviewWrap');
  if (!preview) return;
  if (DB.profile.backgroundImage) {
    preview.innerHTML = `<img src="${DB.profile.backgroundImage}"><button class="bg-preview-remove" onclick="removeBgImage()" title="إزالة"><i class="fas fa-times"></i></button>`;
  } else {
    preview.innerHTML = `<span>لا توجد خلفية مختارة</span>`;
  }
}

function handleBgImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    DB.profile.backgroundImage = e.target.result;
    saveDB();
    applyBgImage();
    refreshBgPreview();
    showToast('تم رفع صورة الخلفية ✓', 'success');
  };
  reader.readAsDataURL(file);
}

function removeBgImage() {
  DB.profile.backgroundImage = null;
  saveDB();
  applyBgImage();
  refreshBgPreview();
  showToast('تم إزالة الخلفية', 'success');
}

function updateBgBlur(val) {
  DB.profile.bgBlur = parseInt(val, 10);
  document.getElementById('bgBlurVal').textContent = val + 'px';
  saveDB();
  applyBgImage();
}

function updateBgOpacity(val) {
  DB.profile.bgOpacity = parseInt(val, 10);
  document.getElementById('bgOpacityVal').textContent = val + '%';
  saveDB();
  applyBgImage();
}

// ══════════════════════════════════════════════
//  BACKGROUND EFFECTS — particles / matrix rain / bubbles
// ══════════════════════════════════════════════
let particleAnim, matrixAnim, bubbleAnim;

function toggleParticlesEffect(on) {
  DB.settings.particles = on;
  saveDB();
  const canvas = document.getElementById('bgCanvas');
  if (on) {
    canvas.classList.add('active');
    startParticles();
  } else {
    canvas.classList.remove('active');
    if (particleAnim) { cancelAnimationFrame(particleAnim); particleAnim = null; }
  }
}

function startParticles() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const N = 60;
  for (let i = 0; i < N; i++) {
    particles.push({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.4, vy: (Math.random()-.5)*.4,
      r: Math.random()*2+1,
    });
  }

  function draw() {
    if (!DB.settings.particles) return;
    ctx.clearRect(0,0,W,H);
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3B82F6';
    ctx.fillStyle = accent + '88';
    ctx.strokeStyle = accent + '33';
    ctx.lineWidth = 1;

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i+1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d < 120) {
          ctx.globalAlpha = 1 - d/120;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    particleAnim = requestAnimationFrame(draw);
  }
  draw();
}

function toggleMatrixEffect(on) {
  DB.settings.matrix = on;
  saveDB();
  const canvas = document.getElementById('matrixCanvas');
  if (on) {
    canvas.classList.add('active');
    startMatrixRain();
  } else {
    canvas.classList.remove('active');
    if (matrixAnim) { cancelAnimationFrame(matrixAnim); matrixAnim = null; }
  }
}

function startMatrixRain() {
  const canvas = document.getElementById('matrixCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, drops = [];
  const chars = 'アイウエオカキクケコ01アBCDEFGHIJK';
  const fontSize = 14;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    const cols = Math.floor(W / fontSize);
    drops = Array(cols).fill(1);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    if (!DB.settings.matrix) return;
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#00ff41';
    ctx.font = fontSize + 'px monospace';
    drops.forEach((y, i) => {
      const ch = chars[Math.floor(Math.random()*chars.length)];
      ctx.fillText(ch, i*fontSize, y*fontSize);
      if (y*fontSize > H && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    });
    matrixAnim = requestAnimationFrame(draw);
  }
  draw();
}

function toggleBubblesEffect(on) {
  DB.settings.bubbles = on;
  saveDB();
  const canvas = document.getElementById('bubbleCanvas');
  if (on) {
    canvas.classList.add('active');
    startBubbles();
  } else {
    canvas.classList.remove('active');
    if (bubbleAnim) { cancelAnimationFrame(bubbleAnim); bubbleAnim = null; }
  }
}

function startBubbles() {
  const canvas = document.getElementById('bubbleCanvas');
  const ctx = canvas.getContext('2d');
  let W, H, bubbles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function makeBubble(startAtBottom) {
    return {
      x: Math.random()*W,
      y: startAtBottom ? H + Math.random()*100 : Math.random()*H,
      r: Math.random()*26 + 8,
      vy: -(Math.random()*0.5 + 0.15),
      vx: (Math.random()-.5)*0.3,
      alpha: Math.random()*0.25 + 0.08,
      useGold: Math.random() > 0.6,
    };
  }

  const N = 22;
  for (let i = 0; i < N; i++) bubbles.push(makeBubble(false));

  function draw() {
    if (!DB.settings.bubbles) return;
    ctx.clearRect(0,0,W,H);
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3B82F6';
    const gold = getComputedStyle(document.body).getPropertyValue('--gold').trim() || '#F59E0B';

    bubbles.forEach(b => {
      b.y += b.vy;
      b.x += b.vx;
      if (b.y < -b.r*2) Object.assign(b, makeBubble(true));
      if (b.x < -b.r) b.x = W + b.r;
      if (b.x > W + b.r) b.x = -b.r;

      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      const color = b.useGold ? gold : accent;
      grad.addColorStop(0, color + Math.round(b.alpha*255).toString(16).padStart(2,'0'));
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.fill();
    });

    bubbleAnim = requestAnimationFrame(draw);
  }
  draw();
}

// ══════════════════════════════════════════════
//  CATEGORY CRUD
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
//  RGB COLOR PICKER  (shared by cat + custom-theme)
// ══════════════════════════════════════════════
const HSL_PRESETS = [
  '#3B82F6','#22C55E','#F59E0B','#EF4444','#A78BFA',
  '#EC4899','#14B8A6','#F97316','#06B6D4','#84CC16',
  '#0D1117','#161B22','#FFFFFF','#6366F1','#FF7849',
];

// Per-picker state: { r, g, b } (0-255)
const HSL_STATE = {};

// RGB -> HEX
function rgbToHex(r, g, b) {
  return ((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1).toUpperCase();
}

// HEX -> RGB
function hexToRgb(hex) {
  hex = hex.replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  return {
    r: parseInt(hex.slice(0,2),16) || 0,
    g: parseInt(hex.slice(2,4),16) || 0,
    b: parseInt(hex.slice(4,6),16) || 0
  };
}

// Initialise or refresh the RGB picker for prefix 'cat' or 'ct'
function initHslPicker(prefix, hexColor) {
  hexColor = (hexColor || '#3B82F6');
  const rgb = hexToRgb(hexColor);
  HSL_STATE[prefix] = rgb;
  _hslRefreshUI(prefix);
  _hslRenderPresets(prefix);
}

function hslChanged(prefix) {
  const r = parseInt(document.getElementById(prefix+'H').value, 10);
  const g = parseInt(document.getElementById(prefix+'S').value, 10);
  const b = parseInt(document.getElementById(prefix+'L').value, 10);
  const aEl = document.getElementById(prefix+'A');
  const a = aEl ? parseInt(aEl.value, 10) : 100;
  HSL_STATE[prefix] = { r, g, b, a };
  _hslRefreshUI(prefix);
}

function hexInpChanged(prefix) {
  const raw = document.getElementById(prefix+'HexInp').value.replace(/[^0-9A-Fa-f]/g,'');
  if (raw.length === 6) {
    const rgb = hexToRgb(raw);
    HSL_STATE[prefix] = rgb;
    _hslRefreshUI(prefix, true);
  }
}
function hexInpBlur(prefix) {
  const state = HSL_STATE[prefix] || {r:59,g:130,b:246};
  document.getElementById(prefix+'HexInp').value = rgbToHex(state.r, state.g, state.b);
}

function hslRandom(prefix) {
  HSL_STATE[prefix] = {
    r: Math.floor(Math.random()*256),
    g: Math.floor(Math.random()*256),
    b: Math.floor(Math.random()*256),
  };
  _hslRefreshUI(prefix);
}

function _hslRefreshUI(prefix, skipHexInp) {
  const state = HSL_STATE[prefix] || {r:59,g:130,b:246,a:100};
  const {r,g,b} = state;
  const a = (state.a != null) ? state.a : 100;
  const hex = rgbToHex(r,g,b);
  const alphaFrac = a / 100;

  // sliders
  document.getElementById(prefix+'H').value = r;
  document.getElementById(prefix+'S').value = g;
  document.getElementById(prefix+'L').value = b;
  const aEl = document.getElementById(prefix+'A');
  if (aEl) aEl.value = a;

  // labels (R/G/B/A values)
  document.getElementById(prefix+'HLabel').textContent = r;
  document.getElementById(prefix+'SLabel').textContent = g;
  document.getElementById(prefix+'LLabel').textContent = b;
  const aLblEl = document.getElementById(prefix+'ALabel');
  if (aLblEl) aLblEl.textContent = a;

  // swatch — show rgba
  const swatchEl = document.getElementById(prefix+'HslSwatch');
  const neonActive = document.getElementById(prefix+'NeonBtn')?.classList.contains('active');
  if (swatchEl) {
    swatchEl.style.background = `rgba(${r},${g},${b},${alphaFrac})`;
    if (neonActive) swatchEl.style.boxShadow = `0 0 14px rgba(${r},${g},${b},0.8), 0 0 28px rgba(${r},${g},${b},0.4)`;
    else swatchEl.style.boxShadow = '';
  }

  // hex + rgb display
  const hexValEl = document.getElementById(prefix+'HslHexVal');
  const rgbValEl = document.getElementById(prefix+'HslRgbVal');
  if (hexValEl) hexValEl.textContent = '#' + hex;
  if (rgbValEl) rgbValEl.textContent = a < 100 ? `rgba(${r},${g},${b},${alphaFrac.toFixed(2)})` : `rgb(${r},${g},${b})`;

  // hex text input
  if (!skipHexInp) {
    const hexInp = document.getElementById(prefix+'HexInp');
    if (hexInp) hexInp.value = hex;
  }

  // Update slider track gradients dynamically
  const rSlider = document.getElementById(prefix+'H');
  if (rSlider) rSlider.style.background = `linear-gradient(90deg, rgb(0,${g},${b}), rgb(255,${g},${b}))`;
  const gSlider = document.getElementById(prefix+'S');
  if (gSlider) gSlider.style.background = `linear-gradient(90deg, rgb(${r},0,${b}), rgb(${r},255,${b}))`;
  const bSlider = document.getElementById(prefix+'L');
  if (bSlider) bSlider.style.background = `linear-gradient(90deg, rgb(${r},${g},0), rgb(${r},${g},255))`;
  if (aEl) aEl.style.background = `linear-gradient(90deg, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1))`;

  // Propagate to the actual color used in saving
  if (prefix === 'cat') {
    const alphaFracCat = a / 100;
    selectedCatColor = a < 100 ? `rgba(${r},${g},${b},${alphaFracCat.toFixed(2)})` : '#' + hex;
    // Neon: stored separately
    const neonEl = document.getElementById('catNeonBtn');
    if (neonEl && neonEl.classList.contains('active')) {
      selectedCatNeon = { r, g, b };
    }
  } else if (prefix === 'ct') {
    const activeTab = document.querySelector('.ct-ctab.active');
    if (activeTab) {
      const fieldId = activeTab.getAttribute('data-field');
      if (fieldId) {
        document.getElementById(fieldId).value = '#' + hex;
        const dot = activeTab.querySelector('.ct-dot');
        if (dot) dot.style.background = '#' + hex;
      }
    }
  }
}

// ── Neon toggle ──
function toggleNeon(prefix) {
  const btn = document.getElementById(prefix+'NeonBtn');
  if (!btn) return;
  btn.classList.toggle('active');
  // Refresh swatch to show/hide glow
  _hslRefreshUI(prefix, true);
}

// ── Get final RGBA color string from picker state ──
function hslGetColor(prefix) {
  const state = HSL_STATE[prefix] || {r:59,g:130,b:246,a:100};
  const {r,g,b} = state;
  const a = (state.a != null) ? state.a : 100;
  const hex = rgbToHex(r,g,b);
  const neonActive = document.getElementById(prefix+'NeonBtn')?.classList.contains('active');
  if (a < 100) return `rgba(${r},${g},${b},${(a/100).toFixed(2)})`;
  return '#' + hex;
}

function _hslRenderPresets(prefix) {
  const row = document.getElementById(prefix+'PresetRow');
  if (!row) return;
  row.innerHTML = HSL_PRESETS.map(c =>
    `<div class="hsl-preset" style="background:${c};" title="${c}" onclick="hslSetFromHex('${prefix}','${c}')"></div>`
  ).join('');
}

function hslSetFromHex(prefix, hex) {
  const rgb = hexToRgb(hex);
  HSL_STATE[prefix] = rgb;
  _hslRefreshUI(prefix);
}

// ── Custom theme: tabbed color switcher ──
let _ctActiveField = 'ctBg';

function switchCtColor(fieldId, btn) {
  _ctActiveField = fieldId;
  document.querySelectorAll('.ct-ctab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // load current value of that field into the picker
  const hex = document.getElementById(fieldId).value || '#000000';
  initHslPicker('ct', hex);
}

// ── Category CRUD ──
const CAT_ICONS = ['fa-book','fa-flask','fa-atom','fa-calculator','fa-globe','fa-code','fa-music','fa-palette','fa-camera','fa-film','fa-language','fa-microscope','fa-robot','fa-rocket','fa-star','fa-heart','fa-bolt','fa-leaf','fa-mountain','fa-chess','fa-graduation-cap','fa-pencil','fa-laptop','fa-database'];

let selectedCatColor = '#3B82F6';
let selectedCatNeon = null;
let selectedCatIcon = CAT_ICONS[0];

function openAddCategoryModal(parentId) {
  document.getElementById('editCatId').value = '';
  document.getElementById('newCatParent').value = parentId || '';
  document.getElementById('newCatName').value = '';
  document.getElementById('newCatDesc').value = '';
  document.getElementById('addCatModalTitle').textContent = parentId ? 'تصنيف فرعي جديد' : 'تصنيف جديد';
  selectedCatColor = '#3B82F6';
  selectedCatNeon = null;
  selectedCatIcon = CAT_ICONS[0];
  renderIconPicker();
  initHslPicker('cat', selectedCatColor);
  _hslRenderPresets('cat');
  // Reset neon button
  const neonBtn = document.getElementById('catNeonBtn');
  if (neonBtn) neonBtn.classList.remove('active');
  openModal('modalAddCategory');
}

function renderIconPicker() {
  document.getElementById('catIconPicker').innerHTML = CAT_ICONS.map(ic =>
    `<div class="icon-opt ${ic===selectedCatIcon?'selected':''}" onclick="selectIcon('${ic}')"><i class="fas ${ic}"></i></div>`
  ).join('');
}

function selectIcon(ic) {
  selectedCatIcon = ic;
  renderIconPicker();
}

function saveCategory() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم التصنيف', 'error'); return; }
  const editId = document.getElementById('editCatId').value;
  const parentId = document.getElementById('newCatParent').value || null;
  const desc = document.getElementById('newCatDesc').value.trim();

  if (editId) {
    const cat = DB.categories.find(c => c.id === editId);
    if (cat) {
      cat.name = name; cat.desc = desc;
      cat.color = selectedCatColor; cat.icon = selectedCatIcon; cat.neon = selectedCatNeon;
    }
    showToast('تم تعديل التصنيف ✓', 'success');
  } else {
    DB.categories.push({ id:genId(), name, desc, color:selectedCatColor, neon:selectedCatNeon, icon:selectedCatIcon, parentId, createdAt:Date.now() });
    showToast('تم إضافة التصنيف ✓', 'success');
  }
  saveDB();
  closeModal('modalAddCategory');
  buildSidebarCats();
  if (APP.currentView === 'home') renderHome();
  else if (APP.currentView === 'category') renderCategoryView(APP.currentCatId);
}

function editCategory(catId) {
  const cat = DB.categories.find(c => c.id === catId);
  if (!cat) return;
  document.getElementById('editCatId').value = cat.id;
  document.getElementById('newCatParent').value = cat.parentId || '';
  document.getElementById('newCatName').value = cat.name;
  document.getElementById('newCatDesc').value = cat.desc || '';
  document.getElementById('addCatModalTitle').textContent = 'تعديل التصنيف';
  selectedCatColor = cat.color || '#3B82F6';
  selectedCatIcon = cat.icon || CAT_ICONS[0];
  renderIconPicker();
  initHslPicker('cat', selectedCatColor);
  _hslRenderPresets('cat');
  openModal('modalAddCategory');
}

function deleteCategory(catId) {
  confirmAction('حذف التصنيف', 'هل تريد حذف هذا التصنيف وكل محتوياته؟ لا يمكن التراجع.', () => {
    deleteCatRecursive(catId);
    saveDB();
    buildSidebarCats();
    navigate('home');
    showToast('تم حذف التصنيف', 'success');
  });
}

function deleteCatRecursive(catId) {
  const children = DB.categories.filter(c => c.parentId === catId);
  children.forEach(c => deleteCatRecursive(c.id));
  DB.categories = DB.categories.filter(c => c.id !== catId);
  DB.links = DB.links.filter(l => l.catId !== catId);
}

// ══════════════════════════════════════════════
//  LINK CRUD
// ══════════════════════════════════════════════
let ytFetchDebounce;

function openAddLinkModal(catId) {
  document.getElementById('editLinkId').value = '';
  document.getElementById('addLinkModalTitle').textContent = 'إضافة رابط';
  document.getElementById('ytUrl').value = '';
  document.getElementById('ytTitle').value = '';
  document.getElementById('ytNotes').value = '';
  document.getElementById('plUrl').value = '';
  document.getElementById('plTitle').value = '';
  document.getElementById('plDesc').value = '';
  document.getElementById('wsUrl').value = '';
  document.getElementById('wsTitle').value = '';
  document.getElementById('wsDesc').value = '';

  switchLinkType('youtube');
  populateCatSelect('linkCatSelect', catId);
  openModal('modalAddLink');
}

function populateCatSelect(selectId, selectedId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">— اختر التصنيف —</option>';
  function addOpts(cats, depth) {
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = '　'.repeat(depth) + cat.name;
      if (cat.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
      const children = DB.categories.filter(c => c.parentId === cat.id);
      addOpts(children, depth + 1);
    });
  }
  addOpts(DB.categories.filter(c => !c.parentId), 0);
}

function switchLinkType(type) {
  APP.currentLinkType = type;
  document.querySelectorAll('#modalAddLink .type-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#modalAddLink .type-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + type).classList.add('active');
  document.getElementById('panel-' + type).classList.add('active');
}

function debounceYtFetch() {
  clearTimeout(ytFetchDebounce);
  ytFetchDebounce = setTimeout(fetchYtTitle, 800);
}

async function fetchYtTitle() {
  const url = document.getElementById('ytUrl').value.trim();
  if (!url) return;
  const vid = extractYtId(url);
  if (!vid) return;
  document.getElementById('ytLoader').style.display = 'flex';
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${vid}&format=json`);
    if (res.ok) {
      const data = await res.json();
      document.getElementById('ytTitle').value = data.title || '';
    }
  } catch(e) {}
  document.getElementById('ytLoader').style.display = 'none';
}

function saveLink() {
  const type = APP.currentLinkType;
  const catId = document.getElementById('linkCatSelect').value || null;
  let title, url, desc, notes;

  if (type === 'youtube') {
    url = document.getElementById('ytUrl').value.trim();
    title = document.getElementById('ytTitle').value.trim();
    notes = document.getElementById('ytNotes').value.trim();
    if (!url || !title) { showToast('الرجاء إدخال الرابط والعنوان', 'error'); return; }
  } else if (type === 'playlist') {
    url = document.getElementById('plUrl').value.trim();
    title = document.getElementById('plTitle').value.trim();
    desc = document.getElementById('plDesc').value.trim();
    if (!url || !title) { showToast('الرجاء إدخال الرابط والعنوان', 'error'); return; }
  } else {
    url = document.getElementById('wsUrl').value.trim();
    title = document.getElementById('wsTitle').value.trim();
    desc = document.getElementById('wsDesc').value.trim();
    if (!url || !title) { showToast('الرجاء إدخال الرابط والعنوان', 'error'); return; }
  }

  const editId = document.getElementById('editLinkId').value;
  if (editId) {
    const link = DB.links.find(l => l.id === editId);
    if (link) { link.title=title; link.url=url; link.catId=catId||link.catId; link.notes=notes; link.desc=desc; link.type=type; }
    showToast('تم تعديل الرابط ✓', 'success');
  } else {
    DB.links.push({ id:genId(), type, title, url, catId, notes:notes||'', desc:desc||'', createdAt:Date.now() });
    showToast('تم إضافة الرابط ✓', 'success');
  }
  saveDB();
  closeModal('modalAddLink');
  if (APP.currentView === 'home') renderHome();
  else if (APP.currentView === 'category') renderCategoryView(APP.currentCatId);
}

function editLink(linkId) {
  const link = DB.links.find(l => l.id === linkId);
  if (!link) return;
  document.getElementById('editLinkId').value = link.id;
  document.getElementById('addLinkModalTitle').textContent = 'تعديل الرابط';
  switchLinkType(link.type);
  if (link.type === 'youtube') {
    document.getElementById('ytUrl').value = link.url;
    document.getElementById('ytTitle').value = link.title;
    document.getElementById('ytNotes').value = link.notes || '';
  } else if (link.type === 'playlist') {
    document.getElementById('plUrl').value = link.url;
    document.getElementById('plTitle').value = link.title;
    document.getElementById('plDesc').value = link.desc || '';
  } else {
    document.getElementById('wsUrl').value = link.url;
    document.getElementById('wsTitle').value = link.title;
    document.getElementById('wsDesc').value = link.desc || '';
  }
  populateCatSelect('linkCatSelect', link.catId);
  openModal('modalAddLink');
}

function deleteLink(linkId) {
  confirmAction('حذف الرابط', 'هل تريد حذف هذا الرابط؟', () => {
    DB.links = DB.links.filter(l => l.id !== linkId);
    saveDB();
    if (APP.currentView === 'home') renderHome();
    else if (APP.currentView === 'category') renderCategoryView(APP.currentCatId);
    showToast('تم الحذف ✓', 'success');
  });
}

// ══════════════════════════════════════════════
//  CLOUD CRUD
// ══════════════════════════════════════════════
function openAddCloudModal() {
  document.getElementById('editCloudId').value = '';
  document.getElementById('cloudType').value = 'drive';
  document.getElementById('cloudName').value = '';
  document.getElementById('cloudUrl').value = '';
  document.getElementById('cloudDesc').value = '';
  openModal('modalAddCloud');
}

function saveCloud() {
  const name = document.getElementById('cloudName').value.trim();
  const url = document.getElementById('cloudUrl').value.trim();
  if (!name || !url) { showToast('الرجاء إدخال الاسم والرابط', 'error'); return; }
  const editId = document.getElementById('editCloudId').value;
  const item = {
    type: document.getElementById('cloudType').value,
    name, url,
    desc: document.getElementById('cloudDesc').value.trim(),
  };
  if (editId) {
    const idx = DB.cloud.findIndex(c => c.id === editId);
    if (idx > -1) DB.cloud[idx] = { ...DB.cloud[idx], ...item };
    showToast('تم التعديل ✓', 'success');
  } else {
    DB.cloud.push({ id:genId(), ...item, createdAt:Date.now() });
    showToast('تمت الإضافة ✓', 'success');
  }
  saveDB();
  closeModal('modalAddCloud');
  if (APP.currentView === 'cloud') renderCloud();
}

function editCloud(id) {
  const item = DB.cloud.find(c => c.id === id);
  if (!item) return;
  document.getElementById('editCloudId').value = id;
  document.getElementById('cloudType').value = item.type;
  document.getElementById('cloudName').value = item.name;
  document.getElementById('cloudUrl').value = item.url;
  document.getElementById('cloudDesc').value = item.desc || '';
  openModal('modalAddCloud');
}

function deleteCloud(id) {
  confirmAction('حذف الرابط السحابي', 'هل تريد حذف هذا الرابط؟', () => {
    DB.cloud = DB.cloud.filter(c => c.id !== id);
    saveDB();
    renderCloud();
    showToast('تم الحذف ✓', 'success');
  });
}

// ══════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════
let searchDebounce;
function handleSearch(q) {
  clearTimeout(searchDebounce);
  if (!q.trim()) { if (APP.currentView === 'search') navigate('home'); return; }
  searchDebounce = setTimeout(() => doSearch(q.trim()), 300);
}

function doSearch(q) {
  const ql = q.toLowerCase();
  const matchCats = DB.categories.filter(c => c.name.toLowerCase().includes(ql) || (c.desc||'').toLowerCase().includes(ql));
  const matchLinks = DB.links.filter(l => l.title.toLowerCase().includes(ql) || l.url.toLowerCase().includes(ql) || (l.notes||'').toLowerCase().includes(ql));
  const matchCloud = DB.cloud.filter(c => c.name.toLowerCase().includes(ql) || (c.desc||'').toLowerCase().includes(ql));
  const matchPrograms = DB.programs.filter(p => p.name.toLowerCase().includes(ql) || (p.desc||'').toLowerCase().includes(ql));
  const matchNotes = DB.notes.filter(n => n.text.toLowerCase().includes(ql));

  navigate('search');
  const el = document.getElementById('searchResults');
  let html = '';

  if (matchCats.length) {
    html += `<div class="sec-heading"><i class="fas fa-folder" style="color:var(--gold);"></i> تصنيفات (${matchCats.length})</div>`;
    html += `<div class="cat-grid" style="margin-bottom:24px;">${matchCats.map(cat => `
      <div class="cat-card" onclick="navigate('category','${cat.id}')">
        <div class="cat-icon" style="background:${cat.color||'var(--accent)'}"><i class="fas ${cat.icon||'fa-folder'}"></i></div>
        <div class="cat-name">${highlight(escHtml(cat.name), q)}</div>
      </div>`).join('')}</div>`;
  }

  if (matchLinks.length) {
    html += `<div class="sec-heading"><i class="fas fa-link" style="color:var(--accent);"></i> روابط (${matchLinks.length})</div>`;
    html += `<div class="items-list" style="margin-bottom:24px;">${matchLinks.map(l => renderLinkRow(l, true)).join('')}</div>`;
  }

  if (matchPrograms.length) {
    html += `<div class="sec-heading"><i class="fas fa-cubes" style="color:#f59e0b;"></i> برامج فرعية (${matchPrograms.length})</div>`;
    html += `<div class="cloud-grid" style="margin-bottom:24px;">${matchPrograms.map(p => `
      <div class="cloud-card">
        <div class="cloud-card-icon"><i class="fas fa-cube" style="color:#f59e0b;"></i></div>
        <h4>${highlight(escHtml(p.name), q)}</h4>
        <p>${escHtml(p.desc||'')}</p>
        <button class="btn btn-primary btn-sm" onclick="navigate('program-run','${p.id}')"><i class="fas fa-play"></i> تشغيل</button>
      </div>`).join('')}</div>`;
  }


  if (matchNotes.length) {
    html += `<div class="sec-heading"><i class="fas fa-note-sticky" style="color:#a78bfa;"></i> ملاحظات (${matchNotes.length})</div>`;
    html += `<div class="notes-grid" style="margin-bottom:24px;">${matchNotes.map(n => `
      <div class="note-card" style="background:${NOTE_COLORS[(n.colorIdx||0) % NOTE_COLORS.length]};border-color:${NOTE_BORDERS[(n.colorIdx||0) % NOTE_BORDERS.length]}55;" onclick="navigate('notes')">
        <p>${highlight(escHtml(n.text), q)}</p>
      </div>`).join('')}</div>`;
  }

  if (matchCloud.length) {
    html += `<div class="sec-heading"><i class="fas fa-cloud" style="color:#4285f4;"></i> ملفات سحابية (${matchCloud.length})</div>`;
    html += `<div class="cloud-grid">${matchCloud.map(c => `
      <div class="cloud-card">
        <div class="cloud-card-icon"><i class="fab fa-${c.type==='drive'?'google-drive':c.type==='dropbox'?'dropbox':'cloud'}" style="color:${c.type==='drive'?'#4285f4':'#0061ff'};font-size:1.8rem;"></i></div>
        <h4>${highlight(escHtml(c.name), q)}</h4>
        <p>${escHtml(c.desc||'')}</p>
        <a href="${escHtml(c.url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm"><i class="fas fa-external-link-alt"></i> فتح</a>
      </div>`).join('')}</div>`;
  }

  if (!matchCats.length && !matchLinks.length && !matchCloud.length && !matchPrograms.length && !matchNotes.length) {
    html = `<div class="empty-state"><i class="fas fa-search"></i><h3>لا توجد نتائج</h3><p>جرب كلمات بحث أخرى</p></div>`;
  }
  el.innerHTML = html;
}

function highlight(text, q) {
  if (!q) return text;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
  return text.replace(re, '<span class="search-highlight">$1</span>');
}

// ══════════════════════════════════════════════
//  EXPORT / IMPORT
// ══════════════════════════════════════════════
function exportData() {
  const data = {
    version: 4,
    exportDate: new Date().toISOString(),
    profile: { ...DB.profile, avatar: null },
    categories: DB.categories,
    links: DB.links,
    cloud: DB.cloud,
    programs: DB.programs,
    notes: DB.notes,
    todos: DB.todos,
    customThemes: DB.customThemes,
    customFonts: DB.customFonts,
    settings: DB.settings,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `outerschool-backup-${new Date().toLocaleDateString('ar')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('تم التصدير بنجاح ✓', 'success');
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      confirmAction('استيراد البيانات', 'سيتم استبدال كل البيانات الحالية. هل تريد المتابعة؟', () => {
        if (data.categories) DB.categories = data.categories;
        if (data.links) DB.links = data.links;
        if (data.cloud) DB.cloud = data.cloud;
        if (data.programs) DB.programs = data.programs.map(p => p.files ? p : { id:p.id, name:p.name, desc:p.desc, files:{html:p.html||'',css:'',js:''}, createdAt:p.createdAt });
        if (data.notes) DB.notes = data.notes;
        if (data.todos) DB.todos = data.todos;
        if (data.customThemes) DB.customThemes = data.customThemes;
        if (data.customFonts) DB.customFonts = data.customFonts;
        if (data.settings) DB.settings = data.settings;
        if (data.profile) { DB.profile = { ...DB.profile, ...data.profile }; }
        saveDB();
        location.reload();
      });
    } catch(e) {
      showToast('ملف JSON غير صالح', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('importDropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file || !file.name.endsWith('.json')) { showToast('الرجاء رفع ملف JSON', 'error'); return; }
  const fakeInput = { files: [file] };
  importData(fakeInput);
}

function clearAllData() {
  confirmAction('مسح كل البيانات', 'سيتم حذف كل التصنيفات والروابط والبرامج والملفات والملاحظات والإعدادات. هذا الإجراء لا يمكن التراجع عنه!', () => {
    idbDel(IDB_KEY).finally(() => location.reload());
  });
}

// ══════════════════════════════════════════════
//  MODAL UTILITIES
// ══════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('show'); });
  });
  document.getElementById('videoModal').addEventListener('click', e => {
    if (e.target.id === 'videoModal') closeVideoModal();
  });
  document.getElementById('downloaderModal').addEventListener('click', e => {
    if (e.target.id === 'downloaderModal') closeDownloaderModal();
  });
});

function confirmAction(title, msg, callback) {
  document.getElementById('confirmTitle').innerHTML = `<i class="fas fa-exclamation-triangle" style="color:var(--danger);"></i> ${escHtml(title)}`;
  document.getElementById('confirmMsg').textContent = msg;
  const btn = document.getElementById('confirmOkBtn');
  btn.onclick = () => { closeModal('modalConfirm'); callback(); };
  openModal('modalConfirm');
}

// ══════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-bg.show').forEach(m => m.classList.remove('show'));
    closeVideoModal();
    closeDownloaderModal();
    if (APP.sidebarOpen) closeSidebar();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('globalSearch').focus();
  }
});

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
function init() {
  // load any previously-imported google fonts so they render immediately
  DB.customFonts.forEach(f => loadGoogleFont(f));

  if (DB.profile.theme && DB.profile.theme.startsWith('custom-')) {
    const cid = DB.profile.theme.slice(7);
    const theme = DB.customThemes.find(t => t.id === cid);
    if (theme) applyCustomTheme(theme);
    else { DB.profile.theme = 'github'; document.body.setAttribute('data-theme','github'); }
  } else {
    document.body.setAttribute('data-theme', DB.profile.theme || 'github');
  }

  if (DB.profile.font) {
    document.body.style.fontFamily = `'${DB.profile.font}', sans-serif`;
  }

  applyBgImage();
  updateHeaderUser();
  buildSidebarCats();
  buildSidebarPrograms();
  applyFontScale(DB.settings.fontScale || 100, false);
  applyLayoutScale(DB.settings.layoutIdx != null ? DB.settings.layoutIdx : 3, false);

  if (DB.settings.particles) toggleParticlesEffect(true);
  if (DB.settings.matrix) toggleMatrixEffect(true);
  if (DB.settings.bubbles) toggleBubblesEffect(true);

  navigate('home');
}


// ══════════════════════════════════════════════
//  LAYOUT SIZE & FONT SIZE CONTROLS
// ══════════════════════════════════════════════
const FONT_STEPS = [75, 85, 92, 100, 108, 118, 130]; // percent
const LAYOUT_STEPS = [600, 800, 960, 1200, 1400, 1600]; // px max-width
const LAYOUT_LABELS = ['xs','sm','md','lg','xl','2xl'];

function changeFontSize(dir) {
  const cur = DB.settings.fontScale || 100;
  const idx = FONT_STEPS.indexOf(cur);
  const next = FONT_STEPS[Math.max(0, Math.min(FONT_STEPS.length - 1, (idx === -1 ? 3 : idx) + dir))];
  applyFontScale(next, true);
}

function applyFontScale(pct, save) {
  document.documentElement.style.fontSize = (pct / 100) * 16 + 'px';
  const el = document.getElementById('lcFontVal');
  if (el) el.textContent = pct + '%';
  if (save) { DB.settings.fontScale = pct; saveDB(); }
}

function changeLayoutScale(dir) {
  const curIdx = DB.settings.layoutIdx != null ? DB.settings.layoutIdx : 3;
  const next = Math.max(0, Math.min(LAYOUT_STEPS.length - 1, curIdx + dir));
  applyLayoutScale(next, true);
}

function applyLayoutScale(idx, save) {
  const w = LAYOUT_STEPS[idx] + 'px';
  document.querySelector('.main').style.maxWidth = w;
  const el = document.getElementById('lcLayoutVal');
  if (el) el.textContent = LAYOUT_LABELS[idx] || idx;
  if (save) { DB.settings.layoutIdx = idx; saveDB(); }
}

// ══════════════════════════════════════════════
//  APP BOOTSTRAP (async — waits for IndexedDB to load)
// ══════════════════════════════════════════════
(async function bootstrap() {
  DB = await loadDB();
  init();
})();
