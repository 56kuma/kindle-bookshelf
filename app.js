const SHELVES_PER_PAGE = 8;
const RECENT_UPDATES_COUNT = 5;
const COMMENT_STORAGE_KEY = "kindle-bookshelf-comments-v1";
const japaneseCollator = new Intl.Collator("ja", {
  usage: "sort",
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

let useApi = false;

const state = {
  rawBooks: [],
  books: [],
  visibleBooks: [],
  renderedCount: 0,
  query: "",
  sort: "newest",
  mangaOnly: false,
  commentsOnly: false,
  shelfCapacity: 0,
  comments: {},
  activeCommentKey: "",
  activeCommentBook: null,
  activeCommentId: "",
};

const elements = {
  list: document.querySelector("#book-list"),
  template: document.querySelector("#book-card-template"),
  search: document.querySelector("#search-input"),
  sort: document.querySelector("#sort-select"),
  mangaFilter: document.querySelector("#manga-filter"),
  commentFilter: document.querySelector("#comment-filter"),
  csvInput: document.querySelector("#csv-input"),
  count: document.querySelector("#result-count"),
  source: document.querySelector("#source-label"),
  summary: document.querySelector("#library-summary"),
  empty: document.querySelector("#empty-state"),
  clearSearch: document.querySelector("#clear-search"),
  loadSentinel: document.querySelector("#load-sentinel"),
  recentUpdates: document.querySelector("#recent-updates"),
  recentList: document.querySelector("#recent-list"),
  recentLatest: document.querySelector("#recent-latest"),
  commentViewDialog: document.querySelector("#comment-view-dialog"),
  commentViewTitle: document.querySelector("#comment-view-title"),
  commentViewList: document.querySelector("#comment-view-list"),
  commentViewClose: document.querySelector("#comment-view-close"),
  commentViewAdd: document.querySelector("#comment-view-add"),
  commentViewCancel: document.querySelector("#comment-view-cancel"),
  commentDialog: document.querySelector("#comment-dialog"),
  commentForm: document.querySelector("#comment-form"),
  commentBookTitle: document.querySelector("#comment-book-title"),
  commentModeLabel: document.querySelector("#comment-mode-label"),
  commentText: document.querySelector("#comment-text"),
  commentCount: document.querySelector("#comment-count"),
  commentSubmit: document.querySelector("#comment-submit"),
  commentClose: document.querySelector("#comment-close"),
  commentCancel: document.querySelector("#comment-cancel"),
  commentStorageLabel: document.querySelector("#comment-storage-label"),
};

const headerAliases = {
  purchased_at: ["purchased_at", "purchase_date", "order_date"],
  cover_image: ["cover_image", "cover_url", "image_url", "cover"],
  title: ["title", "product_name"],
  title_kana: ["title_kana", "title_yomi", "reading"],
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
      title_sort: valueAt(values, indexes.title_kana) || valueAt(values, indexes.title),
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

function stripTrailingMetadata(title) {
  let value = String(title).normalize("NFKC").trim();

  while (true) {
    const match = value.match(/\s*\(([^()]*)\)\s*$/);
    if (!match || /^\d+$/.test(match[1].trim())) {
      return value;
    }
    value = value.slice(0, match.index).trim();
  }
}

function romanToNumber(value) {
  const digits = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;

  for (let index = 0; index < value.length; index += 1) {
    const current = digits[value[index]];
    const next = digits[value[index + 1]] || 0;
    total += current < next ? -current : current;
  }

  return total;
}

function extractSeries(title) {
  const coreTitle = stripTrailingMetadata(title);
  const patterns = [
    {
      pattern: /^(.*?)\s*第\s*(\d{1,3})\s*巻(.*)$/,
      suffixIndex: 3,
    },
    {
      pattern: /^(.*?)[(（](\d{1,3})[)）](.*)$/,
      suffixIndex: 3,
    },
    {
      pattern: /^(.*?)(\d{1,3})\s*巻(.*)$/,
      suffixIndex: 3,
    },
    {
      pattern: /^(.*?[!！])\s*(\d{1,3})([」』].*)$/,
      suffixIndex: 3,
    },
    {
      pattern: /^(.*?)\s+(?:vol\.?\s*)?(\d{1,3})(【.*】)$/,
      suffixIndex: 3,
    },
    {
      pattern: /^(.*?)\s+(?:vol\.?\s*)?(\d{1,3})\s+(.+)$/i,
      suffixIndex: 3,
    },
    {
      pattern: /^(.*?)\s+(?:vol\.?\s*)?(\d{1,3})$/i,
    },
    {
      pattern: /^(.*?\D)(\d{1,3})$/,
    },
    {
      pattern: /^(.*?[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}・･ー―])\s*([IVXLCDM]{1,8})$/u,
      parseVolume: romanToNumber,
    },
  ];

  for (const definition of patterns) {
    const match = coreTitle.match(definition.pattern);
    if (!match) {
      continue;
    }

    const rawSeriesTitle = match[1].replace(/[\s:：]+$/g, "").trim();
    const volume = definition.parseVolume
      ? definition.parseVolume(match[2])
      : Number(match[2]);
    if (
      rawSeriesTitle
      && Number.isInteger(volume)
      && volume > 0
      && volume < 10000
    ) {
      const suffix = definition.suffixIndex
        ? String(match[definition.suffixIndex] || "").trim()
        : "";
      const seriesTitle = rawSeriesTitle
        .replace(/【極[!！]単行本シリーズ】/g, "")
        .replace(/【[^】]*(?:特典|限定|描き下ろし)[^】]*】/g, "")
        .trim();
      const groupPrefix = rawSeriesTitle
        .replace(/【[^】]*(?:特典|限定|描き下ろし)[^】]*】/g, "")
        .trim();
      const suffixEdition = suffix.match(
        /(?:カラー版|完全版|新装版|文庫版|合本版|愛蔵版|ワイド版)/,
      )?.[0] || "";
      const edition = suffixEdition && !rawSeriesTitle.includes(suffixEdition)
        ? suffixEdition
        : "";
      const bookwormPart = coreTitle.match(
        /本好きの下剋上.*?(第一部|第二部|第三部|第四部)/,
      )?.[1];

      if (bookwormPart) {
        const canonicalTitle = `本好きの下剋上 ${bookwormPart}`;
        return {
          seriesTitle: canonicalTitle,
          volume,
          groupTitle: canonicalTitle,
        };
      }

      return {
        seriesTitle,
        volume,
        groupTitle: `${groupPrefix} ${edition}`.trim(),
      };
    }
  }

  return null;
}

function seriesKey(value) {
  return normalize(value)
    .replace(/[「」『』【】[\]()（）・･!！?？,，.。:：]/g, "")
    .replace(/\s+/g, "");
}

function commentKeyForBook(book) {
  if (book.asin) {
    return `asin:${book.asin}`;
  }
  return `title:${seriesKey(book.title)}`;
}

function collapseMangaSeries(books) {
  const candidates = new Map();
  const singles = [];

  for (const book of books) {
    const series = book.is_manga ? extractSeries(book.title) : null;
    if (!series) {
      singles.push(book);
      continue;
    }

    const key = seriesKey(series.groupTitle);
    const entries = candidates.get(key) || [];
    entries.push({ book, ...series });
    candidates.set(key, entries);
  }

  for (const [key, entries] of candidates) {
    const volumes = new Set(entries.map((entry) => entry.volume));
    if (volumes.size < 2) {
      singles.push(...entries.map((entry) => entry.book));
      continue;
    }

    const sorted = [...entries].sort(
      (left, right) =>
        right.volume - left.volume
        || dateValue(right.book.purchased_at) - dateValue(left.book.purchased_at),
    );
    const latest = sorted[0];
    const combinedSearch = entries.map((entry) => entry.book.searchIndex).join(" ");

    singles.push({
      ...latest.book,
      comment_key: `series:${key}`,
      title: latest.seriesTitle,
      title_sort: latest.seriesTitle,
      purchased_at: latest.book.purchased_at,
      is_series: true,
      max_volume: latest.volume,
      owned_volume_count: volumes.size,
      series_book_count: entries.length,
      searchIndex: normalize(
        `${latest.seriesTitle} ${combinedSearch} ${latest.volume}巻 ${volumes.size}冊`,
      ),
    });
  }

  return singles.map((book) => ({
    ...book,
    comment_key: book.comment_key || commentKeyForBook(book),
  }));
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
    const matchesManga = !state.mangaOnly || book.is_manga;
    const matchesComments =
      !state.commentsOnly || getComments(book.comment_key).length > 0;
    return matchesQuery && matchesManga && matchesComments;
  });

  return filtered.sort((left, right) => {
    if (state.sort === "oldest") {
      return dateValue(left.purchased_at) - dateValue(right.purchased_at);
    }
    if (state.sort === "title") {
      return japaneseCollator.compare(left.title_sort, right.title_sort);
    }
    if (state.sort === "author") {
      return japaneseCollator.compare(left.author, right.author);
    }
    if (state.sort === "genre") {
      const genreOrder = Number(right.is_manga) - Number(left.is_manga);
      return genreOrder
        || japaneseCollator.compare(left.title_sort, right.title_sort);
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
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function getShelfCapacity() {
  if (window.innerWidth < 480) {
    return 3;
  }
  if (window.innerWidth < 720) {
    return 4;
  }
  if (window.innerWidth < 980) {
    return 5;
  }
  return 7;
}

function shortRangeValue(value) {
  return String(value || "不明")
    .replace(/\s*\([^)]*(?:Edition|DIGITAL)[^)]*\)\s*/gi, " ")
    .trim()
    .slice(0, 12);
}

function getShelfLabel(books) {
  const first = books[0];
  const last = books.at(-1);

  if (state.sort === "newest" || state.sort === "oldest") {
    return first.purchased_at === last.purchased_at
      ? formatDate(first.purchased_at)
      : `${formatDate(first.purchased_at)} — ${formatDate(last.purchased_at)}`;
  }
  if (state.sort === "genre") {
    const categories = [...new Set(books.map((book) => book.category))];
    return categories.join(" / ");
  }
  if (state.sort === "author") {
    return `${shortRangeValue(first.author)} — ${shortRangeValue(last.author)}`;
  }
  return `${shortRangeValue(first.title_sort)} — ${shortRangeValue(last.title_sort)}`;
}

function createBookCard(book, index) {
  const card = elements.template.content.cloneNode(true);
  const article = card.querySelector(".book-card");
  const coverLink = card.querySelector(".cover-link");
  const cover = card.querySelector(".book-cover");
  const coverWrap = card.querySelector(".cover-wrap");
  const fallback = card.querySelector(".cover-fallback");
  const date = card.querySelector(".purchase-date");
  const category = card.querySelector(".book-category");
  const progress = card.querySelector(".series-progress");
  const commentButton = card.querySelector(".comment-button");
  const asin = card.querySelector(".book-asin");

  article.dataset.asin = book.asin;
  article.dataset.commentKey = book.comment_key;
  article.style.setProperty("--book-lean", `${((index * 7) % 5) - 2}deg`);
  cover.src = book.cover_image;
  cover.alt = `${book.title}の表紙`;
  fallback.textContent = book.title.slice(0, 1);
  cover.addEventListener("error", () => {
    coverWrap.classList.add("is-missing");
    cover.remove();
  }, { once: true });

  date.dateTime = book.purchased_at;
  date.textContent = formatDate(book.purchased_at);
  if (book.is_series) {
    date.setAttribute("aria-label", `最新巻の購入日 ${formatDate(book.purchased_at)}`);
    progress.hidden = false;
    progress.textContent =
      `${book.max_volume}巻まで · ${book.owned_volume_count}冊所持`;
  }
  category.textContent = book.category;
  category.classList.toggle("is-manga", book.is_manga);
  card.querySelector(".book-title").textContent = book.title;
  card.querySelector(".book-author").textContent = book.author;

  if (book.is_manga) {
    commentButton.hidden = false;
    commentButton.addEventListener("click", () => {
      if (getComments(book.comment_key).length > 0) {
        openCommentView(book);
      } else {
        openCommentDialog(book);
      }
    });
    updateCardComment(commentButton, getComments(book.comment_key));
  }

  if (book.asin) {
    asin.textContent = `ASIN ${book.asin}`;
    asin.href = `https://www.amazon.co.jp/dp/${encodeURIComponent(book.asin)}`;
    coverLink.href = asin.href;
  } else {
    asin.hidden = true;
    coverLink.removeAttribute("href");
  }

  return card;
}

async function loadComments() {
  try {
    const response = await fetch("/api/comments", { cache: "no-cache" });
    if (response.ok) {
      const data = await response.json();
      useApi = true;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(data)
          .map(([key, value]) => [key, normalizeCommentEntries(value)])
          .filter(([, entries]) => entries.length > 0),
      );
    }
  } catch {
    // fall through to localStorage
  }

  useApi = false;
  try {
    const stored = JSON.parse(localStorage.getItem(COMMENT_STORAGE_KEY) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored)
        .map(([key, value]) => [key, normalizeCommentEntries(value)])
        .filter(([, entries]) => entries.length > 0),
    );
  } catch {
    return {};
  }
}

function normalizeCommentEntries(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.entries)
      ? value.entries
      : typeof value?.text === "string"
        ? [value]
        : [];

  return source
    .filter((entry) => entry && typeof entry.text === "string" && entry.text.trim())
    .map((entry, index) => {
      const createdAt = entry.created_at || entry.updated_at || new Date().toISOString();
      return {
        id: entry.id || `legacy-${createdAt}-${index}`,
        text: entry.text.trim(),
        created_at: createdAt,
        updated_at: entry.created_at ? entry.updated_at || "" : "",
      };
    });
}

function persistComments() {
  localStorage.setItem(COMMENT_STORAGE_KEY, JSON.stringify(state.comments));
}

function getComments(key) {
  return Array.isArray(state.comments[key]) ? state.comments[key] : [];
}

function updateCardComment(button, comments) {
  const count = comments.length;
  const hasComment = count > 0;
  const label = hasComment
    ? `コメントを表示（${count}件）`
    : "コメントを書く";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.classList.toggle("has-comment", hasComment);
}

function refreshCommentCards(key) {
  for (const article of elements.list.querySelectorAll(".book-card")) {
    if (article.dataset.commentKey !== key) {
      continue;
    }
    updateCardComment(article.querySelector(".comment-button"), getComments(key));
  }
}

function updateCommentCount() {
  elements.commentCount.textContent =
    `${elements.commentText.value.length.toLocaleString("ja-JP")} / 1000`;
}

function openCommentView(book) {
  const comments = getComments(book.comment_key);
  if (comments.length === 0) {
    openCommentDialog(book);
    return;
  }

  state.activeCommentBook = book;
  elements.commentViewTitle.textContent = book.title;
  renderCommentThread(book);
  elements.commentViewDialog.showModal();
  elements.commentViewList.scrollTop = elements.commentViewList.scrollHeight;
}

function formatCommentDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderCommentThread(book) {
  elements.commentViewList.replaceChildren();
  for (const comment of getComments(book.comment_key)) {
    const message = document.createElement("article");
    const bubble = document.createElement("p");
    const meta = document.createElement("div");
    const time = document.createElement("time");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    message.className = "comment-message";
    bubble.className = "comment-bubble";
    bubble.textContent = comment.text;
    meta.className = "comment-message-meta";
    time.dateTime = comment.updated_at || comment.created_at;
    time.textContent = comment.updated_at
      ? `投稿 ${formatCommentDate(comment.created_at)} · 編集 ${formatCommentDate(comment.updated_at)}`
      : formatCommentDate(comment.created_at);
    editButton.className = "comment-message-action";
    editButton.type = "button";
    editButton.setAttribute("aria-label", "このコメントを編集");
    editButton.title = "編集";
    editButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 16.5-.75 3.25L7.5 19l10-10-2.5-2.5-10 10ZM13.5 8l2.5 2.5"/>
      </svg>
    `;
    editButton.addEventListener("click", () => {
      editCommentEntry(book, comment.id);
    });
    deleteButton.className = "comment-message-action is-delete";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", "このコメントを削除");
    deleteButton.title = "削除";
    deleteButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 7h15M9.5 4h5l1 3h-7l1-3Zm-2 3 .75 13h7.5l.75-13M10 10.5v6M14 10.5v6"/>
      </svg>
    `;
    deleteButton.addEventListener("click", () => {
      deleteCommentEntry(book, comment.id);
    });

    meta.append(time, editButton, deleteButton);
    message.append(bubble, meta);
    elements.commentViewList.append(message);
  }
}

function closeCommentView() {
  state.activeCommentBook = null;
  elements.commentViewDialog.close();
}

function addViewedComment() {
  const book = state.activeCommentBook;
  if (!book) {
    return;
  }

  closeCommentView();
  openCommentDialog(book);
}

function openCommentDialog(book, commentId = "") {
  state.activeCommentKey = book.comment_key;
  state.activeCommentBook = book;
  state.activeCommentId = commentId;
  const comment = getComments(book.comment_key)
    .find((entry) => entry.id === commentId);
  elements.commentBookTitle.textContent = book.title;
  elements.commentModeLabel.textContent = comment ? "コメントを編集" : "新しいコメント";
  elements.commentSubmit.textContent = comment ? "更新" : "追加";
  elements.commentText.value = comment?.text || "";
  updateCommentCount();
  elements.commentDialog.showModal();
  window.setTimeout(() => elements.commentText.focus(), 0);
}

function closeCommentDialog() {
  state.activeCommentKey = "";
  state.activeCommentBook = null;
  state.activeCommentId = "";
  elements.commentDialog.close();
}

async function saveActiveComment() {
  const key = state.activeCommentKey;
  const book = state.activeCommentBook;
  const commentId = state.activeCommentId;
  const text = elements.commentText.value.trim();
  if (!key || !book || !text) {
    return;
  }

  if (useApi) {
    try {
      if (commentId) {
        const res = await fetch("/api/comments", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, id: commentId, text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const entry = await res.json();
        state.comments[key] = getComments(key).map((c) =>
          c.id === commentId ? entry : c,
        );
      } else {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const entry = await res.json();
        state.comments[key] = [...getComments(key), entry];
      }
    } catch (error) {
      window.alert(`コメントの保存に失敗しました: ${error.message}`);
      return;
    }
  } else {
    const now = new Date().toISOString();
    if (commentId) {
      state.comments[key] = getComments(key).map((comment) => (
        comment.id === commentId
          ? { ...comment, text, updated_at: now }
          : comment
      ));
    } else {
      state.comments[key] = [
        ...getComments(key),
        {
          id: globalThis.crypto?.randomUUID?.() || `comment-${Date.now()}`,
          text,
          created_at: now,
          updated_at: "",
        },
      ];
    }
    persistComments();
  }

  refreshCommentCards(key);
  elements.commentDialog.close();
  state.activeCommentKey = "";
  state.activeCommentId = "";
  openCommentView(book);
}

function editCommentEntry(book, commentId) {
  closeCommentView();
  openCommentDialog(book, commentId);
}

async function deleteCommentEntry(book, commentId) {
  const key = book.comment_key;
  if (!window.confirm("このコメントを削除しますか？")) {
    return;
  }

  if (useApi) {
    try {
      const res = await fetch("/api/comments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, id: commentId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      window.alert(`コメントの削除に失敗しました: ${error.message}`);
      return;
    }
  }

  const remaining = getComments(key).filter((comment) => comment.id !== commentId);
  if (remaining.length > 0) {
    state.comments[key] = remaining;
  } else {
    delete state.comments[key];
  }
  if (!useApi) persistComments();
  refreshCommentCards(key);
  if (remaining.length > 0) {
    renderCommentThread(book);
  } else {
    closeCommentView();
    if (state.commentsOnly) {
      render();
    }
  }
}

function createShelfRow(books, startIndex) {
  const row = document.createElement("section");
  const shelfBooks = document.createElement("div");
  const shelfBoard = document.createElement("div");
  const shelfLabel = document.createElement("span");

  row.className = "shelf-row";
  row.setAttribute("aria-label", `本棚 ${Math.floor(startIndex / state.shelfCapacity) + 1}`);
  shelfBooks.className = "shelf-books";
  shelfBooks.style.setProperty("--shelf-columns", state.shelfCapacity);
  shelfBoard.className = "shelf-board";
  shelfLabel.className = "shelf-label";
  shelfLabel.textContent = getShelfLabel(books);

  books.forEach((book, offset) => {
    shelfBooks.append(createBookCard(book, startIndex + offset));
  });
  shelfBoard.append(shelfLabel);
  row.append(shelfBooks, shelfBoard);
  return row;
}

function appendNextPage() {
  if (state.renderedCount >= state.visibleBooks.length) {
    elements.loadSentinel.hidden = true;
    return;
  }

  const pageSize = state.shelfCapacity * SHELVES_PER_PAGE;
  const end = Math.min(state.renderedCount + pageSize, state.visibleBooks.length);
  const fragment = document.createDocumentFragment();

  for (let index = state.renderedCount; index < end; index += state.shelfCapacity) {
    const shelfBooks = state.visibleBooks.slice(
      index,
      Math.min(index + state.shelfCapacity, end),
    );
    fragment.append(createShelfRow(shelfBooks, index));
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
    ? `${total.toLocaleString("ja-JP")}件`
    : `${total.toLocaleString("ja-JP")}件中 ${matches.toLocaleString("ja-JP")}件`;
  elements.loadSentinel.textContent = shown < matches
    ? `${shown.toLocaleString("ja-JP")} / ${matches.toLocaleString("ja-JP")}件を表示`
    : `${matches.toLocaleString("ja-JP")}件を表示`;
}

function updateSummary() {
  const manga = state.rawBooks.filter((book) => book.is_manga).length;
  const mangaWorks = state.books.filter((book) => book.is_manga).length;
  const books = state.rawBooks.length - manga;
  elements.summary.textContent =
    `全${state.rawBooks.length.toLocaleString("ja-JP")}冊 · 漫画${manga.toLocaleString("ja-JP")}冊を${mangaWorks.toLocaleString("ja-JP")}作品に整理 · 書籍${books.toLocaleString("ja-JP")}冊`;
}

function renderRecentUpdates() {
  const recent = [...state.rawBooks]
    .sort(
      (left, right) => dateValue(right.purchased_at) - dateValue(left.purchased_at),
    )
    .slice(0, RECENT_UPDATES_COUNT);

  elements.recentUpdates.hidden = recent.length === 0;
  if (recent.length === 0) {
    return;
  }

  elements.recentLatest.textContent = `直近${recent.length}冊 · ${formatDate(recent[0].purchased_at)}`;
  elements.recentList.replaceChildren(
    ...recent.map((book) => {
      const item = document.createElement("li");
      const link = document.createElement(book.asin ? "a" : "div");
      const cover = document.createElement("img");
      const info = document.createElement("div");
      const title = document.createElement("p");
      const meta = document.createElement("p");
      const date = document.createElement("time");

      item.className = "recent-item";
      link.className = "recent-link";
      if (book.asin) {
        link.href = `https://www.amazon.co.jp/dp/${encodeURIComponent(book.asin)}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      cover.className = "recent-cover";
      cover.src = book.cover_image;
      cover.alt = "";
      cover.loading = "lazy";
      cover.referrerPolicy = "no-referrer";
      cover.addEventListener("error", () => cover.classList.add("is-missing"), {
        once: true,
      });
      info.className = "recent-info";
      title.className = "recent-book-title";
      title.textContent = book.title;
      meta.className = "recent-book-meta";
      meta.textContent = `${book.author} · ${book.category}`;
      date.className = "recent-date";
      date.dateTime = book.purchased_at;
      date.textContent = formatDate(book.purchased_at);

      info.append(title, meta);
      link.append(cover, info, date);
      item.append(link);
      return item;
    }),
  );
}

function render() {
  state.shelfCapacity = getShelfCapacity();
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
  state.commentsOnly = false;
  elements.search.value = "";
  elements.mangaFilter.setAttribute("aria-pressed", "false");
  elements.commentFilter.setAttribute("aria-pressed", "false");
}

async function loadCSV(text, sourceLabel) {
  state.rawBooks = parseCSV(text);
  state.books = collapseMangaSeries(state.rawBooks);
  resetFilters();
  elements.source.textContent = sourceLabel;
  updateSummary();
  renderRecentUpdates();
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

elements.commentFilter.addEventListener("click", () => {
  state.commentsOnly = !state.commentsOnly;
  elements.commentFilter.setAttribute("aria-pressed", String(state.commentsOnly));
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

elements.commentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveActiveComment();
});

elements.commentText.addEventListener("input", updateCommentCount);
elements.commentClose.addEventListener("click", closeCommentDialog);
elements.commentCancel.addEventListener("click", closeCommentDialog);
elements.commentViewClose.addEventListener("click", closeCommentView);
elements.commentViewCancel.addEventListener("click", closeCommentView);
elements.commentViewAdd.addEventListener("click", addViewedComment);
elements.commentViewDialog.addEventListener("click", (event) => {
  if (event.target === elements.commentViewDialog) {
    closeCommentView();
  }
});
elements.commentDialog.addEventListener("click", (event) => {
  if (event.target === elements.commentDialog) {
    closeCommentDialog();
  }
});

const loadObserver = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    appendNextPage();
  }
}, { rootMargin: "600px 0px" });

loadObserver.observe(elements.loadSentinel);

loadComments().then((comments) => {
  state.comments = comments;
  if (elements.commentStorageLabel) {
    elements.commentStorageLabel.textContent = useApi
      ? "サーバーに保存されます（誰でも閲覧できます）"
      : "このブラウザに保存されます";
  }
  if (state.books.length > 0) render();
});

let resizeTimer;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (state.books.length > 0 && getShelfCapacity() !== state.shelfCapacity) {
      render();
    }
  }, 180);
});

loadDefaultCSV();
