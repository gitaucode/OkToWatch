/**
 * OkToWatch /public/js/auth.js
 * Loaded on every page. Initializes Clerk, sets window.CV, renders nav.
 * Secondary nav with dropdown menu.
 */

(function () {
//
  // Set to true when billing is live. Features are restricted by subscription.
  const BILLING_ENABLED = true;
  window.BILLING_ENABLED = BILLING_ENABLED;

  const CLERK_PK = 'pk_test_dGhvcm91Z2gtYW50ZWF0ZXItMjAuY2xlcmsuYWNjb3VudHMuZGV2JA';
  const CLERK_SCRIPT = 'https://thorough-anteater-20.clerk.accounts.dev/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';

//
  const PAGE = document.body.dataset.page || '';

  function getCachedAuthState() {
    try {
      const raw = sessionStorage.getItem('cvAuthCache');
      if (!raw) return { loggedIn: false, isPro: false, isFamily: false, tier: 'free', user: null };
      const parsed = JSON.parse(raw);
      return {
        loggedIn: !!parsed.loggedIn,
        isPro: !!parsed.isPro,
        isFamily: !!parsed.isFamily,
        tier: parsed.tier || 'free',
        user: parsed.user || null,
      };
    } catch {
      return { loggedIn: false, isPro: false, isFamily: false, tier: 'free', user: null };
    }
  }

  function cacheAuthState(loggedIn, isPro, isFamily, tier, clerkUser) {
    try {
      const user = clerkUser ? {
        firstName: clerkUser.firstName || '',
        imageUrl: clerkUser.imageUrl || '',
        emailAddresses: clerkUser.emailAddresses?.[0]?.emailAddress
          ? [{ emailAddress: clerkUser.emailAddresses[0].emailAddress }]
          : []
      } : null;
      sessionStorage.setItem('cvAuthCache', JSON.stringify({
        loggedIn: !!loggedIn,
        isPro: !!isPro,
        isFamily: !!isFamily,
        tier: tier || 'free',
        user
      }));
    } catch {}
  }

//
  async function fetchSubscriptionStatus(token) {
    try {
      const res = await fetch('/api/subscription-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        console.warn('Failed to fetch subscription status:', res.status);
        return { tier: 'free', status: 'free', isPro: false, isFamily: false };
      }
      return await res.json();
    } catch (err) {
      console.warn('Error fetching subscription status:', err.message);
      return { tier: 'free', status: 'free', isPro: false, isFamily: false };
    }
  }

//
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

//
  function renderNav(loggedIn, isPro, user) {
    const root = document.getElementById('nav-root');
    if (!root) return;

    const links = loggedIn ? NAV_LOGGED_IN : NAV_LOGGED_OUT;
    const currentPath = (window.location.pathname || '/').replace(/\/$/, '') || '/';
    const isActive = (href) => {
      const normalized = (href || '/').replace(/\/$/, '') || '/';
      if (normalized === '/dashboard' && (currentPath === '' || currentPath === '/')) return true;
      return currentPath === normalized || currentPath.startsWith(normalized + '/');
    };

    const renderDesktopLink = (link) => {
      const active = isActive(link.href);
      return `<a class="${active
        ? "text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white pb-1 font-['Plus_Jakarta_Sans'] font-bold tracking-tight no-underline"
        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-['Plus_Jakarta_Sans'] font-bold tracking-tight no-underline"}" href="${link.href}">${link.label}</a>`;
    };

    const renderMobileLink = (link) => {
      const active = isActive(link.href);
      return `<a href="${link.href}" class="block rounded-xl px-4 py-3 font-['Plus_Jakarta_Sans'] font-bold tracking-tight no-underline transition-colors ${active
        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}">${link.label}</a>`;
    };

    const linkHTML = links.map(renderDesktopLink).join('');
    const mobileLinksHTML = links.map(renderMobileLink).join('');

    let secondaryHTML = '';
    if (loggedIn) {
      secondaryHTML = NAV_SECONDARY.map(l => `<a href="${l.href}" class="nav-dropdown-item">${l.label}</a>`).join('');
    }

    const initial = (user?.firstName || user?.emailAddresses?.[0]?.emailAddress || '?')[0].toUpperCase();
    const avatarContent = user?.imageUrl
      ? `<img src="${user.imageUrl}" alt="${initial}" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;">`
      : `<span class="material-symbols-outlined" style="font-size:22px;">account_circle</span>`;

    const desktopRight = loggedIn ? `
      <div class="relative group hidden lg:block">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input class="pl-10 pr-4 py-1.5 bg-slate-200/70 border-none rounded-full text-sm focus:ring-2 focus:ring-primary focus:bg-white transition-all w-64 cursor-pointer text-slate-700 placeholder:text-slate-500" placeholder="Search movies..." readonly onclick="window.cvOpenSearchModal&&window.cvOpenSearchModal()" type="text"/>
      </div>
      <button class="p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md transition-all" onclick="window.cvOpenSearchModal&&window.cvOpenSearchModal()" aria-label="Open search">
        <span class="material-symbols-outlined text-slate-700 dark:text-slate-200">search</span>
      </button>
      <div class="relative">
        <button class="nav-avatar-btn" id="navAvatarBtn" aria-label="Account menu">${avatarContent}</button>
        <div class="nav-dropdown" id="navDropdown">
          <div class="nav-dropdown-header">
            <span class="nav-dropdown-name">${user?.firstName || 'Account'}</span>
            <span class="nav-dropdown-email">${user?.emailAddresses?.[0]?.emailAddress || ''}</span>
          </div>
          <a href="/settings" class="nav-dropdown-item">Settings</a>
          ${secondaryHTML ? '<div class="nav-dropdown-separator"></div>' + secondaryHTML : ''}
          <div class="nav-dropdown-separator"></div>
          <button class="nav-dropdown-item nav-dropdown-item--danger" id="navSignOutBtn">Sign out</button>
        </div>
      </div>` : `
      <div class="hidden md:flex items-center gap-3">
        <a href="/signin" class="px-4 py-2 rounded-full text-sm font-semibold text-slate-700 hover:text-slate-900 no-underline transition-colors">Sign in</a>
        <a href="/signup" class="px-4 py-2 rounded-full text-sm font-semibold bg-slate-900 text-white hover:opacity-90 no-underline transition-opacity">Sign up</a>
      </div>`;

    const mobileActions = loggedIn
      ? `<button class="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onclick="window.cvOpenSearchModal&&window.cvOpenSearchModal()">Search</button>
         <a href="/settings" class="block w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 no-underline transition-colors">Settings</a>
         <button class="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" id="mobileSignOutBtn">Sign out</button>`
      : `<a href="/signin" class="block w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 no-underline transition-colors">Sign in</a>
         <a href="/signup" class="block w-full rounded-xl px-4 py-3 text-left font-semibold bg-slate-900 text-white hover:opacity-90 no-underline transition-opacity">Sign up</a>`;

    root.innerHTML = `
<nav class="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/60">
  <div class="flex justify-between items-center h-16 px-4 md:px-8 max-w-[1440px] mx-auto gap-4">
    <a href="${loggedIn ? '/dashboard' : '/'}" class="inline-flex items-center gap-2 text-slate-900 dark:text-white no-underline shrink-0">
      <img src="/icons/favicon-32.png" alt="OkToWatch logo" class="w-8 h-8 rounded-[10px] object-contain" />
      <span aria-label="OkToWatch" class="font-['Plus_Jakarta_Sans'] text-[1.02rem] tracking-[-0.03em] leading-none">
        <span class="font-medium">Ok</span><span class="font-extrabold">ToWatch</span>
      </span>
    </a>
    <div class="hidden md:flex items-center gap-8">${linkHTML}</div>
    <div class="flex items-center gap-2 md:gap-4">
      ${desktopRight}
      <button class="cv-nav-hamburger md:hidden" id="cvNavHamburger" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</nav>

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
    <div class="cv-nav-mobile-links">${mobileLinksHTML}</div>
    <div class="cv-nav-mobile-actions">${mobileActions}</div>
  </div>
</div>
<style>
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
    font-family: 'Inter', sans-serif; font-size: 1rem;
    color: #1f2937;
  }
  .cv-search-modal-input::placeholder { color: #64748b; }
  .cv-search-modal-close {
    background: none; border: none; font-size: 1.4rem;
    color: #64748b; cursor: pointer;
    padding: 0; width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px; transition: all 0.12s;
  }
  .cv-search-modal-close:hover { background: #f1f5f9; color: #111827; }
  .cv-search-modal-body {
    max-height: 60vh; overflow-y: auto; padding: 0.5rem 0;
  }
  .cv-search-suggestions { display: flex; flex-direction: column; gap: 0; }
  .cv-search-item {
    display: flex; align-items: center; gap: 0.85rem;
    padding: 0.85rem 1.25rem; cursor: pointer;
    transition: background 0.12s; border: none;
    background: none; font-family: 'Inter', sans-serif;
    width: 100%; text-align: left; font-size: 0.9rem;
  }
  .cv-search-item:hover { background: #f8fafc; }
  .cv-search-item-poster {
    width: 40px; min-width: 40px; height: 64px;
    border-radius: 6px; overflow: hidden;
    background: #e2e8f0; display: flex;
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
    font-size: 0.77rem; color: #64748b; margin-top: 0.2rem;
  }
  .cv-search-modal-hint {
    padding: 0.6rem 1.25rem; font-size: 0.75rem;
    color: #64748b; border-top: 1px solid rgba(0,0,0,0.06);
  }
  .cv-search-modal-hint kbd {
    background: #f1f5f9; padding: 0.15rem 0.4rem;
    border-radius: 4px; font-size: 0.7rem; font-weight: 600;
  }
  .nav-avatar-btn {
    width: 40px; height: 40px; border-radius: 9999px;
    overflow: hidden; border: none; cursor: pointer;
    background: transparent; padding: 0; display: flex;
    align-items: center; justify-content: center;
    color: #334155; transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .nav-avatar-btn:hover { transform: translateY(-1px); }
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
  .nav-dropdown-name { display: block; font-weight: 700; font-size: 0.875rem; color: #111827; }
  .nav-dropdown-email { display: block; font-size: 0.72rem; color: #64748b; margin-top: 0.15rem; }
  .nav-dropdown-item {
    display: block; width: 100%;
    padding: 0.7rem 1rem; font-size: 0.83rem;
    color: #111827; text-decoration: none;
    background: none; border: none; text-align: left; cursor: pointer;
    font-family: 'Inter', sans-serif;
    transition: background 0.12s;
  }
  .nav-dropdown-item:hover { background: #f8fafc; }
  .nav-dropdown-item--danger:hover { background: #fdecea; color: #c0392b; }
  .nav-dropdown-separator { height: 1px; background: rgba(0,0,0,0.07); }
  .cv-nav-hamburger {
    background: none; border: none; cursor: pointer; padding: 0.4rem;
    display: inline-flex; flex-direction: column; gap: 5px; transition: all 0.2s;
  }
  .cv-nav-hamburger span {
    display: block; width: 22px; height: 2px; background: #111827; border-radius: 2px; transition: all 0.25s;
  }
  .cv-nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .cv-nav-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .cv-nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  .cv-nav-mobile-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.25); z-index: 98;
    backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
  }
  .cv-nav-mobile-overlay.open { display: block; }
  .cv-nav-mobile {
    position: fixed; top: 64px; left: 0; right: 0; z-index: 99;
    background: rgba(255,255,255,0.98); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(0,0,0,0.1); box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    transform: translateY(-8px); opacity: 0; pointer-events: none;
    transition: transform 0.22s ease, opacity 0.22s ease;
  }
  .cv-nav-mobile.open { transform: translateY(0); opacity: 1; pointer-events: all; }
  .cv-nav-mobile-inner { padding: 0.9rem 1rem 1.1rem; }
  .cv-nav-mobile-links { display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 0.85rem; }
  .cv-nav-mobile-actions { display: flex; flex-direction: column; gap: 0.55rem; padding-top: 0.85rem; border-top: 1px solid rgba(0,0,0,0.07); }
  @media (min-width: 768px) {
    .cv-nav-mobile, .cv-nav-mobile-overlay, .cv-nav-hamburger { display: none !important; }
  }
</style>`;

    const hamburger = document.getElementById('cvNavHamburger');
    const mobileMenu = document.getElementById('cvNavMobile');
    const overlay = document.getElementById('cvNavOverlay');

    function openMobileMenu() {
      if (!mobileMenu || !overlay || !hamburger) return;
      mobileMenu.classList.add('open');
      overlay.classList.add('open');
      hamburger.classList.add('open');
    }
    function closeMobileMenu() {
      if (!mobileMenu || !overlay || !hamburger) return;
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
    if (overlay) overlay.addEventListener('click', closeMobileMenu);
    document.querySelectorAll('.cv-nav-mobile-links a').forEach(link => link.addEventListener('click', closeMobileMenu));

    const avatarBtn = document.getElementById('navAvatarBtn');
    const dropdown = document.getElementById('navDropdown');
    if (avatarBtn && dropdown) {
      let closeTimer;
      const openDropdown = () => {
        clearTimeout(closeTimer);
        dropdown.classList.add('open');
      };
      const scheduleClose = () => {
        closeTimer = setTimeout(() => dropdown.classList.remove('open'), 150);
      };
      avatarBtn.addEventListener('mouseenter', openDropdown);
      dropdown.addEventListener('mouseenter', openDropdown);
      avatarBtn.addEventListener('mouseleave', scheduleClose);
      dropdown.addEventListener('mouseleave', scheduleClose);
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !avatarBtn.contains(e.target)) {
          dropdown.classList.remove('open');
        }
      });
    }

    const signOutBtns = [document.getElementById('navSignOutBtn'), document.getElementById('mobileSignOutBtn')].filter(Boolean);
    signOutBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await window.Clerk.signOut();
          window.location.href = '/';
        } catch (e) {
          console.error('Sign out failed', e);
        }
      });
    });

    const searchModal = document.getElementById('cvSearchModal');
    const searchInput = document.getElementById('cvSearchInput');
    const searchSuggestions = document.getElementById('cvSearchSuggestions');
    let searchTimeout;
    let searchHistory = [];

    try {
      searchHistory = JSON.parse(localStorage.getItem('cvSearchHistory') || '[]').slice(0, 10);
    } catch (e) {
      searchHistory = [];
    }

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchModal.classList.add('open');
        searchInput.focus();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchModal.classList.contains('open')) {
        cvCloseSearchModal();
      }
    });

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        if (!query) {
          renderSearchHistory();
          return;
        }
        searchSuggestions.innerHTML = '<div style="padding: 1rem; color: #64748b; font-size: 0.9rem;">Searching...</div>';
        searchTimeout = setTimeout(() => performSearch(query), 300);
      });
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    function renderSearchHistory() {
      if (searchHistory.length === 0) {
        searchSuggestions.innerHTML = '<div style="padding: 1rem; color: #64748b; font-size: 0.9rem;">Start typing to search...</div>';
        return;
      }
      searchSuggestions.innerHTML = '<div style="padding: 0.75rem 1.25rem; font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Recent</div>' +
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
        const res = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        let results = data.results || [];
        results = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
        if (results.length > 0) {
          searchSuggestions.innerHTML = results.slice(0, 8).map(r => {
            const title = r.title || r.name;
            const dateStr = r.release_date || r.first_air_date || '';
            const year = dateStr ? dateStr.substring(0, 4) : '';
            return `
            <button class="cv-search-item" onclick="cvOpenTitle('${r.id}','${r.media_type}')">
              <div class="cv-search-item-poster">${r.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${r.poster_path}" alt="">` : '🎬'}</div>
              <div class="cv-search-item-info">
                <div class="cv-search-item-title">${title}</div>
                <div class="cv-search-item-meta">${year}${year ? ' · ' : ''}${r.media_type === 'tv' ? 'TV' : 'Movie'}</div>
              </div>
            </button>
          `}).join('');
        } else {
          searchSuggestions.innerHTML = '<div style="padding: 1rem; color: #64748b; font-size: 0.9rem;">No results found</div>';
        }
      } catch (e) {
        console.error('Search error:', e);
        searchSuggestions.innerHTML = '<div style="padding: 1rem; color: #64748b; font-size: 0.9rem;">Search failed, try again</div>';
      }
    }

    if (searchModal) {
      searchModal.addEventListener('animationend', () => {
        if (searchModal.classList.contains('open') && !searchInput.value) {
          renderSearchHistory();
        }
      });
    }
  }


  // Global search modal functions
  window.cvOpenSearchModal = function() {
    const modal = document.getElementById('cvSearchModal');
    const input = document.getElementById('cvSearchInput');
    if (modal) {
      modal.classList.add('open');
      if (input) {
        input.focus(); // Synchronous focus
        setTimeout(() => input.focus(), 50); // Fallback after transition
      }
    }
  };

  window.cvCloseSearchModal = function() {
    const modal = document.getElementById('cvSearchModal');
    const input = document.getElementById('cvSearchInput');
    if (modal) {
      modal.classList.remove('open');
      if (input) input.value = '';
    }
  };

  window.cvOpenTitle = function(id, type) {
    // Save to search history before navigating
    try {
      let history = JSON.parse(localStorage.getItem('cvSearchHistory') || '[]');
      const titleEl = event.target.closest('.cv-search-item').querySelector('.cv-search-item-title');
      const metaEl  = event.target.closest('.cv-search-item').querySelector('.cv-search-item-meta');
      const title   = titleEl ? titleEl.textContent : '';
      const year    = metaEl  ? metaEl.textContent.split(' · ')[0] : '';
      const poster  = event.target.closest('.cv-search-item').querySelector('img')?.src || null;

      const item = { id, type, title, year, poster };
      history = [item, ...history.filter(h => h.id !== id)].slice(0, 10);
      localStorage.setItem('cvSearchHistory', JSON.stringify(history));
    } catch (e) {
      console.error('History save failed:', e);
    }

    // Close search modal then navigate to the detail page.
    cvCloseSearchModal();
    window.location.href = `/index?id=${id}&type=${type}`;
  };

  // Handle deep links on page load (e.g. shared URLs with ?id= params)
  window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const sId   = params.get('searchId');
    const sType = params.get('searchType');
    // If someone lands with legacy searchId params, redirect cleanly to detail page
    if (sId && sType) {
      window.location.replace(`/index?id=${sId}&type=${sType}`);
    }
  });

//
  window.requireAuth = function () {
    if (!window.CV?.loggedIn) {
      window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.pathname);
    }
  };
  // requirePro: checks subscription tier for access control
  window.requirePro = function () {
    if (!window.CV?.loggedIn) {
      window.location.href = '/signin?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }
  };


//
  function dispatchAuth(loggedIn, isPro, isFamily, tier, clerkUser) {
    window.CV = { loggedIn, isPro, isFamily, tier: tier || 'free', user: clerkUser || null };
    cacheAuthState(loggedIn, isPro, isFamily, tier, clerkUser || null);
    renderNav(loggedIn, isPro, clerkUser || null);
    document.dispatchEvent(new CustomEvent('cv:auth', {
      detail: { loggedIn, isPro, isFamily, tier: tier || 'free', user: clerkUser || null }
    }));
  }

//
  (function reserveNavHeight() {
    const navRoot = document.getElementById('nav-root');
    if (!navRoot) return;
    navRoot.style.minHeight = '64px';
    const cached = getCachedAuthState();
    window.CV = {
      loggedIn: cached.loggedIn,
      isPro: cached.isPro,
      isFamily: cached.isFamily,
      tier: cached.tier || 'free',
      user: cached.user || null,
    };
    renderNav(cached.loggedIn, cached.isPro, cached.user || null);
  })();

//
  (function() {
    if (!document.querySelector('link[href*="clerk.accounts.dev"]')) {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = 'https://thorough-anteater-20.clerk.accounts.dev'; l.crossOrigin = '';
      document.head.prepend(l);
    }
  })();

//
  async function boot() {
    try {
      // Load Clerk JS with a 10s timeout so we never hang forever.
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
        // Try to reload metadata. If it fails, use whatever Clerk already has.
        try {
          await Promise.race([
            clerkUser.reload(),
            new Promise((_, r) => setTimeout(() => r(new Error('reload timeout')), 4000))
          ]);
        } catch {
          // Reload failed. Fall through with existing metadata.
          console.warn('OkToWatch: metadata reload failed, using cached metadata');
        }
      }

      const meta     = clerkUser?.publicMetadata || {};
      let isPro    = loggedIn && (meta.isPro === true);
      let isFamily = loggedIn && (meta.isFamily === true);
      let tier = 'free';

      // In production, fetch actual subscription status from API
      if (loggedIn && BILLING_ENABLED) {
        try {
          // Get session token from Clerk's session object
          const sessionToken = await window.Clerk?.session?.getToken?.();
          if (sessionToken) {
            const subStatus = await fetchSubscriptionStatus(sessionToken);
            isPro = subStatus.isPro || false;
            isFamily = subStatus.isFamily || false;
            tier = subStatus.tier || 'free';
          }
        } catch (err) {
          console.warn('Failed to fetch subscription status:', err);
          // Fall back to metadata
        }
      }

      dispatchAuth(loggedIn, isPro, isFamily, tier, clerkUser);

    } catch (err) {
      // Clerk failed to load. Treat as logged out so pages can still render.
      console.warn('OkToWatch auth: Clerk failed to initialise.', err?.message);
      dispatchAuth(false, false, false, 'free', null);
    }
  }

    //  Render footer 
  function renderFooter() {
    const root = document.getElementById('footer-root');
    if (!root) return;

    root.innerHTML = `
<footer style="border-top:1px solid rgba(0,0,0,0.08); background:#f2f4f5; margin-top:3rem;">
  <div style="max-width:1100px; margin:0 auto; padding:1.35rem 1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
    <div style="display:flex; align-items:center; min-width:180px;">
      <span style="display:inline-flex; align-items:center; gap:0.65rem; font-family:'Plus Jakarta Sans',sans-serif; font-size:1.05rem; color:#1a2420; letter-spacing:-0.03em; line-height:1;">
        <img src="/icons/favicon-32.png" alt="OkToWatch logo" style="width:30px;height:30px;border-radius:10px;object-fit:contain;" />
        <span aria-label="OkToWatch" style="display:inline-flex; align-items:baseline; line-height:1;">
          <span style="font-weight:500;">Ok</span><span style="font-weight:800;">ToWatch</span>
        </span>
      </span>
    </div>
    <div style="display:flex; flex-wrap:wrap; justify-content:flex-end; gap:1.5rem;">
      <a style="font-family:'Inter',sans-serif; font-size:0.85rem; color:#607670; text-decoration:none; font-weight:500;" href="/about">About</a>
      <a style="font-family:'Inter',sans-serif; font-size:0.85rem; color:#607670; text-decoration:none; font-weight:500;" href="/privacy">Privacy</a>
      <a style="font-family:'Inter',sans-serif; font-size:0.85rem; color:#607670; text-decoration:none; font-weight:500;" href="/contact">Contact</a>
      <a style="font-family:'Inter',sans-serif; font-size:0.85rem; color:#607670; text-decoration:none; font-weight:500;" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDb Attribution</a>
    </div>
  </div>
</footer>
    `;
  }

//
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
    document.addEventListener('DOMContentLoaded', () => { boot(); renderFooter();
    loadAnnouncements(); });
  } else {
    boot();
    renderFooter();
    loadAnnouncements();
  }
})();
