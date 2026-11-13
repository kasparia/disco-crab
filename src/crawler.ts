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

// Fetch a fresh batch of CRAWL_QUERY_LIMIT results from Discogs and store them.
// Returns the raw Discogs response so callers can inspect pagination. The
// Discogs page to fetch is dictated by the caller via `page`; the pageTicker
// is set to that requested page so the frontend controls which page is
// fetched from Discogs.
function makeQuery(query: SearchQuery, page: number): Promise<FetchResponse> {
  handleSettingsChange(query);

  // The frontend dictates the page we ask Discogs for.
  pageTicker = Math.max(1, Math.round(page));
  console.log(pageTicker);

  // Query the current country; the country index advances once all pages of a
  // given country have been collected.
  const country = activeCountryList[countryIndex]
    ?? activeCountryList[activeCountryList.length - 1];

  queryJson = new URLSearchParams({
    genre: query.genre || 'Electronic',
    style: query.style || 'Progressive house, Techno',
    year: query.year || '1999'
  });
  //if (query.style) queryJson.set('style', query.style);
  //if (query.year) queryJson.set('year', query.year);
  // Only apply the country filter when at least one country is selected;
  // otherwise leave the country param empty so Discogs returns all countries.
  if (country) queryJson.set('country', country);
  // queryJson.set('per_page', String(CRAWL_QUERY_LIMIT));

  const urlString: string = BASE_URL + '/database/search?'
    + queryJson.toString()
    + '&token=' + access_token
    + '&page=' + pageTicker
    + '&format=Vinyl'
    + '&per_page=' + CRAWL_QUERY_LIMIT;

  console.log('Fetching: ', queryJson);

  return rateLimitedFetch(urlString, fetchInit)
    .then((response: Response): Promise<FetchResponse> => response.json())
    .then((data: FetchResponse): Promise<FetchResponse> => {
      if (data.results) {
        // Avoid adding the same master id twice
        for (const result of data.results) {
          if (!results.some((r) => r.id === result.id)) {
            results.push(result);
          }
        }
        currentAmountOfPages = data.pagination.pages;
        console.log(data.pagination.pages);
        console.log(`Collected ${results.length} unique results so far (page ${pageTicker})`);
      }

      // advanceTickers(data);

      // Sub-query: fetch the detailed release record for each new result.
      // We return the enriched search response once all sub-queries complete.
      return fetchReleaseDetailsForResults(data.results)
        .then((): FetchResponse => data);
    });
}

// Perform a single crawl step against Discogs using the provided settings.
// Used to populate the results store on demand (for example when the API is
// requested). If the settings differ from the last crawl, the results store is
// reset so the query always starts from page one.
export function runCrawl(query: SearchQuery, page: number): Promise<void> {
  return makeQuery(query, page).then(() => { /* results store is mutated in place */ });
}

// Advance to the next Discogs page within the current query/settings. When the
// current country's search is exhausted we move on to the next selected
// country, and once all countries are done we loop back while continuing to
// collect the same, already-stored results.
function advanceTickers(data: FetchResponse): void {
  const pagination = data.pagination;
  const currentPages = pagination ? pagination.pages : 0;

  if (pageTicker < currentPages) {
    pageTicker += 1; // more pages remain in this country's search
  } else if (countryIndex < activeCountryList.length - 1) {
    countryIndex += 1;
    pageTicker = 1;
  } else {
    console.log('Crawled the full search space for the current settings.');
    pageTicker = 1;
  }
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