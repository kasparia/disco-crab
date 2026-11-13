/* Disco Crab — static frontend logic (vanilla JS, no dependencies).
   Talks directly to the crawler API at the same origin (/api). */

(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // Country options (mirrors the crawler's lookup).
  // -------------------------------------------------------------------------
  var COUNTRY_OPTIONS = [
    "UK",
    "US",
    "Germany",
    "Netherlands",
    "Italy",
    "Spain",
    "Canada",
    "Finland",
    "Australia",
    "France",
    "Europe",
    "Belgium",
    "Unknown",
    "Switzerland",
    "Sweden",
    "Hungary",
    "Greece",
    "Japan",
    "Portugal",
    "Poland",
    "Ukraine",
    "Denmark",
    "Mexico",
    "Brazil",
    "Czech Republic",
    "UK & Europe",
    "Argentina",
    "Taiwan",
    "Romania",
  ];

  var DISCOGS_URL = "https://discogs.com/";

  var TEXT_FIELDS = [
    { key: "genre", label: "Genre", default: "Electronic" },
    { key: "style", label: "Style", default: "Progressive house, Techno" },
    { key: "year", label: "Year", default: "1999" },
  ];

  // -------------------------------------------------------------------------
  // DOM refs.
  // -------------------------------------------------------------------------
  var elGenre = document.getElementById("field-genre");
  var elStyle = document.getElementById("field-style");
  var elYear = document.getElementById("field-year");
  var elCountryOptions = document.getElementById("country-options");
  var elStatus = document.getElementById("status");
  var elError = document.getElementById("error");
  var elEmpty = document.getElementById("empty-notice");
  var elResults = document.getElementById("results");
  var elMeta = document.getElementById("meta");
  var elPageNumber = document.getElementById("page-number");
  var elPrev = document.getElementById("btn-prev");
  var elNext = document.getElementById("btn-next");
  var elRaw = document.getElementById("btn-raw");
  var elRawJson = document.getElementById("raw-json");
  var elGrid = document.getElementById("grid");
  var elSearch = document.getElementById("btn-search");
  var elReset = document.getElementById("btn-reset");

  // -------------------------------------------------------------------------
  // State.
  // -------------------------------------------------------------------------
  var selectedCountries = {};
  var data = null;
  var page = 1;
  var showRaw = false;
  var sortKey = "have";
  var sortOrder = "desc";
  var loading = false;

  // -------------------------------------------------------------------------
  // Helpers.
  // -------------------------------------------------------------------------
  function releasePageUrl(id) {
    return DISCOGS_URL + "release/" + id;
  }

  // Collect the currently entered settings from the form.
  function readSettings() {
    return {
      genre: elGenre.value,
      style: elStyle.value,
      year: elYear.value,
      country: selectedCountries,
    };
  }

  // Build the /api URL including page and query settings.
  function buildUrl(requestedPage, query) {
    var params = ["page=" + encodeURIComponent(String(requestedPage))];
    if (query.genre) params.push("genre=" + encodeURIComponent(query.genre));
    if (query.style) params.push("style=" + encodeURIComponent(query.style));
    if (query.year) params.push("year=" + encodeURIComponent(query.year));
    var countries = Object.keys(query.country);
    if (countries.length) {
      params.push("country=" + encodeURIComponent(countries.join(",")));
    }
    return "/api?" + params.join("&");
  }

  function showStatus(msg) {
    if (msg) {
      elStatus.textContent = msg;
      elStatus.hidden = false;
    } else {
      elStatus.hidden = true;
    }
  }

  function showError(msg) {
    if (msg) {
      elError.textContent = "Error: " + msg;
      elError.hidden = false;
    } else {
      elError.hidden = true;
    }
  }

  // Fetch a page from the crawler API and update the view.
  function fetchPage(requestedPage, query) {
    loading = true;
    showStatus("Loading…");
    showError(null);

    fetch(buildUrl(requestedPage, query))
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Request failed with status " + response.status);
        }
        return response.json();
      })
      .then(function (body) {
        data = body;
        page = body.page;
        render();
        showStatus(null);
      })
      .catch(function (err) {
        data = null;
        showError(err instanceof Error ? err.message : String(err));
        render();
        showStatus(null);
      })
      .then(function () {
        loading = false;
      });
  }

  function runSearch() {
    page = 1;
    fetchPage(1, readSettings());
  }

  function goToPage(nextPage) {
    page = nextPage;
    fetchPage(nextPage, readSettings());
  }

  // -------------------------------------------------------------------------
  // Sorting.
  // -------------------------------------------------------------------------
  function sortResults(resultsArr, key, order) {
    var sorted = resultsArr.slice();
    sorted.sort(function (a, b) {
      var av = (a.community && a.community[key]) || 0;
      var bv = (b.community && b.community[key]) || 0;
      return order === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }

  function formatCount(p, pageSize, batchLength) {
    var fromIndex = (p - 1) * pageSize + 1;
    var toIndex = fromIndex + batchLength - 1;
    return fromIndex + "\u2013" + toIndex;
  }

  function formatHaveWant(community) {
    if (!community) return "\u2014";
    var have = community.have || 0;
    var want = community.want || 0;
    return have + " / " + want;
  }

  // -------------------------------------------------------------------------
  // Rendering.
  // -------------------------------------------------------------------------
  function render() {
    elEmpty.hidden = data !== null;
    elResults.hidden = data === null;

    var hasData = data !== null;

    // Error state: if not loading but data didn't arrive, show empty notice.
    if (!hasData) {
      return;
    }

    // Toolbar / meta.
    var batchLength = data.results ? data.results.length : 0;
    elMeta.textContent =
      "Showing " +
      formatCount(data.page, data.pageSize, batchLength) +
      " of " +
      data.total +
      " results \u00b7 Page " +
      data.page +
      " of " +
      data.pages;
    elPageNumber.textContent = String(page);
    elPrev.disabled = page <= 1;
    // Next is usable whenever the crawler still expects more results for the
    // current settings (Discogs has further pages to fetch). We must NOT gate
    // it on data.pages: that value is computed from the results accumulated so
    // far, so on a fresh search it lags behind hasMore and would leave the
    // button enabled-but-inert.
    elNext.disabled = !data.hasMore;

    // Raw JSON toggle.
    elRawJson.hidden = !showRaw;
    elRaw.textContent = showRaw ? "View Cards" : "View Raw JSON";
    if (showRaw) {
      elRawJson.textContent = JSON.stringify(data, null, 2);
    }

    // Cards.
    elGrid.hidden = showRaw;
    renderCards(sortResults(data.results || [], sortKey, sortOrder));
  }

  function renderCards(resultsArr) {
    elGrid.innerHTML = "";
    if (!resultsArr.length) {
      var emptyP = document.createElement("p");
      emptyP.className = "status";
      emptyP.textContent = "No results on this page yet.";
      elGrid.appendChild(emptyP);
      return;
    }

    resultsArr.forEach(function (result) {
      elGrid.appendChild(buildCard(result));
    });
  }

  function buildCard(result) {
    var card = document.createElement("div");
    card.className = "card";

    if (result.cover_image) {
      var img = document.createElement("img");
      img.src = result.cover_image;
      img.alt = result.title || "";
      img.className = "cover";
      card.appendChild(img);
    }

    var info = document.createElement("div");

    var h2 = document.createElement("h2");
    h2.className = "card-title";
    var a = document.createElement("a");
    a.href = releasePageUrl(result.id);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Open on Discogs: " + result.title;
    a.textContent = result.title;
    h2.appendChild(a);
    info.appendChild(h2);

    var dl = document.createElement("dl");
    dl.className = "dl";
    addDlRow(dl, "Country", result.country);
    addDlRow(dl, "Year", result.year);
    addDlRow(dl, "Format", join(result.format));
    addDlRow(dl, "Label", join(result.label));
    addDlRow(dl, "Genre", join(result.genre));
    addDlRow(dl, "Style", join(result.style));
    addDlRow(dl, "Have / Want", formatHaveWant(result.release && result.release.community));
    info.appendChild(dl);

    if (result.release && result.release.videos && result.release.videos.length) {
      info.appendChild(buildVideos(result.release.videos, result.title));
    }

    card.appendChild(info);
    return card;
  }

  function addDlRow(dl, label, value) {
    var dt = document.createElement("dt");
    var dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value || "";
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function join(arr) {
    return Array.isArray(arr) ? arr.join(", ") : (arr || "");
  }

  function buildVideos(videos, releaseTitle) {
    var container = document.createElement("div");
    container.className = "videos";

    var label = document.createElement("span");
    label.className = "videos-label";
    label.textContent = "Videos (" + videos.length + ")";
    container.appendChild(label);

    var ul = document.createElement("ul");
    ul.className = "video-list";
    videos.forEach(function (video, index) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = video.uri;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "video-link";
      a.title = video.title || "";
      a.textContent = video.title || releaseTitle;
      li.appendChild(a);
      ul.appendChild(li);
    });
    container.appendChild(ul);

    return container;
  }

  // -------------------------------------------------------------------------
  // Country multi-select rendering.
  // -------------------------------------------------------------------------
  function renderCountryOptions() {
    elCountryOptions.innerHTML = "";
    COUNTRY_OPTIONS.slice()
      .sort()
      .forEach(function (country) {
        var label = document.createElement("label");
        label.className = "country-option";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.value = country;
        input.checked = !!selectedCountries[country];
        input.addEventListener("change", onCountryToggle);
        var span = document.createElement("span");
        span.textContent = country;
        label.appendChild(input);
        label.appendChild(span);
        elCountryOptions.appendChild(label);
      });
  }

  function onCountryToggle(event) {
    var country = event.target.value;
    if (event.target.checked) {
      selectedCountries[country] = true;
    } else {
      delete selectedCountries[country];
    }
  }

  // -------------------------------------------------------------------------
  // Sort controls.
  // -------------------------------------------------------------------------
  function updateSortButtons() {
    document.querySelectorAll(".sort-btn[data-sort-key]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-sort-key") === sortKey);
    });
    document.querySelectorAll(".sort-btn[data-sort-order]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-sort-order") === sortOrder);
    });
  }

  // -------------------------------------------------------------------------
  // Event wiring.
  // -------------------------------------------------------------------------
  elSearch.addEventListener("click", runSearch);

  elReset.addEventListener("click", function () {
    elGenre.value = "";
    elStyle.value = "";
    elYear.value = "";
    selectedCountries = {};
    renderCountryOptions();
  });

  elPrev.addEventListener("click", function () {
    if (page > 1) goToPage(page - 1);
  });

  elNext.addEventListener("click", function () {
    if (data && data.hasMore) goToPage(page + 1);
  });

  elRaw.addEventListener("click", function () {
    showRaw = !showRaw;
    render();
  });

  document.querySelectorAll(".sort-btn[data-sort-key]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      sortKey = btn.getAttribute("data-sort-key");
      updateSortButtons();
      if (data) render();
    });
  });

  document.querySelectorAll(".sort-btn[data-sort-order]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      sortOrder = btn.getAttribute("data-sort-order");
      updateSortButtons();
      if (data) render();
    });
  });

  // Also allow pressing Enter in a text field to trigger a search.
  [elGenre, elStyle, elYear].forEach(function (field) {
    field.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        runSearch();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Init.
  // -------------------------------------------------------------------------
  renderCountryOptions();
  updateSortButtons();
  render();
})();