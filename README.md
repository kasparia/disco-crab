# DISCO-CRAB
Disco-crab is a simple Discogs API crawler made to making finding certain records from Discogs easier.

It crawls through the Discogs API with rate-limit throttling. When an HTTP request hits the API, it triggers a crawl against Discogs and then returns the newly collected results as paginated chunks (50 per page). A React/Next.js frontend renders and browses those results.

## Structure
- `src/crawler.ts` — crawler queries Discogs API on demand (`runCrawl(query)`), using the query settings provided via the API. After each search (25 results per page), it issues a **release sub-query** (`GET /releases/{id}`) for every result to enrich it with the detailed release record (tracklist, artists, formats, notes, images, …). All requests pass through a token-bucket rate limiter.
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

### Launch the whole application (backend + frontend) with one command
```
npm run node
```
This installs dependencies for both parts (via `npm run install:all` if needed), builds the crawler, then starts the backend API and the Next.js frontend concurrently. The backend listens on `http://localhost:3333/api?page=1` and the frontend on `http://localhost:3000`.

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

## Rate limiting & release sub-query

The Discogs API hard-limits authenticated requests to 60 per minute. Every search page of 25 results triggers 25 additional release sub-queries, so a single crawl step issues up to **26 requests**. To stay under the cap:

- Search results are limited to **25 per page** (`CRAWL_QUERY_LIMIT`).
- A built-in **token-bucket rate limiter** throttles every request (search + release sub-queries) so the crawler never exceeds the configured limit.

The limit is read from the `REQUESTS_PER_MINUTE` key in `.env` (defaults to `60`):

```
ACCESS_TOKEN=...
REQUESTS_PER_MINUTE=60
```

Fetched release records are cached by release id, so revisiting the same page reuses cached details instead of refetching from Discogs.

### TODO
- _