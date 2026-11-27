const HIST_KEY = "fp_team_hist_10y";
const LEGACY_HIST_KEY = "fp_team_hist_9m";
const STANDINGS_KEY = "fp_standings_cache_v2";
const BET_KEY = "fp_bet_log_v1";
const SLIP_KEY = "fp_slip_v1";
const ODDS_KEY_STORAGE = "fp_odds_api_key_v1";
const ODDS_CACHE_KEY = "fp_odds_cache_v1";
const ODDS_SPORTS_KEY = "fp_odds_sports_v1";
const ODDS_QUOTA_KEY = "fp_odds_quota_v1";
const ODDS_TTL = 45 * 60 * 1000;

const AF_KEY_STORAGE = "fp_af_api_key_v1";
const AF_DATE_CACHE_KEY = "fp_af_dates_v1";
const AF_MATCH_CACHE_KEY = "fp_af_matches_v1";
const AF_QUOTA_KEY = "fp_af_quota_v1";
const AF_DATE_TTL = 12 * 3600 * 1000;
const AF_MATCH_TTL = 20 * 60 * 1000;

const STANDINGS_TTL = 30 * 60 * 1000;
const EXTRA_RE = /\b(AET|ET|PEN|PENS|PSO|FT-PENS)\b/;

const COMPS = [
  ["ita.1", "Serie A", "Campionato", "🇮🇹"], ["ita.2", "Serie B", "Campionato", "🇮🇹"], ["ita.coppa_italia", "Coppa Italia", "Coppa", "🇮🇹"],
  ["eng.1", "Premier League", "Campionato", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"], ["eng.2", "Championship", "Campionato", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"], ["eng.fa", "FA Cup", "Coppa", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"], ["eng.league_cup", "EFL Cup", "Coppa", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["esp.1", "La Liga", "Campionato", "🇪🇸"], ["esp.copa_del_rey", "Copa del Rey", "Coppa", "🇪🇸"],
  ["ger.1", "Bundesliga", "Campionato", "🇩🇪"], ["ger.dfb_pokal", "DFB-Pokal", "Coppa", "🇩🇪"],
  ["fra.1", "Ligue 1", "Campionato", "🇫🇷"], ["fra.coupe_de_france", "Coupe de France", "Coppa", "🇫🇷"],
  ["ned.1", "Eredivisie", "Campionato", "🇳🇱"], ["por.1", "Liga Portugal", "Campionato", "🇵🇹"],
  ["tur.1", "Süper Lig", "Campionato", "🇹🇷"], ["bel.1", "Pro League", "Campionato", "🇧🇪"], ["sco.1", "Premiership", "Campionato", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"],
  ["uefa.champions", "Champions League", "Coppa", "🏆"], ["uefa.europa", "Europa League", "Coppa", "🏆"], ["uefa.europa.conf", "Conference League", "Coppa", "🏆"],
  ["uefa.nations", "Nations League", "Nazionali", "🌍"], ["fifa.worldq.uefa", "Qual. Mondiali UEFA", "Nazionali", "🌍"],
  ["caf.nations", "Coppa d'Africa", "Nazionali", "🌍"], ["fifa.friendly", "Amichevoli Int.", "Nazionali", "🌍"],
  ["bra.1", "Brasileirão", "Campionato", "🇧🇷"], ["arg.1", "Liga Profesional", "Campionato", "🇦🇷"], ["usa.1", "MLS", "Campionato", "🇺🇸"]
];

const ODDS_SPORT_MAP = {
  "ita.1": "soccer_italy_serie_a",
  "ita.2": "soccer_italy_serie_b",
  "ita.coppa_italia": "soccer_italy_coppa_italia",
  "eng.1": "soccer_epl",
  "eng.2": "soccer_efl_champ",
  "eng.fa": "soccer_fa_cup",
  "eng.league_cup": "soccer_england_efl_cup",
  "esp.1": "soccer_spain_la_liga",
  "esp.copa_del_rey": "soccer_spain_copa_del_rey",
  "ger.1": "soccer_germany_bundesliga",
  "ger.dfb_pokal": "soccer_germany_dfb_pokal",
  "fra.1": "soccer_france_ligue_one",
  "ned.1": "soccer_netherlands_eredivisie",
  "por.1": "soccer_portugal_primeira_liga",
  "tur.1": "soccer_turkey_super_league",
  "bel.1": "soccer_belgium_first_div",
  "sco.1": "soccer_spl",
  "uefa.champions": "soccer_uefa_champs_league",
  "uefa.europa": "soccer_uefa_europa_league",
  "uefa.europa.conf": "soccer_uefa_europa_conference_league",
  "uefa.nations": "soccer_uefa_nations_league",
  "fifa.worldq.uefa": "soccer_fifa_world_cup_qualifiers_europe",
  "bra.1": "soccer_brazil_campeonato",
  "arg.1": "soccer_argentina_primera_division",
  "usa.1": "soccer_usa_mls"
};

const AM_LEAGUES = new Set(["bra.1", "arg.1", "usa.1"]);
const Q_PREFIX = "fp_q4_" + COMPS.length + "_";
const MONTH_PREFIX = "fp_m4_" + COMPS.length + "_";

let TEAM_HIST_CACHE = {};
let standingsCache = {};
let BET_LOG = [];
const GLOBAL_TEAM_STATS = {};
const SLIP = new Map();
const st = {
  tab: "oggi", search: "", minConf: 0, market: "all", sort: "league",
  onlyPlayable: false, onlyValue: false, collapsed: new Set(), allCollapsed: false,
  autoCal: true, useMarketBlend: true
};

const LEAGUE_TIER = {
  "eng.1": { s: 1.00, elo: 1580 }, "esp.1": { s: 1.00, elo: 1570 }, "ita.1": { s: 1.00, elo: 1570 },
  "ger.1": { s: 0.99, elo: 1560 }, "fra.1": { s: 0.97, elo: 1545 },
  "por.1": { s: 0.90, elo: 1490 }, "ned.1": { s: 0.90, elo: 1490 }, "eng.2": { s: 0.89, elo: 1475 },
  "bra.1": { s: 0.91, elo: 1500 }, "arg.1": { s: 0.89, elo: 1480 },
  "bel.1": { s: 0.85, elo: 1445 }, "tur.1": { s: 0.85, elo: 1445 }, "sco.1": { s: 0.82, elo: 1415 },
  "ita.2": { s: 0.83, elo: 1420 }, "usa.1": { s: 0.84, elo: 1430 }
};

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) { dbPromise = null; return reject(new Error("No IDB")); }
    const req = indexedDB.open("FootPredictDB", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error("IDB blocked")); };
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(val, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelByPrefix(prefix) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      (keysReq.result || []).forEach(k => {
        if (typeof k === "string" && k.startsWith(prefix)) store.delete(k);
      });
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function indexGlobalStandings() {
  Object.entries(standingsCache).forEach(([slug, entry]) => {
    if (!entry?.map) return;
    Object.entries(entry.map).forEach(([tid, obj]) => {
      if (!GLOBAL_TEAM_STATS[tid] || obj.played > GLOBAL_TEAM_STATS[tid].played) {
        GLOBAL_TEAM_STATS[tid] = { ...obj, domSlug: slug };
      }
    });
  });
}

function sanitizeTeamHist(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean = {};
  Object.entries(raw).forEach(([tid, t]) => {
    if (!t || typeof t !== "object" || !Array.isArray(t.m)) return;
    const tot = Number(t.tot);
    if (!Number.isFinite(tot) || tot <= 0) return;
    clean[tid] = {
      id: String(t.id ?? tid), n: String(t.n || "Squadra"), tot,
      elo: Number.isFinite(Number(t.elo)) ? Number(t.elo) : 1500,
      hit: Number(t.hit) || 0, ou: Number(t.ou) || 0,
      tTot: Number(t.tTot) || 0, tHit: Number(t.tHit) || 0,
      eg: Number(t.eg) || 0, rg: Number(t.rg) || 0,
      gf: Number(t.gf) || 0, ga: Number(t.ga) || 0,
      egf: Number(t.egf) || 0, ega: Number(t.ega) || 0,
      m: t.m.filter(x => x && typeof x === "object" && typeof x.p === "string")
    };
  });
  return clean;
}

function saveSlip() {
  try { localStorage.setItem(SLIP_KEY, JSON.stringify(Array.from(SLIP.entries()))); } catch {}
}

function loadSlip() {
  try {
    const raw = localStorage.getItem(SLIP_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      arr.slice(0, 8).forEach(([id, item]) => {
        if (id && item && typeof item.code === "string" && Number.isFinite(item.prob)) SLIP.set(id, item);
      });
    }
  } catch {}
}

async function initStorage() {
  await Promise.all([v13Load(),v13LoadSnapshots()]); v13Status();
  loadSlip();
  renderSlipBar();
  try {
    const [hist10y, hist9m, stdIdb, betIdb] = await Promise.all([
      idbGet(HIST_KEY), idbGet(LEGACY_HIST_KEY), idbGet(STANDINGS_KEY), idbGet(BET_KEY)
    ]);
    if (hist10y && typeof hist10y === "object") {
      TEAM_HIST_CACHE = sanitizeTeamHist(hist10y);
    } else if (hist9m && typeof hist9m === "object") {
      TEAM_HIST_CACHE = sanitizeTeamHist(hist9m);
      await idbSet(HIST_KEY, TEAM_HIST_CACHE);
    } else {
      const legacy = localStorage.getItem(HIST_KEY) || localStorage.getItem(LEGACY_HIST_KEY);
      if (legacy) {
        TEAM_HIST_CACHE = sanitizeTeamHist(JSON.parse(legacy));
        await idbSet(HIST_KEY, TEAM_HIST_CACHE);
      }
    }
    if (stdIdb && typeof stdIdb === "object") {
      const now = Date.now();
      Object.entries(stdIdb).forEach(([slug, val]) => {
        if (val && (now - val.ts) < STANDINGS_TTL) standingsCache[slug] = val;
      });
      indexGlobalStandings();
    }
    if (Array.isArray(betIdb)) BET_LOG = betIdb;
  } catch {
    try {
      const legacy = localStorage.getItem(HIST_KEY) || localStorage.getItem(LEGACY_HIST_KEY);
      if (legacy) TEAM_HIST_CACHE = sanitizeTeamHist(JSON.parse(legacy));
    } catch {}
  }
}

async function saveTeamHist(data) {
  TEAM_HIST_CACHE = sanitizeTeamHist(data);
  try { await idbSet(HIST_KEY, TEAM_HIST_CACHE); }
  catch { try { localStorage.setItem(HIST_KEY, JSON.stringify(TEAM_HIST_CACHE)); } catch {} }
}

async function saveBetLog() {
  try { await idbSet(BET_KEY, BET_LOG); } catch {}
}

async function persistStandingsCache() {
  try { await idbSet(STANDINGS_KEY, standingsCache); } catch {}
}

async function clearTeamHist() {
  TEAM_HIST_CACHE = {};
  try {
    await idbDel(HIST_KEY);
    await idbDel(LEGACY_HIST_KEY);
    await idbDelByPrefix("fp_m");
    await idbDelByPrefix("fp_q");
  } catch {}
  try {
    localStorage.removeItem(HIST_KEY);
    localStorage.removeItem(LEGACY_HIST_KEY);
  } catch {}
}

const getTeamHist = () => TEAM_HIST_CACHE;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
}[c]));

const debounce = (fn, ms = 150) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  });
  await Promise.all(workers);
  return results;
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

const ESPNProvider = {
  async fetchWithTimeout(url, ms = 7000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  },
  async fetchScoreboard(slug, datesParam, limit = null, retries = 1) {
    const limQ = limit ? `&limit=${limit}` : "";
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${datesParam}${limQ}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await this.fetchWithTimeout(url, limit ? 9000 : 5000);
        if (!r.ok) {
          if ((r.status === 429 || r.status >= 500) && attempt < retries) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          const err = new Error(`HTTP ${r.status}`); err.status = r.status; throw err;
        }
        const data = await r.json();
        return data.events || [];
      } catch (err) {
        if (attempt < retries && !err?.status) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    return [];
  },
  async fetchStandingsRaw(slug) {
    const r = await this.fetchWithTimeout(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`);
    if (!r.ok) return null;
    return await r.json();
  },
  async fetchSummary(slug, eventId) {
    const r = await this.fetchWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${eventId}`, 5000);
    if (!r.ok) return null;
    return await r.json();
  }
};

const TEAM_ALIASES = {
  "internazionale": "inter", "inter milan": "inter", "fc internazionale milano": "inter",
  "ac milan": "milan", "milan": "milan",
  "as roma": "roma", "roma": "roma",
  "ssc napoli": "napoli", "napoli": "napoli",
  "paris saint germain": "psg", "paris saint-germain": "psg", "psg": "psg",
  "manchester united": "man utd", "man united": "man utd",
  "manchester city": "man city", "man city": "man city",
  "wolverhampton wanderers": "wolves", "wolves": "wolves",
  "brighton and hove albion": "brighton", "brighton hove albion": "brighton",
  "tottenham hotspur": "tottenham", "tottenham": "tottenham",
  "sporting cp": "sporting lisbon", "sporting lisbon": "sporting lisbon",
  "atletico madrid": "atletico madrid", "athletic club": "athletic bilbao",
  "bayern munich": "bayern", "bayern munchen": "bayern",
  "psv eindhoven": "psv", "psv": "psv",
  "feyenoord rotterdam": "feyenoord", "feyenoord": "feyenoord",
  "hellas verona": "verona", "verona": "verona",
  "como 1907": "como", "como": "como"
};

function normTeamName(name) {
  const cleaned = String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|cf|ac|as|ss|ssc|us|sc|afc|rc|cd|ud|fk|sk|sv|vfb|tsg|fsv|rb|1|club|calcio|hotspur|wanderers)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return TEAM_ALIASES[cleaned] || TEAM_ALIASES[String(name || "").toLowerCase().trim()] || cleaned;
}

function teamSimScore(a, b) {
  const na = normTeamName(a), nb = normTeamName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(" ").filter(x => x.length >= 2));
  const tb = new Set(nb.split(" ").filter(x => x.length >= 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  return inter / Math.max(ta.size, tb.size);
}

const OddsProvider = {
  getKey() {
    try { return (localStorage.getItem(ODDS_KEY_STORAGE) || "").trim(); } catch { return ""; }
  },
  setKey(k) {
    try {
      const clean = String(k || "").trim();
      if (clean) localStorage.setItem(ODDS_KEY_STORAGE, clean);
      else localStorage.removeItem(ODDS_KEY_STORAGE);
    } catch {}
  },
  getQuota() {
    try { return JSON.parse(localStorage.getItem(ODDS_QUOTA_KEY) || "null"); } catch { return null; }
  },
  saveQuota(headers) {
    try {
      const rem = headers?.get?.("x-requests-remaining");
      const used = headers?.get?.("x-requests-used");
      if (rem !== null || used !== null) {
        localStorage.setItem(ODDS_QUOTA_KEY, JSON.stringify({ remaining: rem, used, ts: Date.now() }));
      }
    } catch {}
  },
  loadCache() {
    try { return JSON.parse(localStorage.getItem(ODDS_CACHE_KEY) || "{}"); } catch { return {}; }
  },
  saveCache(cache) {
    try { localStorage.setItem(ODDS_CACHE_KEY, JSON.stringify(cache)); } catch {}
  },
  clearCache() {
    try { localStorage.removeItem(ODDS_CACHE_KEY); localStorage.removeItem(ODDS_SPORTS_KEY); } catch {}
  },
  async fetchActiveSports(apiKey) {
    try {
      const cached = JSON.parse(localStorage.getItem(ODDS_SPORTS_KEY) || "null");
      if (cached && (Date.now() - cached.ts) < 12 * 3600 * 1000 && Array.isArray(cached.keys)) {
        return new Set(cached.keys);
      }
    } catch {}
    const r = await ESPNProvider.fetchWithTimeout(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}`, 7000);
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    const arr = await r.json();
    const keys = (Array.isArray(arr) ? arr : []).filter(x => x.active && String(x.key || "").startsWith("soccer_")).map(x => x.key);
    try { localStorage.setItem(ODDS_SPORTS_KEY, JSON.stringify({ ts: Date.now(), keys })); } catch {}
    return new Set(keys);
  },
  async fetchLeagueOdds(sportKey, apiKey, force = false) {
    const cache = this.loadCache();
    const hit = cache[sportKey];
    if (!force && hit && (Date.now() - hit.ts) < ODDS_TTL) {
      return { events: hit.events, fromCache: true };
    }
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${encodeURIComponent(apiKey)}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;
    const r = await ESPNProvider.fetchWithTimeout(url, 8000);
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    this.saveQuota(r.headers);
    const events = await r.json();
    cache[sportKey] = { ts: Date.now(), events: Array.isArray(events) ? events : [] };
    this.saveCache(cache);
    return { events: cache[sportKey].events, fromCache: false };
  }
};

function extractOddsData(ev) {
  const books = ev.bookmakers || [];
  if (!books.length) return null;
  const best = {};
  const updBest = (code, price, bookTitle) => {
    const val = Number(price);
    if (!Number.isFinite(val) || val <= 1.01) return;
    if (!best[code] || val > best[code].odd) best[code] = { odd: val, book: bookTitle };
  };

  let sharpH2H = null, sharpTot = null;
  const allH2H = [], allTot = [];

  books.forEach(bk => {
    const title = bk.title || bk.key || "Book";
    (bk.markets || []).forEach(mk => {
      if (mk.key === "h2h") {
        let o1 = null, ox = null, o2 = null;
        (mk.outcomes || []).forEach(out => {
          if (out.name === "Draw") ox = Number(out.price);
          else if (teamSimScore(out.name, ev.home_team) >= 0.7) o1 = Number(out.price);
          else if (teamSimScore(out.name, ev.away_team) >= 0.7) o2 = Number(out.price);
        });
        if (o1 > 1 && ox > 1 && o2 > 1) {
          updBest("1", o1, title); updBest("X", ox, title); updBest("2", o2, title);
          const item = { o1, ox, o2, key: bk.key };
          allH2H.push(item);
          if (bk.key === "pinnacle" || (!sharpH2H && bk.key === "betfair_ex_eu")) sharpH2H = item;
        }
      } else if (mk.key === "totals") {
        let oO = null, oU = null;
        (mk.outcomes || []).forEach(out => {
          if (Number(out.point) !== 2.5) return;
          if (out.name === "Over") oO = Number(out.price);
          else if (out.name === "Under") oU = Number(out.price);
        });
        if (oO > 1 && oU > 1) {
          updBest("Over 2.5", oO, title); updBest("Under 2.5", oU, title);
          const item = { oO, oU, key: bk.key };
          allTot.push(item);
          if (bk.key === "pinnacle" || (!sharpTot && bk.key === "betfair_ex_eu")) sharpTot = item;
        }
      }
    });
  });

  if (!Object.keys(best).length) return null;

  let mktP1 = null, mktPX = null, mktP2 = null, sharpSrc = null;
  if (sharpH2H) {
    const inv = 1 / sharpH2H.o1 + 1 / sharpH2H.ox + 1 / sharpH2H.o2;
    mktP1 = (1 / sharpH2H.o1) / inv; mktPX = (1 / sharpH2H.ox) / inv; mktP2 = (1 / sharpH2H.o2) / inv;
    sharpSrc = sharpH2H.key === "pinnacle" ? "Pinnacle" : "Betfair Ex";
  } else if (allH2H.length) {
    let s1 = 0, sx = 0, s2 = 0;
    allH2H.forEach(x => {
      const inv = 1 / x.o1 + 1 / x.ox + 1 / x.o2;
      s1 += (1 / x.o1) / inv; sx += (1 / x.ox) / inv; s2 += (1 / x.o2) / inv;
    });
    mktP1 = s1 / allH2H.length; mktPX = sx / allH2H.length; mktP2 = s2 / allH2H.length;
    sharpSrc = `Media ${allH2H.length} book`;
  }

  let mktPO = null, mktPU = null;
  if (sharpTot) {
    const inv = 1 / sharpTot.oO + 1 / sharpTot.oU;
    mktPO = (1 / sharpTot.oO) / inv; mktPU = (1 / sharpTot.oU) / inv;
  } else if (allTot.length) {
    let sO = 0, sU = 0;
    allTot.forEach(x => {
      const inv = 1 / x.oO + 1 / x.oU;
      sO += (1 / x.oO) / inv; sU += (1 / x.oU) / inv;
    });
    mktPO = sO / allTot.length; mktPU = sU / allTot.length;
  }

  return { best, mktP1, mktPX, mktP2, mktPO, mktPU, sharpSrc, booksCount: books.length };
}

function attachOddsToLeagues(leagues) {
  const cache = OddsProvider.loadCache();
  let matched = 0;
  leagues.forEach(l => {
    const sportKey = ODDS_SPORT_MAP[l.id];
    const cached = sportKey ? cache[sportKey] : null;
    if (!cached || (Date.now() - cached.ts) > ODDS_TTL || !Array.isArray(cached.events)) {
      l.matches.forEach(m => { delete m.odds; });
      return;
    }
    l.matches.forEach(m => {
      delete m.odds;
      let bestEv = null, bestScore = 0;
      cached.events.forEach(ev => {
        const evTs = Date.parse(ev.commence_time);
        if (Number.isFinite(evTs) && m.startTs && Math.abs(evTs - m.startTs) > 90 * 60 * 1000) return;
        const sh = teamSimScore(m.home, ev.home_team), sa = teamSimScore(m.away, ev.away_team);
        if (sh >= 0.75 && sa >= 0.75) {
          const sc = sh + sa;
          if (sc > bestScore) { bestScore = sc; bestEv = ev; }
        }
      });
      if (bestEv) {
        const parsed = extractOddsData(bestEv);
        if (parsed) { m.odds = parsed; matched++; }
      }
    });
  });
  return matched;
}

const AFProvider = {
  getKey() {
    try { return (localStorage.getItem(AF_KEY_STORAGE) || "").trim(); } catch { return ""; }
  },
  setKey(k) {
    try {
      const clean = String(k || "").trim();
      if (clean) localStorage.setItem(AF_KEY_STORAGE, clean);
      else localStorage.removeItem(AF_KEY_STORAGE);
    } catch {}
  },
  getQuota() {
    try { return JSON.parse(localStorage.getItem(AF_QUOTA_KEY) || "null"); } catch { return null; }
  },
  isPaidPlan() {
    const q = this.getQuota();
    return Number(q?.limit) > 100;
  },
  saveQuota(headers) {
    try {
      const rem = headers?.get?.("x-ratelimit-requests-remaining");
      const lim = headers?.get?.("x-ratelimit-requests-limit");
      if (rem !== null || lim !== null) {
        localStorage.setItem(AF_QUOTA_KEY, JSON.stringify({ remaining: rem, limit: lim, ts: Date.now() }));
      }
    } catch {}
  },
  loadDateCache() {
    try { return JSON.parse(localStorage.getItem(AF_DATE_CACHE_KEY) || "{}"); } catch { return {}; }
  },
  saveDateCache(c) {
    try { localStorage.setItem(AF_DATE_CACHE_KEY, JSON.stringify(c)); } catch {}
  },
  loadMatchCache() {
    try { return JSON.parse(localStorage.getItem(AF_MATCH_CACHE_KEY) || "{}"); } catch { return {}; }
  },
  saveMatchCache(c) {
    try {
      const now = Date.now(), clean = {};
      Object.entries(c).forEach(([k, v]) => {
        if (v && (now - v.ts) < 6 * 3600 * 1000) clean[k] = v;
      });
      localStorage.setItem(AF_MATCH_CACHE_KEY, JSON.stringify(clean));
    } catch {}
  },
  clearCache() {
    try { localStorage.removeItem(AF_DATE_CACHE_KEY); localStorage.removeItem(AF_MATCH_CACHE_KEY); } catch {}
  },
  async apiGet(path, apiKey) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(`https://v3.football.api-sports.io/${path}`, {
        method: "GET",
        headers: { "x-apisports-key": apiKey },
        signal: ctrl.signal
      });
      this.saveQuota(r.headers);
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
      const data = await r.json();
      const errs = data?.errors;
      if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) {
        const msg = Array.isArray(errs) ? errs.join(" • ") : Object.values(errs).join(" • ");
        throw new Error(msg || "Errore API-Football");
      }
      return data?.response || [];
    } finally {
      clearTimeout(timer);
    }
  },
  async getFixturesByDate(dateIso, apiKey, force = false) {
    const cache = this.loadDateCache();
    const hit = cache[dateIso];
    if (!force && hit && (Date.now() - hit.ts) < AF_DATE_TTL && Array.isArray(hit.list)) {
      return { list: hit.list, fromCache: true };
    }
    const resp = await this.apiGet(`fixtures?date=${dateIso}`, apiKey);
    const slim = resp.map(x => ({
      id: x.fixture?.id,
      ts: (x.fixture?.timestamp || 0) * 1000,
      hId: x.teams?.home?.id, hName: x.teams?.home?.name || "",
      aId: x.teams?.away?.id, aName: x.teams?.away?.name || ""
    })).filter(x => x.id);
    const nextCache = {};
    const now = Date.now();
    Object.entries(cache).forEach(([k, v]) => { if (v && (now - v.ts) < 48 * 3600 * 1000) nextCache[k] = v; });
    nextCache[dateIso] = { ts: now, list: slim };
    this.saveDateCache(nextCache);
    return { list: slim, fromCache: false };
  },
  async fetchDetailsBatch(fixtureIds, apiKey) {
    if (!fixtureIds.length) return {};
    const byFix = {};
    const calcAvail = list => {
      let miss = 0, quest = 0;
      const seen = new Set();
      list.forEach(x => {
        if (seen.has(x.name)) return;
        seen.add(x.name);
        if (String(x.type).toLowerCase().includes("questionable")) quest++;
        else miss++;
      });
      return Number(clamp(1 - Math.min(miss, 5) * 0.025 - Math.min(quest, 4) * 0.01, 0.84, 1.0).toFixed(3));
    };

    const parseChunk = (fixturesResp, injuriesResp) => {
      const chunk = {};
      fixturesResp.forEach(fx => {
        const fid = fx.fixture?.id;
        if (!fid) return;
        const hId = fx.teams?.home?.id, aId = fx.teams?.away?.id;
        const lineups = (fx.lineups || []).map(lu => ({
          teamId: lu.team?.id,
          isHome: lu.team?.id === hId,
          formation: lu.formation || "",
          coach: lu.coach?.name || "",
          startXI: (lu.startXI || []).map(s => `${s.player?.name || ""}${s.player?.pos ? ` (${s.player.pos})` : ""}`)
        }));
        const parseStats = teamId => {
          const stObj = (fx.statistics || []).find(s => s.team?.id === teamId);
          if (!stObj) return null;
          const map = {};
          (stObj.statistics || []).forEach(row => { map[row.type] = row.value; });
          return {
            xg: map["expected_goals"] ?? null,
            sog: map["Shots on Goal"] ?? null,
            tot: map["Total Shots"] ?? null,
            box: map["Shots insidebox"] ?? null,
            pos: map["Ball Possession"] ?? null
          };
        };
        chunk[fid] = {
          ts: Date.now(), fid, hId, aId, lineups,
          statsH: parseStats(hId), statsA: parseStats(aId),
          injH: [], injA: []
        };
      });

      injuriesResp.forEach(inj => {
        const fid = inj.fixture?.id;
        const entry = chunk[fid];
        if (!entry) return;
        const rec = {
          name: inj.player?.name || "Giocatore",
          type: inj.player?.type || "Missing Fixture",
          reason: inj.player?.reason || ""
        };
        if (inj.team?.id === entry.hId) entry.injH.push(rec);
        else if (inj.team?.id === entry.aId) entry.injA.push(rec);
      });

      const matchCache = this.loadMatchCache();
      Object.values(chunk).forEach(item => {
        item.autoHL = calcAvail(item.injH);
        item.autoAL = calcAvail(item.injA);
        matchCache[String(item.fid)] = item;
        byFix[item.fid] = item;
      });
      this.saveMatchCache(matchCache);
    };

    if (fixtureIds.length > 1 && this.isPaidPlan()) {
      const idsParam = fixtureIds.slice(0, 20).join("-");
      const fixturesResp = await this.apiGet(`fixtures?ids=${idsParam}`, apiKey);
      let injuriesResp = [];
      try { injuriesResp = await this.apiGet(`injuries?ids=${idsParam}`, apiKey); } catch {}
      parseChunk(fixturesResp, injuriesResp);
      return byFix;
    }

    for (let i = 0; i < fixtureIds.length; i++) {
      const fid = fixtureIds[i];
      const fixturesResp = await this.apiGet(`fixtures?id=${fid}`, apiKey);
      let injuriesResp = [];
      try { injuriesResp = await this.apiGet(`injuries?fixture=${fid}`, apiKey); } catch {}
      parseChunk(fixturesResp, injuriesResp);
      if (i < fixtureIds.length - 1) await sleep(250);
    }
    return byFix;
  }
};

function findAFFixtureForMatch(m, afDateList) {
  if (!Array.isArray(afDateList) || !afDateList.length) return null;
  let best = null, bestScore = 0, secondScore = 0;
  afDateList.forEach(ev => {
    if (ev.ts && m.startTs && Math.abs(ev.ts - m.startTs) > 95 * 60 * 1000) return;
    const sh = teamSimScore(m.home, ev.hName), sa = teamSimScore(m.away, ev.aName);
    if (sh >= 0.75 && sa >= 0.75) {
      const sc = sh + sa;
      if (sc > bestScore) { secondScore = bestScore; bestScore = sc; best = ev; } else secondScore = Math.max(secondScore, sc);
    }
  });
  return bestScore - secondScore >= 0.10 ? best : null;
}

function attachAFCacheToLeagues(leagues) {
  const dateCache = AFProvider.loadDateCache();
  const matchCache = AFProvider.loadMatchCache();
  let attached = 0;
  leagues.forEach(l => {
    l.matches.forEach(m => {
      delete m.af; delete m.afId;
      const dateIso = localDateKey(new Date(m.startTs || Date.now()));
      const dEntry = dateCache[dateIso];
      if (!dEntry?.list) return;
      const fx = findAFFixtureForMatch(m, dEntry.list);
      if (fx) {
        m.afId = fx.id;
        const det = matchCache[String(fx.id)];
        if (det && (Date.now() - det.ts) < AF_MATCH_TTL) {
          m.af = det;
          attached++;
        }
      }
    });
  });
  return attached;
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
const pois = (k, l) => { let p = Math.exp(-l); for (let n = 1; n <= k; n++) p *= l / n; return p; };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const safeNum = (v, fb) => Number.isFinite(v) ? v : fb;
const shrink = (val, gp, leagueAvg, priorWeight = 5) => (val * gp + leagueAvg * priorWeight) / (gp + priorWeight);
const damp = (f, power = 0.5) => Math.pow(clamp(safeNum(f, 1.0), 0.5, 1.8), power);
const fairOdd = p => (1 / Math.max(0.02, p)).toFixed(2);
const PICK_BASELINES = { "1": 0.44, "2": 0.29, "X": 0.27, "1X": 0.72, "X2": 0.56, "Over 2.5": 0.50, "Under 2.5": 0.50, "Gol": 0.50, "No Gol": 0.50 };
const pickEdge = (code, prob) => { const b = PICK_BASELINES[code] ?? 0.50; return Math.max(0, (prob - b) / (1 - b)); };

function isHit(code, h, a) {
  const tot = h + a;
  if (code === "1") return h > a;
  if (code === "X") return h === a;
  if (code === "2") return h < a;
  if (code === "1X") return h >= a;
  if (code === "X2") return h <= a;
  if (code === "Over 1.5") return tot >= 2;
  if (code === "Under 3.5") return tot <= 3;
  if (code === "Over 2.5") return tot >= 3;
  if (code === "Under 2.5") return tot <= 2;
  if (code === "Gol") return h > 0 && a > 0;
  if (code === "No Gol") return h === 0 || a === 0;
  if (code === "1X + Over 1.5") return h >= a && tot >= 2;
  if (code === "X2 + Over 1.5") return a >= h && tot >= 2;
  if (code === "1X + Under 3.5") return h >= a && tot <= 3;
  if (code === "X2 + Under 3.5") return a >= h && tot <= 3;
  if (code === "Multigol 1-3") return tot >= 1 && tot <= 3;
  if (code === "Multigol 2-4") return tot >= 2 && tot <= 4;
  if (code === "Gol Casa") return h >= 1;
  if (code === "Gol Ospite") return a >= 1;
  return false;
}

function getTeamAdj(teamId) {
  const th = getTeamHist()[teamId];
  if (!th) return { attFactor: 1.0, defFactor: 1.0, elo: null };
  const elo = Number.isFinite(th.elo) ? th.elo : null;
  if (th.tot < 5) return { attFactor: 1.0, defFactor: 1.0, elo };

  const recent = Array.isArray(th.m) ? th.m.slice(-15) : [];
  const lastDate = recent.length ? Date.parse(recent[recent.length - 1].d) : 0;
  if (lastDate && (Date.now() - lastDate) > 45 * 86400000) {
    return { attFactor: 1.0, defFactor: 1.0, elo };
  }

  const hasDetailed = recent.length >= 5 && recent.every(x => Number.isFinite(x.gf) && Number.isFinite(x.egf));
  let attFactor = 1.0, defFactor = 1.0;
  if (hasDetailed) {
    let rGf = 0, rGa = 0, rEgf = 0, rEga = 0;
    recent.forEach(x => { rGf += x.gf; rGa += x.ga; rEgf += x.egf; rEga += x.ega; });
    attFactor = clamp((rGf + 4.0) / Math.max(1.0, rEgf + 4.0), 0.90, 1.10);
    defFactor = clamp((rGa + 4.0) / Math.max(1.0, rEga + 4.0), 0.90, 1.10);
  } else if (th.egf > 0 && th.ega > 0) {
    attFactor = clamp((th.gf + 5.0) / Math.max(1.0, th.egf + 5.0), 0.90, 1.10);
    defFactor = clamp((th.ga + 5.0) / Math.max(1.0, th.ega + 5.0), 0.90, 1.10);
  }
  return {
    attFactor: Number(safeNum(attFactor, 1.0).toFixed(3)),
    defFactor: Number(safeNum(defFactor, 1.0).toFixed(3)),
    elo
  };
}

function calcPred(m, ov = {}, useCal = true, learningModel = null) {
  const baseHL = m.af ? safeNum(m.af.autoHL, 1.0) : safeNum(m.stats.hL, 1.0);
  const baseAL = m.af ? safeNum(m.af.autoAL, 1.0) : safeNum(m.stats.aL, 1.0);
  const hL = safeNum(ov.hL ?? baseHL, 1.0), aL = safeNum(ov.aL ?? baseAL, 1.0);
  const neutralAdj = { attFactor: 1.0, defFactor: 1.0, elo: null };
  const adjH = (useCal && (learningModel || st.autoCal)) ? (m.stats.adjH ?? (m.homeId ? getTeamAdj(m.homeId) : neutralAdj)) : neutralAdj;
  const adjA = (useCal && (learningModel || st.autoCal)) ? (m.stats.adjA ?? (m.awayId ? getTeamAdj(m.awayId) : neutralAdj)) : neutralAdj;
  const avgH = clamp(safeNum(m.stats.avgH, 1.48), 0.5, 3), avgA = clamp(safeNum(m.stats.avgA, 1.18), 0.5, 3);
  const hGF = safeNum(m.stats.hGF, avgH), hGA = safeNum(m.stats.hGA, avgA);
  const aGF = safeNum(m.stats.aGF, avgA), aGA = safeNum(m.stats.aGA, avgH);
  const hFF = safeNum(m.stats.hFF, 1.0), aFF = safeNum(m.stats.aFF, 1.0);

  let eloMult = 1.0;
  if (useCal && (learningModel || st.autoCal)) {
    const eloH = safeNum(m.stats.eloH, adjH.elo);
    const eloA = safeNum(m.stats.eloA, adjA.elo);
    if (Number.isFinite(eloH) || Number.isFinite(eloA)) {
      const defEloH = LEAGUE_TIER[m.stats.domSlugH || m.slug]?.elo ?? 1470;
      const defEloA = LEAGUE_TIER[m.stats.domSlugA || m.slug]?.elo ?? 1470;
      const effEloH = Number.isFinite(eloH) ? eloH : defEloH;
      const effEloA = Number.isFinite(eloA) ? eloA : defEloA;
      const wt = m.stats.isCrossLeague ? 0.18 : 0.06;
      eloMult = clamp(Math.pow(10, ((effEloH - effEloA) / 400) * wt), 0.78, 1.28);
    } else if (m.stats.isCrossLeague && m.stats.tierH && m.stats.tierA) {
      eloMult = clamp(Math.pow(m.stats.tierH / m.stats.tierA, 1.2), 0.84, 1.19);
    }
  }

  const lamH = clamp( (hGF / avgH) * (aGA / avgH) * avgH * damp(hFF, 0.5) * hL * damp(adjH.attFactor, 0.5) * damp(adjA.defFactor, 0.5) * eloMult, 0.15, 6);
  const lamA = clamp( (aGF / avgA) * (hGA / avgA) * avgA * damp(aFF, 0.5) * aL * damp(adjA.attFactor, 0.5) * damp(adjH.defFactor, 0.5) / eloMult, 0.15, 6);

  // Sensitivity mixture: uncertain scoring intensity, not a fitted calibration.
  const sample = Math.min(safeNum(m.stats.sampleH, 0), safeNum(m.stats.sampleA, 0));
  const spread = sample >= 15 ? 0.10 : sample >= 5 ? 0.18 : 0.28;
  const scenarios = [[1-spread,0.25],[1,0.50],[1+spread,0.25]].map(([scale,weight])=>{const lh=lamH*scale,la=lamA*scale;return {lh,la,weight,rho:Math.max(-0.08,-0.95/Math.max(lh,la)),ph:Array.from({length:25},(_,i)=>pois(i,lh)),pa:Array.from({length:25},(_,i)=>pois(i,la))};});
  const scores = [];
  let totalP = 0;
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 24; j++) {
      let p = 0;
      for (const {lh,la,weight,rho,ph,pa} of scenarios) {
        let q = ph[i]*pa[j];
        if (i===0 && j===0) q *= 1-lh*la*rho;
        else if (i===1 && j===0) q *= 1+la*rho;
        else if (i===0 && j===1) q *= 1+lh*rho;
        else if (i===1 && j===1) q *= 1-rho;
        p += weight*q;
      }
      scores.push({ i, j, p });
      totalP += p;
    }
  }

  // One joint distribution for every market. Market targets are soft, then
  // iterative proportional fitting reconciles the marginals with scorelines.
  scores.forEach(x => x.p /= totalP);
  const sumWhere = fn => scores.reduce((sum, x) => sum + (fn(x) ? x.p : 0), 0);
  const home = x => x.i > x.j, draw = x => x.i === x.j, away = x => x.i < x.j;
  const over = x => x.i + x.j > 2;
  const rawProbs = { p1: sumWhere(home), px: sumWhere(draw), p2: sumWhere(away), pO: sumWhere(over) };
  const ml = useCal && (learningModel || st.autoCal) ? v13Distribution(scores,m,lamH,lamA,learningModel || v13Model,m.startTs) : null;
  const adapted = [sumWhere(home),sumWhere(draw),sumWhere(away)], adaptedO = sumWhere(over);
  let marketDiv = 0;
  const odds = m.odds;
  const validMarket = odds && [odds.mktP1, odds.mktPX, odds.mktP2].every(v => Number.isFinite(v) && v > 0 && v < 1);
  if (useCal && validMarket) {
    const z = odds.mktP1 + odds.mktPX + odds.mktP2;
    const market = [odds.mktP1/z, odds.mktPX/z, odds.mktP2/z];
    const raw = [rawProbs.p1, rawProbs.px, rawProbs.p2];
    marketDiv = Math.max(...raw.map((v,i) => Math.abs(v-market[i])), Number.isFinite(odds.mktPO) ? Math.abs(rawProbs.pO-odds.mktPO) : 0);
    if (st.useMarketBlend) {
      const w = 0.28; // provisional, not fitted
      const targets = adapted.map((v,i) => (1-w)*v+w*market[i]);
      const hasOver = Number.isFinite(odds.mktPO) && odds.mktPO > 0 && odds.mktPO < 1;
      const targetO = hasOver ? (1-w)*adaptedO+w*odds.mktPO : null;
      for (let n=0; n<20; n++) {
        const current = [sumWhere(home),sumWhere(draw),sumWhere(away)];
        scores.forEach(x => { const i=home(x)?0:draw(x)?1:2; x.p *= targets[i]/Math.max(1e-12,current[i]); });
        if (hasOver) { const o=sumWhere(over); scores.forEach(x => x.p *= over(x)?targetO/Math.max(1e-12,o):(1-targetO)/Math.max(1e-12,1-o)); }
      }
    }
  }
  const norm = sumWhere(() => true); scores.forEach(x => x.p /= norm);
  const p1=sumWhere(home), px=sumWhere(draw), p2=sumWhere(away), pO=sumWhere(over), pG=sumWhere(x=>x.i>0&&x.j>0);
  const pO15=sumWhere(x=>x.i+x.j>=2), pU35=sumWhere(x=>x.i+x.j<=3);
  const p1X_O15=sumWhere(x=>x.i>=x.j&&x.i+x.j>=2), pX2_O15=sumWhere(x=>x.j>=x.i&&x.i+x.j>=2);
  const p1X_U35=sumWhere(x=>x.i>=x.j&&x.i+x.j<=3), pX2_U35=sumWhere(x=>x.j>=x.i&&x.i+x.j<=3);
  const pMG13=sumWhere(x=>x.i+x.j>=1&&x.i+x.j<=3), pMG24=sumWhere(x=>x.i+x.j>=2&&x.i+x.j<=4);
  const pHomeG=sumWhere(x=>x.i>=1), pAwayG=sumWhere(x=>x.j>=1);

  const topScores = scores.sort((a, b) => b.p - a.p).slice(0, 3).map(s => ({ score: `${s.i}-${s.j}`, prob: s.p }));
  const best1X2 = [
    { code: "1", cat: "1X2", label: "Vittoria " + m.home, prob: p1 },
    { code: "2", cat: "1X2", label: "Vittoria " + m.away, prob: p2 },
    { code: "X", cat: "1X2", label: "Pareggio", prob: px }
  ].reduce((b, c) => c.prob > b.prob ? c : b);

  const bestDC = p1 >= p2
    ? { code: "1X", cat: "DC", label: m.home + " o X", prob: p1 + px }
    : { code: "X2", cat: "DC", label: m.away + " o X", prob: px + p2 };

  const bestGoals = [
    { code: "Over 1.5", cat: "GOALS", label: "2+ Gol", prob: pO15 },
    { code: "Under 3.5", cat: "GOALS", label: "0-3 Gol", prob: pU35 },
    { code: "Over 2.5", cat: "GOALS", label: "3+ Gol", prob: pO },
    { code: "Under 2.5", cat: "GOALS", label: "0-2 Gol", prob: 1 - pO },
    { code: "Gol", cat: "GOALS", label: "Entrambe a segno", prob: pG },
    { code: "No Gol", cat: "GOALS", label: "Almeno una a zero", prob: 1 - pG }
  ].reduce((b, c) => c.prob > b.prob ? c : b);

  // Select by estimated success probability; data quality is separate.
  const bestPick = [best1X2, bestDC, bestGoals].reduce((b,c)=>c.prob>b.prob?c:b);
  const ouPick = pO >= 0.5 ? { code: "Over 2.5", prob: pO, isOver: true } : { code: "Under 2.5", prob: 1-pO, isOver: false };
  const quality = clamp(0.70*safeNum(m.stats.comp,0.35)+0.30*(1-clamp(safeNum(m.stats.vol,0.5),0,1)),0,1);
  const conf = Math.round(100*clamp(quality-(m.lowData?0.20:0)-Math.min(0.20,marketDiv*0.7),0,1));
  const rankScore = bestPick.prob * conf;
  const eligible = bestPick.prob >= 0.75 && conf >= 75 && !m.lowData && marketDiv < 0.14;

  let bestValue = null;
  if (m.odds?.best && conf >= 75 && marketDiv < 0.14) {
    const probByCode = { "1": p1, "X": px, "2": p2, "Over 2.5": pO, "Under 2.5": 1 - pO };
    Object.entries(probByCode).forEach(([code, prob]) => {
      const bObj = m.odds.best[code];
      if (!bObj || prob < 0.22) return;
      const ev = prob * bObj.odd - 1;
      if (ev >= 0.05 && (!bestValue || ev > bestValue.ev)) {
        bestValue = { code, prob, odd: bObj.odd, book: bObj.book, ev };
      }
    });
  }

  const combos = [
    { code: p1 >= p2 ? "1X + Over 1.5" : "X2 + Over 1.5", prob: p1 >= p2 ? p1X_O15 : pX2_O15 },
    { code: p1 >= p2 ? "1X + Under 3.5" : "X2 + Under 3.5", prob: p1 >= p2 ? p1X_U35 : pX2_U35 },
    { code: "Over 1.5", prob: pO15 },
    { code: "Under 3.5", prob: pU35 },
    { code: "Multigol 1-3", prob: pMG13 },
    { code: "Multigol 2-4", prob: pMG24 },
    { code: "Gol Casa", prob: pHomeG },
    { code: "Gol Ospite", prob: pAwayG }
  ];

  return {
    lamH: lamH.toFixed(2), lamA: lamA.toFixed(2),
    probs: { p1, px, p2, pO, pU: 1 - pO, pG, pNG: 1 - pG },
    rawProbs, marketDiv, bestValue,
    bestPick, best1X2, ouPick, topScores, combos, confidence: conf, rankScore, eligible, modelVersion: "13.0", calibrated: Boolean(ml?.active), ml: learningModel ? ml : undefined, mlActive: Boolean(ml?.active)
  };
}

function parseForm(str) {
  if (!str) return { pills: [], factor: 1.0 };
  const map = { W: "V", D: "P", L: "S", T: "P" }, ptsMap = { W: 3, D: 1, T: 1, L: 0 };
  const arr = str.slice(-5).split("");
  const pts = arr.reduce((s, c) => s + (ptsMap[c] ?? 1), 0);
  return { pills: arr.map(c => map[c] || c), factor: Number((0.88 + (pts / Math.max(1, arr.length * 3)) * 0.24).toFixed(3)) };
}

function renderFormDots(pills) {
  if (!pills || !pills.length) return "";
  return `<span class="inline-flex items-center gap-0.5 ml-1.5 shrink-0">${pills.map(p => {
    const cls = p === "V" ? "bg-emerald-400" : p === "P" ? "bg-amber-400" : "bg-rose-400";
    return `<span class="w-1.5 h-1.5 rounded-full ${cls}" title="${esc(p)}"></span>`;
  }).join("")}</span>`;
}

function renderFormBadges(pills) {
  if (!pills || !pills.length) return `<span class="text-slate-500">N/D</span>`;
  return pills.map(p => {
    const cls = p === "V" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : p === "P" ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
      : "bg-rose-500/20 text-rose-300 border-rose-500/40";
    return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${cls}">${esc(p)}</span>`;
  }).join(" ");
}

function extractStandingsEntries(node) {
  if (!node) return [];
  let entries = node.standings?.entries || [];
  if (Array.isArray(node.children)) {
    node.children.forEach(c => { entries = entries.concat(extractStandingsEntries(c)); });
  }
  return entries;
}

const splitAvg = (val, gp) => (Number.isFinite(val) && Number.isFinite(gp) && gp >= 3) ? val / gp : null;

async function fetchStandings(slug, leagueName = "") {
  const cached = standingsCache[slug];
  if (cached && (Date.now() - cached.ts) < STANDINGS_TTL) return cached.map;
  try {
    const d = await ESPNProvider.fetchStandingsRaw(slug);
    if (!d) return {};
    const entries = extractStandingsEntries(d);
    const map = {};
    let sumGf = 0, sumGp = 0, sumHGf = 0, sumHGp = 0, sumAGf = 0, sumAGp = 0;

    entries.forEach(e => {
      const m = {}; (e.stats || []).forEach(s => { m[s.name] = Number(s.value); });
      const gp = m.gamesPlayed || 0, gf = m.pointsFor ?? m.goalsFor ?? 0, ga = m.pointsAgainst ?? m.goalsAgainst ?? 0;
      if (e.team?.id && gp > 0 && Number.isFinite(gf) && Number.isFinite(ga)) {
        sumGf += gf; sumGp += gp;
        const hGf = m.homeGoalsFor ?? m.homePointsFor, hGp = m.homeGamesPlayed;
        const aGf = m.awayGoalsFor ?? m.awayPointsFor, aGp = m.awayGamesPlayed;
        if (Number.isFinite(hGf) && Number.isFinite(hGp) && hGp > 0) { sumHGf += hGf; sumHGp += hGp; }
        if (Number.isFinite(aGf) && Number.isFinite(aGp) && aGp > 0) { sumAGf += aGf; sumAGp += aGp; }

        const obj = {
          played: gp, gfAvg: gf / gp, gaAvg: ga / gp,
          hGp: (Number.isFinite(hGp) && hGp >= 3) ? hGp : null,
          aGp: (Number.isFinite(aGp) && aGp >= 3) ? aGp : null,
          hGfAvg: splitAvg(hGf, hGp), hGaAvg: splitAvg(m.homeGoalsAgainst ?? m.homePointsAgainst, hGp),
          aGfAvg: splitAvg(aGf, aGp), aGaAvg: splitAvg(m.awayGoalsAgainst ?? m.awayPointsAgainst, aGp),
          rank: Number.isFinite(m.rank) ? m.rank : "-", source: leagueName || slug, domSlug: slug
        };
        map[e.team.id] = obj;
        if (!GLOBAL_TEAM_STATS[e.team.id] || gp > GLOBAL_TEAM_STATS[e.team.id].played) {
          GLOBAL_TEAM_STATS[e.team.id] = obj;
        }
      }
    });

    let avgH = 1.48, avgA = 1.18;
    if (sumHGp >= 20 && sumAGp >= 20) {
      avgH = Number(clamp(sumHGf / sumHGp, 0.90, 2.30).toFixed(3));
      avgA = Number(clamp(sumAGf / sumAGp, 0.70, 2.00).toFixed(3));
    } else if (sumGp >= 20) {
      const avgG = sumGf / sumGp;
      avgH = Number(clamp(avgG * 1.08, 0.90, 2.30).toFixed(3));
      avgA = Number(clamp(avgG * 0.92, 0.70, 2.00).toFixed(3));
    }

    standingsCache[slug] = { ts: Date.now(), map, avgH, avgA };
    return map;
  } catch { return {}; }
}

function resolveTeamStats(teamId, localTable, kind = "Campionato") {
  const isLeague = kind === "Campionato", isClubCup = kind === "Coppa";
  const local = localTable[teamId], dom = GLOBAL_TEAM_STATS[teamId];
  if (isLeague && local && local.played >= 3) return { ...local, kind: "local" };
  if (isClubCup && dom && dom.played >= 6 && (!local || dom.played >= local.played)) return { ...dom, kind: "league" };
  if (local && local.played >= 3) return { ...local, kind: "local" };
  if (isClubCup && dom && dom.played >= 3) return { ...dom, kind: "league" };

  const th = getTeamHist()[teamId];
  if (th && th.tot >= 4) {
    const rec = Array.isArray(th.m) ? th.m.slice(-38).filter(x => Number.isFinite(x.gf) && Number.isFinite(x.ga)) : [];
    if (rec.length >= 4) {
      let rGf = 0, rGa = 0;
      rec.forEach(x => { rGf += x.gf; rGa += x.ga; });
      return { played: rec.length, gfAvg: rGf / rec.length, gaAvg: rGa / rec.length, kind: "hist", source: `Storico (${rec.length}g)` };
    }
    if (Number.isFinite(th.gf) && Number.isFinite(th.ga)) {
      return { played: th.tot, gfAvg: th.gf / th.tot, gaAvg: th.ga / th.tot, kind: "hist", source: "Storico" };
    }
  }
  if (local && local.played > 0) return { ...local, kind: "local" };
  return null;
}

function dateParam(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function targetDateKey(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return localDateKey(d);
}

function renderTeamLeaderboard() {
  v13Status(); v13LiveStatus(); v14Render();
  const raw = getTeamHist(), q = document.getElementById("teamHistSearch").value.trim().toLowerCase();
  const minM = Number(document.getElementById("minMatchesFilter").value), all = Object.values(raw);
  const tot = all.reduce((s, x) => s + x.tot, 0), hits = all.reduce((s, x) => s + x.hit, 0), ouHits = all.reduce((s, x) => s + x.ou, 0);

  const exactMarkets = {}; const seenEvents = new Set();
  let uniqueM = 0, brierSum = 0, b1x2Sum = 0, b1x2Cnt = 0, bOuSum = 0, bOuCnt = 0;
  const byCat = { "1X2": { n: 0, h: 0 }, "DC": { n: 0, h: 0 }, "GOALS": { n: 0, h: 0 } };
  const bins = [
    { label: "50–60%", min: 0.50, max: 0.60, n: 0, h: 0, pSum: 0 },
    { label: "60–70%", min: 0.60, max: 0.70, n: 0, h: 0, pSum: 0 },
    { label: "70–80%", min: 0.70, max: 0.80, n: 0, h: 0, pSum: 0 },
    { label: "80%+", min: 0.80, max: 1.01, n: 0, h: 0, pSum: 0 }
  ];

  all.forEach(t => {
    (t.m || []).forEach(x => {
      if (x.h !== 1 || !Number.isFinite(x.pr)) return;
      if (x.eventId && seenEvents.has(x.eventId)) return;
      if (x.eventId) seenEvents.add(x.eventId);
      if (x.modelVersion === "13.0") Object.entries(x.markets || {}).forEach(([code,v]) => {
        if (!Number.isFinite(v.p) || ![0,1].includes(v.y)) return;
        const r = exactMarkets[code] ||= {n:0,p:0,y:0,b:0};
        r.n++; r.p+=v.p; r.y+=v.y; r.b+=(v.p-v.y)**2;
      });
      uniqueM++; brierSum += Math.pow(x.pr - x.ph, 2);
      if (Number.isFinite(x.b1x2)) { b1x2Sum += x.b1x2; b1x2Cnt++; }
      if (Number.isFinite(x.bOu)) { bOuSum += x.bOu; bOuCnt++; }
      if (byCat[x.cat]) { byCat[x.cat].n++; byCat[x.cat].h += x.ph; }
      const b = bins.find(bn => x.pr >= bn.min && x.pr < bn.max);
      if (b) { b.n++; b.h += x.ph; b.pSum += x.pr; }
    });
  });

  document.getElementById("hTotal").textContent = (uniqueM || Math.round(tot / 2)).toLocaleString("it-IT");
  document.getElementById("hWinRate").textContent = tot ? `${Math.round(hits / tot * 100)}%` : "-";
  document.getElementById("hBrier").textContent = uniqueM ? (brierSum / uniqueM).toFixed(3) : "-";
  document.getElementById("hOuRate").textContent = tot ? `${Math.round(ouHits / tot * 100)}%` : "-";

  const calBox = document.getElementById("calibSummary");
  if (uniqueM > 0) {
    calBox.classList.remove("hidden");
    const fmtCat = (label, obj) => obj.n ? `<span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">${label}: <strong class="text-white">${Math.round(obj.h / obj.n * 100)}%</strong> <span class="text-slate-500">(${obj.n.toLocaleString("it-IT")})</span></span>` : "";
    const marketBriers = (b1x2Cnt || bOuCnt)
      ? `<div class="flex flex-wrap gap-2 text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
          ${b1x2Cnt ? `<span title="3-esiti (casuale = 0.667, buono < 0.60)">Brier 1X2: <strong class="text-cyan-300">${(b1x2Sum / b1x2Cnt).toFixed(3)}</strong></span>` : ""}
          ${bOuCnt ? `<span title="Binario (casuale = 0.250, buono < 0.240)">Brier O/U 2.5: <strong class="text-fuchsia-300">${(bOuSum / bOuCnt).toFixed(3)}</strong></span>` : ""}
        </div>` : "";
    calBox.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-1.5">
        <span class="font-bold text-slate-300">🎯 Resa per Mercato:</span>
        <div class="flex flex-wrap gap-1.5">${fmtCat("1X2", byCat["1X2"])}${fmtCat("Doppia Chance", byCat["DC"])}${fmtCat("Gol/O-U", byCat["GOALS"])}</div>
      </div>
      <div class="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-800/80 text-center">
        ${bins.map(b => {
          const real = b.n ? Math.round((b.h / b.n) * 100) + "%" : "-";
          const exp = b.n ? Math.round((b.pSum / b.n) * 100) + "%" : "-";
          return `<div class="p-1.5 rounded-lg bg-slate-900/70"><div class="text-[9px] text-slate-400">Prev. ${b.label}</div><div class="font-bold text-emerald-400">${real} <span class="text-[9px] text-slate-500 font-normal">vs ${exp}</span></div></div>`;
        }).join("")}
      </div>${marketBriers}<div class="pt-2 border-t border-slate-800"><strong>Diagnostica V13 per mercato (backtest cronologico)</strong>${Object.entries(exactMarkets).map(([code,r])=>`<div>${esc(code)} • n=${r.n} • previsto ${(100*r.p/r.n).toFixed(1)}% • osservato ${(100*r.y/r.n).toFixed(1)}% • Brier ${(r.b/r.n).toFixed(3)}</div>`).join("") || " — rigenera lo storico"}</div>`;
  } else {
    calBox.classList.add("hidden");
  }

  const list = all.filter(t => t.tot >= minM && (!q || t.n.toLowerCase().includes(q)))
    .map(t => ({ ...t, rate: t.hit / t.tot })).sort((a, b) => b.rate - a.rate || b.tot - a.tot);

  const box = document.getElementById("teamLeaderboard");
  if (!all.length) {
    box.innerHTML = `<div class="glass rounded-2xl p-6 text-center text-xs text-slate-400">Premi <strong>"📥 1 Anno"</strong>, <strong>"📥 5 Anni"</strong> o <strong>"📥 10 Anni"</strong> per generare storico, rating ELO e calibrazione reale!</div>`;
    return;
  }
  if (!list.length) {
    box.innerHTML = `<div class="glass rounded-2xl p-6 text-center text-xs text-slate-400">Nessuna squadra trovata.</div>`;
    return;
  }

  box.innerHTML = list.slice(0, 250).map((t, idx) => {
    const pct = Math.round(t.rate * 100), ouPct = Math.round((t.ou / t.tot) * 100);
    const cls = pct >= 68 ? "border-emerald-500/35 text-emerald-400" : pct >= 52 ? "border-amber-500/35 text-amber-300" : "border-rose-500/35 text-rose-400";
    const barCls = pct >= 68 ? "bg-emerald-500" : pct >= 52 ? "bg-amber-400" : "bg-rose-500";
    return `<div data-tid="${esc(t.id)}" class="team-card glass rounded-2xl p-3 space-y-2 border ${cls.split(' ')[0]} cursor-pointer hover:bg-slate-800/50 transition-colors">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xs font-bold text-slate-500 w-7 shrink-0">#${idx + 1}</span>
          <div class="min-w-0">
            <div class="text-xs sm:text-sm font-bold text-white truncate">${esc(t.n)} <span class="text-[10px] font-normal text-cyan-300">ELO ${Math.round(t.elo || 1500)}</span></div>
            <div class="text-[10px] text-slate-400">${t.hit}/${t.tot} presi • O/U ${ouPct}%</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0"><span class="text-sm font-extrabold ${cls.split(' ')[1]}">${pct}%</span><span class="text-slate-500 text-xs">▸</span></div>
      </div>
      <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden"><div class="h-full ${barCls}" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");
}

function openTeamModal(tid) {
  const t = getTeamHist()[tid];
  if (!t) return;
  currentModalToken++;
  const pct = Math.round((t.hit / t.tot) * 100);
  document.getElementById("modalLeague").textContent = `Storico • ${t.hit}/${t.tot} presi (${pct}%) • ELO ${Math.round(t.elo || 1500)}`;
  document.getElementById("modalTitle").textContent = t.n;
  const byCompYear = {};
  t.m.slice().reverse().forEach(x => {
    const yr = (x.d || "").slice(0, 4);
    const key = `${yr} • ${x.f} ${x.c} (${x.k})`;
    if (!byCompYear[key]) byCompYear[key] = [];
    byCompYear[key].push(x);
  });
  document.getElementById("modalBody").innerHTML = Object.entries(byCompYear).map(([label, list], i) => {
    const cHits = list.filter(x => x.ph).length;
    return `<details ${i < 3 ? "open" : ""} class="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
      <summary class="px-3 py-2 bg-slate-900 border-b border-slate-800 flex justify-between items-center cursor-pointer list-none">
        <span class="text-xs font-bold text-white">${esc(label)}</span>
        <span class="text-[11px] font-semibold text-emerald-400">${cHits}/${list.length} (${Math.round(cHits / list.length * 100)}%) ▾</span>
      </summary>
      <div class="divide-y divide-slate-800/70">
        ${list.map(x => `<div class="px-3 py-2 flex items-center justify-between gap-2 text-xs">
          <div class="min-w-0"><div class="text-[10px] text-slate-500">${esc(x.d)}</div><div class="text-slate-200 font-medium truncate">${esc(x.t)}</div></div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="px-2 py-0.5 rounded bg-slate-800 font-bold text-white">${esc(x.s)}</span>
            <div class="text-right">
              <div class="text-[11px] font-bold ${x.ph ? 'text-emerald-400' : 'text-rose-400'}">${esc(x.p)} ${x.ph ? '✅' : '❌'}</div>
              <div class="text-[9px] text-slate-400">${esc(x.o)} ${x.oh ? '✅' : '❌'}</div>
            </div>
          </div>
        </div>`).join("")}
      </div>
    </details>`;
  }).join("");
  document.body.classList.add("overflow-hidden");
  const mod = document.getElementById("detailModal");
  mod.classList.remove("hidden"); mod.classList.add("flex");
}

function renderDiario() {
  const closed = BET_LOG.filter(b => b.status === "won" || b.status === "lost");
  const won = closed.filter(b => b.status === "won").length;
  const staked = closed.reduce((s, b) => s + b.stake, 0);
  const net = closed.reduce((s, b) => s + (b.status === "won" ? b.stake * (b.odd - 1) : -b.stake), 0);

  document.getElementById("dCount").textContent = `${closed.length}/${BET_LOG.length}`;
  document.getElementById("dWinRate").textContent = closed.length ? `${Math.round(won / closed.length * 100)}%` : "-";
  const netEl = document.getElementById("dNetProfit");
  netEl.textContent = `${net >= 0 ? "+" : ""}${net.toFixed(2)}u`;
  netEl.className = `text-sm font-extrabold ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`;
  document.getElementById("dRoi").textContent = staked > 0 ? `${((net / staked) * 100).toFixed(1)}%` : "-";

  const box = document.getElementById("betLogList");
  if (!BET_LOG.length) {
    box.innerHTML = `<div class="glass rounded-2xl p-6 text-center text-xs text-slate-400">Nessuna giocata registrata. Tocca una partita nel palinsesto, inserisci la quota e premi <strong>"💼 Registra"</strong>!</div>`;
    return;
  }

  box.innerHTML = BET_LOG.slice().reverse().map(b => {
    const netWon = b.stake * (b.odd - 1);
    const stBadge = b.status === "won"
      ? (netWon >= 0
          ? `<span class="text-emerald-400 font-bold">✅ VINTA (+${netWon.toFixed(2)}u)</span>`
          : `<span class="text-amber-300 font-bold">🟡 PARZIALE (${netWon.toFixed(2)}u)</span>`)
      : b.status === "lost" ? `<span class="text-rose-400 font-bold">❌ PERSA (-${b.stake.toFixed(2)}u)</span>`
      : b.status === "void" ? `<span class="text-slate-400 font-bold">↩️ RIMBORSATA</span>`
      : `<span class="text-amber-300 font-bold">⏳ IN ATTESA</span>`;
    return `<div class="glass rounded-2xl p-3 space-y-2 text-xs">
      <div class="flex justify-between items-start gap-2">
        <div class="min-w-0">
          <div class="text-[10px] text-slate-400">${esc(b.date)} • ${esc(b.league)}</div>
          <div class="font-bold text-white truncate">${esc(b.match)}</div>
          <div class="text-[11px] text-cyan-300 font-semibold">${esc(b.code)} @${b.odd.toFixed(2)} • Puntata: ${b.stake}u</div>
        </div>
        <div class="text-right shrink-0">${stBadge}</div>
      </div>
      <div class="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-800">
        <button data-bet-set="${esc(b.id)}:won" class="px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">✅ Vinta</button>
        <button data-bet-set="${esc(b.id)}:lost" class="px-2 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-bold">❌ Persa</button>
        <button data-bet-set="${esc(b.id)}:void" class="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">↩️ Rimb.</button>
        <button data-bet-del="${esc(b.id)}" class="ml-auto px-2 py-1 rounded bg-slate-800 text-rose-300 text-[10px]">🗑️</button>
      </div>
    </div>`;
  }).join("");
}