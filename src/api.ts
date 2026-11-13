// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

import type { DiscogsSearchResult, SearchQuery } from './types';

const PAGE_SIZE: number = 50;
const PORT: number = 3333;

// Directory that holds the static frontend (index.html, styles.css, app.js).
// Resolved relative to this source file's sibling 'dist/' directory:
// dist/api.js -> <repo>/public
const STATIC_DIR: string = path.resolve(__dirname, '../public');

interface ApiResponse {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  results: DiscogsSearchResult[];
  error?: string;
}

// Signature of the crawl callback. Receives the query settings plus the page
// the frontend requested, so the Discogs search targets that exact page.
type CrawlFn = (query: SearchQuery, page: number) => Promise<void>;

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  const payload: string = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(payload);
}

// Content types for the static assets we serve from the public/ directory.
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

// Serve a static file from the public/ directory. The request path is mapped
// to a file inside STATIC_DIR, guarding against path traversal. A request for
// the directory root (e.g. '/') serves index.html so the whole app lives at
// one URL. Falls back to 404 when the file doesn't exist.
function serveStatic(requestUrl: string, response: http.ServerResponse): void {
  const urlPath = requestUrl.split('?')[0].split('#')[0];

  let filePath = decodeURIComponent(urlPath);
  // Directories and the root path resolve to the index page.
  if (filePath === '/' || filePath.endsWith('/')) {
    filePath += 'index.html';
  }

  const resolved = path.resolve(STATIC_DIR, filePath.startsWith('/') ? filePath.slice(1) : filePath);

  // Prevent path traversal outside the static directory.
  if (resolved !== STATIC_DIR && !resolved.startsWith(STATIC_DIR + path.sep)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  fs.readFile(resolved, (err, data) => {
    if (err) {
      sendJson(response, 404, { error: 'Not Found' });
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Access-Control-Allow-Origin': '*',
    });
    response.end(data);
  });
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
  triggerCrawl: CrawlFn,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const requestedPage: number = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const query: SearchQuery = readQuery(url);

  // Trigger a crawl against Discogs targeting the exact page the frontend
  // requested, so that page is fetched from Discogs before serving results.
  return triggerCrawl(query, requestedPage).then(() => {
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
 * Discogs, then serves the collected results, 50 per page. Non-/api requests
 * serve the static frontend from the public/ directory, so the whole app
 * (page + API) lives at a single origin on this port.
 *
 * @param results      shared in-memory store populated by the crawler
 * @param triggerCrawl callback that issues a single crawl (e.g. runCrawl())
 * @param port         port to listen on (defaults to 3333)
 */
export function startApi(
  results: DiscogsSearchResult[],
  triggerCrawl: CrawlFn,
  port: number = PORT,
): http.Server {
  const server = http.createServer((request, response) => {
    const url = request.url || '/';
    if (url.startsWith('/api')) {
      handleApiRequest(results, triggerCrawl, request, response);
      return;
    }
    // Any other request tries to serve a static asset from public/.
    serveStatic(url, response);
  });

  server.listen(port, () => {
    console.log(`Disco-Crab listening on http://localhost:${port}/`);
    console.log(`Crawler API: http://localhost:${port}/api?page=1`);
    console.log(`Each page returns up to ${PAGE_SIZE} results.`);
  });

  return server;
}