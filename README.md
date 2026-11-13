# DISCO-CRAB

Disco-crab is a simple Discogs API crawler for finding certain records from
Discogs more easily.

It crawls the Discogs API with rate-limit throttling. When an HTTP request hits
the API, it triggers a crawl against Discogs and then returns the newly
collected results as paginated chunks (50 per page). A **static page** (plain
HTML/CSS/vanilla JS, no build step) renders and browses those results. The
whole app — page **and** API — is served by a single Node process on one port.

## Structure

- `src/crawler.ts` — crawler queries the Discogs API on demand (`runCrawl(query)`),
  using the query settings provided via the API. After each search, it issues a
  **release sub-query** (`GET /releases/{id}`) for every result to enrich it
  with the detailed release record (tracklist, artists, formats, notes, images,
  …). All requests pass through a token-bucket rate limiter.
- `src/api.ts` — HTTP server. Each `/api?page=N` request triggers a
  `runCrawl(query)`, then serves the cached results (50 per page). Any
  non-`/api` request serves the static frontend from `public/` (with basic
  path-traversal protection).
- `src/config.ts` — loads configuration from an `.env` file (`--config <path>`).
- `public/` — the static frontend: `index.html`, `styles.css`, `app.js`.
  It talks directly to the crawler API at the same origin (`/api`).

## Installing / building / running

```
npm install
npm run build
npm start
```

Open **http://localhost:3333/** — the crawler server serves both the static
frontend and the `/api` endpoints from a single origin, so no proxy or CORS
setup is needed.

Useful scripts:

- `npm run build` — compile TypeScript to `dist/` (`tsc`)
- `npm start` — run the compiled crawler (`node dist/crawler.js`)
- `npm run dev` — run via ts-node for development
- `npm run clean` — remove `dist/`

The API is also reachable directly: `http://localhost:3333/api?page=1`.

## Query settings

The crawler's query can be adjusted per-request via these optional URL parameters:

- `genre` — defaults to `Electronic`
- `style`
- `year`
- `country` — a single country, or a comma-separated list (`UK,US,Germany`)

Example: `http://localhost:3333/api?page=1&genre=Electronic&style=Techno&year=2000&country=Germany,France`

An empty (or omitted) parameter tells the crawler to use its default for that
axis. Whenever the settings change, the crawler resets its result store and
starts collecting again from page 1.

The static frontend exposes a **Query Settings** panel at the top of the page:

- Text fields for Genre, Style, and Year.
- A **multi-select** for Countries (list of options from the crawler's lookup table).
- A **Search** button that runs the crawl with the current settings.

Editing fields only updates the form — the crawl starts (resetting to page one)
when **Search** is clicked. The page also supports sorting by Have/Want,
pagination, and a card-view / raw-JSON toggle.

## Rate limiting & release sub-query

The Discogs API hard-limits authenticated requests to 60 per minute. Every
search page of 25 results triggers 25 additional release sub-queries, so a
single crawl step issues up to **26 requests**. To stay under the cap:

- Search results are limited to **25 per page** (`CRAWL_QUERY_LIMIT`).
- A built-in **token-bucket rate limiter** throttles every request (search +
  release sub-queries) so the crawler never exceeds the configured limit.

The limit is read from the `REQUESTS_PER_MINUTE` key in `.env` (defaults to `60`):

```
ACCESS_TOKEN=...
REQUESTS_PER_MINUTE=60
```

Fetched release records are cached by release id, so revisiting the same page
reuses cached details instead of refetching from Discogs.