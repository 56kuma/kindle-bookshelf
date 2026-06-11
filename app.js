const PAGE_SIZE = 72;

const state = {
  books: [],
  visibleBooks: [],
  renderedCount: 0,
  query: "",
  sort: "newest",
  mangaOnly: false,
};

const elements = {
  list: document.querySelector("#book-list"),
  template: document.querySelector("#book-card-template"),
  search: document.querySelector("#search-input"),
  sort: document.querySelector("#sort-select"),
  mangaFilter: document.querySelector("#manga-filter"),
  csvInput: document.querySelector("#csv-input"),
  count: document.querySelector("#result-count"),
  source: document.querySelector("#source-label"),
  summary: document.querySelector("#library-summary"),
  empty: document.querySelector("#empty-state"),
  clearSearch: document.querySelector("#clear-search"),
  loadSentinel: document.querySelector("#load-sentinel"),
};

const headerAliases = {
  purchased_at: ["purchased_at", "purchase_date", "order_date"],
  cover_image: ["cover_image", "cover_url", "image_url", "cover"],
  title: ["title", "product_name"],
  author: ["author", "authors", "creator"],
  category: ["category", "type", "book_type"],
  asin: ["asin"],
  is_manga: ["is_manga", "manga", "is_comic"],
};

const mangaCategories = ["漫画", "マンガ", "コミック", "manga", "comic", "comics"];

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => normalize(header));
  const indexes = Object.fromEntries(
    Object.entries(headerAliases).map(([key, aliases]) => [
      key,
      headers.findIndex((header) => aliases.includes(header)),
    ]),
  );

  if (indexes.title === -1) {
    throw new Error("CSVに title 列がありません。");
  }

  return rows.slice(1).map((values, index) => {
    const category = valueAt(values, indexes.category);
    const mangaValue = valueAt(values, indexes.is_manga);
    const manga = indexes.is_manga >= 0
      ? isTruthy(mangaValue)
      : isMangaCategory(category);
    const book = {
      purchased_at: valueAt(values, indexes.purchased_at),
      cover_image: valueAt(values, indexes.cover_image),
      title: valueAt(values, indexes.title) || "タイトル不明",
      author: valueAt(values, indexes.author) || "著者不明",
      category: manga ? "漫画" : category || "書籍",
      asin: valueAt(values, indexes.asin),
      is_manga: manga,
    };

    book.id = book.asin || `${book.title}-${index}`;
    book.searchIndex = normalize(
      `${book.title} ${book.author} ${book.asin} ${book.purchased_at} ${book.category}`,
    );
    return book;
  });
}

function valueAt(row, index) {
  return index >= 0 ? row[index] || "" : "";
}

function isTruthy(value) {
  return ["true", "1", "yes", "y", "漫画", "manga"].includes(normalize(value));
}

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/\s+/g, " ")
    .trim();
}

function isMangaCategory(category) {
  const normalizedCategory = normalize(category);
  return mangaCategories.some((value) => normalizedCategory.includes(value));
}

function getVisibleBooks() {
  const terms = normalize(state.query).split(" ").filter(Boolean);
  const filtered = state.books.filter((book) => {
    const matchesQuery = terms.every((term) => book.searchIndex.includes(term));
    return matchesQuery && (!state.mangaOnly || book.is_manga);
  });

  return filtered.sort((left, right) => {
    if (state.sort === "oldest") {
      return dateValue(left.purchased_at) - dateValue(right.purchased_at);
    }
    if (state.sort === "title") {
      return left.title.localeCompare(right.title, "ja");
    }
    if (state.sort === "author") {
      return left.author.localeCompare(right.author, "ja");
    }
    return dateValue(right.purchased_at) - dateValue(left.purchased_at);
  });
}

function dateValue(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value || "購入日不明";
  }
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}

function createBookCard(book) {
  const card = elements.template.content.cloneNode(true);
  const article = card.querySelector(".book-card");
  const cover = card.querySelector(".book-cover");
  const coverWrap = card.querySelector(".cover-wrap");
  const fallback = card.querySelector(".cover-fallback");
  const date = card.querySelector(".purchase-date");
  const category = card.querySelector(".book-category");
  const asin = card.querySelector(".book-asin");

  article.dataset.asin = book.asin;
  cover.src = book.cover_image;
  cover.alt = `${book.title}の表紙`;
  fallback.textContent = book.title.slice(0, 1);
  cover.addEventListener("error", () => {
    coverWrap.classList.add("is-missing");
    cover.remove();
  }, { once: true });

  date.dateTime = book.purchased_at;
  date.textContent = formatDate(book.purchased_at);
  category.textContent = book.category;
  category.classList.toggle("is-manga", book.is_manga);
  card.querySelector(".book-title").textContent = book.title;
  card.querySelector(".book-author").textContent = book.author;

  if (book.asin) {
    asin.textContent = `ASIN ${book.asin}`;
    asin.href = `https://www.amazon.co.jp/dp/${encodeURIComponent(book.asin)}`;
  } else {
    asin.hidden = true;
  }

  return card;
}

function appendNextPage() {
  if (state.renderedCount >= state.visibleBooks.length) {
    elements.loadSentinel.hidden = true;
    return;
  }

  const end = Math.min(state.renderedCount + PAGE_SIZE, state.visibleBooks.length);
  const fragment = document.createDocumentFragment();

  for (let index = state.renderedCount; index < end; index += 1) {
    fragment.append(createBookCard(state.visibleBooks[index]));
  }

  elements.list.append(fragment);
  state.renderedCount = end;
  elements.loadSentinel.hidden = state.renderedCount >= state.visibleBooks.length;
  updateCount();
}

function updateCount() {
  const total = state.books.length;
  const matches = state.visibleBooks.length;
  const shown = state.renderedCount;
  elements.count.textContent = matches === total
    ? `${total.toLocaleString("ja-JP")}冊`
    : `${total.toLocaleString("ja-JP")}冊中 ${matches.toLocaleString("ja-JP")}冊`;
  elements.loadSentinel.textContent = shown < matches
    ? `${shown.toLocaleString("ja-JP")} / ${matches.toLocaleString("ja-JP")}冊を表示`
    : `${matches.toLocaleString("ja-JP")}冊を表示`;
}

function updateSummary() {
  const manga = state.books.filter((book) => book.is_manga).length;
  elements.summary.textContent =
    `全${state.books.length.toLocaleString("ja-JP")}冊 · 漫画${manga.toLocaleString("ja-JP")}冊 · 書籍${(state.books.length - manga).toLocaleString("ja-JP")}冊`;
}

function render() {
  state.visibleBooks = getVisibleBooks();
  state.renderedCount = 0;
  elements.list.replaceChildren();
  elements.list.hidden = state.visibleBooks.length === 0;
  elements.empty.hidden = state.visibleBooks.length !== 0;
  appendNextPage();
  updateCount();
}

function resetFilters() {
  state.query = "";
  state.mangaOnly = false;
  elements.search.value = "";
  elements.mangaFilter.setAttribute("aria-pressed", "false");
}

async function loadCSV(text, sourceLabel) {
  state.books = parseCSV(text);
  resetFilters();
  elements.source.textContent = sourceLabel;
  updateSummary();
  render();
}

async function loadDefaultCSV() {
  const localSource = {
    url: "data/kindle-web-library.csv",
    label: "ローカルCSV",
  };
  const cloudflareSource = {
    url: "/api/books",
    label: "Cloudflare R2",
  };
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const sources = localHosts.has(window.location.hostname)
    ? [localSource]
    : [cloudflareSource];
  let lastError;

  for (const source of sources) {
    try {
      const response = await fetch(source.url, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await loadCSV(await response.text(), source.label);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  elements.count.textContent = "読み込みエラー";
  elements.list.innerHTML =
    `<p class="load-error">KindleライブラリCSVを読み込めませんでした。${lastError ? ` (${lastError.message})` : ""}</p>`;
}

let searchTimer;
elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(render, 120);
});

elements.sort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

elements.mangaFilter.addEventListener("click", () => {
  state.mangaOnly = !state.mangaOnly;
  elements.mangaFilter.setAttribute("aria-pressed", String(state.mangaOnly));
  render();
});

elements.clearSearch.addEventListener("click", () => {
  resetFilters();
  elements.search.focus();
  render();
});

elements.csvInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    await loadCSV(await file.text(), file.name);
  } catch (error) {
    window.alert(error.message);
  } finally {
    event.target.value = "";
  }
});

const loadObserver = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    appendNextPage();
  }
}, { rootMargin: "600px 0px" });

loadObserver.observe(elements.loadSentinel);
loadDefaultCSV();
