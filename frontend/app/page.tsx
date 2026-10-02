"use client";

import { useCallback, useState } from "react";

import type { ApiResponse, Community, DiscogsSearchResult, SearchQuery, Settings } from "./types";
import { COUNTRY_OPTIONS } from "./types";

const DEFAULT_SETTINGS: Settings = {
  genre: "",
  style: "",
  year: "",
  country: [],
};

const DISCOGS_URL = "https://discogs.com/";

// Build a direct link to a release page on Discogs from its release id.
function releasePageUrl(id: number): string {
  return `${DISCOGS_URL}release/${id}`;
}
// Serialize the form settings into the query string used by the crawler API.
function toSearchQuery(s: Settings): SearchQuery {
  return {
    genre: s.genre,
    style: s.style,
    year: s.year,
    country: s.country.join(","),
  };
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Builds the /api URL including the requested page and current query settings.
  const buildUrl = useCallback((requestedPage: number, query: SearchQuery) => {
    const params = new URLSearchParams({ page: String(requestedPage) });
    if (query.genre) params.set("genre", query.genre);
    if (query.style) params.set("style", query.style);
    if (query.year) params.set("year", query.year);
    if (query.country) params.set("country", query.country);
    return `/api?${params.toString()}`;
  }, []);

  const fetchPage = useCallback(
    async (requestedPage: number, query: SearchQuery) => {
      console.log('fetching...');
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(buildUrl(requestedPage, query));
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
    },
    [buildUrl],
  );

  // Edit a single text setting. Editing only updates the form state; the
  // crawl starts when the Search button is clicked.
  const updateSetting = (key: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Toggle a country in the multi-select.
  const toggleCountry = (country: string) => {
    setSettings((prev) => {
      const has = prev.country.includes(country);
      return {
        ...prev,
        country: has
          ? prev.country.filter((c) => c !== country)
          : [...prev.country, country],
      };
    });
  };

  // Trigger a search with the current settings, resetting to page one.
  const runSearch = () => {
    setPage(1);
    fetchPage(1, toSearchQuery(settings));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const goToPage = (nextPage: number) => {
    console.log(nextPage);
    // if (nextPage < 1 || (data && nextPage > data.pages)) return;
    setPage(nextPage);
    fetchPage(nextPage, toSearchQuery(settings));
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>Disco Crab — Crawler API</h1>

      <QuerySettings
        settings={settings}
        onTextChange={updateSetting}
        onToggleCountry={toggleCountry}
        onReset={resetSettings}
        onSearch={runSearch}
      />

      {loading && <p style={styles.status}>Loading…</p>}
      {error && <p style={styles.error}>Error: {error}</p>}

      {!data && !loading && !error && (
        <p style={styles.status}>
          No results yet — set your query options above and press{" "}
          <strong>Search</strong> to start the crawl.
        </p>
      )}

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
                disabled={/*page <= 1*/ false}
                style={styles.button}
              >
                ← Prev
              </button>
              <span style={styles.pageNumber}>{page}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={/*!data || page >= data.pages*/ false}
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

// Query settings panel shown at the top of the page. Editing fields only
// updates the form; the crawl runs when the Search button is clicked.
function QuerySettings({
  settings,
  onTextChange,
  onToggleCountry,
  onReset,
  onSearch,
}: {
  settings: Settings;
  onTextChange: (key: "genre" | "style" | "year", value: string) => void;
  onToggleCountry: (country: string) => void;
  onReset: () => void;
  onSearch: () => void;
}) {
  const textFields: { key: "genre" | "style" | "year"; label: string, default: string }[] = [
    { key: "genre", label: "Genre", default: "Electronic" },
    { key: "style", label: "Style", default: "Progressive house, Techno" },
    { key: "year", label: "Year", default: "1999" },
  ];

  return (
    <section style={styles.settings}>
      <div style={styles.settingsHeader}>
        <h2 style={styles.settingsTitle}>Query Settings</h2>
        <button onClick={onReset} style={styles.button}>
          Reset to Defaults
        </button>
        <button onClick={onSearch} style={styles.searchButton}>
          Search
        </button>
      </div>

      <div style={styles.settingsFields}>
        {textFields.map((field) => (
          <label key={field.key} style={styles.field}>
            <span style={styles.fieldLabel}>{field.label}</span>
            <input
              type="text"
              value={settings[field.key]}
              placeholder={field.default}
              onChange={(e) => onTextChange(field.key, e.target.value)}
              style={styles.input}
            />
          </label>
        ))}
      </div>

      <div style={styles.countryGroup}>
        <span style={styles.fieldLabel}>
          Countries (multi-select)
        </span>
        <div style={styles.countryOptions}>
          {COUNTRY_OPTIONS.sort().map((country) => (
            <label key={country} style={styles.countryOption}>
              <input
                type="checkbox"
                checked={settings.country.includes(country)}
                onChange={() => onToggleCountry(country)}
              />
              <span>{country}</span>
            </label>
          ))}
        </div>
      </div>

      <p style={styles.settingsHint}>
        Click Search to run the crawl with the current settings (resets to page
        one).
      </p>
    </section>
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

// Format the have / want totals for a release. Both come from the community
// stats found in the release sub-query data.
function formatHaveWant(community?: Community): string {
  if (!community) {
    return "—";
  }
  const have = community.have ?? 0;
  const want = community.want ?? 0;
  return `${have} / ${want}`;
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
            <h2 style={styles.cardTitle}>
              <a
                href={releasePageUrl(result.id)}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.cardTitleLink}
                title={`Open on Discogs: ${result.title}`}
              >
                {result.title}
              </a>
            </h2>
            <dl style={styles.dl}>
              <dt style={styles.cardLabels}>Country</dt> <dd>{result.country}</dd>
              <dt style={styles.cardLabels}>Year</dt> <dd>{result.year}</dd>
              <dt style={styles.cardLabels}>Format</dt> <dd>{result.format.join(", ")}</dd>
              <dt style={styles.cardLabels}>Label</dt> <dd>{result.label.join(", ")}</dd>
              <dt style={styles.cardLabels}>Genre</dt> <dd>{result.genre.join(", ")}</dd>
              <dt style={styles.cardLabels}>Style</dt> <dd>{result.style.join(", ")}</dd>
              <dt style={styles.cardLabels}>Have / Want</dt>
              <dd>{formatHaveWant(result.release?.community)}</dd>
            </dl>
            <Videos releaseTitle={result.title} videos={result.release?.videos} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Renders the video links collected from the release sub-query.
function Videos({
  releaseTitle,
  videos,
}: {
  releaseTitle: string;
  videos?: { title: string; uri: string }[];
}) {
  if (!videos || videos.length === 0) {
    return null;
  }

  return (
    <div style={styles.videos}>
      <span style={styles.videosLabel}>Videos ({videos.length})</span>
      <ul style={styles.videoList}>
        {videos.map((video, index) => (
          <li key={`${video.uri}-${index}`}>
            <a
              href={video.uri}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.videoLink}
              title={video.title}
            >
              {video.title || releaseTitle}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Inline styles to keep this demo self-contained.
const styles: Record<string, React.CSSProperties> = {
  main: {
    width: 960,
    maxWidth: "100%",
    margin: "0 auto",
    padding: "2rem 1rem",
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif",
    color: "#1a1a1a",
  },
  title: {
    fontSize: "1.6rem",
    marginBottom: "1rem",
  },
  settings: {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "1rem",
    marginBottom: "1.25rem",
    background: "#fafafa",
  },
  settingsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.75rem",
  },
  settingsTitle: {
    fontSize: "1.05rem",
    margin: 0,
  },
  settingsFields: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "0.75rem",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  fieldLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    color: "#666",
  },
  input: {
    padding: "0.4rem 0.5rem",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: "0.9rem",
    background: "#fff",
  },
  settingsHint: {
    fontSize: "0.75rem",
    color: "#888",
    margin: "0.75rem 0 0",
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
  searchButton: {
    padding: "0.4rem 1.1rem",
    borderRadius: 6,
    border: "1px solid #1a73e8",
    cursor: "pointer",
    background: "#1a73e8",
    color: "#fff",
    fontWeight: 600,
    marginLeft: "0.5rem",
  },
  countryGroup: {
    marginTop: "0.9rem",
  },
  countryOptions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "0.35rem 0.75rem",
    marginTop: "0.35rem",
    maxHeight: 150,
    overflow: "auto",
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    padding: "0.5rem",
    background: "#fff",
  },
  countryOption: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: "0.85rem",
    cursor: "pointer",
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
    fontWeight: 700,
  },
  cardTitleLink: {
    color: "#1a73e8",
    textDecoration: "none",
  },
  dl: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "0.15rem 0.5rem",
    fontSize: "0.8rem",
    margin: 0,
  },
  cardLabels: {
    fontWeight: 700
  },
  videos: {
    marginTop: "0.6rem",
    borderTop: "1px solid #eaeaea",
    paddingTop: "0.5rem",
  },
  videosLabel: {
    display: "block",
    fontSize: "0.7rem",
    fontWeight: 600,
    textTransform: "uppercase",
    color: "#888",
    marginBottom: "0.3rem",
  },
  videoList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  videoLink: {
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "0.8rem",
    color: "#1a73e8",
    textDecoration: "none",
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