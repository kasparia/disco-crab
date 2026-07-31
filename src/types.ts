// ---------------------------------------------------------------------------
// Discogs API Response Types
// ---------------------------------------------------------------------------

export interface Community {
  want: number;
  have: number;
}

export interface UserData {
  in_wantlist: boolean;
  in_collection: boolean;
}

export interface Pagination {
  page: number;
  pages: number;
  items: number;
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
}

export interface FetchResponse {
  results: DiscogsSearchResult[];
  pagination: Pagination;
}

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Application Configuration
// ---------------------------------------------------------------------------

export interface Config {
  ACCESS_TOKEN: string;
}
