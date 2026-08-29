# QR Menu Dashboard â€” Operations & Analytics

Live Demo: https://gourab775.github.io/qr-menu-app-dashboard

Category: Hospitality Operations Â· Analytics & Management

Stack: React 18 Â· Vite 5 Â· Electron 33 Â· Supabase Â· Recharts Â· Tailwind Design

## Overview

QR Menu Dashboard is a unified management console for restaurant teams to monitor live orders, streamline service, and analyze performance. Available as both a responsive web application and a native desktop client via Electron, the dashboard provides real-time order tracking, waiter-call management, menu administration, and data-driven insights in a single, enterprise-grade interface.

Built for fast-paced hospitality environments, it pairs a Supabase-powered backend with an optimized React front end, popup-assisted service workflows, and analytics-ready visualizations.

## Features

- **Live Order Command Center** â€” Real-time order ingestion, status tracking (pending, preparing, served), and table-aware fulfillment with Supabase realtime subscriptions.
- **Service Request Management** â€” Centralized waiter-call queue with request-type handling, priority, and resolution tracking supported by dedicated migrations.
- **Menu & Restaurant Administration** â€” Full CRUD for menu items, categories, pricing, taxes, and currency â€” including tax/currency migrations and role-ready configuration.
- **Analytics & Reporting** â€” Recharts-powered dashboards for revenue, order volume, and operational metrics to support data-informed decisions.
- **Desktop & Web Deployment** â€” Electron builder (NSIS installer, desktop/start-menu shortcuts) for Windows alongside Vite-built web deployment (Vercel + GitHub Pages).

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
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ App.jsx               # Main dashboard (order board, analytics, menu admin)
â”‚   â”œâ”€â”€ PopupApp.jsx          # Popup workflow for service/kitchen views
â”‚   â”œâ”€â”€ main.jsx              # Entry: routing between App & PopupApp
â”‚   â”œâ”€â”€ App.css / PopupApp.css / theme.css
â”‚   â”œâ”€â”€ components/           # Dashboard widgets (order cards, tables, charts)
â”‚   â”œâ”€â”€ pages/                # Route views (orders, menu, analytics, settings)
â”‚   â”œâ”€â”€ contexts/             # Global context (orders, restaurant, realtime)
â”‚   â”œâ”€â”€ services/             # Supabase clients, data services
â”‚   â”œâ”€â”€ hooks/                # Data and realtime hooks
â”‚   â”œâ”€â”€ lib/                  # Helpers, formatting, Supabase init
â”‚   â”œâ”€â”€ constants/            # Status maps, configuration
â”‚   â””â”€â”€ utils/                # Pricing, date, business logic
â”œâ”€â”€ services/                 # Extensibility layer for platform integrations
â”‚   â””â”€â”€ config/               # Environment bindings (SERVICE_* convention)
â”œâ”€â”€ electron/
â”‚   â”œâ”€â”€ main.cjs              # Electron main process (window, packaging config)
â”‚   â””â”€â”€ preload / assets
â”œâ”€â”€ assets/                   # Icons, product assets (icon.png for installer)
â”œâ”€â”€ database_sql.md           # Full schema (restaurants, menus, orders, calls)
â”œâ”€â”€ database_migration_*.sql  # Incremental migrations (taxes, currency)
â”œâ”€â”€ vite.config.js
â”œâ”€â”€ vercel.json               # Deployment rewrites
â””â”€â”€ package.json              # Build: vite + electron + dist
```

> `services/` is reserved for optional platform services. Environment variables follow the `SERVICE_*` convention â€” `SERVICE_* (alias for AI_GATEWAY_* for backward compat)` where applicable.

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
npm run build        # Web build â†’ dist/
npm run preview      # Preview web build
npm run dist         # Electron build â†’ dist-electron/ (NSIS installer)
```

## Deployment

### Vercel (Web)

`vercel.json` configured for SPA. Connect repo â€” Build command `npm run build`, Output `dist`.

### GitHub Pages

1. Set `base` in `vite.config.js` if needed for `https://gourab775.github.io/qr-menu-app-dashboard/`.
2. Build and publish `dist/` via Actions or `gh-pages`.

Live demo at `https://gourab775.github.io/qr-menu-app-dashboard`.

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

- **Order Workflow** â€” Adjust order status flow and popup behavior in `src/App.jsx` / `src/PopupApp.jsx` and `src/components/`.
- **Menu & Pricing** â€” Extend `src/pages/` and `src/services/` for modifiers, availability, tax display, or currency handling.
- **Analytics** â€” Configure Recharts dashboards in `src/pages/` and `src/components/` for custom KPIs and time ranges.
- **Desktop Branding** â€” Update `package.json` `build` (appId, productName, icon, NSIS options) and `electron/main.cjs` for window behavior.
- **Realtime** â€” Tune Supabase realtime channels in `src/contexts/` and `src/hooks/` for order and waiter-call streams; support end-to-end hospitality flow.

## License

MIT
