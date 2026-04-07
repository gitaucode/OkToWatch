import re

with open('public/js/auth.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace Logo
c = re.sub(
    r'<a href="\$\{loggedIn \? \'/dashboard\' : \'/index\'\}" class="cv-nav-logo">\s*<div class="cv-nav-logo-mark">.*?</div>\s*<span class="cv-nav-logo-text">.*?</span>\s*</a>',
    '<a href="${loggedIn ? \'/dashboard\' : \'/index\'}" class="cv-nav-logo">\n      <span class="cv-nav-logo-text" style="font-family: \'Inter\', \'DM Sans\', sans-serif; font-size: 1.15rem; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">OkToWatch</span>\n    </a>',
    c, flags=re.DOTALL
)

# Replace Search Pill
c = re.sub(
    r'<button class="nav-search-pill" onclick="cvOpenSearchModal\(\)">\s*<span class="nsp-icon">[^<]+</span>\s*<span class="nsp-text">Search titles...</span>\s*<span class="nsp-kbd">[^<]+</span>\s*</button>',
    '<button class="nav-search-bar" onclick="cvOpenSearchModal()">\n          <svg class="nsb-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>\n          <span class="nsb-text">Search movies...</span>\n        </button>\n        <button class="nav-search-icon-btn" onclick="cvOpenSearchModal()" aria-label="Search">\n          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>\n        </button>',
    c, flags=re.DOTALL
)

# Add CSS directly
css_additions = """
  /* Override styles injected for new layout */
  .cv-nav {
    position: sticky; top: 0; z-index: 400;
    background: white !important;
    border-bottom: 2px solid rgba(0,0,0,0.04) !important;
    backdrop-filter: none !important;
  }
  .cv-nav-inner {
    max-width: 1440px !important; margin: 0 auto;
    padding: 0 1.25rem;
    height: 60px !important;
    display: flex; align-items: center; justify-content: space-between; gap: 0 !important;
  }
  .cv-nav-links {
    display: flex; align-items: center; justify-content: flex-start !important; flex: 1; margin-left: 1.5rem;
  }
  .nav-link {
    font-family: 'Inter', 'DM Sans', sans-serif !important;
    font-size: 0.9rem !important; font-weight: 500 !important;
    color: #475569 !important; text-decoration: none;
    padding: 0.5rem 0.2rem !important; margin-right: 1.5rem;
    transition: color 0.15s; border-radius: 0 !important; background: transparent !important;
    position: relative;
  }
  .nav-link:hover { color: #0f172a !important; background: transparent !important; }
  .nav-link.active { color: #0f172a !important; font-weight: 600 !important; background: transparent !important; }
  .nav-link.active::after {
    content: ''; position: absolute; left: 0; bottom: -2px; right: 0;
    height: 2px; background: #0f172a; border-radius: 2px;
  }
  .cv-nav-right {
    display: flex; align-items: center; gap: 1rem !important;
    flex-shrink: 0; position: relative; justify-content: flex-end;
  }
  .nav-search-bar {
    display: none; align-items: center;
    background: #f1f5f9; border: none;
    color: #475569; padding: 0.45rem 1rem;
    border-radius: 6px; font-family: 'Inter', 'DM Sans', sans-serif;
    cursor: pointer; transition: all 0.15s;
    width: 250px; justify-content: flex-start;
  }
  .nav-search-bar:hover { background: #e2e8f0; }
  .nsb-icon { color: #64748b; }
  .nsb-text { font-size: 0.9rem; font-weight: 400; color: #64748b; }
  @media (min-width: 650px) { .nav-search-bar { display: flex; } }
  
  .nav-search-icon-btn {
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: #0f172a; padding: 0.25rem;
  }
  @media (min-width: 650px) { .nav-search-icon-btn { display: none; } }
  
  .nav-avatar {
    background: #cbd5e1 !important; color: #0f172a !important; font-family: 'Inter', 'DM Sans', sans-serif !important;
  }
  .nav-avatar:hover { box-shadow: 0 0 0 3px rgba(15,23,42,0.1) !important; }
"""

c = c.replace('</style>', css_additions + '\n</style>')

with open('public/js/auth.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Replaced successfully")
