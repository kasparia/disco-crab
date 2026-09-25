// Mirrors the crawler API response types found in disco-crab/src/types.ts

export interface UserData {
  in_wantlist: boolean;
  in_collection: boolean;
}

export interface Community {
  want: number;
  have: number;
}

export interface DiscogsSearchResult {
  country: string;
  year: string;
  format: string[];
  label: string[];
  type: string;
  genre: string[];
  style: string[];
  id: number;
  barcode: string[];
  user_data: UserData;
  master_id: number;
  master_url: string;
  uri: string;
  catno: string;
  title: string;
  thumb: string;
  cover_image: string;
  resource_url: string;
  community: Community;
  // Enriched by the release sub-query (`GET /releases/{id}`). Present once
  // the detailed release record has been fetched for this result.
  release?: DiscogsRelease;
}

// Mirrors the `database-release` API types found in disco-crab/src/types.ts.

export interface Track {
  position: string;
  title: string;
  duration: string;
  type_: string;
}

export interface ReleaseArtist {
  name: string;
  anv: string;
  join: string;
  role: string;
}

export interface ReleaseFormat {
  name: string;
  qty: string;
  descriptions?: string[];
}

export interface ReleaseLabel {
  name: string;
  catno: string;
  entity_type: string;
}

export interface ReleaseVideo {
  title: string;
  uri: string;
  description?: string;
}

export interface DiscogsRelease {
  id: number;
  title: string;
  country: string;
  year: number;
  released_formatted?: string;
  genres: string[];
  styles: string[];
  artists: ReleaseArtist[];
  tracklist: Track[];
  formats: ReleaseFormat[];
  labels: ReleaseLabel[];
  notes?: string;
  videos?: ReleaseVideo[];
}

export interface ApiResponse {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  results: DiscogsSearchResult[];
}

// Query settings passed to the crawler API. Empty string means "use default".
// `country` is a comma-separated list when multiple countries are selected.
export interface SearchQuery {
  genre: string;
  style: string;
  year: string;
  country: string;
}

// Frontend form state for the query settings. Country is a multi-selection.
export interface Settings {
  genre: string;
  style: string;
  year: string;
  country: string[];
}

// Country options shown in the multi-select (mirrors the crawler's lookup).
export const COUNTRY_OPTIONS: string[] = [
  'UK',
  'US',
  'Germany',
  'Netherlands',
  'Italy',
  'Spain',
  'Canada',
  'Finland',
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
  'UK & Europe',
  'Argentina',
  'Taiwan',
  'Romania',
];