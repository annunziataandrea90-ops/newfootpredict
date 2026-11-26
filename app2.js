let LEAGUES = [];
const DAY_CACHE = {};
let lastDiag = "";
let currentLoadToken = 0;
let currentModalToken = 0;
const dayOffset = () => st.tab === "ieri" ? -1 : st.tab === "oggi" ? 0 : 1;

function recalcAllPredictions() {
  LEAGUES.forEach(l => l.matches.forEach(m => { m.prediction = calcPred(m); }));
}

async function fetchScoreboardDay(slug, dp, diag) {
  try {
    const events = await ESPNProvider.fetchScoreboard(slug, dp, null, 0);
    diag.ok++;
    return events;
  } catch (err) {
    if (err?.status) { diag.httpErr++; diag.lastStatus = err.status; }
    else { diag.netErr++; }
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
    lastDiag = "";
    recalcAllPredictions();
    const tot = LEAGUES.reduce((s, l) => s + l.matches.length, 0);
    badge.textContent = "LIVE REALE";
    badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    sub.textContent = `${tot} partite (${dp.slice(6,8)}/${dp.slice(4,6)}) • Cache veloce`;
    syncSlipFromLeagues();
    renderSchedule();
    return;
  }

  badge.textContent = "CARICO...";
  badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
  const diag = { ok: 0, httpErr: 0, netErr: 0, lastStatus: 0 };

  try {
    let doneBoards = 0;
    sub.textContent = `Scarico tornei 0/${COMPS.length}...`;
    const boards = await mapWithConcurrency(COMPS, 10, async ([slug, name, kind, flag]) => {
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
    if (diag.ok === 0 && diag.netErr > 0) throw new Error("Connessione/CORS non riuscita");

    const active = boards.filter(Boolean);
    const hasClubCup = active.some(b => b.kind === "Coppa");
    const slugsToFetch = active.filter(b => b.slug !== "fifa.friendly").map(b => [b.slug, b.name]);
    if (hasClubCup) {
      COMPS.filter(([, , kind]) => kind === "Campionato").forEach(([slug, name]) => {
        if (!slugsToFetch.some(([s]) => s === slug)) slugsToFetch.push([slug, name]);
      });
    }
    if (slugsToFetch.length) sub.textContent = `Scarico classifiche (${slugsToFetch.length})...`;
    await mapWithConcurrency(slugsToFetch, 10, ([slug, name]) => fetchStandings(slug, name));
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

        const m = {
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
        m.prediction = calcPred(m);
        return m;
      });
      return { id: b.slug, name: b.name, kind: b.kind, flag: b.flag, matches };
    });

    const tot = LEAGUES.reduce((s, l) => s + l.matches.length, 0);
    if (tot > 0 || diag.httpErr === 0) DAY_CACHE[dp] = { ts: Date.now(), leagues: LEAGUES };
    lastDiag = tot === 0
      ? `API OK su ${diag.ok}/${COMPS.length} tornei${diag.httpErr ? ` (HTTP ${diag.lastStatus} su ${diag.httpErr})` : " — nessuna gara in calendario per questa data"}`
      : "";
    const nowStr = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    badge.textContent = "LIVE REALE";
    badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    sub.textContent = `${tot} partite (${dp.slice(6,8)}/${dp.slice(4,6)}) • Agg. ${nowStr}`;
    syncSlipFromLeagues();
    renderSchedule();
  } catch (err) {
    console.error("Errore loadDay:", err);
    if (token !== currentLoadToken) return;
    LEAGUES = [];
    lastDiag = `Impossibile contattare site.api.espn.com (${err?.message || "connessione assente o blocco CORS/rete"}).`;
    badge.textContent = "OFFLINE";
    badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30";
    sub.textContent = "Controlla la connessione e premi ↻";
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
  document.getElementById("histScanStatus").textContent = "⏹️ Interruzione richiesta, completo il blocco corrente...";
};

function parseQuarterEvents(events, slug, compName, kind, flag, targetMap) {
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

function buildQuarters(startD, endD) {
  const quarters = [];
  const startY = startD.getFullYear(), startQ = Math.floor(startD.getMonth() / 3);
  const endY = endD.getFullYear(), endQ = Math.floor(endD.getMonth() / 3);
  let y = startY, q = startQ;
  while (y < endY || (y === endY && q <= endQ)) {
    const mStart = q * 3 + 1;
    const mEnd = mStart + 2;
    const lastDay = String(new Date(y, mEnd, 0).getDate()).padStart(2, "0");
    const qKey = `${y}Q${q + 1}`;
    const range = `${y}${String(mStart).padStart(2, "0")}01-${y}${String(mEnd).padStart(2, "0")}${lastDay}`;
    quarters.push({ y, q, mStart, mEnd, qKey, range });
    q++;
    if (q > 3) { q = 0; y++; }
  }
  return quarters;
}

window.scanSeason = async totalDays => {
  if (isScanning) return;
  scanAborted = false;
  setScanBusy(true);
  const wrapEl = document.getElementById("histScanWrap"), stEl = document.getElementById("histScanStatus");
  const pWrap = document.getElementById("histProgressWrap"), pBar = document.getElementById("histProgressBar");
  wrapEl.classList.remove("hidden"); pWrap.classList.remove("hidden"); pBar.style.width = "2%";

  try {
    const nowD = new Date(), currentQKey = `${nowD.getFullYear()}Q${Math.floor(nowD.getMonth() / 3) + 1}`;
    const endD = new Date(); endD.setDate(endD.getDate() - 1); endD.setHours(23, 59, 59, 999);
    const startD = new Date(); startD.setDate(startD.getDate() - totalDays); startD.setHours(0, 0, 0, 0);
    const minTs = startD.getTime(), maxTs = endD.getTime();
    const quarters = buildQuarters(startD, endD);

    const evMap = new Map();
    for (let qIdx = 0; qIdx < quarters.length; qIdx++) {
      if (scanAborted) break;
      const { y, mStart, mEnd, qKey, range } = quarters[qIdx];
      const qEndDay = new Date(y, mEnd, 0);
      const isClosedQ = qKey < currentQKey && (nowD.getTime() - qEndDay.getTime()) > 3 * 86400000;

      let qRecords = null;
      if (isClosedQ) {
        try { qRecords = await idbGet(Q_PREFIX + qKey); } catch {}
      }

      if (Array.isArray(qRecords)) {
        stEl.textContent = `Cache trimestre ${qIdx + 1}/${quarters.length} (${qKey}) • ${evMap.size} match...`;
      } else {
        stEl.textContent = `Scarico trimestre ${qIdx + 1}/${quarters.length} (${qKey}) • ${evMap.size} match...`;
        const qDedup = new Map();
        await mapWithConcurrency(COMPS, 6, async ([slug, compName, kind, flag]) => {
          if (scanAborted) return;
          try {
            const events = await ESPNProvider.fetchScoreboard(slug, range, 1000, 1);
            if (events.length >= 950) {
              for (let m = mStart; m <= mEnd; m++) {
                if (scanAborted) break;
                const lastMDay = String(new Date(y, m, 0).getDate()).padStart(2, "0");
                const mRange = `${y}${String(m).padStart(2, "0")}01-${y}${String(m).padStart(2, "0")}${lastMDay}`;
                const mEvents = await ESPNProvider.fetchScoreboard(slug, mRange, 500, 1);
                parseQuarterEvents(mEvents, slug, compName, kind, flag, qDedup);
              }
            } else {
              parseQuarterEvents(events, slug, compName, kind, flag, qDedup);
            }
          } catch {}
        });
        qRecords = Array.from(qDedup.values());
        if (isClosedQ && !scanAborted && qRecords.length > 0) {
          try { await idbSet(Q_PREFIX + qKey, qRecords); } catch {}
        }
      }

      qRecords.forEach(rec => {
        if (rec.ts >= minTs && rec.ts <= maxTs && !evMap.has(rec.id)) evMap.set(rec.id, rec);
      });
      pBar.style.width = `${Math.round(((qIdx + 1) / (quarters.length + 1)) * 100)}%`;
    }

    if (scanAborted && evMap.size === 0) {
      stEl.textContent = "⏹️ Scansione annullata.";
      return;
    }

    const allEvents = Array.from(evMap.values()).sort((a, b) => a.ts - b.ts);
    stEl.textContent = `Analizzo ${allEvents.length} match + calcolo rating ELO storico...`;
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
    stEl.textContent = `${scanAborted ? "⏹️ Parziale:" : "✅ Salvati"} ${allEvents.length} match + ELO su ${Object.keys(teams).length} squadre!`;
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

function renderTeamLeaderboard() {
  const raw = getTeamHist(), q = document.getElementById("teamHistSearch").value.trim().toLowerCase();
  const minM = Number(document.getElementById("minMatchesFilter").value), all = Object.values(raw);
  const tot = all.reduce((s, x) => s + x.tot, 0), hits = all.reduce((s, x) => s + x.hit, 0), ouHits = all.reduce((s, x) => s + x.ou, 0);

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
      </div>${marketBriers}`;
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
