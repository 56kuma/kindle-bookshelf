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
  genre: "",
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
  genreFilters: document.querySelector("#genre-filters"),
  commentFilter: document.querySelector("#comment-filter"),
  count: document.querySelector("#result-count"),
  source: document.querySelector("#source-label"),
  summary: document.querySelector("#library-summary"),
  empty: document.querySelector("#empty-state"),
  clearSearch: document.querySelector("#clear-search"),
  loadSentinel: document.querySelector("#load-sentinel"),
  recentUpdates: document.querySelector("#recent-updates"),
  recentList: document.querySelector("#recent-list"),
  recentLatest: document.querySelector("#recent-latest"),
  syncLog: document.querySelector("#sync-log"),
  syncLogList: document.querySelector("#sync-log-list"),
  syncLogLatest: document.querySelector("#sync-log-latest"),
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
  genre: ["genre", "ジャンル"],
  asin: ["asin"],
  is_manga: ["is_manga", "manga", "is_comic"],
};

const mangaCategories = ["漫画", "マンガ", "コミック", "manga", "comic", "comics"];

const OTHER_GENRE = "その他";
// CSVにジャンル列が無いため、タイトルのキーワードから推定する。
// ジャンル名は Amazon Kindleストアのカテゴリーに準拠。
// 先に並んだルールほど優先（レーベル名など特定しやすいものが先、
// 「仕事」「習慣」のような広いキーワードを持つビジネス・経済が最後）。
// keywords は normalize() 済みの部分一致、words は英数字の単語一致。
const genreRules = [
  {
    genre: "ライトノベル",
    keywords: [
      "ライトノベル", "ラノベ", "電撃文庫", "スニーカー文庫", "ファンタジア文庫",
      "mf文庫", "ga文庫", "hj文庫", "ガガガ文庫", "ファミ通文庫",
      "オーバーラップ文庫", "オーバーラップノベルス", "ダッシュエックス文庫",
      "講談社ラノベ文庫", "電撃の新文芸", "カドカワbooks", "mfブックス",
      "gcノベルズ", "ヒーロー文庫", "レジェンドノベルス", "サーガフォレスト",
      "アース・スター", "toブックス",
    ],
    words: [],
  },
  {
    genre: "コンピュータ・IT",
    keywords: [
      "プログラミング", "プログラマ", "エンジニア", "ソフトウェア", "アルゴリズム",
      "ネットワーク", "セキュリティ", "データベース", "データ分析", "データサイエンス",
      "機械学習", "深層学習", "ディープラーニング", "人工知能", "生成ai",
      "クラウド", "サーバ", "コンピュータ", "パソコン", "情報処理", "情報技術",
      "基本情報", "応用情報", "システム開発", "システム設計", "要件定義",
      "オブジェクト指向", "ドメイン駆動", "テスト駆動", "リファクタリング",
      "コーディング", "アプリ開発", "ゲーム開発", "web制作", "webデザイン",
      "webアプリ", "ホームページ", "ハッカー", "ハッキング", "go言語",
    ],
    words: [
      "python", "javascript", "typescript", "java", "ruby", "php", "rust",
      "kotlin", "swift", "golang", "sql", "mysql", "postgresql", "aws", "azure",
      "gcp", "linux", "unix", "docker", "kubernetes", "git", "github", "react",
      "vue", "angular", "html", "css", "api", "ai", "chatgpt", "llm", "vba",
      "c++", "c#", "dx", "iot", "it",
    ],
  },
  {
    genre: "語学・資格",
    keywords: [
      "英語", "英会話", "英単語", "英文法", "英検", "漢検", "中国語", "韓国語",
      "フランス語", "ドイツ語", "スペイン語", "語学", "資格", "検定",
      "試験対策", "過去問", "問題集", "勉強法", "宅建", "行政書士",
      "社労士", "中小企業診断士", "ファイナンシャルプランナー",
    ],
    words: ["toeic", "toefl", "ielts", "fp"],
  },
  {
    genre: "暮らし・健康・子育て",
    keywords: [
      "健康", "ダイエット", "筋トレ", "筋肉", "トレーニング", "ストレッチ",
      "睡眠", "栄養", "食事術", "腸活", "腸内", "免疫", "血糖", "血圧", "内臓",
      "姿勢", "骨盤", "肩こり", "腰痛", "疲労", "疲れ", "自律神経", "メンタル",
      "うつ", "ストレス", "運動", "ヨガ", "ピラティス", "ランニング", "体幹",
      "糖質", "断食", "ファスティング", "医者", "医師", "病気", "予防医学",
      "長生き", "老化", "若返り", "体調", "痩せ", "やせる", "太らない",
      "認知症", "アンチエイジング", "サプリ", "漢方", "整体", "マッサージ",
      "子育て", "育児", "離乳食", "料理", "レシピ", "献立", "お弁当",
      "掃除", "収納", "片づけ", "片付け", "ミニマリスト", "節約", "家事",
      "暮らし",
    ],
    words: [],
  },
  {
    genre: "歴史・地理",
    keywords: [
      "歴史", "日本史", "世界史", "戦国", "幕末", "明治維新", "江戸",
      "縄文", "三国志", "古代", "中世", "近代史", "現代史", "地政学",
      "地理", "考古学", "ローマ帝国", "武将", "天皇", "昭和史",
    ],
    words: [],
  },
  {
    genre: "科学・テクノロジー",
    keywords: [
      "宇宙", "物理", "数学", "化学", "生物学", "進化", "遺伝子", "脳科学",
      "量子", "相対性理論", "天文", "気象", "元素", "科学", "サイエンス",
      "統計学", "微分", "確率",
    ],
    words: [],
  },
  {
    genre: "人文・思想",
    keywords: [
      "哲学", "心理学", "心理", "宗教", "仏教", "禅", "神道", "キリスト教",
      "思想", "倫理", "社会学", "民俗学", "言語学", "名著", "ニーチェ",
      "アドラー", "ブッダ",
    ],
    words: [],
  },
  {
    genre: "小説・文芸",
    keywords: [
      "小説", "物語", "短編集", "ミステリ", "サスペンス", "ホラー",
      "ファンタジー", "純文学", "芥川賞", "直木賞", "本屋大賞", "エッセイ",
      "随筆", "詩集", "俳句", "短歌", "角川文庫", "新潮文庫", "講談社文庫",
      "文春文庫", "集英社文庫", "幻冬舎文庫", "中公文庫", "岩波文庫",
      "ハヤカワ文庫", "創元推理文庫", "創元sf文庫",
    ],
    words: ["sf"],
  },
  {
    genre: "趣味・実用",
    keywords: [
      "カメラ", "写真", "釣り", "キャンプ", "アウトドア", "登山", "将棋",
      "囲碁", "麻雀", "ゴルフ", "サッカー", "野球", "自転車", "ロードバイク",
      "手芸", "編み物", "イラスト", "描き方", "デッサン", "ガーデニング",
      "園芸", "バイク", "旅行", "温泉", "鉄道", "ピアノ", "ギター",
      "音楽理論", "ボードゲーム",
    ],
    words: ["diy"],
  },
  {
    genre: "ビジネス・経済",
    keywords: [
      "ビジネス", "仕事", "経営", "マネジメント", "マーケティング", "リーダー",
      "起業", "副業", "転職", "キャリア", "営業", "会計", "簿記", "経済",
      "金融", "投資", "株式", "資産", "節税", "税金", "お金", "年収", "貯金",
      "家計", "ふるさと納税", "確定申告", "戦略", "企画", "プレゼン", "交渉",
      "会議", "部下", "上司", "働き方", "仕事術", "時間術", "習慣",
      "思考法", "ロジカルシンキング", "フレームワーク", "エクセル",
      "パワーポイント", "マネー",
    ],
    words: ["mba", "nisa", "ideco", "excel", "powerpoint"],
  },
];

for (const rule of genreRules) {
  if (rule.words.length > 0) {
    const escaped = rule.words.map((word) =>
      word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    rule.wordPattern = new RegExp(
      `(?<![a-z0-9])(?:${escaped.join("|")})(?![a-z0-9])`,
    );
  }
}

// チップとジャンル順ソートの表示順（推定の優先順とは別に定義する）
const GENRE_ORDER = [
  "漫画",
  "小説・文芸",
  "ライトノベル",
  "ビジネス・経済",
  "コンピュータ・IT",
  "暮らし・健康・子育て",
  "趣味・実用",
  "歴史・地理",
  "人文・思想",
  "科学・テクノロジー",
  "語学・資格",
  OTHER_GENRE,
];

function genreRank(genre) {
  const index = GENRE_ORDER.indexOf(genre);
  return index === -1 ? GENRE_ORDER.length - 1 : index;
}

function inferGenre(title) {
  const normalizedTitle = normalize(title);
  for (const rule of genreRules) {
    if (rule.keywords.some((keyword) => normalizedTitle.includes(keyword))) {
      return rule.genre;
    }
    if (rule.wordPattern && rule.wordPattern.test(normalizedTitle)) {
      return rule.genre;
    }
  }
  return OTHER_GENRE;
}

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
    const explicitGenre = valueAt(values, indexes.genre);
    const mangaValue = valueAt(values, indexes.is_manga);
    const manga = indexes.is_manga >= 0
      ? isTruthy(mangaValue)
      : isMangaCategory(category) || isMangaCategory(explicitGenre);
    const title = valueAt(values, indexes.title) || "タイトル不明";
    const genre = manga
      ? "漫画"
      : explicitGenre
        || (category && !isMangaCategory(category) ? category : "")
        || inferGenre(title);
    const book = {
      purchased_at: valueAt(values, indexes.purchased_at),
      cover_image: valueAt(values, indexes.cover_image),
      title,
      title_sort: valueAt(values, indexes.title_kana) || title,
      author: valueAt(values, indexes.author) || "著者不明",
      category: genre,
      genre,
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
    const matchesGenre = !state.genre || book.genre === state.genre;
    const matchesComments =
      !state.commentsOnly || getComments(book.comment_key).length > 0;
    return matchesQuery && matchesGenre && matchesComments;
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
      const genreOrder = genreRank(left.genre) - genreRank(right.genre);
      return genreOrder
        || japaneseCollator.compare(left.genre, right.genre)
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
  // シリーズ集約後のデータを使い、同じ漫画は1エントリ（最新巻の購入日）にまとめる
  const recent = [...state.books]
    .sort(
      (left, right) => dateValue(right.purchased_at) - dateValue(left.purchased_at),
    )
    .slice(0, RECENT_UPDATES_COUNT);

  elements.recentUpdates.hidden = recent.length === 0;
  if (recent.length === 0) {
    return;
  }

  elements.recentLatest.textContent = `直近${recent.length}件 · ${formatDate(recent[0].purchased_at)}`;
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
      meta.textContent = book.is_series
        ? `${book.author} · ${book.max_volume}巻まで · ${book.owned_volume_count}冊所持`
        : `${book.author} · ${book.category}`;
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

const SYNC_LOG_DISPLAY_COUNT = 10;
const syncStatusLabels = {
  success: "成功",
  failed: "失敗",
  aborted: "中止",
  login_required: "要ログイン",
};

async function loadSyncStatus() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const url = localHosts.has(window.location.hostname)
    ? "data/sync-status.json"
    : "/api/sync-status";

  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    const runs = Array.isArray(data?.runs)
      ? data.runs
      : data?.runs
        ? [data.runs]
        : [];
    renderSyncLog(runs);
  } catch {
    // 同期ログが無い環境では非表示のまま
  }
}

function renderSyncLog(runs) {
  const recent = runs.slice(-SYNC_LOG_DISPLAY_COUNT).reverse();
  if (recent.length === 0) {
    return;
  }

  const latest = recent[0];
  elements.syncLog.hidden = false;
  elements.syncLogLatest.textContent =
    `${syncStatusLabels[latest.status] || latest.status} · ${latest.at}`;
  elements.syncLogList.replaceChildren(
    ...recent.map((run) => {
      const item = document.createElement("li");
      const badge = document.createElement("span");
      const time = document.createElement("time");
      const detail = document.createElement("span");

      item.className = "sync-log-item";
      badge.className = `sync-log-badge ${run.status === "success" ? "is-success" : "is-failure"}`;
      badge.textContent = syncStatusLabels[run.status] || run.status;
      time.className = "sync-log-time";
      time.textContent = run.at;
      detail.className = "sync-log-detail";
      detail.textContent = run.status === "success"
        ? `${Number(run.rows || 0).toLocaleString("ja-JP")}冊`
        : run.message || "";

      item.append(badge, time, detail);
      if (run.status !== "success" && run.hint) {
        const hint = document.createElement("p");
        hint.className = "sync-log-hint";
        hint.textContent = `考えられる原因・対処: ${run.hint}`;
        item.append(hint);
      }
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
  state.genre = "";
  state.commentsOnly = false;
  elements.search.value = "";
  updateGenreChips();
  elements.commentFilter.setAttribute("aria-pressed", "false");
}

function renderGenreChips() {
  const present = new Set(state.books.map((book) => book.genre));
  const extras = [...present]
    .filter((genre) => !GENRE_ORDER.includes(genre))
    .sort(japaneseCollator.compare);
  const genres = [
    ...GENRE_ORDER.filter((genre) => present.has(genre)),
    ...extras,
  ];

  elements.genreFilters.replaceChildren(
    ...genres.map((genre) => {
      const chip = document.createElement("button");
      const check = document.createElement("span");

      chip.className = "filter-chip";
      chip.type = "button";
      chip.dataset.genre = genre;
      chip.setAttribute("aria-pressed", String(state.genre === genre));
      check.className = "filter-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      chip.append(check, document.createTextNode(genre));
      chip.addEventListener("click", () => {
        state.genre = state.genre === genre ? "" : genre;
        updateGenreChips();
        render();
      });
      return chip;
    }),
  );
}

function updateGenreChips() {
  for (const chip of elements.genreFilters.querySelectorAll(".filter-chip")) {
    chip.setAttribute(
      "aria-pressed",
      String(state.genre === chip.dataset.genre),
    );
  }
}

async function loadCSV(text, sourceLabel) {
  state.rawBooks = parseCSV(text);
  state.books = collapseMangaSeries(state.rawBooks);
  resetFilters();
  renderGenreChips();
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
loadSyncStatus();
