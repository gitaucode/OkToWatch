# OkToWatch

> See what's in it before they watch.

Instant content breakdowns for any movie or TV show — built for parents.

**Live site:** https://oktowatch.com

## Stack
- **Frontend:** Vanilla HTML/CSS/JS — Cloudflare Pages
- **Backend:** Cloudflare Pages Functions
- **Database:** Cloudflare D1 (SQLite)
- **Auth:** Clerk
- **AI:** Groq (Llama)
- **Movie data:** TMDB API

## Project structure
```
├── public/          # Frontend — deployed to Cloudflare Pages
│   ├── index.html   # Homepage / search
│   ├── dashboard.html
│   ├── js/auth.js   # Shared nav + Clerk auth
│   └── ...
├── functions/       # Cloudflare Pages Functions (backend API)
│   └── api/
│       ├── analyze.js
│       ├── profiles.js
│       ├── history.js
│       └── ...
├── schema.sql       # D1 database schema
└── wrangler.toml    # Cloudflare config
```

## Setup

1. Install Wrangler: `npm install -g wrangler`
2. Copy `.dev.vars.example` to `.dev.vars` and fill in your keys
3. Create D1 database: `wrangler d1 create oktowatch`
4. Run migrations: `wrangler d1 execute oktowatch --file=./schema.sql`
5. Deploy: `wrangler pages deploy public --project-name clearview --branch production`

## Environment variables
Set these in Cloudflare Pages → Settings → Variables and Secrets:
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `GROQ_API_KEY`
- `TMDB_API_KEY`
- `TMDB_TOKEN`

## Database backup
```bash
wrangler d1 export clearviewbeta --output=backup.sql
```
