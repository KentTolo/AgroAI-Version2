# AgroAI web app

React 19 + TypeScript single-page app built with Vite and Tailwind CSS.

```bash
npm ci
npm run dev        # http://localhost:5173, proxies /api to http://localhost:8000
npm test           # Vitest + Testing Library
npm run lint       # oxlint
npm run typecheck
npm run build      # production bundle in dist/
```

Set `VITE_DEV_API_PROXY` to point the dev proxy at a different API, or `VITE_API_URL` at build
time to call an API on another origin. See the [project README](../README.md) for more.
