# DISCO-CRAB
Disco-crab is a simple Discogs API crawler made to making finding certain records from Discogs easier.

It crawls through the Discogs API with rate-limit throttling. When an HTTP request hits the API, it triggers a crawl against Discogs and then returns the newly collected results as paginated chunks (50 per page). A React/Next.js frontend renders and browses those results.

## Structure
- `src/crawler.ts` — crawler queries Discogs API on demand (`runCrawl(query)`), using the query settings provided via the API
- `src/api.ts` — HTTP API server. Each `/api?page=N` request triggers a `runCrawl(query)`, then serves the cached results (50 per page)
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

## Query settings

The crawler's query can be adjusted per-request via these optional URL parameters:

- `genre` — defaults to `Electronic`
- `style`
- `year`
- `country` — a single country, or a comma-separated list (`UK,US,Germany`)

Example: `http://localhost:3333/api?page=1&genre=Electronic&style=Techno&year=2000&country=Germany,France`

An empty (or omitted) parameter tells the crawler to use its default for that axis. Whenever the settings change, the crawler resets its result store and starts collecting again from page 1.

The frontend exposes a **Query Settings** panel at the top of the page:

- Text fields for Genre, Style, and Year.
- A **multi-select** for Countries (list of options from the crawler's lookup table).
- A **Search** button that runs the crawl with the current settings.

Editing fields only updates the form — the crawl starts (resetting to page one) when **Search** is clicked.

### TODO
- _