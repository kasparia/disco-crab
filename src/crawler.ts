import type { Config } from './types';
import { getConfigFilePath, loadConfig, DEFAULT_REQUESTS_PER_MINUTE } from './config';
import { startApi } from './api';

import type {
  DiscogsRelease,
  DiscogsSearchResult,
  FetchInit,
  FetchResponse,
  SearchQuery,
} from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Keep per-page search results small: every result triggers an additional
// release sub-query, so a larger page would exceed the 60 req/min hard limit.
const CRAWL_QUERY_LIMIT: number = 50;   // search results per Discogs request
const PAGE_SIZE: number = 50;           // results served per frontend page
const DEFAULT_COUNTRY: string = 'UK';   // initial country before a query runs
const BASE_URL: string = 'https://api.discogs.com';

// ---------------------------------------------------------------------------
// Crawl state
// ---------------------------------------------------------------------------

// Simple token-bucket limiter. A fixed number of tokens refill continuously;
// a request can fire only when a token is available, otherwise it waits. This
// guarantees we never burst beyond `requestsPerMinute` requests in a minute.
class RateLimiter {
  private readonly capacity: number;      // max tokens (== requests/min)
  private readonly refillPerMs: number;   // tokens gained per millisecond
  private tokens: number;
  private lastRefill: number;

  constructor(requestsPerMinute: number) {
    this.capacity = requestsPerMinute;
    this.refillPerMs = requestsPerMinute / 60000;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
  }

  // Consume one token, waiting until one is available if the bucket is empty.
  async acquire(): Promise<void> {
    const now: number = Date.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (now - this.lastRefill) * this.refillPerMs,
    );
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitMs: number = (1 - this.tokens) / this.refillPerMs;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.ceil(waitMs)));
    this.tokens = 0;
    this.lastRefill = Date.now();
  }
}

let access_token: string = '';
let queryJson: URLSearchParams;

// All results collected from Discogs so far
const results: DiscogsSearchResult[] = [];

// Ticker for enumerating the pages of the current query/settings
let pageTicker: number = 1;

let currentAmountOfPages: number = 0;

// Index of the currently-active country within the selected country list
let countryIndex: number = 0;

// Detailed release records fetched via `GET /releases/{id}` for each search
// result, keyed by release id. The sub-query enriches the search results.
const releaseDetails: Map<number, DiscogsRelease> = new Map();

// Rate limiter that spaces out Discogs requests so we stay under the hard
// limit (default 60 req/min). Set once config is loaded.
let rateLimiter: RateLimiter = new RateLimiter(DEFAULT_REQUESTS_PER_MINUTE);

// Countries selected in the current query (comma-separated in the request).
// Defaults to a single country so behavior matches the original crawler.
let activeCountryList: string[] = [DEFAULT_COUNTRY];

// The last query/settings the crawler ran (used to detect setting changes)
let activeQuery: SearchQuery | null = null;

// Whether the Discogs search for the current settings has more pages left to
// fetch. Cleared when settings change; recomputed every time a page is pulled.
let hasMorePages: boolean = true;

// ---------------------------------------------------------------------------
// Discogs crawler
// ---------------------------------------------------------------------------

export function setToken(token: string): void {
  access_token = token;
}

function setRateLimit(requestsPerMinute: number): void {
  rateLimiter = new RateLimiter(requestsPerMinute);
}

// Perform a rate-limited fetch against the Discogs API.
function rateLimitedFetch(url: string, init: FetchInit): Promise<Response> {
  return rateLimiter.acquire().then(() => fetch(url, init));
}

function queriesDiffer(a: SearchQuery, b: SearchQuery): boolean {
  return a.genre !== b.genre
    || a.style !== b.style
    || a.year !== b.year
    || a.country !== b.country;
}

// Split the comma-separated country value from the request into a list. When
// no country is supplied we return an empty list so the query runs without a
// country filter (the country param is omitted from the Discogs request).
function splitCountries(country: string): string[] {
  return country.split(',').map((c) => c.trim()).filter((c) => c.length > 0);
}

// If the requested settings differ from the current ones, reset the crawler so
// the very next page fetched matches the new settings from page one.
function handleSettingsChange(query: SearchQuery): void {
  const countryList = splitCountries(query.country);

  if (activeQuery && queriesDiffer(activeQuery, query)) {
    results.length = 0;
    releaseDetails.clear();
    pageTicker = 1;
    countryIndex = 0;
    hasMorePages = true;
    console.log('Query settings changed; resetting results to page 1.');
  }

  activeCountryList = countryList;
  activeQuery = query;
}

// Build the fetch options used for every Discogs request.
function buildFetchInit(): FetchInit {
  return {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'FindingThatRecord/0.1',
    },
  };
}

// ---------------------------------------------------------------------------
// Release sub-query
// ---------------------------------------------------------------------------

const fetchInit: FetchInit = buildFetchInit();

// Fetch the detailed record for a single release via `GET /releases/{id}`
// (the database-release endpoint) and store it keyed by release id.
function fetchReleaseDetails(result: DiscogsSearchResult): Promise<void> {
  const url: string = `${BASE_URL}/releases/${result.id}?token=${access_token}`;

  return rateLimitedFetch(url, fetchInit)
    .then((response: Response): Promise<void> =>
      response.text().then((text: string): void => {
        // Discogs can return HTML error pages, empty bodies (deleted/blocked
        // releases) or 404/429 responses. Reading the body as text and only
        // parsing it when it actually contains data avoids the dreaded
        // `response.json()` on an empty body -> "Unexpected end of JSON input".
        const trimmed: string = text.trim();
        if (trimmed.length === 0) {
          console.warn(
            `Release ${result.id} returned an empty body (HTTP ${response.status}); skipping.`,
          );
          return;
        }

        if (!response.ok) {
          console.warn(
            `Release ${result.id} request failed (HTTP ${response.status}): `
            + trimmed.slice(0, 200),
          );
          return;
        }

        let data: DiscogsRelease;
        try {
          data = JSON.parse(trimmed) as DiscogsRelease;
        } catch (error) {
          const parseError: Error = error as Error;
          // Non-JSON body (e.g. an HTML error page). Log it, never crash.
          console.warn(
            `Release ${result.id} returned a non-JSON body: ${parseError.message}`,
          );
          return;
        }

        if (data && data.id) {
          releaseDetails.set(data.id, data);
          result.release = data;
        }
      }),
    )
    .catch((error: Error): void => {
      console.warn(`Failed to fetch release ${result.id}: ${error.message}`);
    });
}

// Fetch release details for the given search results that do not already have
// a cached release record. Runs the sub-queries in parallel, but each request
// is individually rate-limited so the Discogs hard limit is never exceeded.
function fetchReleaseDetailsForResults(resultsToEnrich: DiscogsSearchResult[]): Promise<void[]> {
  const pending: Array<DiscogsSearchResult> = resultsToEnrich.filter(
    (r) => !releaseDetails.has(r.id),
  );
  return Promise.all(pending.map(fetchReleaseDetails));
}

// Fetch a single fresh batch of CRAWL_QUERY_LIMIT results from Discogs for the
// current country/page cursor, store them, and enrich them with release
// sub-queries. Returns the raw Discogs response so callers can inspect
// pagination. The page/country to fetch comes from the internal cursor
// (pageTicker + countryIndex), NOT from the requested frontend page.
function makeQuery(): Promise<FetchResponse> {
  // Query the current country; the country index advances once all pages of a
  // given country have been collected. When no country is selected the list is
  // empty, so the country param is omitted and Discogs returns all countries.
  const country = activeCountryList[countryIndex]
    ?? activeCountryList[activeCountryList.length - 1];

  queryJson = new URLSearchParams({
    genre: activeQuery ? (activeQuery.genre || 'Electronic') : 'Electronic',
    style: activeQuery ? (activeQuery.style || 'Progressive house, Techno') : 'Progressive house, Techno',
    year: activeQuery ? (activeQuery.year || '1999') : '1999',
  });
  if (country) queryJson.set('country', country);

  const urlString: string = BASE_URL + '/database/search?'
    + queryJson.toString()
    + '&token=' + access_token
    + '&page=' + pageTicker
    + '&format=Vinyl'
    + '&per_page=' + CRAWL_QUERY_LIMIT;

  console.log(`Fetching page ${pageTicker} (country '${country}'): `, queryJson.toString());

  return rateLimitedFetch(urlString, fetchInit)
    .then((response: Response): Promise<FetchResponse> => response.json())
    .then((data: FetchResponse): Promise<FetchResponse> => {
      if (data.results) {
        let added = 0;
        // Avoid adding the same release id twice.
        for (const result of data.results) {
          if (!results.some((r) => r.id === result.id)) {
            results.push(result);
            added += 1;
          }
        }
        currentAmountOfPages = data.pagination.pages;
        console.log(`Collected ${results.length} unique results so far (page ${pageTicker}, +${added} new)`);

        // Record whether the Discogs search still has more pages to fetch.
        updateHasMore(data);
      }

      // Sub-query: fetch the detailed release record for each new result.
      // Guard against responses without a `results` field (e.g. a transient
      // rate-limit/error body), which would otherwise crash the crawl on
      // `fetchReleaseDetailsForResults(undefined).filter(...)`.
      // We return the enriched search response once all sub-queries complete.
      return fetchReleaseDetailsForResults(data.results || [])
        .then((): FetchResponse => data);
    });
}

// Advance to the next Discogs page/country within the current query/settings.
function advanceTickers(data: FetchResponse): void {
  const pagination = data.pagination;
  const currentPages = pagination ? pagination.pages : 0;

  // If Discogs reports more pages, move to the next page of this country.
  if (pageTicker < currentPages) {
    pageTicker += 1;
    return;
  }

  // This country's pages are exhausted. Move on to the next selected country
  // (resetting its page cursor) if one remains.
  if (countryIndex < activeCountryList.length - 1) {
    countryIndex += 1;
    pageTicker = 1;
    return;
  }

  // All countries crawled -> no more results available for these settings.
  console.log('Crawled the full search space for the current settings.');
  hasMorePages = false;
}

// Decide whether there are more Discogs pages to fetch for the current
// settings, based on the official page count, any remaining countries, and
// whether Discogs actually returned results (protects against misreported
// totals / off-by-one page counts).
function updateHasMore(data: FetchResponse): void {
  const pagination = data.pagination;
  const currentPages = pagination ? pagination.pages : 0;
  const resultCount = (data.results && data.results.length) || 0;

  const morePagesReported = pageTicker < currentPages;
  const moreCountries = countryIndex < activeCountryList.length - 1;

  // There is definitely more if Discogs reports further pages or another
  // country is queued.
  if (morePagesReported || moreCountries) {
    hasMorePages = true;
    return;
  }

  // No more pages/countries reported. If this fetch returned no results we've
  // reached the end; otherwise stay conservative and wait for an empty page.
  if (!gotResults(resultCount)) {
    hasMorePages = false;
  }
}

function gotResults(count: number): boolean {
  return count > 0;
}

/**
 * Crawl on demand until the results store can satisfy the frontend page the
 * caller asked for, or until Discogs has no more results for the current
 * settings. The frontend 'page' maps to a slice of `results[]`:
 *   slice for page N == results[(N-1) * PAGE_SIZE .. N * PAGE_SIZE)
 *
 * @param query the query settings from the request
 * @param page  the frontend page number being requested (1-based)
 */
export function runCrawl(query: SearchQuery, page: number): Promise<void> {
  handleSettingsChange(query);

  // The number of stored results needed to serve the requested slice.
  const needed = Math.max(0, page * PAGE_SIZE);

  return crawlUntil(() => results.length >= needed || !hasMorePages);
}

// Whether the current query's search on Discogs has any further pages to fetch.
// Exposed so the API layer can tell the frontend when no more results exist.
export function hasMoreResults(): boolean {
  return hasMorePages;
}

// Keep pulling Discogs pages (one per makeQuery call) until `isSatisfied`
// returns true, i.e. the requested slice is covered or no more results exist.
function crawlUntil(isSatisfied: () => boolean): Promise<void> {
  const next = (): Promise<void> => {
    if (isSatisfied()) {
      return Promise.resolve();
    }
    return makeQuery().then((data) => {
      advanceTickers(data);
      return next();
    });
  };

  return next();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const configFilePath: string = getConfigFilePath(process.argv);
let config: Config;

try {
  config = loadConfig(configFilePath);
} catch (err) {
  const error: NodeJS.ErrnoException = err as NodeJS.ErrnoException;
  console.error(`Error reading config file "${configFilePath}": ${error.message}`);
  process.exit(1);
}

if (config.ACCESS_TOKEN === '') {
  console.error('ACCESS_TOKEN is empty in config file. Please add your token.');
  process.exit(1);
}

setToken(config.ACCESS_TOKEN);
setRateLimit(config.REQUESTS_PER_MINUTE || DEFAULT_REQUESTS_PER_MINUTE);
console.log(`Rate limit: ${config.REQUESTS_PER_MINUTE || DEFAULT_REQUESTS_PER_MINUTE} req/min`);

// Start the HTTP API server. Each API request triggers a crawl against
// Discogs using the settings provided in the request, so the first batch of
// results is fetched on demand.
startApi(results, runCrawl, 3333);