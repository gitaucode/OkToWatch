(function () {
  const currentPath = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  const protectedPaths = new Set([
    '/dashboard',
    '/dashboard/dasboardv2.html',
    '/history',
    '/lists',
    '/profiles',
    '/settings',
  ]);

  if (!protectedPaths.has(currentPath)) return;

  try {
    const raw = sessionStorage.getItem('cvAuthCache');
    if (!raw) return;

    const cached = JSON.parse(raw);
    const updatedAt = Number(cached?.updatedAt || 0);
    const isFresh = updatedAt > 0 && (Date.now() - updatedAt) < 5 * 60 * 1000;

    if (cached?.loggedIn === false && (!updatedAt || isFresh)) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace('/signin?redirect=' + redirect);
    }
  } catch {}
})();
