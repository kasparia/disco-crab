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


fs = require('fs');

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
  'Romania'
];

const styleLoot = [
  'Progressive Trance',
  'Progressive House',
  'Techno'
];

const yearLoot = [
  1997,
  1998,
  1999,
  2000,
  2001,
  2002
];

const resultsFileName = 'crawl_results_' + Date.now().toString();
let discoToken = ''; // token used for authentication
let queryJson;
let results = [];

// tickers
let pageTicker = 1;
let styleTicker = 0;
let yearTicker = 0;
let countryTicker = 0;

const writeResultsFile = false;

function echoResults () {
  console.log('       ');
  console.log(' ----- ');
  for (let singleResult of results) {
    if (singleResult.community.have < 101 && singleResult.community.have > 96
      && singleResult.community.want > 92 && singleResult.community.want < 94) {
        console.log('https://www.discogs.com' + singleResult.uri);
    }
  }
  console.log(' ----- ');
  console.log('       ');
}


function makeQuery () {
  queryJson = new URLSearchParams({
    genre: 'Electronic',
    style: styleLoot[styleTicker],
    year: yearLoot[yearTicker],
    country: countryLoot[countryTicker],
    per_page: 100
  });

  fetch('https://api.discogs.com/database/search?' + queryJson.toString() + '&token=' + discoToken + '&page=' + pageTicker, {
    "method": 'GET',
    "headers": {
      "Accept"       : "application/json",
      "Content-Type" : "application/json",
      "User-Agent"   : "FindingThatRecord/0.1"
    }
  })
  .then((response) => response.json())
  .then((data) => {
    if (pageTicker == 1) {
      echoResults();
      console.log('Country: _______' + countryLoot[countryTicker]);
      console.log('Year: __________' + yearLoot[yearTicker]);
      console.log('Amount: ________' + data.pagination.items);
      console.log('Style: _________' + styleLoot[styleTicker]);
    }
    console.log('Crawling page: ' + data.pagination.page + ' / ' + data.pagination.pages + '     ...');
    
    
    for(const entry of data.results) {
      results.push(entry);
      if (writeResultsFile) {
        fs.appendFile(countryLoot[countryTicker] + '_' + resultsFileName + '.json', JSON.stringify(entry) + '\r\n', error => {
          if (error) {
            console.log(error)
          }
        });
      }
      
    }

    if (pageTicker == data.pagination.pages) {
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
      
    }

    // Throttle so we're making under 60 calls per minute to the API
    setTimeout(() => {
      makeQuery();  
    }, 1000)
  });
}


fs.readFile('auth.conf', 'utf8', function(err, data){
  discoToken = data;

  if (discoToken !== '') {
    makeQuery();
  }
});