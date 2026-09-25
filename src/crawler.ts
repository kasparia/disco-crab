/*
Example json:
{
  country: 'UK',
  year: '2001',
  format: [ 'Vinyl', '12"', '33 ⅓ RPM' ],
  label: [ "Droppin' Science" ],
  type: 'master',
  genre: [ 'Electronic', 'Hip Hop' ],
  style: [ 'Instrumental', 'Trip Hop', 'Drum n Bass' ],
  id: 219265,
  barcode: [],
  user_data: { in_wantlist: false, in_collection: false },
  master_id: 219265,
  master_url: 'https://api.discogs.com/masters/219265',
  uri: '/Danny-Breaks-Beat-Biter/master/219265',
  catno: 'DS 27',
  title: 'Danny Breaks - Beat Biter',
  thumb: 'https://i.discogs.com/073zuIF6gEXgjcaNiPvavrGK7aG1bnTaQgXTfMo2E7I/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE0ODg2/OC0xNTIyNDA0ODUz/LTQ4NjIuanBlZw.jpeg',
  cover_image: 'https://i.discogs.com/30sUDLAp_FgtDkhASq-vtFKbtgqEfkrufjmLvKF4FlU/rs:fit/g:sm/q:90/h:593/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE0ODg2/OC0xNTIyNDA0ODUz/LTQ4NjIuanBlZw.jpeg',
  resource_url: 'https://api.discogs.com/masters/219265',
  community: { want: 183, have: 313 }
}*/

import type { Config } from './types';
import { getConfigFilePath, loadConfig } from './config';

import type {
  DiscogsSearchResult,
  FetchInit,
  FetchResponse,
} from './types';

// Lookup tables (const assertion for immutable tuples)
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

let access_token: string = ''; // token used for authentication
let queryJson: URLSearchParams;
let results: DiscogsSearchResult[] = [];

// Tickers
let pageTicker: number = 1;
let styleTicker: number = 0;
let yearTicker: number = 0;
let countryTicker: number = 0;

const writeResultsFile: boolean = false;

function makeQuery(config: Config): void {
  queryJson = new URLSearchParams({
    genre: 'Electronic',
    style: styleLoot[styleTicker],
    year: String(yearLoot[yearTicker]),
    country: countryLoot[countryTicker],
    per_page: '100',
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
      console.log(data);

      // Throttle so we're making under 60 calls per minute to the API
      setTimeout(() => {
        makeQuery(config);
      }, 1000);
    });
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

makeQuery(config);
