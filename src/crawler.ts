import type { Config } from './types';
import { getConfigFilePath, loadConfig } from './config';
import { startApi } from './api';

import type {
  DiscogsSearchResult,
  FetchInit,
  FetchResponse,
} from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CRAWL_QUERY_LIMIT: number = 100; // results per Discogs API request
const CRAWL_INTERVAL_MS: number = 1000; // throttle to remain under Discogs rate limits

// ---------------------------------------------------------------------------
// Lookup tables (const assertion for immutable tuples)
// ---------------------------------------------------------------------------

const countryLoot = [
  'UK',
  'US',
  'Germany',
  'Netherlands',
  'Italy',
  'Spain',
  'Canada',
  'Australia',
  'France',
  'Europe',
  'Belgium',
  'Unknown',
  'Switzerland',
  'Sweden',
  'Hungary',
  'Greece',
  'Japan',
  'Portugal',
  'Poland',
  'Ukraine',
  'Denmark',
  'Mexico',
  'Brazil',
  'Czech Republic',
  'Israel',
  'UK & Europe',
  'Argentina',
  'Taiwan',
  'Romania',
] as const;

const styleLoot = [
  'Progressive Trance',
  'Progressive House',
  'Techno',
] as const;

const yearLoot = [
  1997,
  1998,
  1999,
  2000,
  2001,
  2002,
] as const;

// ---------------------------------------------------------------------------
// Crawl state
// ---------------------------------------------------------------------------

let access_token: string = '';
let queryJson: URLSearchParams;

// All results collected from Discogs so far
const results: DiscogsSearchResult[] = [];

// Tickers for enumerating the search space
let pageTicker: number = 1;
let styleTicker: number = 0;
let yearTicker: number = 0;
let countryTicker: number = 0;

// ---------------------------------------------------------------------------
// Discogs crawler
// ---------------------------------------------------------------------------

function makeQuery(config: Config): void {
  queryJson = new URLSearchParams({
    genre: 'Electronic',
    style: styleLoot[styleTicker],
    year: String(yearLoot[yearTicker]),
    country: countryLoot[countryTicker],
    per_page: String(CRAWL_QUERY_LIMIT),
  });

  const urlString: string = 'https://api.discogs.com/database/search?'
    + queryJson.toString()
    + '&token=' + config.ACCESS_TOKEN
    + '&page=' + pageTicker;

  const fetchInit: FetchInit = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'FindingThatRecord/0.1',
    },
  };

  fetch(urlString, fetchInit)
    .then((response: Response): Promise<FetchResponse> => response.json())
    .then((data: FetchResponse): void => {
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

      // Throttle so we're making under 60 calls per minute to the API
      setTimeout(() => {
        makeQuery(config);
      }, CRAWL_INTERVAL_MS);
    })
    .catch((error: Error): void => {
      console.error(`Crawl request failed: ${error.message}`);
      setTimeout(() => {
        makeQuery(config);
      }, CRAWL_INTERVAL_MS);
    });
}

// Advance to the next Discogs search once the current one is exhausted.
function advanceTickers(data: FetchResponse): void {
  const pagination = data.pagination;
  const currentPages = pagination ? pagination.pages : 0;

  if (pageTicker < currentPages) {
    pageTicker += 1; // more pages remain in this search
    return;
  }

  // Current search is exhausted; move to the next combination
  pageTicker = 1;

  if (styleTicker < styleLoot.length - 1) {
    styleTicker += 1;
  } else if (yearTicker < yearLoot.length - 1) {
    styleTicker = 0;
    yearTicker += 1;
  } else if (countryTicker < countryLoot.length - 1) {
    styleTicker = 0;
    yearTicker = 0;
    countryTicker += 1;
  } else {
    console.log('Crawled the full search space. Restarting from the beginning.');
    styleTicker = 0;
    yearTicker = 0;
    countryTicker = 0;
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

access_token = config.ACCESS_TOKEN;

if (access_token === '') {
  console.error('ACCESS_TOKEN is empty in config file. Please add your token.');
  process.exit(1);
}

// Start the crawler in the background
//makeQuery(config);

// Start the HTTP API server, serving the shared results store
startApi(results);