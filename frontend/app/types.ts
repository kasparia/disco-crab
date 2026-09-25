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
}

export interface ApiResponse {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  results: DiscogsSearchResult[];
}