(function () {
  try {
    const raw = sessionStorage.getItem('cvAuthCache');
    const cached = raw ? JSON.parse(raw) : null;
    if (cached && cached.loggedIn === false) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace('/signin?redirect=' + redirect);
      return;
    }
  } catch {}

  const root = document.getElementById('dashboard-sidebar-root');
  if (!root) return;
  document.body.classList.add('cv-has-dashboard-sidebar');

  if (!document.getElementById('cv-app-tour-script')) {
    const script = document.createElement('script');
    script.id = 'cv-app-tour-script';
    script.src = '/js/app-walkthrough.js?v=dev';
    document.head.appendChild(script);
  }

  if (!document.getElementById('cv-dashboard-sidebar-styles')) {
    const style = document.createElement('style');
    style.id = 'cv-dashboard-sidebar-styles';
    style.textContent = `
      .cv-dashboard-sidebar-shell {
        display: none;
        width: 16rem;
        flex: 0 0 16rem;
      }
      .cv-dashboard-layout {
        display: block;
        min-height: calc(100vh - 64px);
      }
      .cv-dashboard-sidebar {
        position: sticky;
        top: 64px;
        z-index: 20;
        box-sizing: border-box;
        width: 100%;
        height: calc(100vh - 64px);
        min-height: calc(100vh - 64px);
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        overflow-y: auto;
        padding: 1rem;
        background: #f8fafc;
        border-right: 1px solid #e2e8f0;
      }
      .cv-dashboard-sidebar::-webkit-scrollbar {
        display: none;
      }
      .cv-dashboard-sidebar {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      .cv-dashboard-sidebar__nav {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 0.25rem;
      }
      .cv-dashboard-sidebar__link {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 0.9rem;
        border-radius: 0.75rem;
        color: #475569;
        font-size: 0.95rem;
        font-weight: 500;
        text-decoration: none;
        transition: background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
      }
      .cv-dashboard-sidebar__link:hover {
        background: #f1f5f9;
        color: #0f172a;
        transform: translateX(2px);
      }
      .cv-dashboard-sidebar__link.active {
        background: #ffffff;
        color: #0f172a;
        font-weight: 700;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      }
      .cv-dashboard-sidebar__link .material-symbols-outlined {
        font-size: 1.35rem;
      }
      .cv-dashboard-sidebar__link.active .material-symbols-outlined {
        font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
      }
      .cv-dashboard-content {
        width: 100%;
        max-width: 1120px;
        margin: 0 auto;
      }
      .cv-dashboard-content--wide {
        max-width: 1180px;
      }
      .cv-dashboard-content--narrow {
        max-width: 1040px;
      }
      .cv-dashboard-content--compact {
        max-width: 960px;
      }
      body.cv-has-dashboard-sidebar {
        overflow-x: hidden;
      }
      body.cv-has-dashboard-sidebar #footer-root {
        position: relative;
        z-index: 10;
      }
      .cv-dashboard-main {
        min-width: 0;
      }
      .cv-dashboard-layout > #pageLoader,
      .cv-dashboard-layout > #pageContent,
      .cv-dashboard-layout > main,
      .cv-dashboard-layout > .cv-dashboard-main {
        min-width: 0;
      }
      @media (min-width: 768px) {
        .cv-dashboard-layout {
          display: grid;
          grid-template-columns: 16rem minmax(0, 1fr);
          align-items: stretch;
        }
        .cv-dashboard-sidebar-shell {
          display: block;
          min-height: calc(100vh - 64px);
        }
        .cv-dashboard-layout > #pageLoader,
        .cv-dashboard-layout > #pageContent,
        .cv-dashboard-layout > main,
        .cv-dashboard-layout > .cv-dashboard-main {
          grid-column: 2;
          grid-row: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const page = (document.body.dataset.page || '').toLowerCase();
  const currentPath = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  const items = [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { id: 'discover', label: 'Discover', href: '/discover', icon: 'explore' },
    { id: 'lists', label: 'Lists', href: '/lists', icon: 'bookmark' },
    { id: 'history', label: 'History', href: '/history', icon: 'history' },
    { id: 'profiles', label: 'Profiles', href: '/profiles', icon: 'family_restroom' },
    { id: 'settings', label: 'Settings', href: '/settings', icon: 'settings' },
  ];

  const isActive = (item) => {
    const href = (item.href || '/').replace(/\/$/, '') || '/';
    return page === item.id || currentPath === href || currentPath.startsWith(href + '/');
  };

  root.innerHTML = `
    <aside class="cv-dashboard-sidebar-shell" aria-label="Dashboard navigation">
      <div class="cv-dashboard-sidebar">
        <nav class="cv-dashboard-sidebar__nav">
          ${items.map((item) => `
            <a class="cv-dashboard-sidebar__link${isActive(item) ? ' active' : ''}" href="${item.href}" data-tour-link="${item.id}">
              <span class="material-symbols-outlined">${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `).join('')}
        </nav>
      </div>
    </aside>
  `;
})();
