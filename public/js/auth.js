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
      if (!raw) return { loggedIn: false, isPro: false, isFamily: false, tier: 'free', user: null, updatedAt: 0 };
      const parsed = JSON.parse(raw);
      return {
        loggedIn: !!parsed.loggedIn,
        isPro: !!parsed.isPro,
        isFamily: !!parsed.isFamily,
        tier: parsed.tier || 'free',
        user: parsed.user || null,
        updatedAt: Number(parsed.updatedAt || 0),
      };
    } catch {
      return { loggedIn: false, isPro: false, isFamily: false, tier: 'free', user: null, updatedAt: 0 };
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
        user,
        updatedAt: Date.now()
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
        ? "text-[#131C35] dark:text-white border-b-2 border-[#131C35] dark:border-white pb-1 font-['Plus_Jakarta_Sans'] font-bold tracking-tight no-underline"
        : "text-slate-500 dark:text-slate-400 hover:text-[#131C35] dark:hover:text-slate-200 transition-colors font-['Plus_Jakarta_Sans'] font-bold tracking-tight no-underline"}" href="${link.href}">${link.label}</a>`;
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
        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input class="pl-11 pr-4 py-2.5 bg-[#EEF2FA] border border-transparent rounded-2xl text-sm focus:ring-2 focus:ring-primary/15 focus:border-primary/10 focus:bg-white transition-all w-[22rem] cursor-pointer text-slate-700 placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]" placeholder="Search movies, shows..." readonly onclick="window.cvOpenSearchModal&&window.cvOpenSearchModal()" type="text"/>
      </div>
      <button class="h-11 w-11 inline-flex items-center justify-center rounded-2xl text-slate-700 hover:bg-[#EEF2FA] dark:hover:bg-slate-800/50 transition-all" onclick="window.cvOpenSearchModal&&window.cvOpenSearchModal()" aria-label="Open search">
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
        <a href="/signin" class="px-4 py-2 rounded-2xl text-sm font-semibold text-slate-700 hover:text-[#131C35] no-underline transition-colors">Sign in</a>
        <a href="/signup" class="px-5 py-2.5 rounded-2xl text-sm font-bold bg-[#131C35] text-white hover:opacity-90 no-underline transition-opacity shadow-[0_14px_28px_rgba(19,28,53,0.16)]">Sign up</a>
      </div>`;

    const mobileActions = loggedIn
      ? `<button class="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onclick="window.cvOpenSearchModal&&window.cvOpenSearchModal()">Search</button>
         <a href="/settings" class="block w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 no-underline transition-colors">Settings</a>
         <button class="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" id="mobileSignOutBtn">Sign out</button>`
      : `<a href="/signin" class="block w-full rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 no-underline transition-colors">Sign in</a>
         <a href="/signup" class="block w-full rounded-2xl px-4 py-3 text-left font-bold bg-[#131C35] text-white hover:opacity-90 no-underline transition-opacity shadow-[0_14px_28px_rgba(19,28,53,0.16)]">Sign up</a>`;

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
    background: rgba(15,22,45,0.34); backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    align-items: flex-start; justify-content: center; padding: 92px 20px 24px;
    animation: fadeIn 0.15s ease;
  }
  .cv-search-modal.open { display: flex; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .cv-search-modal-content {
    width: min(100%, 40rem);
    background: rgba(255,255,255,0.96); border-radius: 28px;
    border: 1px solid rgba(19,28,53,0.08);
    box-shadow: 0 28px 64px rgba(19,28,53,0.22);
    overflow: hidden; animation: slideDown 0.25s ease;
  }
  @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .cv-search-modal-header {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 1.15rem 1.25rem; border-bottom: 1px solid rgba(19,28,53,0.08);
  }
  .cv-search-modal-input {
    flex: 1; background: transparent; border: none; outline: none;
    font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.05rem; font-weight: 700;
    color: #131C35;
  }
  .cv-search-modal-input::placeholder { color: #94a3b8; font-weight: 600; }
  .cv-search-modal-close {
    background: #F5F7FB; border: 1px solid rgba(19,28,53,0.06); font-size: 1.35rem;
    color: #64748b; cursor: pointer;
    padding: 0; width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 16px; transition: all 0.12s;
  }
  .cv-search-modal-close:hover { background: #EEF2FA; color: #131C35; }
  .cv-search-modal-body {
    max-height: min(60vh, 30rem); overflow-y: auto; padding: 0.5rem 0;
  }
  .cv-search-suggestions { display: flex; flex-direction: column; gap: 0; }
  .cv-search-item {
    display: flex; align-items: center; gap: 0.85rem;
    padding: 0.95rem 1.25rem; cursor: pointer;
    transition: background 0.12s; border: none;
    background: none; font-family: 'Inter', sans-serif;
    width: 100%; text-align: left; font-size: 0.9rem;
  }
  .cv-search-item:hover { background: #F8FAFC; }
  .cv-search-item-poster {
    width: 46px; min-width: 46px; height: 68px;
    border-radius: 10px; overflow: hidden;
    background: #e2e8f0; display: flex;
    align-items: center; justify-content: center; font-size: 1rem;
    flex-shrink: 0;
  }
  .cv-search-item-poster img { width: 100%; height: 100%; object-fit: cover; }
  .cv-search-item-info { flex: 1; min-width: 0; }
  .cv-search-item-title {
    font-size: 0.95rem; font-weight: 700; color: #131C35;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cv-search-item-meta {
    font-size: 0.78rem; color: #64748b; margin-top: 0.22rem;
  }
  .cv-search-modal-hint {
    padding: 0.85rem 1.25rem; font-size: 0.75rem;
    color: #64748b; border-top: 1px solid rgba(19,28,53,0.06); background: #FBFCFF;
  }
  .cv-search-modal-hint kbd {
    background: #EEF2FA; padding: 0.18rem 0.42rem;
    border-radius: 8px; font-size: 0.7rem; font-weight: 700; color: #131C35;
  }
  .cv-search-empty, .cv-search-state {
    padding: 1.15rem 1.25rem;
    color: #64748b;
    font-size: 0.92rem;
  }
  .cv-search-section-label {
    padding: 0.8rem 1.25rem 0.4rem;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .nav-avatar-btn {
    width: 40px; height: 40px; border-radius: 9999px;
    overflow: hidden; border: none; cursor: pointer;
    background: transparent; padding: 0; display: flex;
    align-items: center; justify-content: center;
    color: #334155; transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .nav-avatar-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 20px rgba(19,28,53,0.08); }
  .nav-dropdown {
    display: none; position: absolute; top: calc(100% + 10px); right: 0;
    background: white; border-radius: 16px;
    box-shadow: 0 18px 44px rgba(19,28,53,0.14);
    border: 1px solid rgba(0,0,0,0.07);
    min-width: 220px; overflow: hidden; z-index: 1001;
  }
  .nav-dropdown.open { display: block; animation: dropIn 0.18s ease; }
  @keyframes dropIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .nav-dropdown-header {
    padding: 0.85rem 1rem 0.7rem;
    border-bottom: 1px solid rgba(0,0,0,0.07);
  }
  .nav-dropdown-name { display: block; font-weight: 700; font-size: 0.875rem; color: #131C35; }
  .nav-dropdown-email { display: block; font-size: 0.72rem; color: #64748b; margin-top: 0.15rem; }
  .nav-dropdown-item {
    display: block; width: 100%;
    padding: 0.7rem 1rem; font-size: 0.83rem;
    color: #131C35; text-decoration: none;
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
    display: block; width: 22px; height: 2px; background: #131C35; border-radius: 2px; transition: all 0.25s;
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
        searchSuggestions.innerHTML = '<div class="cv-search-state">Searching...</div>';
        searchTimeout = setTimeout(() => performSearch(query), 300);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const firstResult = searchSuggestions?.querySelector('.cv-search-item');
          if (firstResult) {
            firstResult.click();
            return;
          }
          const query = searchInput.value.trim();
          if (query) {
            window.location.href = `/search/?q=${encodeURIComponent(query)}`;
          }
        }
      });
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    function renderSearchHistory() {
      if (searchHistory.length === 0) {
        searchSuggestions.innerHTML = '<div class="cv-search-empty">Start typing to search...</div>';
        return;
      }
      searchSuggestions.innerHTML = '<div class="cv-search-section-label">Recent</div>' +
        searchHistory.map(item => `
          <button class="cv-search-item" onclick="cvOpenTitle('${item.id}','${item.type}', this)">
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
        const res = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}&page=1&include_adult=false`);
        const data = await res.json();
        let results = data.results || [];
        results = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
        if (results.length > 0) {
          searchSuggestions.innerHTML = results.slice(0, 8).map(r => {
            const title = r.title || r.name;
            const dateStr = r.release_date || r.first_air_date || '';
            const year = dateStr ? dateStr.substring(0, 4) : '';
            return `
            <button class="cv-search-item" onclick="cvOpenTitle('${r.id}','${r.media_type}', this)">
              <div class="cv-search-item-poster">${r.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${r.poster_path}" alt="">` : '🎬'}</div>
              <div class="cv-search-item-info">
                <div class="cv-search-item-title">${title}</div>
                <div class="cv-search-item-meta">${year}${year ? ' · ' : ''}${r.media_type === 'tv' ? 'TV' : 'Movie'}</div>
              </div>
            </button>
          `}).join('');
        } else {
          searchSuggestions.innerHTML = '<div class="cv-search-empty">No results found. Press Enter to search the full page.</div>';
        }
      } catch (e) {
        console.error('Search error:', e);
        searchSuggestions.innerHTML = '<div class="cv-search-empty">Search failed, try again.</div>';
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
    const suggestions = document.getElementById('cvSearchSuggestions');
    if (modal) {
      modal.classList.add('open');
      if (input) {
        if (!input.value && suggestions) renderSearchHistory();
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

  window.cvOpenTitle = function(id, type, sourceEl) {
    // Save to search history before navigating
    try {
      let history = JSON.parse(localStorage.getItem('cvSearchHistory') || '[]');
      const row = sourceEl && sourceEl.closest ? sourceEl.closest('.cv-search-item') : null;
      const titleEl = row ? row.querySelector('.cv-search-item-title') : null;
      const metaEl  = row ? row.querySelector('.cv-search-item-meta') : null;
      const title   = titleEl ? titleEl.textContent : '';
      const year    = metaEl  ? metaEl.textContent.split(' · ')[0] : '';
      const poster  = row ? row.querySelector('img')?.src || null : null;

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
  function dispatchAuth(loggedIn, isPro, isFamily, tier, clerkUser, onboardingComplete) {
    window.CV = {
      loggedIn,
      isPro,
      isFamily,
      tier: tier || 'free',
      user: clerkUser || null,
      onboardingComplete: onboardingComplete !== false
    };
    cacheAuthState(loggedIn, isPro, isFamily, tier, clerkUser || null);
    renderNav(loggedIn, isPro, clerkUser || null);
    document.dispatchEvent(new CustomEvent('cv:auth', {
      detail: {
        loggedIn,
        isPro,
        isFamily,
        tier: tier || 'free',
        user: clerkUser || null,
        onboardingComplete: onboardingComplete !== false
      }
    }));
  }

  async function fetchOnboardingStatus(token) {
    try {
      const res = await fetch('/api/onboarding', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return { completed: false };
      return await res.json();
    } catch (err) {
      console.warn('Error fetching onboarding status:', err.message);
      return { completed: false };
    }
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

      let sessionToken = null;

      // In production, fetch actual subscription status from API
      if (loggedIn && BILLING_ENABLED) {
        try {
          sessionToken = await window.Clerk?.session?.getToken?.();
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

      if (loggedIn && !sessionToken) {
        try { sessionToken = await window.Clerk?.session?.getToken?.(); } catch {}
      }

      let onboardingComplete = true;
      if (loggedIn && sessionToken) {
        const onboardingStatus = await fetchOnboardingStatus(sessionToken);
        onboardingComplete = onboardingStatus.completed === true;
        try { sessionStorage.setItem('cvOnboardingState', JSON.stringify(onboardingStatus)); } catch {}

        const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
        const onOnboardingPage = currentPath === '/onboarding';
        const forceOnboarding = new URLSearchParams(window.location.search).get('force') === '1';

        if (onboardingComplete && onOnboardingPage && !forceOnboarding) {
          const redirect = new URLSearchParams(window.location.search).get('redirect');
          window.location.replace(redirect || '/dashboard');
          return;
        }
      }

      dispatchAuth(loggedIn, isPro, isFamily, tier, clerkUser, onboardingComplete);

    } catch (err) {
      // Clerk failed to load. Treat as logged out so pages can still render.
      console.warn('OkToWatch auth: Clerk failed to initialise.', err?.message);
      dispatchAuth(false, false, false, 'free', null, true);
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
