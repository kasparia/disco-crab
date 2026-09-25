import type { Config } from './types';
import { getConfigFilePath, loadConfig } from './config';
import { startApi } from './api';

import type {
  DiscogsSearchResult,
  FetchInit,
  FetchResponse,
  SearchQuery,
} from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CRAWL_QUERY_LIMIT: number = 100; // results per Discogs API request
const DEFAULT_COUNTRY: string = 'UK';  // used when no country is selected

// ---------------------------------------------------------------------------
// Crawl state
// ---------------------------------------------------------------------------

let access_token: string = '';
let queryJson: URLSearchParams;

// All results collected from Discogs so far
const results: DiscogsSearchResult[] = [];

// Ticker for enumerating the pages of the current query/settings
let pageTicker: number = 1;

// Index of the currently-active country within the selected country list
let countryIndex: number = 0;

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

function queriesDiffer(a: SearchQuery, b: SearchQuery): boolean {
  return a.genre !== b.genre
    || a.style !== b.style
    || a.year !== b.year
    || a.country !== b.country;
}

// Split the comma-separated country value from the request into a list. When
// no country is supplied we fall back to a single default country.
function splitCountries(country: string): string[] {
  const list = country.split(',').map((c) => c.trim()).filter((c) => c.length > 0);
  return list.length > 0 ? list : [DEFAULT_COUNTRY];
}

// If the requested settings differ from the current ones, reset the crawler so
// the very next page fetched matches the new settings from page one.
function handleSettingsChange(query: SearchQuery): void {
  const countryList = splitCountries(query.country);

  if (activeQuery && queriesDiffer(activeQuery, query)) {
    results.length = 0;
    pageTicker = 1;
    countryIndex = 0;
    console.log('Query settings changed; resetting results to page 1.');
  }

  activeCountryList = countryList;
  activeQuery = query;
}

// Fetch a fresh batch of CRAWL_QUERY_LIMIT results from Discogs and store them.
// Returns the raw Discogs response so callers can inspect pagination.
function makeQuery(query: SearchQuery): Promise<FetchResponse> {
  handleSettingsChange(query);

  // Query the current country; the country index advances once all pages of a
  // given country have been collected.
  const country = activeCountryList[countryIndex]
    ?? activeCountryList[activeCountryList.length - 1];

  queryJson = new URLSearchParams({ genre: query.genre || 'Electronic' });
  if (query.style) queryJson.set('style', query.style);
  if (query.year) queryJson.set('year', query.year);
  queryJson.set('country', country);
  queryJson.set('per_page', String(CRAWL_QUERY_LIMIT));

  const urlString: string = 'https://api.discogs.com/database/search?'
    + queryJson.toString()
    + '&token=' + access_token
    + '&page=' + pageTicker;

  const fetchInit: FetchInit = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'FindingThatRecord/0.1',
    },
  };

  return fetch(urlString, fetchInit)
    .then((response: Response): Promise<FetchResponse> => response.json())
    .then((data: FetchResponse): FetchResponse => {
      if (data.results) {
        // Avoid adding the same master id twice
        for (const result of data.results) {
          if (!results.some((r) => r.id === result.id)) {
            results.push(result);
          }
        }
        console.log(`Collected ${results.length} unique results so far (page ${pageTicker})`);
      }

      advanceTickers(data);
      return data;
    });
}

// Perform a single crawl step against Discogs using the provided settings.
// Used to populate the results store on demand (for example when the API is
// requested). If the settings differ from the last crawl, the results store is
// reset so the query always starts from page one.
export function runCrawl(query: SearchQuery): Promise<void> {
  return makeQuery(query).then(() => { /* results store is mutated in place */ });
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

// Start the HTTP API server. Each API request triggers a crawl against
// Discogs using the settings provided in the request, so the first batch of
// results is fetched on demand.
startApi(results, runCrawl, 3333);