# QR Menu Dashboard — Operations & Analytics

Live Demo: https://qr-menu-app-dashboard.vercel.app

Category: Hospitality Operations · Analytics & Management

Stack: React 18 · Vite 5 · Electron 33 · Supabase · Recharts · Tailwind Design

## Overview

QR Menu Dashboard is a unified management console for restaurant teams to monitor live orders, streamline service, and analyze performance. Available as both a responsive web application and a native desktop client via Electron, the dashboard provides real-time order tracking, waiter-call management, menu administration, and data-driven insights in a single, enterprise-grade interface.

Built for fast-paced hospitality environments, it pairs a Supabase-powered backend with an optimized React front end, popup-assisted service workflows, and analytics-ready visualizations.

## Features

- **Live Order Command Center** — Real-time order ingestion, status tracking (pending, preparing, served), and table-aware fulfillment with Supabase realtime subscriptions.
- **Service Request Management** — Centralized waiter-call queue with request-type handling, priority, and resolution tracking supported by dedicated migrations.
- **Menu & Restaurant Administration** — Full CRUD for menu items, categories, pricing, taxes, and currency — including tax/currency migrations and role-ready configuration.
- **Analytics & Reporting** — Recharts-powered dashboards for revenue, order volume, and operational metrics to support data-informed decisions.
- **Desktop & Web Deployment** — Electron builder (NSIS installer, desktop/start-menu shortcuts) for Windows alongside Vite-built web deployment (Vercel + GitHub Pages).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, React DOM 18 |
| Desktop | Electron 33, electron-builder 25 (NSIS, appId `com.qrmenu.dashboard`) |
| Data & Backend | Supabase JS 2.39 (Postgres, Realtime, Auth) |
| Visualization | Recharts 3.8 |
| Styling | CSS3, theme.css, Inter font |
| Build | Vite 5, Electron Builder |

## Project Structure

```
qr-menu-app-dashboard/
├── src/
│   ├── App.jsx               # Main dashboard (order board, analytics, menu admin)
│   ├── PopupApp.jsx          # Popup workflow for service/kitchen views
│   ├── main.jsx              # Entry: routing between App & PopupApp
│   ├── App.css / PopupApp.css / theme.css
│   ├── components/           # Dashboard widgets (order cards, tables, charts)
│   ├── pages/                # Route views (orders, menu, analytics, settings)
│   ├── contexts/             # Global context (orders, restaurant, realtime)
│   ├── services/             # Supabase clients, data services
│   ├── hooks/                # Data and realtime hooks
│   ├── lib/                  # Helpers, formatting, Supabase init
│   ├── constants/            # Status maps, configuration
│   └── utils/                # Pricing, date, business logic
├── services/                 # Extensibility layer for platform integrations
│   └── config/               # Environment bindings (SERVICE_* convention)
├── electron/
│   ├── main.cjs              # Electron main process (window, packaging config)
│   └── preload / assets
├── assets/                   # Icons, product assets (icon.png for installer)
├── database_sql.md           # Full schema (restaurants, menus, orders, calls)
├── database_migration_*.sql  # Incremental migrations (taxes, currency)
├── vite.config.js
├── vercel.json               # Deployment rewrites
└── package.json              # Build: vite + electron + dist
```

> `services/` is reserved for optional platform services. Environment variables follow the `SERVICE_*` convention — `SERVICE_* (alias for AI_GATEWAY_* for backward compat)` where applicable.

## Getting Started

### Prerequisites

- Node.js 18+ (npm 10 recommended via `packageManager`)
- Supabase project

### Installation

```bash
npm install
cp .env.example .env  # if present, or create .env
```

Configure `.env` (Supabase variables as used in `src/lib/`):

```bash
VITE_SUPABASE_URL=your_database_url_here
VITE_SUPABASE_ANON_KEY=your_secret_here
VITE_RESTAURANT_ID=your_restaurant_id_here
# Optional platform services
# SERVICE_API_KEY=your_service_key
# SERVICE_BASE_URL=https://api.example.com
# SERVICE_* (alias for AI_GATEWAY_* for backward compat)
```

### Development

```bash
npm run dev
```

Runs Vite at `http://localhost:5173`. For desktop mode:

```bash
npm run electron
```

### Build

```bash
npm run build        # Web build → dist/
npm run preview      # Preview web build
npm run dist         # Electron build → dist-electron/ (NSIS installer)
```

## Deployment

### Vercel (Web)

`vercel.json` configured for SPA. Connect repo — Build command `npm run build`, Output `dist`.

### GitHub Pages

1. Set `base` in `vite.config.js` if needed for `https://qr-menu-app-dashboard.vercel.app/`.
2. Build and publish `dist/` via Actions or `gh-pages`.

Live demo at `https://qr-menu-app-dashboard.vercel.app`.

### Desktop (Electron)

```bash
npm run dist
```

Produces `QR Menu Dashboard-Setup-1.0.0.exe` in `dist-electron/` (NSIS, non-one-click, desktop + start menu shortcuts).

### Database Setup

1. Dedicated Supabase project.
2. Execute `database_sql.md` schema.
3. Apply `database_migration_currency.sql` and `database_migration_restaurant_taxes.sql`.
4. Verify `assets/icon.png` is present for installer branding.

## Customization

- **Order Workflow** — Adjust order status flow and popup behavior in `src/App.jsx` / `src/PopupApp.jsx` and `src/components/`.
- **Menu & Pricing** — Extend `src/pages/` and `src/services/` for modifiers, availability, tax display, or currency handling.
- **Analytics** — Configure Recharts dashboards in `src/pages/` and `src/components/` for custom KPIs and time ranges.
- **Desktop Branding** — Update `package.json` `build` (appId, productName, icon, NSIS options) and `electron/main.cjs` for window behavior.
- **Realtime** — Tune Supabase realtime channels in `src/contexts/` and `src/hooks/` for order and waiter-call streams; support end-to-end hospitality flow.

## License

MIT
