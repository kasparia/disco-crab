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

import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

import type { Config } from './types';

interface DiscogsConfig extends Config {
  // reserved for future Discogs-specific config keys
}

const DEFAULT_CONFIG_FILE: string = '.env';

function loadConfig(configPath: string): Config {
  const content: string = fs.readFileSync(configPath, 'utf8');
  const config: Config = {
    ACCESS_TOKEN: '',
  };

  for (const line of content.split('\n')) {
    const trimmedLine: string = line.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue; // skip empty lines and comments
    }

    const equalsIndex: number = trimmedLine.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key: string = trimmedLine.substring(0, equalsIndex).trim();
    const value: string = trimmedLine.substring(equalsIndex + 1).trim();

    switch (key) {
      case 'ACCESS_TOKEN':
        config.ACCESS_TOKEN = value;
        break;
      default:
        console.log(`Unknown config key: ${key}`);
        break;
    }
  }

  return config;
}

function getConfigFilePath(argv: string[]): string {
  const configIndex: number = argv.indexOf('--config');
  if (configIndex !== -1 && configIndex + 1 < argv.length) {
    return argv[configIndex + 1];
  }
  return DEFAULT_CONFIG_FILE;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type {
  Community,
  DiscogsSearchResult,
  FetchInit,
  FetchResponse,
  Pagination,
  UserData,
} from './types';

// Lookup tables (const assertion for immutable tuples)
const countryLoot = [
  'UK',
  'US',
  'Germany',
  'Netherlands',
  'Russia',
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

const resultsFileName: string = 'crawl_results_' + Date.now().toString();
let access_token: string = ''; // token used for authentication
let queryJson: URLSearchParams;
let results: DiscogsSearchResult[] = [];

// Tickers
let pageTicker: number = 1;
let styleTicker: number = 0;
let yearTicker: number = 0;
let countryTicker: number = 0;

const writeResultsFile: boolean = false;

/*function echoResults(): void {
  console.log('      ');
  console.log(' ----- ');
  for (const singleResult of results) {
    if (singleResult.community.have < 101 && singleResult.community.have > 96
      && singleResult.community.want > 92 && singleResult.community.want < 94) {
      console.log('https://www.discogs.com' + singleResult.uri);
    }
  }
  console.log(' ----- ');
  console.log('      ');
}*/

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
      /*if (pageTicker === 1) {
        echoResults();
        console.log('Country: _______' + countryLoot[countryTicker]);
        console.log('Year: __________' + yearLoot[yearTicker]);
        console.log('Amount: ________' + data.pagination.items);
        console.log('Style: _________' + styleLoot[styleTicker]);
      }
      console.log('Crawling page: ' + data.pagination.page + ' / ' + data.pagination.pages + '     ...');

      for (const entry of data.results) {
        results.push(entry);
        if (writeResultsFile) {
          fs.appendFile(
            countryLoot[countryTicker] + '_' + resultsFileName + '.json',
            JSON.stringify(entry) + '\r\n',
            (error: NodeJS.ErrnoException | null) => {
              if (error) {
                console.log(error);
              }
            },
          );
        }
      }*/

      /*if (pageTicker === data.pagination.pages) {
        if (yearTicker < yearLoot.length - 1) {
          yearTicker++;
        } else if (styleTicker < styleLoot.length - 1) {
          yearTicker = 0;
          styleTicker++;
        } else if (countryTicker < countryLoot.length - 1) {
          yearTicker = 0;
          styleTicker = 0;
          countryTicker++;
          results = [];
        } else {
          return; // all other cases -> end
        }

        pageTicker = 1; // reset to one
      } else if (pageTicker < data.pagination.pages) {
        pageTicker++;
      }*/

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
