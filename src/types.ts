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
  // Enriched by the release sub-query (`GET /releases/{id}`). Present once
  // the detailed release record has been fetched for this result.
  release?: DiscogsRelease;
}

export interface FetchResponse {
  results: DiscogsSearchResult[];
  pagination: Pagination;
}

// ---------------------------------------------------------------------------
// Discogs Release API Types (database-release endpoint)
// ---------------------------------------------------------------------------

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

export interface ReleaseImage {
  type: string;
  uri: string;
  uri150: string;
  width: number;
  height: number;
}

// Detailed release record returned by `GET /releases/{release_id}`. This is
// fetched as a sub-query for every release returned by the search query.
export interface DiscogsRelease {
  id: number;
  title: string;
  country: string;
  year: number;
  released?: string;
  released_formatted?: string;
  status?: string;
  data_quality?: string;
  genres: string[];
  styles: string[];
  artists: ReleaseArtist[];
  extraartists?: ReleaseArtist[];
  tracklist: Track[];
  formats: ReleaseFormat[];
  labels: ReleaseLabel[];
  companies?: Array<{ name: string; catno: string }>;
  notes?: string;
  images?: ReleaseImage[];
  videos?: Array<{ title: string; uri: string; description?: string }>;
  community?: Community;
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
  // Discogs API rate limit in requests per minute. Defaults to 60 (Discogs'
  // hard limit for authenticated requests). The crawler throttles requests so
  // it never exceeds this cap.
  REQUESTS_PER_MINUTE?: number;
}

// ---------------------------------------------------------------------------
// Query Settings passed from the frontend to the crawler
// ---------------------------------------------------------------------------

export interface SearchQuery {
  genre: string;
  style: string;
  year: string;
  country: string;
}
