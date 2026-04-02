/**
 * OkToWatch — /public/js/auth.js
 * Loaded on every page. Initialises Clerk, sets window.CV, renders nav.
 */

(function () {
  // ── Billing flag ──────────────────────────────────────────────────────────
  // Set to true when Dodo Payments is live and approved.
  // false = all logged-in users get full Pro access (free beta mode).
  const BILLING_ENABLED = false;
  window.BILLING_ENABLED = BILLING_ENABLED;

  const CLERK_PK = 'pk_test_dGhvcm91Z2gtYW50ZWF0ZXItMjAuY2xlcmsuYWNjb3VudHMuZGV2JA';
  const CLERK_SCRIPT = 'https://thorough-anteater-20.clerk.accounts.dev/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';

  // ── Page meta ─────────────────────────────────────────────────────────────
  const PAGE = document.body.dataset.page || '';

  // ── Nav configs ───────────────────────────────────────────────────────────
  const NAV_LOGGED_OUT = [
    { label: 'Plans',   href: '/plans' },
    { label: 'About',   href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];
  const NAV_LOGGED_IN = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Lists',     href: '/lists' },
    { label: 'Discover',  href: '/discover' },
    { label: 'History',   href: '/history' },
  ];
  const NAV_SECONDARY = [
    { label: 'How it works', href: '/how-it-works' },
    { label: 'About',        href: '/about' },
    { label: 'Contact',      href: '/contact' },
  ];

  // ── Render nav ────────────────────────────────────────────────────────────
  function renderNav(loggedIn, isPro, user) {
    const root = document.getElementById('nav-root');
    if (!root) return;

    const links = loggedIn ? NAV_LOGGED_IN : NAV_LOGGED_OUT;
    const currentPath = window.location.pathname.replace(/^\//, '') || '/index';

    const linkHTML = links.map(l => {
      const active = currentPath === l.href.replace(/^\//, '');
      return `<a href="${l.href}" class="nav-link${active ? ' active' : ''}">${l.label}</a>`;
    }).join('');

    // Add secondary dropdown for logged-in users
    let secondaryHTML = '';
    if (loggedIn) {
      const secondaryLinks = NAV_SECONDARY.map(l => 
        `<a href="${l.href}" class="nav-secondary-link">${l.label}</a>`
      ).join('');
      secondaryHTML = `
        <div class="nav-secondary-wrap">
          <button class="nav-secondary-btn" id="navSecondaryBtn" aria-label="More options">
            <span>⋯</span>
          </button>
          <div class="nav-secondary-menu" id="navSecondaryMenu">
            ${secondaryLinks}
          </div>
        </div>`;
    }

    let rightHTML = '';
    if (!loggedIn) {
      rightHTML = `
        <a href="/signin" class="nav-btn nav-btn--ghost">Sign in</a>
        <a href="/signup" class="nav-btn nav-btn--solid">Sign up</a>`;
    } else {
      const initial = (user?.firstName || user?.emailAddresses?.[0]?.emailAddress || '?')[0].toUpperCase();
      const avatarContent = user?.imageUrl
        ? `<img src="${user.imageUrl}" alt="${initial}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : initial;
      rightHTML = `
        <button class="nav-avatar" id="navAvatarBtn" aria-label="Account menu">${avatarContent}</button>
        <div class="nav-dropdown" id="navDropdown">
          <div class="nav-dropdown-header">
            <span class="nav-dropdown-name">${user?.firstName || 'Account'}</span>
            <span class="nav-dropdown-email">${user?.emailAddresses?.[0]?.emailAddress || ''}</span>
          </div>
          <a href="/settings" class="nav-dropdown-item">⚙️ Settings</a>
          <button class="nav-dropdown-item nav-dropdown-item--danger" id="navSignOutBtn">Sign out</button>
        </div>`;
    }

    root.innerHTML = `
<nav class="cv-nav" id="cvNav">
  <div class="cv-nav-inner">
    <a href="/index" class="cv-nav-logo">
      <div class="cv-nav-logo-mark">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" fill="white"/>
          <path d="M8 2C4.5 2 1.5 4.5 1 8c.5 3.5 3.5 6 7 6s6.5-2.5 7-6c-.5-3.5-3.5-6-7-6z" stroke="white" stroke-width="1.5" fill="none"/>
        </svg>
      </div>
      <span class="cv-nav-logo-text">Ok<strong>ToWatch</strong><span class="cv-nav-beta-badge">Beta</span></span>
    </a>
    <div class="cv-nav-links" id="cvNavLinks">${linkHTML}${secondaryHTML}</div>
    <div class="cv-nav-right" id="cvNavRight">${rightHTML}</div>
    <button class="cv-nav-hamburger" id="cvNavHamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<!-- Global search modal (available on all pages) -->
<div class="cv-search-modal" id="cvSearchModal" onclick="if(event.target===this)cvCloseSearchModal()">
  <div class="cv-search-modal-content" onclick="event.stopPropagation()">
    <div class="cv-search-modal-header">
      <input type="text" id="cvSearchInput" class="cv-search-modal-input" placeholder="Search any movie or TV show..." autocomplete="off"/>
      <button class="cv-search-modal-close" onclick="cvCloseSearchModal()">✕</button>
    </div>
    <div class="cv-search-modal-body">
      <div class="cv-search-suggestions" id="cvSearchSuggestions"></div>
    </div>
    <div class="cv-search-modal-hint">
      <span>Press <kbd>Esc</kbd> to close</span>
    </div>
  </div>
</div>

<div class="cv-nav-mobile-overlay" id="cvNavOverlay"></div>
<div class="cv-nav-mobile" id="cvNavMobile">
  <div class="cv-nav-mobile-inner">
    <div class="cv-nav-mobile-links">${linkHTML}</div>
    <div class="cv-nav-mobile-actions">
      ${!loggedIn
        ? `<a href="/signin" class="nav-btn nav-btn--ghost" style="width:100%;text-align:center;">Sign in</a>
           <a href="/signup" class="nav-btn nav-btn--solid" style="width:100%;text-align:center;">Sign up</a>`
        : `<a href="/settings" class="nav-btn nav-btn--ghost" style="width:100%;text-align:center;">Settings</a>
           <button class="nav-btn nav-btn--ghost" id="mobileSignOutBtn" style="width:100%;text-align:center;border:1.5px solid var(--border);">Sign out</button>`
      }
    </div>
  </div>
</div>
<style>
  /* Search Modal */
  .cv-search-modal {
    display: none; position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    align-items: flex-start; justify-content: center; padding-top: 80px;
    animation: fadeIn 0.15s ease;
  }
  .cv-search-modal.open { display: flex; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .cv-search-modal-content {
    width: 90%; max-width: 500px;
    background: white; border-radius: 16px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.25);
    overflow: hidden; animation: slideDown 0.25s ease;
  }
  @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .cv-search-modal-header {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 1rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.08);
  }
  .cv-search-modal-input {
    flex: 1; background: transparent; border: none; outline: none;
    font-family: 'DM Sans', sans-serif; font-size: 1rem;
    color: var(--text, #1a2420);
  }
  .cv-search-modal-input::placeholder { color: var(--muted, #7a908a); }
  .cv-search-modal-close {
    background: none; border: none; font-size: 1.4rem;
    color: var(--muted, #7a908a); cursor: pointer;
    padding: 0; width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px; transition: all 0.12s;
  }
  .cv-search-modal-close:hover { background: var(--surface2, #f4f6f5); color: var(--text, #1a2420); }
  .cv-search-modal-body {
    max-height: 60vh; overflow-y: auto; padding: 0.5rem 0;
  }
  .cv-search-suggestions { display: flex; flex-direction: column; gap: 0; }
  .cv-search-item {
    display: flex; align-items: center; gap: 0.85rem;
    padding: 0.85rem 1.25rem; cursor: pointer;
    transition: background 0.12s; border: none;
    background: none; font-family: 'DM Sans', sans-serif;
    width: 100%; text-align: left; font-size: 0.9rem;
  }
  .cv-search-item:hover { background: var(--surface2, #f4f6f5); }
  .cv-search-item-poster {
    width: 40px; min-width: 40px; height: 56px;
    border-radius: 6px; overflow: hidden;
    background: var(--bg, #c8d9d1); display: flex;
    align-items: center; justify-content: center; font-size: 1rem;
    flex-shrink: 0;
  }
  .cv-search-item-poster img { width: 100%; height: 100%; object-fit: cover; }
  .cv-search-item-info { flex: 1; min-width: 0; }
  .cv-search-item-title {
    font-size: 0.9rem; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cv-search-item-meta {
    font-size: 0.77rem; color: var(--muted, #7a908a); margin-top: 0.2rem;
  }
  .cv-search-modal-hint {
    padding: 0.6rem 1.25rem; font-size: 0.75rem;
    color: var(--muted, #7a908a); border-top: 1px solid rgba(0,0,0,0.06);
  }
  .cv-search-modal-hint kbd {
    background: var(--surface2, #f4f6f5); padding: 0.15rem 0.4rem;
    border-radius: 4px; font-size: 0.7rem; font-weight: 600;
  }

  .cv-nav {
    position: sticky; top: 0; z-index: 400;
    background: rgba(200,217,209,0.92);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(0,0,0,0.07);
  }
  .cv-nav-inner {
    max-width: 1100px; margin: 0 auto;
    padding: 0 1.25rem;
    height: 56px;
    display: flex; align-items: center; gap: 0.75rem;
  }
  .cv-nav-logo {
    display: flex; align-items: center; gap: 0.55rem;
    text-decoration: none; flex-shrink: 0;
  }
  .cv-nav-logo-mark {
    width: 26px; height: 26px; border-radius: 7px;
    background: var(--accent, #2a6b55);
    display: flex; align-items: center; justify-content: center;
  }
  .cv-nav-logo-text {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.95rem; color: var(--text, #1a2420); letter-spacing: -0.01em;
    display: inline-flex; align-items: center; gap: 0.4rem;
  }
  .cv-nav-logo-text strong { font-weight: 700; }
  .cv-nav-beta-badge {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 0.14rem 0.4rem;
    border-radius: 999px;
    background: rgba(42,107,85,0.1);
    border: 1px solid rgba(42,107,85,0.16);
    color: var(--accent, #2a6b55);
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transform: translateY(-1px);
  }
  .cv-nav-links {
    display: flex; align-items: center; gap: 0.25rem;
    margin-left: auto;
  }
  .nav-link {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem; font-weight: 500;
    color: var(--text2, #3d4f49); text-decoration: none;
    padding: 0.35rem 0.75rem; border-radius: 100px;
    transition: background 0.15s, color 0.15s;
  }
  .nav-link:hover { background: rgba(0,0,0,0.05); color: var(--text, #1a2420); }
  .nav-link.active { background: var(--accent, #2a6b55); color: white; font-weight: 600; }
  .nav-secondary-wrap {
    position: relative; display: flex; align-items: center;
  }
  .nav-secondary-btn {
    background: none; border: none; font-size: 1.2rem;
    color: var(--text2, #3d4f49); cursor: pointer;
    padding: 0.35rem 0.5rem; border-radius: 100px;
    transition: all 0.15s;
  }
  .nav-secondary-btn:hover { color: var(--text, #1a2420); }
  .nav-secondary-menu {
    display: none; position: absolute; top: calc(100% + 8px); right: 0;
    background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.14);
    border: 1px solid rgba(0,0,0,0.07); min-width: 160px; overflow: hidden;
    animation: dropIn 0.18s ease;
  }
  .nav-secondary-menu.open { display: block; }
  .nav-secondary-link {
    display: block; padding: 0.7rem 1rem; font-family: 'DM Sans', sans-serif;
    font-size: 0.83rem; color: var(--text, #1a2420); text-decoration: none;
    transition: background 0.12s; white-space: nowrap;
  }
  .nav-secondary-link:hover { background: rgba(42,107,85,0.08); }
  .cv-nav-right {
    display: flex; align-items: center; gap: 0.5rem;
    flex-shrink: 0; position: relative;
  }
  .nav-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem; font-weight: 600;
    padding: 0.45rem 1rem; border-radius: 100px;
    text-decoration: none; border: none; cursor: pointer;
    transition: all 0.15s; white-space: nowrap;
    display: inline-flex; align-items: center;
  }
  .nav-btn--ghost {
    background: rgba(255,255,255,0.55);
    border: 1.5px solid rgba(0,0,0,0.1);
    color: var(--text, #1a2420);
  }
  .nav-btn--ghost:hover { background: white; }
  .nav-btn--solid {
    background: var(--accent, #2a6b55); color: white;
  }
  .nav-btn--solid:hover { opacity: 0.88; }
  .nav-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--accent, #2a6b55); color: white;
    border: none; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; transition: box-shadow 0.15s;
  }
  .nav-avatar:hover { box-shadow: 0 0 0 3px rgba(42,107,85,0.25); }
  .nav-dropdown {
    display: none; position: absolute; top: calc(100% + 10px); right: 0;
    background: white; border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.14);
    border: 1px solid rgba(0,0,0,0.07);
    min-width: 220px; overflow: hidden; z-index: 1001;
  }
  .nav-dropdown.open { display: block; animation: dropIn 0.18s ease; }
  @keyframes dropIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .nav-dropdown-header {
    padding: 0.85rem 1rem 0.7rem;
    border-bottom: 1px solid rgba(0,0,0,0.07);
  }
  .nav-dropdown-name { display: block; font-weight: 700; font-size: 0.875rem; color: var(--text, #1a2420); }
  .nav-dropdown-email { display: block; font-size: 0.72rem; color: var(--muted, #7a908a); margin-top: 0.15rem; }
  .nav-dropdown-item {
    display: block; width: 100%;
    padding: 0.7rem 1rem; font-size: 0.83rem;
    color: var(--text, #1a2420); text-decoration: none;
    background: none; border: none; text-align: left; cursor: pointer;
    font-family: 'DM Sans', sans-serif;
    transition: background 0.12s;
  }
  .nav-dropdown-item:hover { background: var(--surface2, #f4f6f5); }
  .nav-dropdown-item--danger:hover { background: #fdecea; color: #c0392b; }
  .cv-nav-hamburger {
    display: none; background: none; border: none;
    cursor: pointer; padding: 0.4rem; flex-direction: column;
    gap: 5px; margin-left: auto; transition: all 0.2s;
  }
  .cv-nav-hamburger span {
    display: block; width: 22px; height: 2px;
    background: var(--text, #1a2420); border-radius: 2px;
    transition: all 0.25s;
  }
  .cv-nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .cv-nav-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .cv-nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

  /* Overlay backdrop */
  .cv-nav-mobile-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.25); z-index: 98;
    backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
  }
  .cv-nav-mobile-overlay.open { display: block; }

  /* Slide-down panel — sits below the nav */
  .cv-nav-mobile {
    position: fixed; top: 56px; left: 0; right: 0; z-index: 99;
    background: var(--nav-bg, rgba(200,217,209,0.98));
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(0,0,0,0.1);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    transform: translateY(-8px); opacity: 0; pointer-events: none;
    transition: transform 0.22s ease, opacity 0.22s ease;
  }
  .cv-nav-mobile.open {
    transform: translateY(0); opacity: 1; pointer-events: all;
  }
  .cv-nav-mobile-inner { padding: 0.75rem 1.25rem 1.25rem; }
  .cv-nav-mobile-links { display: flex; flex-direction: column; gap: 0.1rem; margin-bottom: 0.85rem; }
  .cv-nav-mobile-links .nav-link { padding: 0.7rem 0.85rem; font-size: 0.95rem; border-radius: var(--radius-sm, 10px); }
  .cv-nav-mobile-links .nav-link:hover { background: rgba(0,0,0,0.05); }
  .cv-nav-mobile-actions { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.65rem; border-top: 1px solid rgba(0,0,0,0.07); }

  @media (max-width: 700px) {
    .cv-nav-links { display: none; }
    .cv-nav-right { display: none; }
    .cv-nav-hamburger { display: flex; }
    .cv-nav-inner { gap: 0; }
  }
  @media (min-width: 701px) {
    .cv-nav-mobile, .cv-nav-mobile-overlay { display: none !important; }
  }
</style>`;

    // Hamburger toggle
    const hamburger = document.getElementById('cvNavHamburger');
    const mobileMenu = document.getElementById('cvNavMobile');
    const overlay    = document.getElementById('cvNavOverlay');

    function openMobileMenu() {
      mobileMenu.classList.add('open');
      overlay.classList.add('open');
      hamburger.classList.add('open');
    }
    function closeMobileMenu() {
      mobileMenu.classList.remove('open');
      overlay.classList.remove('open');
      hamburger.classList.remove('open');
    }

    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileMenu.classList.contains('open') ? closeMobileMenu() : openMobileMenu();
      });
    }
    if (overlay) {
      overlay.addEventListener('click', closeMobileMenu);
    }
    // Close on nav link tap
    document.querySelectorAll('.cv-nav-mobile-links .nav-link').forEach(link => {
      link.addEventListener('click', closeMobileMenu);
    });

    // Avatar dropdown
    const avatarBtn = document.getElementById('navAvatarBtn');
    const dropdown = document.getElementById('navDropdown');
    if (avatarBtn && dropdown) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', () => dropdown.classList.remove('open'));
    }

    // Secondary nav dropdown
    const secondaryBtn = document.getElementById('navSecondaryBtn');
    const secondaryMenu = document.getElementById('navSecondaryMenu');
    if (secondaryBtn && secondaryMenu) {
      secondaryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        secondaryMenu.classList.toggle('open');
      });
      // Prevent menu from closing when clicking inside it
      secondaryMenu.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      // Close menu when a link is clicked
      secondaryMenu.querySelectorAll('.nav-secondary-link').forEach(link => {
        link.addEventListener('click', () => secondaryMenu.classList.remove('open'));
      });
      // Close on click outside
      document.addEventListener('click', () => secondaryMenu.classList.remove('open'));
      // Close on escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') secondaryMenu.classList.remove('open');
      });
    }

    // Sign out buttons
    const signOutBtns = [
      document.getElementById('navSignOutBtn'),
      document.getElementById('mobileSignOutBtn'),
    ].filter(Boolean);

    signOutBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await window.Clerk.signOut();
          window.location.href = '/index';
        } catch (e) {
          console.error('Sign out failed', e);
        }
      });
    });

    // Set up global search modal
    const searchModal = document.getElementById('cvSearchModal');
    const searchInput = document.getElementById('cvSearchInput');
    const searchSuggestions = document.getElementById('cvSearchSuggestions');
    let searchTimeout;
    let searchHistory = [];

    // Load search history from localStorage
    try {
      searchHistory = JSON.parse(localStorage.getItem('cvSearchHistory') || '[]').slice(0, 10);
    } catch (e) {
      searchHistory = [];
    }

    // Cmd+K to open search
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchModal.classList.add('open');
        searchInput.focus();
      }
    });

    // Escape to close search
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchModal.classList.contains('open')) {
        cvCloseSearchModal();
      }
    });

    // Search input handler
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        
        if (!query) {
          renderSearchHistory();
          return;
        }

        searchSuggestions.innerHTML = '<div style="padding: 1rem; color: var(--muted); font-size: 0.9rem;">Searching...</div>';
        
        searchTimeout = setTimeout(() => {
          performSearch(query);
        }, 300);
      });

      // Prevent closing when typing
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    function renderSearchHistory() {
      if (searchHistory.length === 0) {
        searchSuggestions.innerHTML = '<div style="padding: 1rem; color: var(--muted); font-size: 0.9rem;">Start typing to search...</div>';
        return;
      }
      searchSuggestions.innerHTML = '<div style="padding: 0.75rem 1.25rem; font-size: 0.75rem; color: var(--muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Recent</div>' +
        searchHistory.map(item => `
          <button class="cv-search-item" onclick="cvOpenTitle('${item.id}','${item.type}')">
            <div class="cv-search-item-poster">${item.poster ? `<img src="${item.poster}" alt="">` : '🎬'}</div>
            <div class="cv-search-item-info">
              <div class="cv-search-item-title">${item.title}</div>
              <div class="cv-search-item-meta">${item.year || ''} · ${item.type === 'tv' ? 'TV' : 'Movie'}</div>
            </div>
          </button>
        `).join('');
    }

    async function performSearch(query) {
      try {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
          searchSuggestions.innerHTML = data.results.slice(0, 8).map(r => `
            <button class="cv-search-item" onclick="cvOpenTitle('${r.tmdb_id}','${r.media_type}')">
              <div class="cv-search-item-poster">${r.poster ? `<img src="https://image.tmdb.org/t/p/w88${r.poster}" alt="">` : '🎬'}</div>
              <div class="cv-search-item-info">
                <div class="cv-search-item-title">${r.title}</div>
                <div class="cv-search-item-meta">${r.year || ''} · ${r.media_type === 'tv' ? 'TV' : 'Movie'}</div>
              </div>
            </button>
          `).join('');
        } else {
          searchSuggestions.innerHTML = '<div style="padding: 1rem; color: var(--muted); font-size: 0.9rem;">No results found</div>';
        }
      } catch (e) {
        console.error('Search error:', e);
        searchSuggestions.innerHTML = '<div style="padding: 1rem; color: var(--muted); font-size: 0.9rem;">Search failed — try again</div>';
      }
    }

    // Initialize with history on first open
    if (searchModal) {
      searchModal.addEventListener('animationend', () => {
        if (searchModal.classList.contains('open') && !searchInput.value) {
          renderSearchHistory();
        }
      });
    }
  }

  // Global search modal functions
  window.cvCloseSearchModal = function() {
    const modal = document.getElementById('cvSearchModal');
    const input = document.getElementById('cvSearchInput');
    if (modal) {
      modal.classList.remove('open');
      if (input) input.value = '';
    }
  };

  window.cvOpenTitle = function(id, type) {
    // Save to search history
    try {
      let history = JSON.parse(localStorage.getItem('cvSearchHistory') || '[]');
      // Get title from the clicked element
      const titleEl = event.target.closest('.cv-search-item').querySelector('.cv-search-item-title');
      const metaEl = event.target.closest('.cv-search-item').querySelector('.cv-search-item-meta');
      const title = titleEl.textContent;
      const year = metaEl.textContent.split(' · ')[0];
      const poster = event.target.closest('.cv-search-item').querySelector('img')?.src || null;
      
      const item = { id, type, title, year, poster };
      history = [item, ...history.filter(h => h.id !== id)].slice(0, 10);
      localStorage.setItem('cvSearchHistory', JSON.stringify(history));
    } catch (e) {
      console.error('History save failed:', e);
    }
    // Navigate
    window.location.href = `/index?id=${id}&type=${type}`;
  };

  // ── Public guards ─────────────────────────────────────────────────────────
  window.requireAuth = function () {
    if (!window.CV?.loggedIn) {
      window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.pathname);
    }
  };
  // requirePro: beta is free, so any signed-in user can access these surfaces for now.
  window.requirePro = function () {
    if (!window.CV?.loggedIn) {
      window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }
  };


  // ── Dispatch auth event (always fires, even on failure) ───────────────────
  function dispatchAuth(loggedIn, isPro, isFamily, clerkUser) {
    // Free beta mode — all signed-in users get Pro access until billing is live
    if (!BILLING_ENABLED && loggedIn) {
      isPro    = true;
      isFamily = false;
    }
    window.CV = { loggedIn, isPro, isFamily, user: clerkUser || null };
    renderNav(loggedIn, isPro, clerkUser || null);
    document.dispatchEvent(new CustomEvent('cv:auth', {
      detail: { loggedIn, isPro, isFamily, user: clerkUser || null }
    }));
  }

  // ── Preconnect to Clerk CDN as early as possible ────────────────────────
  (function() {
    if (!document.querySelector('link[href*="clerk.accounts.dev"]')) {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = 'https://thorough-anteater-20.clerk.accounts.dev'; l.crossOrigin = '';
      document.head.prepend(l);
    }
  })();

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function boot() {
    try {
      // Load Clerk JS — with a 10s timeout so we never hang forever
      // Use pre-loaded script promise if signin/signup page already started it,
      // otherwise load fresh. 10s timeout either way.
      if (!window.__clerkScriptPromise) {
        window.__clerkScriptPromise = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = CLERK_SCRIPT;
          s.setAttribute('data-clerk-publishable-key', CLERK_PK);
          s.async = true;
          s.onload  = resolve;
          s.onerror = () => reject(new Error('Clerk script failed to load'));
          document.head.appendChild(s);
        });
      }
      await Promise.race([
        window.__clerkScriptPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Clerk script timed out')), 10000)
        ),
      ]);

      await window.Clerk.load();

      const clerkUser = window.Clerk.user;
      const loggedIn  = !!clerkUser;

      if (loggedIn) {
        // Try to reload metadata — if it fails, use whatever Clerk already has
        try {
          await Promise.race([
            clerkUser.reload(),
            new Promise((_, r) => setTimeout(() => r(new Error('reload timeout')), 4000))
          ]);
        } catch {
          // Reload failed — fall through with existing metadata
          console.warn('OkToWatch: metadata reload failed, using cached metadata');
        }
      }

      const meta     = clerkUser?.publicMetadata || {};
      const isPro    = loggedIn && (meta.isPro === true);
      const isFamily = loggedIn && (meta.isFamily === true);

      dispatchAuth(loggedIn, isPro, isFamily, clerkUser);

    } catch (err) {
      // Clerk failed to load — treat as logged out so pages can still render
      console.warn('OkToWatch auth: Clerk failed to initialise.', err?.message);
      dispatchAuth(false, false, false, null);
    }
  }

  // ── Announcements banner ─────────────────────────────────────────────────
  async function loadAnnouncements() {
    try {
      const res = await fetch('/api/announcements');
      if (!res.ok) return;
      const list = await res.json();
      if (!list.length) return;
      const colors = { info: '#1a6091', warning: '#7d4e00', success: '#1a5c38' };
      const bgs    = { info: '#e8f4fd', warning: '#fef6e4', success: '#e6f4ec' };
      list.forEach(ann => {
        const bar = document.createElement('div');
        bar.style.cssText = `background:${bgs[ann.type]||bgs.info};color:${colors[ann.type]||colors.info};padding:0.6rem 1.25rem;font-size:0.82rem;font-weight:500;text-align:center;position:relative;z-index:300;border-bottom:1px solid ${colors[ann.type]||colors.info}33;`;
        bar.innerHTML = `<span>${ann.message}</span><button onclick="this.parentNode.remove()" style="position:absolute;right:1rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1rem;color:inherit;opacity:0.6;">✕</button>`;
        const nav = document.getElementById('nav-root');
        if (nav && nav.nextSibling) nav.parentNode.insertBefore(bar, nav.nextSibling);
        else document.body.prepend(bar);
      });
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { boot(); loadAnnouncements(); });
  } else {
    boot();
    loadAnnouncements();
  }
})();
