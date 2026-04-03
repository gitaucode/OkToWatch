(function() {
  const globalCss = `
    .cv-slide-over { position:fixed; top:0; right:0; bottom:0; width:100%; max-width:640px; background:var(--bg); z-index:10000; transform:translateX(100%); transition:transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow:-8px 0 32px rgba(0,0,0,0.1); display:flex; flex-direction:column; }
    .cv-slide-over.open { transform:translateX(0); }
    .cv-slide-over-header { position:sticky; top:0; background:rgba(200,217,209,0.95); backdrop-filter:blur(14px); z-index:20; padding:1rem 1.25rem; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); }
    .cv-so-close { background:var(--surface2); width:32px; height:32px; border-radius:50%; border:none; cursor:pointer; font-size:1.1rem; color:var(--text2); display:flex; align-items:center; justify-content:center; }
    .cv-slide-over-iframe { flex:1; width:100%; border:none; background:transparent; }
    .cv-panel-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); z-index:9999; display:none; }
  `;
  
  if(!document.getElementById('cv-panel-css')) {
    const style = document.createElement('style');
    style.id = 'cv-panel-css';
    style.innerHTML = globalCss;
    document.head.appendChild(style);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'cv-slide-over';
  wrapper.id = 'cvSlideOver';
  wrapper.innerHTML = `
    <div class="cv-slide-over-header">
      <div style="font-weight:700;font-size:1.1rem;display:flex;align-items:center;gap:0.5rem;"><div style="width:8px;height:8px;border-radius:50%;background:var(--accent);"></div> Analysis</div>
      <button class="cv-so-close" onclick="window.cvSearchPanel.close()">✕</button>
    </div>
    <iframe id="cvSlideOverIframe" class="cv-slide-over-iframe"></iframe>
  `;
  document.body.appendChild(wrapper);

  let globalOverlay = document.getElementById('cvPanelGlobalOverlay');
  if (!globalOverlay) {
    globalOverlay = document.createElement('div');
    globalOverlay.id = 'cvPanelGlobalOverlay';
    globalOverlay.className = 'cv-panel-overlay';
    document.body.appendChild(globalOverlay);
  }

  window.cvSearchPanel = {
    openTitle: function(id, type) {
      document.getElementById('cvPanelGlobalOverlay').style.display='block';
      document.getElementById('cvSlideOver').classList.add('open');
      document.body.style.overflow='hidden';
      
      const iframe = document.getElementById('cvSlideOverIframe');
      // Only set src if it's different to prevent unnecessary full-reloads if already loaded
      const targetSrc = '/search?embed=true&id=' + id + '&type=' + type;
      if (iframe.getAttribute('src') !== targetSrc) {
        iframe.src = targetSrc;
      } else {
        // Send a message to re-trigger analysis inside the iframe
        iframe.contentWindow.postMessage({ type: 'openTitle', id, media_type: type }, '*');
      }
    },
    close: function() {
      document.getElementById('cvSlideOver').classList.remove('open');
      document.getElementById('cvPanelGlobalOverlay').style.display='none';
      document.body.style.overflow='';
      
      // Clear the search query from URL without reloading
      const url = new URL(window.location);
      url.searchParams.delete('searchId');
      url.searchParams.delete('searchType');
      window.history.pushState({ panelOpen: false }, '', url);
    }
  };

  // Close when clicking overlay
  const overlay = document.getElementById('cvPanelGlobalOverlay');
  if (overlay) overlay.addEventListener('click', window.cvSearchPanel.close);

  // Handle messages from the iframe (e.g. closing, navigating)
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type === 'closePanel') {
      window.cvSearchPanel.close();
    }
  });

})();
