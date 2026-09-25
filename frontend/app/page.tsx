"use client";

import { useCallback, useEffect, useState } from "react";

import type { ApiResponse, DiscogsSearchResult } from "./types";

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [showRaw, setShowRaw] = useState<boolean>(false);

  const fetchPage = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api?page=${requestedPage}`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const body: ApiResponse = await response.json();
      setData(body);
      setPage(body.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || (data && nextPage > data.pages)) return;
    fetchPage(nextPage);
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Disco Crab — Crawler API</h1>

      {loading && <p style={styles.status}>Loading…</p>}
      {error && <p style={styles.error}>Error: {error}</p>}

      {data && !loading && (
        <>
          <div style={styles.toolbar}>
            <span style={styles.meta}>
              Showing {formatCount(data.page, data.pageSize, data.results.length)} of{" "}
              {data.total} results · Page {data.page} of {data.pages}
            </span>
            <div style={styles.controls}>
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                style={styles.button}
              >
                ← Prev
              </button>
              <span style={styles.pageNumber}>{page}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={!data || page >= data.pages}
                style={styles.button}
              >
                Next →
              </button>
              <button onClick={() => setShowRaw((v) => !v)} style={styles.button}>
                {showRaw ? "View Cards" : "View Raw JSON"}
              </button>
            </div>
          </div>

          {showRaw ? (
            <RawJson data={data} />
          ) : (
            <ResultGrid results={data.results} />
          )}
        </>
      )}
    </main>
  );
}

function formatCount(
  page: number,
  pageSize: number,
  batchLength: number,
): string {
  const from = (page - 1) * pageSize + 1;
  const to = from + batchLength - 1;
  return `${from}–${to}`;
}

function RawJson({ data }: { data: ApiResponse }) {
  return (
    <pre style={styles.rawJson}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function ResultGrid({ results }: { results: DiscogsSearchResult[] }) {
  if (results.length === 0) {
    return <p style={styles.status}>No results on this page yet.</p>;
  }

  return (
    <div style={styles.grid}>
      {results.map((result) => (
        <div key={result.id} style={styles.card}>
          {result.cover_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.cover_image}
              alt={result.title}
              style={styles.cover}
            />
          )}
          <div>
            <h2 style={styles.cardTitle}>{result.title}</h2>
            <dl style={styles.dl}>
              <dt>Country</dt> <dd>{result.country}</dd>
              <dt>Year</dt> <dd>{result.year}</dd>
              <dt>Format</dt> <dd>{result.format.join(", ")}</dd>
              <dt>Label</dt> <dd>{result.label.join(", ")}</dd>
              <dt>Genre</dt> <dd>{result.genre.join(", ")}</dd>
              <dt>Style</dt> <dd>{result.style.join(", ")}</dd>
            </dl>
          </div>
        </div>
      ))}
    </div>
  );
}

// Inline styles to keep this demo self-contained.
const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "2rem 1rem",
    fontFamily: "system-ui, sans-serif",
    color: "#1a1a1a",
  },
  title: {
    fontSize: "1.6rem",
    marginBottom: "1rem",
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  meta: {
    fontWeight: 500,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  button: {
    padding: "0.35rem 0.75rem",
    borderRadius: 6,
    border: "1px solid #ccc",
    cursor: "pointer",
    background: "#fff",
  },
  pageNumber: {
    minWidth: "2rem",
    textAlign: "center",
  },
  status: {
    color: "#555",
  },
  error: {
    color: "#c00",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "1rem",
  },
  card: {
    border: "1px solid #e2e2e2",
    borderRadius: 8,
    padding: "0.75rem",
    overflow: "hidden",
  },
  cover: {
    width: "100%",
    maxHeight: 180,
    objectFit: "cover",
    borderRadius: 4,
    marginBottom: "0.5rem",
  },
  cardTitle: {
    fontSize: "0.95rem",
    margin: "0 0 0.5rem",
  },
  dl: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "0.15rem 0.5rem",
    fontSize: "0.8rem",
    margin: 0,
  },
  rawJson: {
    background: "#0f172a",
    color: "#d1e7ff",
    padding: "1rem",
    borderRadius: 8,
    overflow: "auto",
    fontSize: "0.75rem",
    maxHeight: "70vh",
  },
};