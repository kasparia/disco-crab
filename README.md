# DISCO-CRAB
Disco-crab is a simple Discogs API crawler made to making finding certain records from Discogs easier.

It crawls through the Discogs API with rate-limit throttling. When an HTTP request hits the API, it triggers a crawl against Discogs and then returns the newly collected results as paginated chunks (50 per page). A React/Next.js frontend renders and browses those results.

## Structure
- `src/crawler.ts` — crawler queries Discogs API on demand (`runCrawl()`), advancing through the search space
- `src/api.ts` — HTTP API server. Each `/api?page=N` request triggers a `runCrawl()`, then serves the cached results (50 per page)
- `src/config.ts` — loads configuration from an `.env` file (`--config <path>`).
- `frontend/` — Next.js + React frontend. It proxies `/api/*` to the crawler and displays the JSON on the index page (card view or raw JSON toggle, with pagination).

## Installing / Building / Running
Install root dependencies and build the crawler:
```
npm install
npm run build
```

### Backend (crawler + API)
```
npm run start
npm run dev       # ts-node, for development
```
The API listens on `http://localhost:3333/api?page=1`.

### Frontend (Next.js)
```
cd frontend
npm install
npm run dev       # http://localhost:3001
```
Run the crawler backend first; the frontend proxies `/api` to it. To point the frontend at a different backend, set `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3333`).

### TODO
- Modify API so that crawler settings are configured via it