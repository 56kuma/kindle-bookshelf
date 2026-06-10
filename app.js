const state = {
  books: [],
  query: "",
  sort: "newest",
};

const elements = {
  list: document.querySelector("#book-list"),
  template: document.querySelector("#book-card-template"),
  search: document.querySelector("#search-input"),
  sort: document.querySelector("#sort-select"),
  csvInput: document.querySelector("#csv-input"),
  count: document.querySelector("#result-count"),
  source: document.querySelector("#source-label"),
  empty: document.querySelector("#empty-state"),
  clearSearch: document.querySelector("#clear-search"),
};

const headerAliases = {
  purchased_at: ["purchased_at", "purchase_date", "order_date", "購入日"],
  cover_image: ["cover_image", "image_url", "cover", "表紙", "表紙画像"],
  title: ["title", "product_name", "タイトル", "商品名"],
  author: ["author", "creator", "作者", "著者"],
};

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

  const headers = rows[0].map((header) => header.toLowerCase());
  const indexes = Object.fromEntries(
    Object.entries(headerAliases).map(([key, aliases]) => [
      key,
      headers.findIndex((header) => aliases.includes(header)),
    ]),
  );

  if (indexes.title === -1) {
    throw new Error("CSVに title（タイトル）列がありません。");
  }

  return rows.slice(1).map((values, index) => ({
    id: `${values[indexes.title]}-${index}`,
    purchased_at: valueAt(values, indexes.purchased_at),
    cover_image: valueAt(values, indexes.cover_image),
    title: valueAt(values, indexes.title) || "タイトル不明",
    author: valueAt(values, indexes.author) || "作者不明",
  }));
}

function valueAt(row, index) {
  return index >= 0 ? row[index] || "" : "";
}

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/\s+/g, " ")
    .trim();
}

function getVisibleBooks() {
  const terms = normalize(state.query).split(" ").filter(Boolean);
  const filtered = state.books.filter((book) => {
    const searchable = normalize(
      `${book.title} ${book.author} ${book.purchased_at}`,
    );
    return terms.every((term) => searchable.includes(term));
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
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    return value || "購入日不明";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function render() {
  const books = getVisibleBooks();
  const fragment = document.createDocumentFragment();

  books.forEach((book) => {
    const card = elements.template.content.cloneNode(true);
    const cover = card.querySelector(".book-cover");
    const date = card.querySelector(".purchase-date");

    cover.src = book.cover_image || "";
    cover.alt = `${book.title}の表紙`;
    cover.addEventListener("error", () => {
      cover.hidden = true;
    });

    date.dateTime = book.purchased_at;
    date.textContent = formatDate(book.purchased_at);
    card.querySelector(".book-title").textContent = book.title;
    card.querySelector(".book-author").textContent = book.author;
    fragment.append(card);
  });

  elements.list.replaceChildren(fragment);
  elements.list.hidden = books.length === 0;
  elements.empty.hidden = books.length !== 0;
  elements.count.textContent = state.query
    ? `${state.books.length}冊中 ${books.length}冊`
    : `${books.length}冊`;
}

async function loadDefaultCSV() {
  try {
    const response = await fetch("data/books.csv");
    if (!response.ok) {
      throw new Error("サンプルCSVを読み込めませんでした。");
    }
    state.books = parseCSV(await response.text());
    render();
  } catch (error) {
    elements.count.textContent = "読み込みエラー";
    elements.list.innerHTML = `<p>${error.message}</p>`;
  }
}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

elements.sort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

elements.clearSearch.addEventListener("click", () => {
  state.query = "";
  elements.search.value = "";
  elements.search.focus();
  render();
});

elements.csvInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    state.books = parseCSV(await file.text());
    state.query = "";
    elements.search.value = "";
    elements.source.textContent = file.name;
    render();
  } catch (error) {
    window.alert(error.message);
  } finally {
    event.target.value = "";
  }
});

loadDefaultCSV();
