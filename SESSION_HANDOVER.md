# OkToWatch - Session Handover Document

## Overview of Recent Work
We recently completed a major overhaul of the **Dashboard Experience**, transforming it from a static utility page into a premium, content-discovery SaaS hub designed for parents. We prioritized a "filtering-first" utility aesthetic over a "Netflix-clone" browsing environment.

### Key Features Implemented:
1. **Dynamic Dashboard (`public/dashboard/index.html`)**: 
   - Transformed the layout to use a modern, glassmorphic UI.
   - Implemented constrained, 1-row contextual carousels (e.g., "Trending Movies", "Trending TV") using TMDb's trending endpoints.
   - Added personalized header greetings based on the active child profile (or generic if none is active).
2. **Global Search Integration**: 
   - Unified the global search (`⌘K`) and slide-over analysis panel (`search-panel.js`) to work harmoniously within the dashboard shell.
3. **Routing & Auth Fixes**:
   - *The "Wrong Dashboard" Bug:* Discovered that the navigation bar and Clerk auth hooks (`afterSignInUrl`, `afterSignUpUrl`) were sending users to `/index` (the old marketing landing page) instead of the new `/dashboard`. This has been globally updated.
   - Added a proactive `cv:auth` event listener to `public/index/index.html` to instantly redirect logged-in users to `/dashboard` if they organically land on the homepage.
4. **TMDb Image Poster Fix**:
   - Fixed broken poster images in the search dropdown by updating the requested TMDb CDN size to a valid enum (`w92` instead of the unsupported `w88`).
5. **Cloudflare Cache Configuration**:
   - Rewrote `public/_headers` to correctly apply `max-age` and cache-busting behaviors to extensionless routes (like `oktowatch.com/dashboard`) instead of just literal `.html` files.

---

## Technical Stack & Architecture Context
- **Hosting & Backend**: Cloudflare Pages + Cloudflare Functions (`functions/api/*`).
- **Database**: Cloudflare D1 (Handles user saved lists, profiles, and history).
- **Auth**: Clerk (Handles authentication and subscription tier metadata: Pro vs Free).
- **APIs**: The frontend *never* calls TMDb directly. All requests proxy through `/api/tmdb/*` to secure API keys and enforce aggressive 5-minute caching.

---

## Known Quirks & Probable Bugs

1. **Cloudflare Edge Caching Delays**
   - **The Issue**: Cloudflare Pages caches HTML aggressively at the edge network. Even with our updated `_headers` file, it can take a few minutes for a pushed commit to become visible to the end user.
   - **Workaround**: Developers and users must occasionally perform a **Hard Refresh (`Cmd+Shift+R` or `Ctrl+F5`)** immediately after a deployment completes.
2. **Search Overlay (`cvPanelGlobalOverlay`) Z-Index Issues**
   - **The Issue**: The slide-over panel injected by `/js/search-panel.js` dynamically creates background overlays. If a user triggers a Clerk auth modal while the search panel is open, the z-indexes can conflict, locking the screen.
   - **Workaround**: Avoid triggering deep interactions when multiple overlapping modals are already open.
3. **Empty / Undefined TMDb Discovery Feeds**
   - **The Issue**: On the dashboard, we fetch TMDb `/discover` and `/trending` logic. If TMDb throws an error or returns `[]`, the UI components do not gracefully handle a "zero-state" error feed inside the carousels just yet, leaving a blank gap.
4. **Clerk `user` Object Loading Gap**
   - **The Issue**: In `public/js/auth.js`, the app relies on an asynchronous Clerk SDK initialization. There is a ~100-300ms window where the SDK is loaded, but `Clerk.user` mapping to our internal UI hasn't caught up, occasionally resulting in momentary default states flashing before the Pro-user configuration applies.

---

## Next Steps for the AI Agent
1. If the user reports UI or CSS layout bugs, always check `public/dashboard/index.html` for layout structure prior to tweaking global variables in `public/index.css`.
2. Any major changes to the layout must ensure that skeleton screens (`.skeleton-card`) mirror the structure closely to avoid layout shift (CLS).
3. We are heavily reliant on `sessionStorage` for tracking the `cv_active_profile` state. Be careful not to overwrite or wipe this without emitting the `cv:profileChanged` event.
