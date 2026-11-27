let LEAGUES = [];
const DAY_CACHE = {};
let lastDiag = "";
let currentLoadToken = 0;
let currentModalToken = 0;
const dayOffset = () => st.tab === "ieri" ? -1 : st.tab === "oggi" ? 0 : 1;

function recalcAllPredictions() {
  LEAGUES.forEach(l => l.matches.forEach(m => { m.prediction = calcPred(m); }));
}

function updateApiStatusBars(customOdds = null, customAf = null) {
  const oddsEl = document.getElementById("oddsStatusLine");
  const afEl = document.getElementById("afStatusLine");
  const keyBtn = document.getElementById("oddsKeyBtn");
  const hasOdds = Boolean(OddsProvider.getKey()), hasAf = Boolean(AFProvider.getKey());
  if (keyBtn) {
    keyBtn.textContent = (hasOdds && hasAf) ? "🔑 2/2" : (hasOdds || hasAf) ? "🔑 1/2" : "🔑 Keys";
  }

  if (oddsEl) {
    if (customOdds) {
      oddsEl.classList.remove("hidden"); oddsEl.textContent = customOdds;
    } else {
      const matched = LEAGUES.reduce((s, l) => s + l.matches.filter(m => m.odds).length, 0);
      const quota = OddsProvider.getQuota();
      if (matched > 0) {
        const qTxt = quota?.remaining != null ? ` • Crediti rimasti: ${quota.remaining}` : "";
        oddsEl.classList.remove("hidden");
        oddsEl.textContent = `💰 Quote reali attive su ${matched} partite${qTxt}`;
      } else {
        oddsEl.classList.add("hidden");
      }
    }
  }

  if (afEl) {
    if (customAf) {
      afEl.classList.remove("hidden"); afEl.textContent = customAf;
    } else {
      const matchedAf = LEAGUES.reduce((s, l) => s + l.matches.filter(m => m.af).length, 0);
      const quotaAf = AFProvider.getQuota();
      if (matchedAf > 0) {
        const qTxt = quotaAf?.remaining != null ? ` • Rimaste oggi: ${quotaAf.remaining}/${quotaAf.limit || 100} req` : "";
        afEl.classList.remove("hidden");
        afEl.textContent = `🔬 Formazioni/Infortuni API-Football su ${matchedAf} partite${qTxt}`;
      } else {
        afEl.classList.add("hidden");
      }
    }
  }
}

async function fetchOddsForCurrentDay(force = false) {
  const apiKey = OddsProvider.getKey();
  if (!apiKey) { openApiKeysModal(); return; }
  const btn = document.getElementById("oddsFetchBtn");
  btn.disabled = true;
  try {
    updateApiStatusBars("🔎 Controllo campionati attivi (0 crediti)...", null);
    const activeSports = await OddsProvider.fetchActiveSports(apiKey);
    const targetLeagues = LEAGUES.filter(l =>
      ODDS_SPORT_MAP[l.id] &&
      activeSports.has(ODDS_SPORT_MAP[l.id]) &&
      l.matches.some(m => m.stateType === "pre" || m.stateType === "in")
    );
    if (!targetLeagues.length) {
      updateApiStatusBars("Nessun campionato con partite aperte trovato per le quote.", null);
      return;
    }

    let done = 0, usedCache = 0, errMsg = "";
    for (const l of targetLeagues) {
      const sportKey = ODDS_SPORT_MAP[l.id];
      updateApiStatusBars(`💰 Scarico quote ${++done}/${targetLeagues.length} (${l.name})...`, null);
      try {
        const res = await OddsProvider.fetchLeagueOdds(sportKey, apiKey, force);
        if (res.fromCache) usedCache++;
      } catch (err) {
        errMsg = err?.status === 401 ? "API Key Quote non valida (401)"
          : err?.status === 429 ? "Limite richieste/crediti raggiunto (429)"
          : (err?.message || "Errore rete");
        if (err?.status === 401 || err?.status === 429) break;
      }
    }

    if (errMsg) { updateApiStatusBars(`❌ ${errMsg}`, null); return; }

    const matched = attachOddsToLeagues(LEAGUES);
    recalcAllPredictions(); syncSlipFromLeagues(); renderSchedule();
    const quota = OddsProvider.getQuota();
    const qTxt = quota?.remaining != null ? ` • Crediti rimasti: ${quota.remaining}` : "";
    const cacheTxt = usedCache ? ` (${usedCache} da cache)` : "";
    updateApiStatusBars(`✅ Quote abbinate su ${matched} partite${cacheTxt}${qTxt}`, null);
  } catch (err) {
    updateApiStatusBars(`❌ Errore quote: ${err?.status === 401 ? "API Key non valida" : (err?.message || "connessione fallita")}`, null);
  } finally {
    btn.disabled = false;
  }
}

async function fetchAFForTopVisible() {
  const apiKey = AFProvider.getKey();
  if (!apiKey) { openApiKeysModal(); return; }
  const btn = document.getElementById("afBatchBtn");
  btn.disabled = true;
  let partialErr = "";
  try {
    const q = st.search.trim().toLowerCase();
    const filtered = [];
    LEAGUES.forEach(l => l.matches.forEach(m => {
      if (m.stateType !== "pre" && m.stateType !== "in") return;
      if (m.prediction.confidence < st.minConf) return;
      if (st.market !== "all" && m.prediction.bestPick.cat !== st.market) return;
      if (st.onlyValue && !m.prediction.bestValue) return;
      if (q && !`${l.name} ${l.kind} ${m.home} ${m.away}`.toLowerCase().includes(q)) return;
      filtered.push(m);
    }));

    filtered.sort((a, b) => {
      if (st.sort === "ev") return (b.prediction.bestValue?.ev ?? -1) - (a.prediction.bestValue?.ev ?? -1);
      return b.prediction.rankScore - a.prediction.rankScore;
    });
    const topPool = filtered.slice(0, 20);
    if (!topPool.length) {
      updateApiStatusBars(null, "Nessun match PRE/LIVE visibile coi filtri attuali.");
      return;
    }

    const datesNeeded = [...new Set(topPool.map(m => localDateKey(new Date(m.startTs || Date.now()))))];
    const dateLists = {};
    for (const dIso of datesNeeded) {
      updateApiStatusBars(null, `🔬 Mappo calendario ${dIso}...`);
      const res = await AFProvider.getFixturesByDate(dIso, apiKey, false);
      dateLists[dIso] = res.list;
    }

    const isPaid = AFProvider.isPaidPlan();
    const maxPerClick = isPaid ? 20 : 4;
    const afMatchCache = AFProvider.loadMatchCache();
    const idsToFetch = [];

    for (const m of topPool) {
      const dIso = localDateKey(new Date(m.startTs || Date.now()));
      const fx = findAFFixtureForMatch(m, dateLists[dIso]);
      if (fx) {
        m.afId = fx.id;
        const hit = afMatchCache[String(fx.id)];
        const isFresh = hit && (Date.now() - hit.ts) < AF_MATCH_TTL && !(m.stateType === "in" && (Date.now() - hit.ts) >= 3 * 60 * 1000);
        if (!isFresh && !idsToFetch.includes(fx.id)) {
          idsToFetch.push(fx.id);
          if (idsToFetch.length >= maxPerClick) break;
        }
      }
    }

    if (idsToFetch.length) {
      updateApiStatusBars(null, `🔬 Scarico ${idsToFetch.length} match top (${isPaid ? "batch" : "singoli per piano Free"})...`);
      try {
        await AFProvider.fetchDetailsBatch(idsToFetch, apiKey);
      } catch (err) {
        partialErr = err?.message || "limite richieste/minuto";
      }
    }

    const attached = attachAFCacheToLeagues(LEAGUES);
    recalcAllPredictions(); syncSlipFromLeagues(); renderSchedule();
    const quotaAf = AFProvider.getQuota();
    const qTxt = quotaAf?.remaining != null ? ` • Rimaste oggi: ${quotaAf.remaining}/${quotaAf.limit || 100} req` : "";
    const msg = partialErr
      ? `⚠️ Scaricati parziali (${attached} match attivi • ${partialErr})${qTxt}`
      : `✅ Formazioni/Infortuni attivi su ${attached} match${!isPaid && idsToFetch.length === 4 ? " (riclicca tra 60s per altri 4)" : ""}${qTxt}`;
    updateApiStatusBars(null, msg);
  } catch (err) {
    updateApiStatusBars(null, `❌ API-Football: ${err?.message || "errore connessione"}`);
  } finally {
    btn.disabled = false;
  }
}

async function fetchAFForSingleMatch(m) {
  const apiKey = AFProvider.getKey();
  if (!apiKey) { openApiKeysModal(); return false; }
  const dateIso = localDateKey(new Date(m.startTs || Date.now()));
  const res = await AFProvider.getFixturesByDate(dateIso, apiKey, false);
  const fx = findAFFixtureForMatch(m, res.list);
  if (!fx) throw new Error("Match non trovato su API-Football per questa data.");
  m.afId = fx.id;
  await AFProvider.fetchDetailsBatch([fx.id], apiKey);
  attachAFCacheToLeagues(LEAGUES);
  recalcAllPredictions(); syncSlipFromLeagues(); renderSchedule(); updateApiStatusBars();
  return true;
}

async function fetchScoreboardDay(slug, dp, diag) {
  try {
    const events = await ESPNProvider.fetchScoreboard(slug, dp, null, 0);
    diag.ok++;
    return events;
  } catch (err) {
    if (err?.status) { diag.httpErr++; diag.lastStatus = err.status; }
    else { diag.netErr++; diag.lastErr = err?.message || "Errore rete/CORS"; }
    return [];
  }
}

async function loadDay(offset, force = false) {
  const token = ++currentLoadToken;
  const badge = document.getElementById("modeBadge"), sub = document.getElementById("subStatus");
  const dp = dateParam(offset), dpPrev = dateParam(offset - 1), tKey = targetDateKey(offset);
  const ttl = offset === 0 ? 55 * 1000 : 10 * 60 * 1000;
  const cached = DAY_CACHE[dp];

  if (!force && cached && (Date.now() - cached.ts) < ttl) {
    LEAGUES = cached.leagues;
    lastDiag = cached.diagMsg || "";
    attachOddsToLeagues(LEAGUES);
    attachAFCacheToLeagues(LEAGUES);
    recalcAllPredictions();
    const tot = LEAGUES.reduce((s, l) => s + l.matches.length, 0);
    badge.textContent = "LIVE REALE";
    badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    sub.textContent = `${tot} partite (${dp.slice(6,8)}/${dp.slice(4,6)}) • Cache veloce`;
    syncSlipFromLeagues();
    updateApiStatusBars();
    renderSchedule();
    return;
  }

  badge.textContent = "CARICO...";
  badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
  const diag = { ok: 0, httpErr: 0, netErr: 0, lastStatus: 0, lastErr: "" };

  try {
    let doneBoards = 0;
    sub.textContent = `Scarico tornei 0/${COMPS.length}...`;
    const boards = await mapWithConcurrency(COMPS, 8, async ([slug, name, kind, flag]) => {
      let events = await fetchScoreboardDay(slug, dp, diag);
      if (AM_LEAGUES.has(slug)) {
        const prevEv = await fetchScoreboardDay(slug, dpPrev, diag);
        const evMap = new Map();
        prevEv.forEach(ev => { ev._espnDp = dpPrev; evMap.set(ev.id, ev); });
        events.forEach(ev => { ev._espnDp = dp; evMap.set(ev.id, ev); });
        events = Array.from(evMap.values()).filter(ev => localDateKey(new Date(ev.date)) === tKey);
      }
      doneBoards++;
      if (token === currentLoadToken) sub.textContent = `Scarico tornei ${doneBoards}/${COMPS.length}...`;
      return events.length ? { slug, name, kind, flag, events } : null;
    });

    if (token !== currentLoadToken) return;
    if (diag.ok === 0) {
      if (diag.httpErr > 0) throw new Error(`ESPN HTTP ${diag.lastStatus} su tutte le chiamate`);
      throw new Error(diag.lastErr || "Connessione/CORS non riuscita");
    }

    const active = boards.filter(Boolean);
    const hasClubCup = active.some(b => b.kind === "Coppa");
    const slugsToFetch = active.filter(b => b.slug !== "fifa.friendly").map(b => [b.slug, b.name]);
    if (hasClubCup) {
      COMPS.filter(([, , kind]) => kind === "Campionato").forEach(([slug, name]) => {
        if (!slugsToFetch.some(([s]) => s === slug)) slugsToFetch.push([slug, name]);
      });
    }
    if (slugsToFetch.length) sub.textContent = `Scarico classifiche (${slugsToFetch.length})...`;
    await mapWithConcurrency(slugsToFetch, 8, ([slug, name]) => fetchStandings(slug, name));
    if (token !== currentLoadToken) return;
    persistStandingsCache();

    LEAGUES = active.map(b => {
      const isLeague = b.kind === "Campionato", stdEntry = standingsCache[b.slug] || {}, tbl = stdEntry.map || {};
      const leagueAvgH = isLeague ? safeNum(stdEntry.avgH, 1.48) : 1.48;
      const leagueAvgA = isLeague ? safeNum(stdEntry.avgA, 1.18) : 1.18;

      const matches = b.events.map(ev => {
        const comp = ev.competitions?.[0] || {};
        const isNeutral = Boolean(comp.neutralSite);
        const home = (comp.competitors || []).find(c => c.homeAway === "home") || {};
        const away = (comp.competitors || []).find(c => c.homeAway === "away") || {};
        const hs = resolveTeamStats(home.team?.id, tbl, b.kind);
        const as = resolveTeamStats(away.team?.id, tbl, b.kind);
        const ok = Boolean(hs && as && hs.played >= 3 && as.played >= 3);
        const hf = parseForm(home.form), af = parseForm(away.form);
        const dt = new Date(ev.date), startTs = dt.getTime();
        const timeStr = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;

        const statusObj = ev.status?.type || {}, statusName = statusObj.name || "";
        const shortDet = (statusObj.shortDetail || "").toUpperCase();
        const isExtra = EXTRA_RE.test(shortDet) || Number(ev.status?.period) > 2;
        const isCanceled = statusName === "STATUS_POSTPONED" || statusName === "STATUS_CANCELED"
          || statusName === "STATUS_ABANDONED" || statusName === "STATUS_SUSPENDED"
          || (statusObj.state === "post" && statusObj.completed === false);
        const stateType = isCanceled ? "canceled" : (statusObj.state || "pre");
        const hasScore = home.score !== undefined && home.score !== "" && away.score !== undefined && away.score !== ""
          && Number.isFinite(Number(home.score)) && Number.isFinite(Number(away.score));
        const hScore = hasScore ? Number(home.score) : 0, aScore = hasScore ? Number(away.score) : 0;

        let statusTxt = "PRE";
        if (stateType === "in") statusTxt = ev.status?.displayClock || "LIVE";
        else if (stateType === "post") statusTxt = isExtra ? (/\b(PEN|PENS|PSO|FT-PENS)\b/.test(shortDet) ? "RIG" : "SUPPL") : "FIN";
        else if (stateType === "canceled") statusTxt = statusName === "STATUS_CANCELED" ? "CANC" : (statusName === "STATUS_SUSPENDED" || statusName === "STATUS_ABANDONED" ? "SOSP" : "RINV");

        const effAvgH = isNeutral ? Number(((leagueAvgH + leagueAvgA) / 2).toFixed(3)) : leagueAvgH;
        const effAvgA = isNeutral ? effAvgH : leagueAvgA;

        const domStdH = hs?.domSlug ? standingsCache[hs.domSlug] : null;
        const domAvgH = isNeutral ? Number((((domStdH?.avgH ?? leagueAvgH) + (domStdH?.avgA ?? leagueAvgA)) / 2).toFixed(3)) : safeNum(domStdH?.avgH, leagueAvgH);
        const domAvgHA = isNeutral ? domAvgH : safeNum(domStdH?.avgA, leagueAvgA);

        const domStdA = as?.domSlug ? standingsCache[as.domSlug] : null;
        const domAvgAH = isNeutral ? Number((((domStdA?.avgH ?? leagueAvgH) + (domStdA?.avgA ?? leagueAvgA)) / 2).toFixed(3)) : safeNum(domStdA?.avgH, leagueAvgH);
        const domAvgAA = isNeutral ? domAvgAH : safeNum(domStdA?.avgA, leagueAvgA);

        const gpH = hs ? hs.played : 0, gpA = as ? as.played : 0;
        const hEffGp = !hs ? 0 : (isNeutral ? gpH : (hs.hGp ?? Math.max(1, Math.round(gpH / 2))));
        const aEffGp = !as ? 0 : (isNeutral ? gpA : (as.aGp ?? Math.max(1, Math.round(gpA / 2))));

        const rawHGF = hs ? ((isNeutral ? hs.gfAvg : (hs.hGfAvg ?? hs.gfAvg * 1.08)) / domAvgH) * effAvgH : effAvgH;
        const rawHGA = hs ? ((isNeutral ? hs.gaAvg : (hs.hGaAvg ?? hs.gaAvg * 0.92)) / domAvgHA) * effAvgA : effAvgA;
        const rawAGF = as ? ((isNeutral ? as.gfAvg : (as.aGfAvg ?? as.gfAvg * 0.92)) / domAvgAA) * effAvgA : effAvgA;
        const rawAGA = as ? ((isNeutral ? as.gaAvg : (as.aGaAvg ?? as.gaAvg * 1.08)) / domAvgAH) * effAvgH : effAvgH;

        const hGF = shrink(clamp(rawHGF, 0.35, 3.8), hEffGp, effAvgH, 5);
        const hGA = shrink(clamp(rawHGA, 0.30, 3.8), hEffGp, effAvgA, 5);
        const aGF = shrink(clamp(rawAGF, 0.30, 3.8), aEffGp, effAvgA, 5);
        const aGA = shrink(clamp(rawAGA, 0.35, 3.8), aEffGp, effAvgH, 5);

        const hId = home.team?.id, aId = away.team?.id;
        const domSlugH = hs?.domSlug || b.slug;
        const domSlugA = as?.domSlug || b.slug;
        const tierH = (LEAGUE_TIER[domSlugH]?.s) ?? 0.88;
        const tierA = (LEAGUE_TIER[domSlugA]?.s) ?? 0.88;
        const baseVol = b.slug === "fifa.friendly" ? 0.42 : (b.kind === "Nazionali" ? (ok ? 0.28 : 0.38) : (b.kind === "Coppa" ? (ok ? 0.25 : 0.37) : (ok ? 0.20 : 0.34)));

        return {
          id: ev.id, dp, espnDp: ev._espnDp || dp, slug: b.slug, leagueId: b.slug, leagueName: b.name, kind: b.kind, flag: b.flag,
          time: timeStr, startTs, stateType, isExtra, hasScore, hScore, aScore, neutralSite: isNeutral,
          scoreStr: ((stateType === "in" || stateType === "post") && hasScore) ? `${hScore} - ${aScore}` : "- : -",
          statusTxt, homeId: hId, awayId: aId,
          home: home.team?.displayName || "Casa", away: away.team?.displayName || "Ospite",
          homeLogo: home.team?.logo || "", awayLogo: away.team?.logo || "", lowData: !ok,
          formH: hf.pills, formA: af.pills,
          statSourceH: hs ? `${hs.source} (${hs.played}g)` : "Default",
          statSourceA: as ? `${as.source} (${as.played}g)` : "Default",
          stats: {
            avgH: effAvgH, avgA: effAvgA,
            hGF: Number(safeNum(hGF, effAvgH).toFixed(2)), hGA: Number(safeNum(hGA, effAvgA).toFixed(2)),
            aGF: Number(safeNum(aGF, effAvgA).toFixed(2)), aGA: Number(safeNum(aGA, effAvgH).toFixed(2)),
            hFF: hf.factor, aFF: af.factor, hL: 1.0, aL: 1.0,
            isCrossLeague: b.kind !== "Campionato", domSlugH, domSlugA, tierH, tierA,
            comp: ok ? 0.92 : (home.form && away.form ? 0.72 : 0.54), vol: baseVol
          }
        };
      });
      return { id: b.slug, name: b.name, kind: b.kind, flag: b.flag, matches };
    });

    attachOddsToLeagues(LEAGUES);
    attachAFCacheToLeagues(LEAGUES);
    recalcAllPredictions();

    const tot = LEAGUES.reduce((s, l) => s + l.matches.length, 0);
    lastDiag = tot === 0
      ? `API OK su ${diag.ok}/${COMPS.length} tornei${diag.httpErr ? ` (HTTP ${diag.lastStatus} su ${diag.httpErr})` : ""}${diag.netErr ? ` (${diag.netErr} errori rete)` : ""} — nessuna gara trovata`
      : "";
    if (tot > 0 || (diag.httpErr === 0 && diag.netErr === 0)) {
      DAY_CACHE[dp] = { ts: Date.now(), leagues: LEAGUES, diagMsg: lastDiag };
    }
    const nowStr = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    badge.textContent = "LIVE REALE";
    badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    sub.textContent = `${tot} partite (${dp.slice(6,8)}/${dp.slice(4,6)}) • Agg. ${nowStr}`;
    syncSlipFromLeagues();
    updateApiStatusBars();
    renderSchedule();
  } catch (err) {
    console.error("Errore loadDay:", err);
    if (token !== currentLoadToken) return;
    LEAGUES = [];
    lastDiag = `Impossibile contattare site.api.espn.com (${err?.message || "connessione assente o blocco proxy/CORS"}).`;
    badge.textContent = "OFFLINE";
    badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30";
    sub.textContent = "Controlla la connessione/rete e premi ↻";
    renderSchedule();
  }
}

let isScanning = false;
let scanAborted = false;

function setScanBusy(busy) {
  isScanning = busy;
  ["btnScan1", "btnScan5", "btnScan10", "btnResetHist", "btnExportHist"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  });
  const stopBtn = document.getElementById("btnStopScan");
  if (stopBtn) stopBtn.classList.toggle("hidden", !busy);
}

window.stopScan = () => {
  if (!isScanning) return;
  scanAborted = true;
  document.getElementById("histScanStatus").textContent = "⏹️ Interruzione richiesta, completo il mese corrente...";
};

function parseMonthEvents(events, slug, compName, kind, flag, targetMap) {
  events.forEach(ev => {
    if (targetMap.has(ev.id)) return;
    const stType = ev.status?.type, isExtra = EXTRA_RE.test((stType?.shortDetail || "").toUpperCase()) || Number(ev.status?.period) > 2;
    const comp = ev.competitions?.[0] || {};
    const home = (comp.competitors || []).find(c => c.homeAway === "home");
    const away = (comp.competitors || []).find(c => c.homeAway === "away");
    const hasScore = home?.score !== undefined && home?.score !== "" && away?.score !== undefined && away?.score !== "";
    if (stType?.state === "post" && stType?.completed !== false && !isExtra && hasScore && home?.team?.id && away?.team?.id) {
      const ts = new Date(ev.date).getTime();
      if (Number.isFinite(ts)) {
        targetMap.set(ev.id, {
          id: ev.id, ts, date: ev.date, slug, compName, kind, flag,
          hId: home.team.id, hName: home.team.displayName || "Casa", hScore: Number(home.score),
          aId: away.team.id, aName: away.team.displayName || "Ospite", aScore: Number(away.score)
        });
      }
    }
  });
}

function buildMonths(startD, endD) {
  const months = [];
  const cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
  const last = new Date(endD.getFullYear(), endD.getMonth(), 1);
  while (cur <= last) {
    const y = cur.getFullYear(), m = cur.getMonth() + 1;
    months.push({ y, m, ym: `${y}${String(m).padStart(2, "0")}` });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

window.scanSeason = async totalDays => {
  if (isScanning) return;
  scanAborted = false;
  setScanBusy(true);
  const wrapEl = document.getElementById("histScanWrap"), stEl = document.getElementById("histScanStatus");
  const pWrap = document.getElementById("histProgressWrap"), pBar = document.getElementById("histProgressBar");
  wrapEl.classList.remove("hidden"); pWrap.classList.remove("hidden"); pBar.style.width = "2%";

  try {
    const nowD = new Date();
    stEl.textContent = "🔎 Verifico connessione verso ESPN API...";
    try {
      const probeDt = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
      const probeYm = `${probeDt.getFullYear()}${String(probeDt.getMonth() + 1).padStart(2, "0")}`;
      await ESPNProvider.fetchScoreboard("eng.1", probeYm, 100, 0);
    } catch (probeErr) {
      const msg = probeErr?.status ? `HTTP ${probeErr.status}` : (probeErr?.message || "blocco rete/proxy/CORS");
      stEl.textContent = `❌ Impossibile scaricare da ESPN (${msg}). Riprova tra qualche minuto.`;
      return;
    }

    const currentYm = `${nowD.getFullYear()}${String(nowD.getMonth() + 1).padStart(2, "0")}`;
    const endD = new Date(); endD.setDate(endD.getDate() - 1); endD.setHours(23, 59, 59, 999);
    const startD = new Date(); startD.setDate(startD.getDate() - totalDays); startD.setHours(0, 0, 0, 0);
    const minTs = startD.getTime(), maxTs = endD.getTime();
    const months = buildMonths(startD, endD);

    const evMap = new Map();
    let reqOk = 0, reqErr = 0, lastErrStr = "";

    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      if (scanAborted) break;
      const { y, m, ym } = months[mIdx];
      const mEndDay = new Date(y, m, 0);
      const isClosedM = ym < currentYm && (nowD.getTime() - mEndDay.getTime()) > 3 * 86400000;

      let mRecords = null;
      if (isClosedM) {
        try { mRecords = await idbGet(MONTH_PREFIX + ym); } catch {}
      }

      if (Array.isArray(mRecords)) {
        stEl.textContent = `Cache mese ${mIdx + 1}/${months.length} (${ym.slice(4)}/${ym.slice(0, 4)}) • ${evMap.size.toLocaleString("it-IT")} match...`;
      } else {
        stEl.textContent = `Scarico mese ${mIdx + 1}/${months.length} (${ym.slice(4)}/${ym.slice(0, 4)}) • ${evMap.size.toLocaleString("it-IT")} match...`;
        const mDedup = new Map();
        let mFatalErr = 0;
        await mapWithConcurrency(COMPS, 6, async ([slug, compName, kind, flag]) => {
          if (scanAborted) return;
          try {
            const events = await ESPNProvider.fetchScoreboard(slug, ym, 300, 1);
            reqOk++;
            parseMonthEvents(events, slug, compName, kind, flag, mDedup);
          } catch (err) {
            reqErr++;
            lastErrStr = err?.status ? `HTTP ${err.status}` : (err?.message || "errore rete");
            if (!err?.status || err.status === 429 || err.status >= 500) mFatalErr++;
          }
        });
        mRecords = Array.from(mDedup.values());
        if (isClosedM && !scanAborted && mRecords.length > 0 && mFatalErr === 0) {
          try { await idbSet(MONTH_PREFIX + ym, mRecords); } catch {}
        }
        await sleep(30);
      }

      mRecords.forEach(rec => {
        if (rec.ts >= minTs && rec.ts <= maxTs && !evMap.has(rec.id)) evMap.set(rec.id, rec);
      });
      pBar.style.width = `${Math.round(((mIdx + 1) / (months.length + 1)) * 100)}%`;
    }

    if (evMap.size === 0) {
      stEl.textContent = scanAborted
        ? "⏹️ Scansione annullata (nessun dato salvato)."
        : `⚠️ 0 match trovati (richieste OK: ${reqOk}, errori: ${reqErr}${lastErrStr ? ` • ${lastErrStr}` : ""}). Storico precedente mantenuto.`;
      return;
    }

    const allEvents = Array.from(evMap.values()).sort((a, b) => a.ts - b.ts);
    stEl.textContent = `Analizzo ${allEvents.length.toLocaleString("it-IT")} match + calcolo rating ELO storico...`;
    await sleep(20);

    const rolling = {}, leagueRoll = {}, eloMap = {}, teams = {};
    const initRoll = () => ({ played: 0, gf: 0, ga: 0, hP: 0, hGf: 0, hGa: 0, aP: 0, aGf: 0, aGa: 0, pts: [], res: [], lastTs: 0 });
    const getRoll = id => rolling[id] || initRoll();
    const getElo = (id, slug) => eloMap[id] ?? (LEAGUE_TIER[slug]?.elo ?? 1470);
    const formFactor = arr => !arr.length ? 1.0 : 0.88 + (arr.slice(-5).reduce((a, b) => a + b, 0) / (Math.min(5, arr.length) * 3)) * 0.24;
    const calcRollAdj = r => {
      if (!r.res || r.res.length < 5) return { attFactor: 1.0, defFactor: 1.0 };
      const sl = r.res.slice(-15);
      let rGf = 0, rGa = 0, rEgf = 0, rEga = 0;
      sl.forEach(x => { rGf += x.gf; rGa += x.ga; rEgf += x.egf; rEga += x.ega; });
      return {
        attFactor: clamp((rGf + 4.0) / Math.max(1.0, rEgf + 4.0), 0.90, 1.10),
        defFactor: clamp((rGa + 4.0) / Math.max(1.0, rEga + 4.0), 0.90, 1.10)
      };
    };
    const decayRoll = r => ({
      played: r.played * 0.35, gf: r.gf * 0.35, ga: r.ga * 0.35,
      hP: r.hP * 0.35, hGf: r.hGf * 0.35, hGa: r.hGa * 0.35,
      aP: r.aP * 0.35, aGf: r.aGf * 0.35, aGa: r.aGa * 0.35,
      pts: r.pts.slice(-2), res: [], lastTs: r.lastTs
    });

    allEvents.forEach(rec => {
      const { hId, aId, hName, aName, hScore, aScore, ts: evTs, date, slug, compName, kind, flag } = rec;
      if (!Number.isFinite(hScore) || !Number.isFinite(aScore)) return;

      const lr = leagueRoll[slug] || { m: 0, hGf: 0, aGf: 0 };
      const avgH = Number(clamp((lr.hGf + 1.48 * 10) / (lr.m + 10), 0.90, 2.30).toFixed(3));
      const avgA = Number(clamp((lr.aGf + 1.18 * 10) / (lr.m + 10), 0.70, 2.00).toFixed(3));

      let hr = getRoll(hId), ar = getRoll(aId);
      const tierBase = LEAGUE_TIER[slug]?.elo ?? 1470;
      if (hr.lastTs && (evTs - hr.lastTs) > 3888000000) {
        hr = decayRoll(hr);
        if (eloMap[hId] !== undefined) eloMap[hId] = eloMap[hId] * 0.78 + tierBase * 0.22;
      }
      if (ar.lastTs && (evTs - ar.lastTs) > 3888000000) {
        ar = decayRoll(ar);
        if (eloMap[aId] !== undefined) eloMap[aId] = eloMap[aId] * 0.78 + tierBase * 0.22;
      }

      const eloH = getElo(hId, slug), eloA = getElo(aId, slug);
      let resH = hr.res, resA = ar.res;

      if (hr.played >= 2 && ar.played >= 2) {
        const rawHGF = hr.hP >= 3 ? (hr.hGf / hr.hP) : (hr.gf / hr.played) * 1.08;
        const rawHGA = hr.hP >= 3 ? (hr.hGa / hr.hP) : (hr.ga / hr.played) * 0.92;
        const rawAGF = ar.aP >= 3 ? (ar.aGf / ar.aP) : (ar.gf / ar.played) * 0.92;
        const rawAGA = ar.aP >= 3 ? (ar.aGa / ar.aP) : (ar.ga / ar.played) * 1.08;

        const fake = {
          home: hName, away: aName, slug,
          stats: {
            avgH, avgA,
            hGF: shrink(rawHGF, hr.hP >= 3 ? hr.hP : hr.played, avgH, 5),
            hGA: shrink(rawHGA, hr.hP >= 3 ? hr.hP : hr.played, avgA, 5),
            aGF: shrink(rawAGF, ar.aP >= 3 ? ar.aP : ar.played, avgA, 5),
            aGA: shrink(rawAGA, ar.aP >= 3 ? ar.aP : ar.played, avgH, 5),
            hFF: formFactor(hr.pts), aFF: formFactor(ar.pts), hL: 1.0, aL: 1.0,
            adjH: calcRollAdj(hr), adjA: calcRollAdj(ar),
            isCrossLeague: kind !== "Campionato", eloH, eloA,
            comp: hr.played >= 5 && ar.played >= 5 ? 0.91 : 0.74, vol: 0.22
          }
        };
        const pred = calcPred(fake, {}, true);
        const lH = Number(pred.lamH), lA = Number(pred.lamA);
        resH = [...hr.res.slice(-14), { gf: hScore, ga: aScore, egf: lH, ega: lA }];
        resA = [...ar.res.slice(-14), { gf: aScore, ga: hScore, egf: lA, ega: lH }];

        const ph = isHit(pred.bestPick.code, hScore, aScore) ? 1 : 0;
        const oh = isHit(pred.ouPick.code, hScore, aScore) ? 1 : 0;
        const pr = Number(pred.bestPick.prob.toFixed(3)), cat = pred.bestPick.cat;
        const b1x2 = Number((
          Math.pow(pred.probs.p1 - (hScore > aScore ? 1 : 0), 2) +
          Math.pow(pred.probs.px - (hScore === aScore ? 1 : 0), 2) +
          Math.pow(pred.probs.p2 - (hScore < aScore ? 1 : 0), 2)
        ).toFixed(4));
        const bOu = Number(Math.pow(pred.probs.pO - ((hScore + aScore) >= 3 ? 1 : 0), 2).toFixed(4));

        const pushRec = (tid, tName, oppId, opp, isHome) => {
          if (!teams[tid]) teams[tid] = { id: tid, n: tName, elo: 1500, tot: 0, hit: 0, ou: 0, tTot: 0, tHit: 0, eg: 0, rg: 0, gf: 0, ga: 0, egf: 0, ega: 0, m: [] };
          const t = teams[tid];
          t.n = tName;
          const myGf = isHome ? hScore : aScore, myGa = isHome ? aScore : hScore;
          const myEgf = isHome ? lH : lA, myEga = isHome ? lA : lH;
          t.tot++; t.hit += ph; t.ou += oh;
          if (pred.confidence >= 75) { t.tTot++; t.tHit += ph; }
          t.eg += lH + lA; t.rg += hScore + aScore;
          t.gf += myGf; t.ga += myGa; t.egf += myEgf; t.ega += myEga;
          t.m.push({
            d: date.slice(0, 10), c: compName, k: kind, f: flag, oid: oppId, h: isHome ? 1 : 0,
            t: isHome ? `${tName} - ${opp}` : `${opp} - ${tName}`, s: `${hScore}-${aScore}`,
            p: pred.bestPick.code, cat, pr, ph, o: pred.ouPick.code, oh,
            b1x2, bOu, gf: myGf, ga: myGa, egf: myEgf, ega: myEga
          });
        };
        pushRec(hId, hName, aId, aName, true);
        pushRec(aId, aName, hId, hName, false);
      }

      const expH = 1 / (1 + Math.pow(10, (eloA - (eloH + 55)) / 400));
      const actH = hScore > aScore ? 1 : hScore === aScore ? 0.5 : 0;
      const kElo = (kind === "Coppa" ? 26 : 20) * Math.max(1, Math.log(Math.abs(hScore - aScore) + 1) * 1.15);
      eloMap[hId] = eloH + kElo * (actH - expH);
      eloMap[aId] = eloA + kElo * ((1 - actH) - (1 - expH));

      leagueRoll[slug] = { m: lr.m + 1, hGf: lr.hGf + hScore, aGf: lr.aGf + aScore };
      const hp = hScore > aScore ? 3 : hScore === aScore ? 1 : 0;
      const ap = aScore > hScore ? 3 : aScore === hScore ? 1 : 0;
      rolling[hId] = { ...hr, played: hr.played + 1, gf: hr.gf + hScore, ga: hr.ga + aScore, hP: hr.hP + 1, hGf: hr.hGf + hScore, hGa: hr.hGa + aScore, pts: [...hr.pts, hp], res: resH, lastTs: evTs };
      rolling[aId] = { ...ar, played: ar.played + 1, gf: ar.gf + aScore, ga: ar.ga + hScore, aP: ar.aP + 1, aGf: ar.aGf + aScore, aGa: ar.aGa + hScore, pts: [...ar.pts, ap], res: resA, lastTs: evTs };
    });

    Object.keys(teams).forEach(tid => { teams[tid].elo = Math.round(eloMap[tid] ?? 1500); });
    await saveTeamHist(teams);
    pBar.style.width = "100%";
    stEl.textContent = `${scanAborted ? "⏹️ Parziale:" : "✅ Salvati"} ${allEvents.length.toLocaleString("it-IT")} match + ELO su ${Object.keys(teams).length} squadre!`;
    recalcAllPredictions();
    renderTeamLeaderboard();
    renderSchedule();
  } catch (err) {
    console.error("Errore scanSeason:", err);
    stEl.textContent = "⚠️ Errore durante lo scaricamento. Riprova.";
  } finally {
    setScanBusy(false);
    setTimeout(() => pWrap.classList.add("hidden"), 1200);
  }
};

window.resetHistory = async () => {
  if (isScanning) return;
  await clearTeamHist();
  document.getElementById("histScanWrap").classList.add("hidden");
  recalcAllPredictions(); renderTeamLeaderboard(); renderSchedule();
};

window.exportHistory = () => {
  const data = getTeamHist();
  if (!Object.keys(data).length) return alert("Nessuno storico da esportare.");
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `footpredict-storico-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  URL.revokeObjectURL(url);
};
