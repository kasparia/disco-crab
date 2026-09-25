// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

import * as http from 'http';

import type { DiscogsSearchResult, SearchQuery } from './types';

const PAGE_SIZE: number = 50;
const PORT: number = 3333;

interface ApiResponse {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  results: DiscogsSearchResult[];
  error?: string;
}

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  const payload: string = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(payload);
}

function pageCount(total: number): number {
  return total === 0 ? 0 : Math.ceil(total / PAGE_SIZE);
}

// Read the (optional) query settings from the request URL. Empty strings tell
// the crawler to fall back to its defaults for that axis.
function readQuery(url: URL): SearchQuery {
  return {
    genre: url.searchParams.get('genre') || '',
    style: url.searchParams.get('style') || '',
    year: url.searchParams.get('year') || '',
    country: url.searchParams.get('country') || '',
  };
}

function handleApiRequest(
  results: DiscogsSearchResult[],
  triggerCrawl: (query: SearchQuery) => Promise<void>,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const requestedPage: number = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const query: SearchQuery = readQuery(url);

  // Trigger a crawl against Discogs using the provided query settings so the
  // latest batch is available before serving the requested page.
  return triggerCrawl(query).then(() => {
    const pages = pageCount(results.length);
    const start = (requestedPage - 1) * PAGE_SIZE;
    const batch = results.slice(start, start + PAGE_SIZE);

    const body: ApiResponse = {
      page: requestedPage,
      pages,
      total: results.length,
      pageSize: PAGE_SIZE,
      results: batch,
    };

    sendJson(response, 200, body);
  }).catch((error: Error): void => {
    sendJson(response, 500, {
      page: requestedPage,
      pages: 0,
      total: results.length,
      pageSize: PAGE_SIZE,
      results: [],
      error: `Crawl failed: ${error.message}`,
    });
  });
}

/**
 * Start the HTTP API server. Every request first triggers a crawl against
 * Discogs, then serves the collected results, 50 per page.
 *
 * @param results      shared in-memory store populated by the crawler
 * @param triggerCrawl callback that issues a single crawl (e.g. runCrawl())
 * @param port         port to listen on (defaults to 3333)
 */
export function startApi(
  results: DiscogsSearchResult[],
  triggerCrawl: (query: SearchQuery) => Promise<void>,
  port: number = PORT,
): http.Server {
  const server = http.createServer((request, response) => {
    if (request.url && request.url.startsWith('/api')) {
      handleApiRequest(results, triggerCrawl, request, response);
      return;
    }
    sendJson(response, 404, { error: 'Not Found' });
  });

  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}/api?page=1`);
    console.log(`Each page returns up to ${PAGE_SIZE} results.`);
  });

  return server;
}