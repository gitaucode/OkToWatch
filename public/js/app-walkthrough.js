(function () {
  const TOUR_KEY = 'cv_app_walkthrough_v1';
  const AUTO_STARTED_KEY = 'cv_app_walkthrough_auto_started_v1';
  const page = (document.body?.dataset?.page || '').toLowerCase();

  if (!page) return;

  const STEP_SETS = {
    dashboard: [
      {
        selector: '[data-tour="dashboard-header"]',
        title: 'Welcome to your family dashboard',
        body: 'This is your home base for recent checks, saved decisions, and the next safest picks to review.',
      },
      {
        selector: '[data-tour="profiles"]',
        title: 'Create profiles for each child',
        body: 'Profiles help OkToWatch tailor recommendations, filters, and saved decisions to the right age.',
      },
      {
        selector: '[data-tour="recommendations"]',
        title: 'Use recommendations as your shortcut',
        body: 'These picks learn from age, recent checks, and saved approvals so you can decide faster.',
      },
      {
        selector: '[data-tour-link="discover"]',
        title: 'Browse safer options in Discover',
        body: 'Discover is where you browse titles by age fit, genre, and family-friendly signals.',
      },
      {
        selector: '[data-tour-link="settings"]',
        title: 'Fine-tune your household rules',
        body: 'Settings is where you adjust profiles, subscriptions, and the family setup over time.',
      },
    ],
  };

  const steps = STEP_SETS[page];
  if (!steps || !steps.length) return;

  let currentStep = 0;
  let activeTarget = null;
  let started = false;

  function injectStyles() {
    if (document.getElementById('cv-app-tour-styles')) return;
    const style = document.createElement('style');
    style.id = 'cv-app-tour-styles';
    style.textContent = `
      .cv-app-tour-overlay {
        position: fixed;
        inset: 0;
        z-index: 950;
        background: rgba(15, 23, 42, 0.52);
        backdrop-filter: blur(6px);
      }
      .cv-app-tour-card {
        position: fixed;
        z-index: 951;
        width: min(360px, calc(100vw - 2rem));
        background: #ffffff;
        color: #0f172a;
        border-radius: 1rem;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28);
        border: 1px solid rgba(148, 163, 184, 0.22);
        padding: 1rem;
      }
      .cv-app-tour-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #0f766e;
        background: #ecfeff;
        border-radius: 999px;
        padding: 0.3rem 0.6rem;
        margin-bottom: 0.75rem;
      }
      .cv-app-tour-title {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.1rem;
        font-weight: 800;
        line-height: 1.25;
        margin: 0 0 0.5rem;
      }
      .cv-app-tour-body {
        font-size: 0.92rem;
        line-height: 1.6;
        color: #475569;
        margin: 0 0 0.9rem;
      }
      .cv-app-tour-progress {
        font-size: 0.76rem;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 0.9rem;
      }
      .cv-app-tour-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .cv-app-tour-btn-row {
        display: flex;
        gap: 0.5rem;
      }
      .cv-app-tour-btn,
      .cv-app-tour-link {
        border: none;
        border-radius: 999px;
        font: inherit;
        cursor: pointer;
      }
      .cv-app-tour-btn {
        background: #0f172a;
        color: #ffffff;
        padding: 0.65rem 1rem;
        font-size: 0.84rem;
        font-weight: 700;
      }
      .cv-app-tour-btn.secondary {
        background: #f1f5f9;
        color: #334155;
      }
      .cv-app-tour-link {
        background: transparent;
        color: #64748b;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0;
      }
      .cv-app-tour-target {
        position: relative;
        z-index: 952 !important;
        box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.95), 0 0 0 8px rgba(45, 212, 191, 0.42);
        border-radius: 1rem;
        transition: box-shadow 180ms ease;
      }
      @media (max-width: 767px) {
        .cv-app-tour-card {
          left: 1rem !important;
          right: 1rem !important;
          bottom: 1rem !important;
          top: auto !important;
          width: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    injectStyles();

    if (!document.getElementById('cvAppTourOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'cvAppTourOverlay';
      overlay.className = 'cv-app-tour-overlay';
      overlay.hidden = true;
      document.body.appendChild(overlay);
    }

    if (!document.getElementById('cvAppTourCard')) {
      const card = document.createElement('div');
      card.id = 'cvAppTourCard';
      card.className = 'cv-app-tour-card';
      card.hidden = true;
      card.innerHTML = `
        <div class="cv-app-tour-eyebrow">Quick tour</div>
        <h3 class="cv-app-tour-title" id="cvAppTourTitle"></h3>
        <p class="cv-app-tour-body" id="cvAppTourBody"></p>
        <div class="cv-app-tour-progress" id="cvAppTourProgress"></div>
        <div class="cv-app-tour-actions">
          <button type="button" class="cv-app-tour-link" id="cvAppTourSkip">Skip</button>
          <div class="cv-app-tour-btn-row">
            <button type="button" class="cv-app-tour-btn secondary" id="cvAppTourBack">Back</button>
            <button type="button" class="cv-app-tour-btn" id="cvAppTourNext">Next</button>
          </div>
        </div>
      `;
      document.body.appendChild(card);

      card.querySelector('#cvAppTourSkip').addEventListener('click', finishTour);
      card.querySelector('#cvAppTourBack').addEventListener('click', () => goToStep(currentStep - 1));
      card.querySelector('#cvAppTourNext').addEventListener('click', () => {
        if (currentStep >= steps.length - 1) finishTour();
        else goToStep(currentStep + 1);
      });
    }
  }

  function getVisibleTarget(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return el;
  }

  function clearHighlight() {
    if (activeTarget) {
      activeTarget.classList.remove('cv-app-tour-target');
      activeTarget = null;
    }
  }

  function placeCard(target) {
    const card = document.getElementById('cvAppTourCard');
    if (!card || window.innerWidth < 768 || !target) return;

    const rect = target.getBoundingClientRect();
    const gap = 18;
    const cardRect = card.getBoundingClientRect();
    const maxLeft = window.innerWidth - cardRect.width - 16;
    let top = rect.bottom + gap;
    let left = rect.left;

    if (top + cardRect.height > window.innerHeight - 16) {
      top = Math.max(16, rect.top - cardRect.height - gap);
    }
    left = Math.min(Math.max(16, left), maxLeft);

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
    card.style.bottom = 'auto';
    card.style.right = 'auto';
  }

  function renderStep(index) {
    const step = steps[index];
    const target = getVisibleTarget(step.selector);
    if (!target) {
      if (index < steps.length - 1) {
        goToStep(index + 1);
      } else {
        finishTour();
      }
      return;
    }

    currentStep = index;
    clearHighlight();
    activeTarget = target;
    activeTarget.classList.add('cv-app-tour-target');
    activeTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    const overlay = document.getElementById('cvAppTourOverlay');
    const card = document.getElementById('cvAppTourCard');
    const title = document.getElementById('cvAppTourTitle');
    const body = document.getElementById('cvAppTourBody');
    const progress = document.getElementById('cvAppTourProgress');
    const back = document.getElementById('cvAppTourBack');
    const next = document.getElementById('cvAppTourNext');

    title.textContent = step.title;
    body.textContent = step.body;
    progress.textContent = `Step ${index + 1} of ${steps.length}`;
    back.style.visibility = index === 0 ? 'hidden' : 'visible';
    next.textContent = index === steps.length - 1 ? 'Done' : 'Next';

    overlay.hidden = false;
    card.hidden = false;

    requestAnimationFrame(() => placeCard(target));
  }

  function goToStep(index) {
    renderStep(Math.max(0, Math.min(index, steps.length - 1)));
  }

  function finishTour() {
    localStorage.setItem(TOUR_KEY, 'done');
    const overlay = document.getElementById('cvAppTourOverlay');
    const card = document.getElementById('cvAppTourCard');
    if (overlay) overlay.hidden = true;
    if (card) card.hidden = true;
    clearHighlight();
    started = false;
  }

  function waitForDashboardReady(callback, tries) {
    const pageContent = document.getElementById('pageContent');
    if (!pageContent || pageContent.classList.contains('visible')) {
      callback();
      return;
    }
    if (tries <= 0) return;
    window.setTimeout(() => waitForDashboardReady(callback, tries - 1), 250);
  }

  function startTour(force) {
    if (started) return;
    if (!force && localStorage.getItem(TOUR_KEY) === 'done') return;

    ensureUi();
    started = true;
    goToStep(0);
  }

  window.cvStartAppTour = function (force) {
    waitForDashboardReady(() => startTour(!!force), 20);
  };

  document.addEventListener('cv:auth', ({ detail }) => {
    if (page !== 'dashboard' || !detail?.loggedIn) return;
    if (localStorage.getItem(TOUR_KEY) === 'done') return;
    if (sessionStorage.getItem(AUTO_STARTED_KEY) === '1') return;

    sessionStorage.setItem(AUTO_STARTED_KEY, '1');
    waitForDashboardReady(() => startTour(false), 20);
  });

  window.addEventListener('resize', () => {
    if (started && activeTarget) placeCard(activeTarget);
  });
})();
