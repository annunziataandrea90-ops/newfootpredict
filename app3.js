function syncSlipFromLeagues() {
  if (!SLIP.size) return;
  const byId = new Map();
  LEAGUES.forEach(l => l.matches.forEach(m => byId.set(m.id, m)));
  let changed = false;
  SLIP.forEach((item, id) => {
    const m = byId.get(id);
    if (m) {
      const baseUpdate = {
        slug: m.slug, dp: m.dp, espnDp: m.espnDp, startTs: m.startTs,
        leagueId: m.leagueId, leagueName: m.leagueName, home: m.home, away: m.away
      };
      const code = item.custom ? item.code : m.prediction.bestPick.code;
      const probMap = buildPickMap(m.prediction);
      const prob = item.custom ? (probMap[code] ?? item.prob) : m.prediction.bestPick.prob;
      const realOdd = m.odds?.best?.[code]?.odd || null;
      SLIP.set(id, {
        ...baseUpdate, id: m.id, code, prob,
        bookOdd: item.manualOdd ? item.bookOdd : (realOdd || item.bookOdd || null),
        manualOdd: Boolean(item.manualOdd),
        custom: Boolean(item.custom)
      });
      changed = true;
    }
  });
  if (changed) saveSlip();
  renderSlipBar();
}

function toggleSlipMatch(lid, mid, customPick = null) {
  if (!customPick && SLIP.has(mid)) {
    SLIP.delete(mid);
  } else {
    if (!SLIP.has(mid) && SLIP.size >= 8) { alert("Massimo 8 eventi nella schedina."); return; }
    const l = LEAGUES.find(x => x.id === lid), m = l?.matches.find(x => x.id === mid);
    if (!m) return;
    const code = customPick ? customPick.code : m.prediction.bestPick.code;
    const prob = customPick ? customPick.prob : m.prediction.bestPick.prob;
    const realOdd = m.odds?.best?.[code]?.odd || null;
    SLIP.set(mid, {
      id: m.id, slug: m.slug, dp: m.dp, espnDp: m.espnDp, startTs: m.startTs,
      leagueId: m.leagueId, leagueName: m.leagueName, home: m.home, away: m.away,
      code, prob, bookOdd: realOdd, manualOdd: false, custom: Boolean(customPick)
    });
  }
  saveSlip();
  renderSlipBar();
  renderSchedule();
}

function renderSlipBar() {
  const bar = document.getElementById("slipBar");
  if (!SLIP.size) { bar.classList.add("hidden"); return; }
  let combP = 1; SLIP.forEach(x => { combP *= x.prob; });
  bar.classList.remove("hidden");
  document.getElementById("slipCount").textContent = SLIP.size;
  document.getElementById("slipProb").textContent = `${(combP * 100).toFixed(1)}%`;
  document.getElementById("slipOdd").textContent = `@${fairOdd(combP)}`;
}

function nCk(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= k; i++) res = (res * (n - k + i)) / i;
  return Math.round(res);
}

function probAtLeastK(probs, k) {
  const n = probs.length;
  if (k <= 0) return 1;
  if (k > n) return 0;
  const dp = new Float64Array(n + 1);
  dp[0] = 1;
  for (let idx = 0; idx < n; idx++) {
    const p = probs[idx];
    for (let j = idx + 1; j >= 1; j--) dp[j] = dp[j] * (1 - p) + dp[j - 1] * p;
    dp[0] *= (1 - p);
  }
  let sum = 0;
  for (let j = k; j <= n; j++) sum += dp[j];
  return sum;
}

function getCombinations(arr, k) {
  const res = [];
  function bt(start, cur) {
    if (cur.length === k) { res.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      bt(i + 1, cur);
      cur.pop();
    }
  }
  bt(0, []);
  return res;
}

function openSlipModal() {
  if (!SLIP.size) return;
  currentModalToken++;
  const items = Array.from(SLIP.values());
  const n = items.length;
  let combP = 1;
  items.forEach(x => { combP *= x.prob; });

  document.getElementById("modalLeague").textContent = `Schedina & Calcolatore Sistemi • ${n} eventi`;
  document.getElementById("modalTitle").textContent = "🎟️ La tua Schedina";

  const sysOptions = [`<option value="${n}">Multipla Secca (${n}/${n} • 1 col.)</option>`];
  if (n >= 3) {
    for (let k = n - 1; k >= Math.max(2, n - 3); k--) {
      const colCnt = nCk(n, k);
      sysOptions.push(`<option value="${k}" ${n === 6 && k === 4 ? "selected" : (n !== 6 && k === n - 1 ? "selected" : "")}>Sistema ${k} su ${n} (${colCnt} col.)</option>`);
    }
  }

  document.getElementById("modalBody").innerHTML = `
    <div id="slipTopStats" class="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 flex justify-between items-center gap-2"></div>

    <div class="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2.5 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-bold text-cyan-300">🧮 Calcolatore Sistema &amp; Puntata</span>
        <div class="flex items-center gap-1.5">
          <select id="slipSystemK" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-semibold">
            ${sysOptions.join("")}
          </select>
          <input id="slipBudgetInput" type="number" min="1" max="5000" step="0.5" value="10" title="Budget totale (€/u)"
            class="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white text-right font-bold" />
          <span class="text-[11px] text-slate-400">€</span>
        </div>
      </div>
      <div id="slipSystemOut" class="space-y-1.5 text-[11px]"></div>
      <button id="logSlipBtn" class="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors">
        💼 Registra Multipla / Sistema nel Diario
      </button>
    </div>

    <div class="divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-800">
      ${items.map(x => `<div class="px-3 py-2 flex items-center justify-between gap-2 text-xs">
        <div class="min-w-0 flex-1">
          <div class="text-[10px] text-slate-400 truncate">${esc(x.leagueName)}</div>
          <div class="font-bold text-white truncate">${esc(x.home)} vs ${esc(x.away)}</div>
          <div class="text-[10px] text-cyan-300 font-semibold">${esc(x.code)} (${Math.round(x.prob * 100)}% • equa @${fairOdd(x.prob)})</div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <input data-slip-odd="${esc(x.id)}" type="number" min="1.01" max="50" step="0.01"
            value="${x.bookOdd ? esc(x.bookOdd) : ""}" placeholder="${fairOdd(x.prob)}" title="Quota bookmaker"
            class="w-16 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] text-white text-right" />
          <button data-remove-slip="${esc(x.id)}" class="px-2 py-1 rounded bg-slate-800 text-rose-300 hover:bg-slate-700">✕</button>
        </div>
      </div>`).join("")}
    </div>`;

  const updateSystemCalc = () => {
    const curItems = Array.from(SLIP.values());
    const k = Number(document.getElementById("slipSystemK").value) || curItems.length;
    const budget = Math.max(0.5, Number(document.getElementById("slipBudgetInput").value) || 10);
    const odds = curItems.map(x => (x.bookOdd && x.bookOdd > 1) ? Number(x.bookOdd) : Number(fairOdd(x.prob)));
    const probs = curItems.map(x => x.prob);
    const avgOdd = odds.reduce((a, b) => a + b, 0) / odds.length;
    const indexed = odds.map((o, idx) => ({ o, p: probs[idx], idx }));
    const combos = getCombinations(indexed, k);
    const colCount = combos.length;
    const colStake = budget / colCount;
    const prod = arr => arr.reduce((p, x) => p * x.o, 1);

    const sysHitProb = probAtLeastK(probs, k);
    const expReturn = colStake * combos.reduce((s, c) => s + c.reduce((pr, x) => pr * x.p * x.o, 1), 0);
    const expEv = ((expReturn / budget) - 1) * 100;
    const winAll = colStake * combos.reduce((s, c) => s + prod(c), 0);

    document.getElementById("slipTopStats").innerHTML = `
      <div>
        <div class="text-[11px] text-slate-400">Prob. stimata (indipendenza) (≥ ${k}/${curItems.length})</div>
        <div class="text-xl font-extrabold text-emerald-400">${(sysHitProb * 100).toFixed(1)}%</div>
        ${k < curItems.length ? `<div class="text-[10px] text-slate-400">Tutti presi: ${(combP * 100).toFixed(1)}%</div>` : ""}
      </div>
      <div class="text-right">
        <div class="text-[11px] text-slate-400">${k === curItems.length ? "Quota totale" : "EV atteso sistema"}</div>
        <div class="text-xl font-extrabold ${k === curItems.length ? "text-cyan-300" : (expEv >= 0 ? "text-emerald-400" : "text-amber-300")}">
          ${k === curItems.length ? `@${prod(indexed).toFixed(2)}` : `${expEv >= 0 ? "+" : ""}${expEv.toFixed(1)}%`}
        </div>
        <div class="text-[10px] text-slate-400">Ritorno atteso: ${expReturn.toFixed(2)} €</div>
      </div>`;

    let err1Block = "";
    if (k < curItems.length) {
      const payouts1 = curItems.map((_, missIdx) => {
        const winningCols = combos.filter(c => !c.some(x => x.idx === missIdx));
        return colStake * winningCols.reduce((s, c) => s + prod(c), 0);
      });
      const min1 = Math.min(...payouts1), max1 = Math.max(...payouts1);
      const colsAfter1Miss = nCk(curItems.length - 1, k);
      const breakEvenOdd = Math.pow(colCount / Math.max(1, colsAfter1Miss), 1 / k);
      const warn = min1 < budget
        ? `<div class="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px]">⚠️ Quota media (@${avgOdd.toFixed(2)}) sotto la soglia di pareggio (@${breakEvenOdd.toFixed(2)}) per 1 errore: il ritorno minimo può essere inferiore alla puntata.</div>`
        : `<div class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px]">✅ Quota media (@${avgOdd.toFixed(2)}) sopra la soglia (@${breakEvenOdd.toFixed(2)}): ritorno minimo stimato non inferiore alla puntata.</div>`;
      err1Block = `
        <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex justify-between items-center">
          <span class="text-slate-300">Con <strong>1 errore</strong> (${curItems.length - 1}/${curItems.length}):</span>
          <strong class="${min1 >= budget ? 'text-emerald-400' : 'text-amber-300'}">${min1.toFixed(2)} € – ${max1.toFixed(2)} €</strong>
        </div>${warn}`;
    } else {
      err1Block = `<div class="text-[10px] text-slate-400">Multipla secca: con 1 errore perdi l'intera puntata. Seleziona un sistema sopra per coprirti!</div>`;
    }

    let err2Block = "";
    if (k <= curItems.length - 2) {
      const payouts2 = [];
      for (let i = 0; i < curItems.length; i++) {
        for (let j = i + 1; j < curItems.length; j++) {
          const wCols = combos.filter(c => !c.some(x => x.idx === i || x.idx === j));
          payouts2.push(colStake * wCols.reduce((s, c) => s + prod(c), 0));
        }
      }
      const min2 = Math.min(...payouts2), max2 = Math.max(...payouts2);
      err2Block = `<div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex justify-between items-center">
        <span class="text-slate-400">Con <strong>2 errori</strong> (${curItems.length - 2}/${curItems.length}):</span>
        <span class="font-bold text-slate-200">${min2.toFixed(2)} € – ${max2.toFixed(2)} €</span>
      </div>`;
    }

    document.getElementById("slipSystemOut").innerHTML = `
      <div class="flex flex-wrap justify-between gap-2 text-slate-300">
        <span>Colonne: <strong class="text-white">${colCount}</strong> × <strong class="text-white">${colStake.toFixed(2)} €</strong></span>
        <span>Quota media: <strong class="text-cyan-300">@${avgOdd.toFixed(2)}</strong></span>
      </div>
      <div class="p-2 rounded-lg bg-slate-900/90 border border-emerald-500/30 flex justify-between items-center">
        <span class="text-slate-200">Con <strong>0 errori</strong> (${curItems.length}/${curItems.length}):</span>
        <strong class="text-emerald-400 text-sm">${winAll.toFixed(2)} €</strong>
      </div>
      ${err1Block}
      ${err2Block}`;
  };

  document.getElementById("slipSystemK").onchange = updateSystemCalc;
  document.getElementById("slipBudgetInput").oninput = updateSystemCalc;
  document.getElementById("logSlipBtn").onclick = async () => {
    const curItems = Array.from(SLIP.values());
    const k = Number(document.getElementById("slipSystemK").value) || curItems.length;
    const budget = Math.max(0.5, Number(document.getElementById("slipBudgetInput").value) || 10);
    const legs = curItems.map(x => ({
      matchId: x.id, slug: x.slug || "", dp: x.dp || dateParam(dayOffset()),
      espnDp: x.espnDp || x.dp || dateParam(dayOffset()),
      code: x.code, odd: (x.bookOdd && x.bookOdd > 1) ? Number(x.bookOdd) : Number(fairOdd(x.prob))
    }));
    const maxMult = k === curItems.length
      ? legs.reduce((p, x) => p * x.odd, 1)
      : getCombinations(legs, k).reduce((s, c) => s + c.reduce((p, x) => p * x.odd, 1), 0) / nCk(curItems.length, k);

    BET_LOG.push({
      id: `slip_${Date.now()}`,
      matchId: curItems.length === 1 ? curItems[0].id : null,
      slug: curItems.length === 1 ? (curItems[0].slug || "") : "",
      dp: curItems[0]?.dp || dateParam(dayOffset()),
      espnDp: curItems[0]?.espnDp || curItems[0]?.dp || dateParam(dayOffset()),
      date: localDateKey(new Date(curItems[0]?.startTs || Date.now())),
      league: k === curItems.length ? `Multipla (${curItems.length} ev.)` : `Sistema ${k}/${curItems.length}`,
      match: curItems.map(x => `${x.home.split(" ")[0]}-${x.away.split(" ")[0]} (${x.code})`).join(" • "),
      code: k === curItems.length ? `Multipla ${curItems.length}/${curItems.length}` : `Sistema ${k}/${curItems.length}`,
      odd: Number(maxMult.toFixed(2)),
      stake: budget,
      status: "pending",
      systemK: k,
      legs
    });
    await saveBetLog();
    const btn = document.getElementById("logSlipBtn");
    btn.textContent = "✅ Registrata nel Diario!";
    setTimeout(() => { if (document.getElementById("logSlipBtn")) document.getElementById("logSlipBtn").textContent = "💼 Registra Multipla / Sistema nel Diario"; }, 1400);
  };

  document.querySelectorAll("[data-slip-odd]").forEach(inp => {
    inp.oninput = () => {
      const item = SLIP.get(inp.dataset.slipOdd);
      if (item) {
        const val = Number(inp.value);
        item.bookOdd = (Number.isFinite(val) && val > 1.0) ? val : null;
        item.manualOdd = Boolean(item.bookOdd);
        saveSlip();
        updateSystemCalc();
      }
    };
  });
  document.querySelectorAll("[data-remove-slip]").forEach(btn => {
    btn.onclick = () => {
      SLIP.delete(btn.dataset.removeSlip);
      saveSlip(); renderSlipBar(); renderSchedule();
      if (SLIP.size) openSlipModal(); else closeModal();
    };
  });

  updateSystemCalc();
  document.body.classList.add("overflow-hidden");
  const mod = document.getElementById("detailModal");
  mod.classList.remove("hidden"); mod.classList.add("flex");
}

function openApiKeysModal() {
  currentModalToken++;
  const curOdds = OddsProvider.getKey(), curAf = AFProvider.getKey();
  const qOdds = OddsProvider.getQuota(), qAf = AFProvider.getQuota();
  document.getElementById("modalLeague").textContent = "Chiavi salvate solo in locale su questo dispositivo";
  document.getElementById("modalTitle").textContent = "🔑 Configura API Keys";
  document.getElementById("modalBody").innerHTML = `
    <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1">
      <p>Le chiavi restano <strong>solo nel localStorage di questo browser</strong> (mai inviate su GitHub).</p>
    </div>

    <div class="p-3 rounded-xl bg-fuchsia-950/20 border border-fuchsia-500/30 space-y-2 text-xs">
      <div class="flex justify-between items-center">
        <span class="font-bold text-fuchsia-300">💰 1. The Odds API (Quote &amp; Value)</span>
        ${qOdds?.remaining != null ? `<span class="text-[10px] text-emerald-400 font-bold">Rimasti: ${esc(qOdds.remaining)}</span>` : ""}
      </div>
      <input id="oddsKeyInput" type="password" value="${esc(curOdds)}" placeholder="Incolla apiKey The Odds API..."
        class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
      <p class="text-[10px] text-slate-400">Piano gratis: 500 crediti/mese • Premi <strong>💰 Quote</strong> quando vuoi scaricare (2 crediti/torneo).</p>
    </div>

    <div class="p-3 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-2 text-xs">
      <div class="flex justify-between items-center">
        <span class="font-bold text-sky-300">🔬 2. API-Football (Formazioni, Assenze &amp; xG)</span>
        ${qAf?.remaining != null ? `<span class="text-[10px] text-emerald-400 font-bold">Oggi: ${esc(qAf.remaining)}/${esc(qAf.limit || 100)}</span>` : ""}
      </div>
      <input id="afKeyInput" type="password" value="${esc(curAf)}" placeholder="Incolla x-apisports-key (dashboard.api-football.com)..."
        class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
      <p class="text-[10px] text-slate-400">Piano gratis: 100 req/giorno • Usa <strong>🔬 Top Match</strong> per analizzare fino a 20 partite filtrate con sole 2–3 richieste!</p>
    </div>

    <div class="flex gap-2 text-xs">
      <button id="saveAllKeysBtn" class="flex-1 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold">💾 Salva Chiavi</button>
      <button id="clearAllCachesBtn" class="px-3 py-2.5 rounded-xl bg-slate-800 text-cyan-300 border border-slate-700 font-semibold">🧹 Svuota Cache</button>
    </div>
    <div id="apiKeysMsg" class="text-[11px] text-emerald-400"></div>`;

  document.getElementById("saveAllKeysBtn").onclick = () => {
    OddsProvider.setKey(document.getElementById("oddsKeyInput").value);
    AFProvider.setKey(document.getElementById("afKeyInput").value);
    updateApiStatusBars();
    closeModal();
  };
  document.getElementById("clearAllCachesBtn").onclick = () => {
    OddsProvider.clearCache();
    AFProvider.clearCache();
    attachOddsToLeagues(LEAGUES);
    attachAFCacheToLeagues(LEAGUES);
    recalcAllPredictions(); renderSchedule(); updateApiStatusBars("Cache quote svuotata.", "Cache API-Football svuotata.");
    document.getElementById("apiKeysMsg").textContent = "✅ Cache quote e formazioni svuotate.";
  };

  document.body.classList.add("overflow-hidden");
  const mod = document.getElementById("detailModal");
  mod.classList.remove("hidden"); mod.classList.add("flex");
}

function confStyle(c) {
  if (c >= 75) return { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", bar: "bg-emerald-500" };
  if (c >= 60) return { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30", bar: "bg-amber-400" };
  return { bg: "bg-slate-700/40", text: "text-slate-300", border: "border-slate-600/50", bar: "bg-slate-400" };
}

function logoHtml(url) {
  if (!url) return "";
  return `<img src="${esc(url)}" alt="" loading="lazy" class="w-3.5 h-3.5 object-contain mr-1.5 shrink-0" onerror="this.style.display='none'" />`;
}

function renderMatchRow(m, showLeague = false) {
  const p = m.prediction, cs = confStyle(p.confidence), isCanceled = m.stateType === "canceled";
  const started = (m.stateType === "in" || m.stateType === "post") && m.hasScore, canEval = m.stateType === "post" && m.hasScore && !m.isExtra && m.predictionVerified;
  const isStar = m.stateType === "pre" && p.eligible;
  const pickOk = canEval ? isHit(p.bestPick.code, m.hScore, m.aScore) : null;
  const ouOk = canEval ? isHit(p.ouPick.code, m.hScore, m.aScore) : null;
  const sCls = m.stateType === "in" ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
    : m.stateType === "post" ? "bg-slate-800 border-slate-700 text-white"
    : isCanceled ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
    : "bg-slate-900/80 border-slate-800 text-slate-500";
  const ouCls = p.ouPick.isOver ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
  const extraBadge = (started && m.isExtra) ? " ⏱️" : "";
  const slipItem = SLIP.get(m.id), inSlip = Boolean(slipItem);
  const customSlipBadge = (slipItem && slipItem.custom && slipItem.code !== p.bestPick.code)
    ? `<span class="text-[9px] text-emerald-300 font-bold">🎟️ ${esc(slipItem.code)}</span>` : "";
  const valBadge = p.bestValue
    ? `<span class="px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/40 text-[9px] font-extrabold">💎 +${Math.round(p.bestValue.ev * 100)}% (${esc(p.bestValue.code)} @${p.bestValue.odd.toFixed(2)})</span>` : "";
  const divBadge = p.marketDiv >= 0.14
    ? `<span class="text-[9px] text-amber-300 font-bold" title="Forte divergenza rispetto alle quote sharp di mercato">⚠️ Mkt</span>` : "";
  const xiBadge = m.af?.lineups?.length
    ? `<span class="text-[9px] text-emerald-300 font-bold" title="Formazioni ufficiali caricate">📋 XI</span>` : "";
  const injBadge = (m.af && (m.af.injH.length >= 2 || m.af.injA.length >= 2))
    ? `<span class="text-[9px] text-sky-300 font-bold" title="Assenze segnalate Casa/Ospite">🏥 ${m.af.injH.length}/${m.af.injA.length}</span>` : "";

  return `<div data-lid="${esc(m.leagueId)}" data-mid="${esc(m.id)}" class="match-card px-2.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/50 active:bg-slate-800 transition-colors ${isStar ? 'bg-emerald-500/5 border-l-2 border-l-emerald-400' : ''} ${isCanceled ? 'opacity-60' : ''}">
    <div class="min-w-0 flex-1">
      <div class="text-[10px] text-slate-400 flex flex-wrap items-center gap-1.5">
        <span>${esc(m.time)}</span>
        ${showLeague ? `<span class="truncate text-slate-500">${m.flag} ${esc(m.leagueName)}</span>` : ""}
        ${isStar ? '<span class="text-[9px] font-bold text-emerald-400">⭐ TOP</span>' : ''}
        ${m.lowData ? '<span class="text-[9px] text-amber-400/90" title="Pochi dati statistici">⚠️</span>' : ''}
        ${divBadge}
        ${m.stateType !== "pre" && !m.predictionVerified ? '<span class="text-[9px] text-amber-300">Non verificato</span>' : ""}
        ${xiBadge}
        ${injBadge}
        ${customSlipBadge}
        ${valBadge}
      </div>
      <div class="text-xs font-semibold text-white flex items-center min-w-0">${logoHtml(m.homeLogo)}<span class="truncate">${esc(m.home)}</span>${renderFormDots(m.formH)}</div>
      <div class="text-xs font-semibold text-slate-300 flex items-center min-w-0">${logoHtml(m.awayLogo)}<span class="truncate">${esc(m.away)}</span>${renderFormDots(m.formA)}</div>
    </div>
    <div class="w-14 shrink-0 py-1 px-1.5 rounded-xl border text-center ${sCls}">
      <div class="text-[9px] font-bold uppercase ${m.stateType === 'in' ? 'animate-pulse text-rose-400' : 'text-slate-400'}">${esc(m.statusTxt)}</div>
      <div class="text-xs font-extrabold">${esc(m.scoreStr)}</div>
    </div>
    <div class="flex flex-col items-end gap-1 shrink-0">
      <span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">${esc(p.bestPick.code)} ${Math.round(p.bestPick.prob * 100)}% <span class="text-[9px] text-cyan-200/75">@${fairOdd(p.bestPick.prob)}</span>${pickOk === null ? extraBadge : pickOk ? " ✅" : " ❌"}</span>
      <span class="px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${ouCls}">${esc(p.ouPick.code)} ${Math.round(p.ouPick.prob * 100)}%${ouOk === null ? extraBadge : ouOk ? " ✅" : " ❌"}</span>
    </div>
    <div class="w-11 shrink-0 px-1 py-1 rounded-xl border ${cs.bg} ${cs.border}">
      <div class="text-[10px] font-bold text-center ${cs.text}">${p.confidence}%</div>
      <div class="w-full h-1 bg-slate-900 rounded-full mt-0.5 overflow-hidden"><div class="h-full ${cs.bar}" style="width:${p.confidence}%"></div></div>
    </div>
    <button data-slip-lid="${esc(m.leagueId)}" data-slip-mid="${esc(m.id)}" title="${inSlip ? `In schedina: ${esc(slipItem.code)}` : 'Aggiungi alla schedina'}"
      class="slip-toggle w-6 h-7 shrink-0 rounded-lg border text-xs font-bold flex items-center justify-center ${inSlip ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'}">${inSlip ? '✓' : '+'}</button>
  </div>`;
}

function renderSchedule() {
  const box = document.getElementById("scheduleContainer"), topBox = document.getElementById("topHighlights");
  const q = st.search.trim().toLowerCase();
  let vis = 0, tops = 0, fin = 0, hit = 0, html = "";
  const allFiltered = [];

  const matchPasses = (l, m) =>
    m.prediction.confidence >= st.minConf &&
    (st.market === "all" || m.prediction.bestPick.cat === st.market) &&
    (!st.onlyPlayable || m.stateType === "pre" || m.stateType === "in") &&
    (!st.onlyValue || Boolean(m.prediction.bestValue)) &&
    (!q || `${l.name} ${l.kind} ${m.home} ${m.away}`.toLowerCase().includes(q));

  LEAGUES.forEach(l => {
    const list = l.matches.filter(m => matchPasses(l, m));
    if (!list.length) return;
    list.forEach(m => {
      if (m.stateType !== "canceled") {
        allFiltered.push(m); vis++;
        if (m.stateType === "pre" && m.prediction.eligible) tops++;
        if (m.stateType === "post" && m.hasScore && !m.isExtra && m.predictionVerified) {
          fin++; if (isHit(m.prediction.bestPick.code, m.hScore, m.aScore)) hit++;
        }
      }
    });
    if (st.sort === "league") {
      const closed = st.collapsed.has(l.id);
      html += `<div class="glass rounded-2xl overflow-hidden">
        <button data-toggle-league="${esc(l.id)}" class="league-toggle w-full px-3 py-2.5 bg-slate-900 hover:bg-slate-800/80 flex items-center justify-between border-b border-slate-800 transition-colors">
          <div class="flex items-center gap-2 text-left"><span>${l.flag}</span><span class="font-bold text-xs text-white">${esc(l.name)}</span><span class="text-[11px] text-slate-400">${esc(l.kind)} (${list.length})</span></div>
          <span class="text-xs text-slate-400">${closed ? "▸" : "▾"}</span>
        </button>
        <div class="${closed ? "hidden" : "divide-y divide-slate-800/70"}">${list.map(m => renderMatchRow(m, false)).join("")}</div>
      </div>`;
    }
  });

  if (st.sort !== "league" && allFiltered.length) {
    const sorted = allFiltered.slice().sort((a, b) => {
      if (st.sort === "time") return a.startTs - b.startTs;
      if (st.sort === "prob") return b.prediction.bestPick.prob - a.prediction.bestPick.prob;
      if (st.sort === "ev") return (b.prediction.bestValue?.ev ?? -1) - (a.prediction.bestValue?.ev ?? -1);
      return b.prediction.confidence - a.prediction.confidence || b.prediction.rankScore - a.prediction.rankScore;
    });
    html = `<div class="glass rounded-2xl overflow-hidden divide-y divide-slate-800/70">${sorted.map(m => renderMatchRow(m, true)).join("")}</div>`;
  }

  const topList = allFiltered.filter(m => m.stateType === "pre" && m.prediction.eligible && m.startTs > Date.now()).sort((a, b) => b.prediction.rankScore - a.prediction.rankScore).slice(0, 6);
  if (topList.length) {
    topBox.classList.remove("hidden");
    topBox.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-extrabold text-emerald-300 tracking-wide">🔥 SELEZIONI SOPRA SOGLIA (${st.tab.toUpperCase()})</span>
        <button id="loadTop6SlipBtn" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-[10px] font-bold text-emerald-300">🎟️ Carica Top 6 in Schedina</button>
      </div>
      <div class="space-y-1.5">
        ${topList.map(m => {
          const p = m.prediction, probPct = Math.round(p.bestPick.prob * 100);
          const started = (m.stateType === "in" || m.stateType === "post") && m.hasScore;
          const hitM = started ? (m.isExtra ? " ⏱️" : (isHit(p.bestPick.code, m.hScore, m.aScore) ? " ✅" : " ❌")) : "";
          return `<div data-lid="${esc(m.leagueId)}" data-mid="${esc(m.id)}" class="match-card px-2.5 py-2 rounded-xl bg-slate-950/75 border border-emerald-500/25 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/70 active:bg-slate-800 transition-colors">
            <div class="min-w-0 flex-1">
              <div class="text-[10px] text-slate-400">${m.flag} ${esc(m.leagueName)} • ${esc(m.time)} ${started ? `• <strong class="text-white">${esc(m.scoreStr)}</strong>` : ""}</div>
              <div class="text-xs font-bold text-white truncate">${esc(m.home)} vs ${esc(m.away)}</div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="px-2 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-500 text-slate-950">${esc(p.bestPick.code)} • ${probPct}% (@${fairOdd(p.bestPick.prob)})${hitM}</span>
              <span class="text-[10px] font-bold text-emerald-300 w-9 text-right">Q.${p.confidence}%</span>
            </div>
          </div>`;
        }).join("")}
      </div>`;
    document.getElementById("loadTop6SlipBtn").onclick = () => {
      const playableTop = allFiltered.filter(m => m.stateType === "pre" && m.prediction.eligible && m.startTs > Date.now())
        .sort((a, b) => b.prediction.rankScore - a.prediction.rankScore).slice(0, 6);
      const chosen = playableTop;
      if (!chosen.length) return;
      SLIP.clear();
      chosen.forEach(m => {
        const code = m.prediction.bestPick.code;
        const realOdd = m.odds?.best?.[code]?.odd || null;
        SLIP.set(m.id, {
          id: m.id, slug: m.slug, dp: m.dp, espnDp: m.espnDp, startTs: m.startTs,
          leagueId: m.leagueId, leagueName: m.leagueName, home: m.home, away: m.away,
          code, prob: m.prediction.bestPick.prob, bookOdd: realOdd, manualOdd: false, custom: false
        });
      });
      saveSlip(); renderSlipBar(); renderSchedule(); openSlipModal();
    };
  } else {
    topBox.classList.add("hidden");
  }

  box.innerHTML = html || `<div class="glass rounded-2xl p-6 text-center text-xs text-slate-400 space-y-1"><div>Nessuna partita trovata.</div>${lastDiag ? `<div class="text-[11px] text-slate-500">${esc(lastDiag)}</div>` : ""}</div>`;
  document.getElementById("visibleCount").textContent = vis;
  document.getElementById("topPickCount").textContent = tops;
  document.getElementById("hitCount").textContent = fin ? `${hit}/${fin} (${Math.round(hit / fin * 100)}%)` : "-";
}

function openModal(lid, mid) {
  const l = LEAGUES.find(x => x.id === lid), m = l?.matches.find(x => x.id === mid);
  if (!m) return;
  const token = ++currentModalToken;
  document.getElementById("modalLeague").textContent = `${l.flag} ${l.name} • ${m.time}${m.neutralSite ? " • Campo Neutro" : ""}`;
  document.getElementById("modalTitle").textContent = `${m.home} vs ${m.away}`;
  renderModalStructure(m);
  document.body.classList.add("overflow-hidden");
  const mod = document.getElementById("detailModal");
  mod.classList.remove("hidden"); mod.classList.add("flex");
  loadModalSummary(m, token);
}

async function loadModalSummary(m, token) {
  const box = document.getElementById("modalSummaryExtra");
  if (!box) return;
  box.innerHTML = `<div class="text-[10px] text-slate-500">🔎 Carico H2H e statistiche ESPN...</div>`;
  try {
    const sum = await ESPNProvider.fetchSummary(m.slug, m.id);
    if (token !== currentModalToken) return;
    const liveBox = document.getElementById("modalSummaryExtra");
    if (!sum || !liveBox) return;
    const chunks = [];

    const teamsBox = sum.boxscore?.teams || [];
    if (teamsBox.length === 2 && (teamsBox[0].statistics?.length || teamsBox[1].statistics?.length)) {
      const getStat = (t, names) => {
        const s = (t.statistics || []).find(x => names.includes(x.name));
        return s ? s.displayValue : "-";
      };
      const hT = teamsBox.find(t => t.homeAway === "home") || teamsBox[0];
      const aT = teamsBox.find(t => t.homeAway === "away") || teamsBox[1];
      chunks.push(`<div class="space-y-1">
        <div class="text-[10px] font-bold text-slate-300">📈 Statistiche Match ESPN</div>
        <div class="grid grid-cols-3 gap-1 text-center text-[10px] bg-slate-900/70 rounded-lg p-1.5">
          <div><strong class="text-white">${esc(getStat(hT, ["shotsOnTarget", "onTargetScoringAttempts"]))}</strong><div class="text-slate-500">Tiri Porta</div><strong class="text-white">${esc(getStat(aT, ["shotsOnTarget", "onTargetScoringAttempts"]))}</strong></div>
          <div><strong class="text-white">${esc(getStat(hT, ["totalShots", "shotsSummary"]))}</strong><div class="text-slate-500">Tiri Tot.</div><strong class="text-white">${esc(getStat(aT, ["totalShots", "shotsSummary"]))}</strong></div>
          <div><strong class="text-white">${esc(getStat(hT, ["possessionPct"]))}%</strong><div class="text-slate-500">Possesso</div><strong class="text-white">${esc(getStat(aT, ["possessionPct"]))}%</strong></div>
        </div>
      </div>`);
    }

    const h2hGames = (sum.headToHeadGames || [])[0]?.events || [];
    if (h2hGames.length) {
      chunks.push(`<div class="space-y-1">
        <div class="text-[10px] font-bold text-slate-300">⚔️ Precedenti Reali ESPN</div>
        ${h2hGames.slice(0, 5).map(ev => `<div class="flex justify-between text-[10px] text-slate-300">
          <span class="text-slate-500">${esc((ev.gameDate || "").slice(0, 10))} • ${esc(ev.leagueAbbreviation || "")}</span>
          <span class="font-semibold text-white">${esc(ev.homeTeamName || "")} ${esc(ev.homeTeamScore ?? "-")} - ${esc(ev.awayTeamScore ?? "-")} ${esc(ev.awayTeamName || "")}</span>
        </div>`).join("")}
      </div>`);
    }

    liveBox.innerHTML = chunks.length ? chunks.join(`<div class="border-t border-slate-800 my-1.5"></div>`) : `<div class="text-[10px] text-slate-500">Nessun dato H2H/statistiche live aggiuntive su ESPN per questo evento.</div>`;
  } catch {
    if (token === currentModalToken && document.getElementById("modalSummaryExtra")) {
      document.getElementById("modalSummaryExtra").innerHTML = "";
    }
  }
}

function renderModalStructure(m) {
  let activePick = { code: m.prediction.bestPick.code, prob: m.prediction.bestPick.prob };
  const initRealOdd = m.odds?.best?.[activePick.code]?.odd || "";
  const defSimH = m.af ? Math.round(m.af.autoHL * 100) : 100;
  const defSimA = m.af ? Math.round(m.af.autoAL * 100) : 100;

  document.getElementById("modalBody").innerHTML = `
    <div id="modalDynamic" class="space-y-3"></div>
    <div id="modalAFBox" class="p-3 rounded-xl bg-slate-950 border border-sky-500/30 space-y-2"></div>
    <div id="modalSummaryExtra" class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2"></div>

    <div class="p-3 rounded-xl bg-cyan-950/25 border border-cyan-500/30 space-y-2 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-bold text-cyan-300">💰 Value &amp; Registra: <strong id="selectedMarketBadge" class="text-white"></strong></span>
        <div class="flex items-center gap-1.5">
          <input id="bookOddInput" type="number" min="1.01" max="50" step="0.01" value="${esc(initRealOdd)}" placeholder="${fairOdd(activePick.prob)}"
            class="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-right" />
          <input id="betStakeInput" type="number" min="0.1" max="100" step="0.5" value="1" title="Unità/Euro puntati"
            class="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-right" />
        </div>
      </div>
      <div id="evResult" class="text-[11px] text-slate-400">Tocca qualsiasi quota sopra per cambiare mercato, calcolare EV% o registrare la giocata.</div>
      <div class="flex gap-2 pt-1">
        <button id="addSlipCustomBtn" class="flex-1 py-1.5 rounded-lg bg-slate-800 text-cyan-300 border border-cyan-500/30 font-bold text-[11px]">🎟️ Metti in Schedina</button>
        <button id="addBetBtn" class="flex-1 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px]">💼 Registra nel Diario</button>
      </div>
    </div>

    <div class="p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30 space-y-2 text-xs">
      <div class="flex items-center justify-between">
        <span class="font-bold text-emerald-400">Simula Assenze / Turnover</span>
        <button id="simResetBtn" class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">Reset 100%</button>
      </div>
      <div><div class="flex justify-between"><span>${esc(m.home)}</span><span id="simHLabel">${defSimH}%</span></div><input id="simH" type="range" min="70" max="100" value="${defSimH}" class="w-full accent-emerald-500"/></div>
      <div><div class="flex justify-between"><span>${esc(m.away)}</span><span id="simALabel">${defSimA}%</span></div><input id="simA" type="range" min="70" max="100" value="${defSimA}" class="w-full accent-emerald-500"/></div>
    </div>`;

  const simH = document.getElementById("simH"), simA = document.getElementById("simA");
  const bookInput = document.getElementById("bookOddInput"), stakeInput = document.getElementById("betStakeInput");

  const renderAFBox = () => {
    const afBox = document.getElementById("modalAFBox");
    if (!afBox) return;
    if (!m.af) {
      afBox.innerHTML = `
        <div class="flex items-center justify-between gap-2 text-xs">
          <span class="font-bold text-sky-300">🔬 Formazioni, Assenze &amp; xG (API-Football)</span>
          <button id="btnFetchSingleAF" class="px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-bold text-[11px] disabled:opacity-50">Scarica solo questo match</button>
        </div>
        <div id="afSingleMsg" class="text-[10px] text-slate-400">Consuma solo 2–3 richieste sulle 100/giorno (1 sola per mappa giorno + 2 per match).</div>`;
      document.getElementById("btnFetchSingleAF").onclick = async () => {
        const b = document.getElementById("btnFetchSingleAF"), msgEl = document.getElementById("afSingleMsg");
        b.disabled = true; msgEl.textContent = "Scarico dati API-Football...";
        try {
          await fetchAFForSingleMatch(m);
          if (m.af) {
            simH.value = Math.round(m.af.autoHL * 100);
            simA.value = Math.round(m.af.autoAL * 100);
          }
          renderAFBox();
          refreshSim();
        } catch (err) {
          msgEl.textContent = `❌ ${err?.message || "Errore"}`;
          b.disabled = false;
        }
      };
      return;
    }

    const fmtInj = (label, list, pct) => {
      if (!list.length) return `<div><span class="text-slate-400">${esc(label)} (${pct}%):</span> <span class="text-emerald-400">Nessun assente segnalato</span></div>`;
      return `<div><div class="text-slate-300 font-semibold">${esc(label)} (${pct}% • ${list.length} ass.):</div>
        <div class="text-[10px] text-amber-200/90">${list.slice(0, 6).map(x => `${esc(x.name)} (${esc(x.reason || x.type)})`).join(" • ")}${list.length > 6 ? " ..." : ""}</div></div>`;
    };
    const hLu = m.af.lineups.find(x => x.isHome), aLu = m.af.lineups.find(x => !x.isHome);
    const luHtml = (hLu || aLu)
      ? `<div class="pt-1.5 border-t border-slate-800 space-y-1 text-[10px]">
          <div class="font-bold text-emerald-300">📋 Formazioni Ufficiali</div>
          ${hLu ? `<div><strong class="text-white">${esc(m.home)} (${esc(hLu.formation)})</strong>: <span class="text-slate-300">${esc(hLu.startXI.join(", "))}</span></div>` : ""}
          ${aLu ? `<div><strong class="text-white">${esc(m.away)} (${esc(aLu.formation)})</strong>: <span class="text-slate-300">${esc(aLu.startXI.join(", "))}</span></div>` : ""}
        </div>`
      : `<div class="text-[10px] text-slate-500 pt-1 border-t border-slate-800">📋 Formazioni ufficiali non ancora uscite (escono ~45–60 min prima).</div>`;
    const stH = m.af.statsH, stA = m.af.statsA;
    const statsHtml = (stH && stA)
      ? `<div class="pt-1.5 border-t border-slate-800 grid grid-cols-4 gap-1 text-center text-[10px] bg-slate-900/70 rounded-lg p-1.5">
          <div><strong class="text-cyan-300">${esc(stH.xg ?? "-")} / ${esc(stA.xg ?? "-")}</strong><div class="text-slate-500">xG</div></div>
          <div><strong class="text-white">${esc(stH.sog ?? "-")} / ${esc(stA.sog ?? "-")}</strong><div class="text-slate-500">Tiri Porta</div></div>
          <div><strong class="text-white">${esc(stH.box ?? "-")} / ${esc(stA.box ?? "-")}</strong><div class="text-slate-500">In Area</div></div>
          <div><strong class="text-white">${esc(stH.pos ?? "-")} / ${esc(stA.pos ?? "-")}</strong><div class="text-slate-500">Possesso</div></div>
        </div>` : "";

    afBox.innerHTML = `
      <div class="flex justify-between items-center text-xs">
        <span class="font-bold text-sky-300">🔬 API-Football: Assenze &amp; Formazioni</span>
        <button id="btnRefreshSingleAF" class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300">↻ Aggiorna</button>
      </div>
      <div class="space-y-1 text-[11px]">
        ${fmtInj(m.home, m.af.injH, Math.round(m.af.autoHL * 100))}
        ${fmtInj(m.away, m.af.injA, Math.round(m.af.autoAL * 100))}
      </div>
      ${luHtml}
      ${statsHtml}`;
    document.getElementById("btnRefreshSingleAF").onclick = async () => {
      await fetchAFForSingleMatch(m);
      if (m.af) { simH.value = Math.round(m.af.autoHL * 100); simA.value = Math.round(m.af.autoAL * 100); }
      renderAFBox(); refreshSim();
    };
  };

  const updateEV = () => {
    document.getElementById("selectedMarketBadge").textContent = `${activePick.code} (${Math.round(activePick.prob * 100)}%)`;
    bookInput.placeholder = fairOdd(activePick.prob);
    const odd = Number(bookInput.value), evEl = document.getElementById("evResult");
    if (!Number.isFinite(odd) || odd <= 1.0) {
      evEl.innerHTML = `<span class="text-slate-400">Quota equa: <strong class="text-white">@${fairOdd(activePick.prob)}</strong>. Tocca un mercato sopra o inserisci quota book &gt; 1.00.</span>`;
      return;
    }
    const ev = (odd * activePick.prob - 1) * 100, kelly = clamp(((odd * activePick.prob - 1) / (odd - 1)) * 0.25 * 100, 0, 10);
    evEl.innerHTML = ev > 0
      ? `<span class="text-emerald-400 font-bold">✅ VALUE BET: +${ev.toFixed(1)}% EV</span> • Kelly 1/4: <strong class="text-white">${kelly.toFixed(1)}% bankroll</strong>`
      : `<span class="text-rose-400 font-semibold">❌ NO VALUE: ${ev.toFixed(1)}% EV</span> (quota equa @${fairOdd(activePick.prob)})`;
  };

  const refreshSim = () => {
    document.getElementById("simHLabel").textContent = `${simH.value}%`;
    document.getElementById("simALabel").textContent = `${simA.value}%`;
    const p = updateModalDynamic(m, { hL: simH.value / 100, aL: simA.value / 100 }, activePick.code);
    const updatedMap = buildPickMap(p);
    if (updatedMap[activePick.code] !== undefined) activePick.prob = updatedMap[activePick.code];
    else activePick = { code: p.bestPick.code, prob: p.bestPick.prob };
    updateEV();
  };

  document.getElementById("modalDynamic").addEventListener("click", e => {
    const btn = e.target.closest("[data-pick-code]");
    if (!btn) return;
    activePick = { code: btn.dataset.pickCode, prob: Number(btn.dataset.pickProb) };
    const realOdd = m.odds?.best?.[activePick.code]?.odd;
    bookInput.value = realOdd ? String(realOdd) : "";
    refreshSim();
  });

  document.getElementById("addSlipCustomBtn").onclick = () => {
    toggleSlipMatch(m.leagueId, m.id, activePick);
    document.getElementById("addSlipCustomBtn").textContent = "✅ Aggiunta alla Schedina!";
    setTimeout(() => { if (document.getElementById("addSlipCustomBtn")) document.getElementById("addSlipCustomBtn").textContent = "🎟️ Metti in Schedina"; }, 1200);
  };

  document.getElementById("addBetBtn").onclick = async () => {
    const odd = Number(bookInput.value) || Number(fairOdd(activePick.prob));
    const stake = Math.max(0.1, Number(stakeInput.value) || 1);
    let status = "pending";
    if (m.stateType === "post" && m.hasScore && !m.isExtra && m.predictionVerified) {
      status = isHit(activePick.code, m.hScore, m.aScore) ? "won" : "lost";
    }
    BET_LOG.push({
      id: `${m.id}_${Date.now()}`, matchId: m.id, slug: m.slug,
      dp: m.dp || dateParam(dayOffset()),
      espnDp: m.espnDp || m.dp || dateParam(dayOffset()),
      date: localDateKey(new Date(m.startTs || Date.now())),
      league: m.leagueName, match: `${m.home} vs ${m.away}`,
      code: activePick.code, odd, stake, status
    });
    await saveBetLog();
    document.getElementById("addBetBtn").textContent = "✅ Salvata nel Diario!";
    setTimeout(() => { if (document.getElementById("addBetBtn")) document.getElementById("addBetBtn").textContent = "💼 Registra nel Diario"; }, 1200);
  };

  simH.oninput = refreshSim; simA.oninput = refreshSim; bookInput.oninput = updateEV;
  document.getElementById("simResetBtn").onclick = () => { simH.value = 100; simA.value = 100; refreshSim(); };
  renderAFBox();
  refreshSim();
}

function buildPickMap(p) {
  const map = { "1": p.probs.p1, "X": p.probs.px, "2": p.probs.p2, "Over 2.5": p.probs.pO, "Under 2.5": p.probs.pU, "Gol": p.probs.pG, "No Gol": p.probs.pNG };
  map["1X"] = p.probs.p1 + p.probs.px;
  map["X2"] = p.probs.px + p.probs.p2;
  (p.combos || []).forEach(c => { map[c.code] = c.prob; });
  return map;
}

function updateModalDynamic(m, ov = {}, selectedCode = null) {
  const p = m.stateType === "pre" && m.startTs > Date.now() ? calcPred(m, ov) : m.prediction, cs = confStyle(p.confidence);
  const overPct = Math.round(p.probs.pO * 100), underPct = 100 - overPct;
  const started = (m.stateType === "in" || m.stateType === "post") && m.hasScore, canEval = m.stateType === "post" && m.hasScore && !m.isExtra && m.predictionVerified;
  const pickOk = canEval ? isHit(p.bestPick.code, m.hScore, m.aScore) : null;
  const th = getTeamHist(), hHist = th[m.homeId], aHist = th[m.awayId];
  const h2h = (hHist?.m || []).filter(x => (x.oid && m.awayId && x.oid === m.awayId) || (!x.oid && x.t.toLowerCase().includes(m.away.toLowerCase()))).slice(-6).reverse();
  const evalBadge = !canEval && !m.isExtra ? `<span class="text-xs text-amber-300">${m.stateType === "in" ? "In corso" : "Nessuno snapshot pre-partita"}</span>` : m.isExtra ? `<span class="text-xs font-bold text-amber-300">⏱️ Escluso (90' non disp.)</span>` : `<span class="text-xs font-bold">${pickOk ? '✅ Preso' : '❌ Errato'}</span>`;
  const sel = selectedCode || p.bestPick.code;

  const pillBtn = (k, v) => {
    const active = sel === k;
    const realObj = m.odds?.best?.[k];
    const ev = realObj ? (v * realObj.odd - 1) : null;
    const evTag = (ev !== null && ev >= 0.02) ? ` <span class="text-fuchsia-300">+${Math.round(ev * 100)}%</span>` : "";
    return `<button data-pick-code="${esc(k)}" data-pick-prob="${v}" class="p-2 rounded-lg border text-center transition-colors ${active ? 'bg-cyan-500/20 border-cyan-400' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}">
      <div class="text-[10px] ${active ? 'text-cyan-300 font-bold' : 'text-slate-400'}">${esc(k)}${evTag}</div>
      <div class="font-bold text-white text-xs">${(v * 100).toFixed(0)}%</div>
      <div class="text-[9px] text-slate-500">${realObj ? `Book @${realObj.odd.toFixed(2)}` : `@${fairOdd(v)}`}</div>
    </button>`;
  };

  let oddsCard = "";
  if (m.odds) {
    const b = m.odds.best;
    const fmtB = code => b[code] ? `<strong class="text-white">@${b[code].odd.toFixed(2)}</strong> <span class="text-slate-500">(${esc(b[code].book)})</span>` : "-";
    const sharpInfo = m.odds.mktP1
      ? `Sharp (${esc(m.odds.sharpSrc)}): 1 ${Math.round(m.odds.mktP1 * 100)}% • X ${Math.round(m.odds.mktPX * 100)}% • 2 ${Math.round(m.odds.mktP2 * 100)}%`
      : "";
    const divAlert = p.marketDiv >= 0.14
      ? `<div class="p-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px]">⚠️ Divergenza forte (${Math.round(p.marketDiv * 100)}%) tra modello puro e mercato: possibili assenze o motivazioni non visibili in classifica.</div>` : "";
    oddsCard = `<div class="p-3 rounded-xl bg-slate-950 border border-fuchsia-500/30 space-y-1.5 text-[10px]">
      <div class="flex justify-between items-center"><span class="font-bold text-fuchsia-300">💰 Migliori Quote Reali EU (${m.odds.booksCount} book)</span><span class="text-slate-400">${sharpInfo}</span></div>
      <div class="grid grid-cols-3 gap-1.5 text-center bg-slate-900/70 rounded-lg p-1.5">
        <div>1: ${fmtB("1")}</div><div>X: ${fmtB("X")}</div><div>2: ${fmtB("2")}</div>
      </div>
      ${(b["Over 2.5"] || b["Under 2.5"]) ? `<div class="grid grid-cols-2 gap-1.5 text-center bg-slate-900/70 rounded-lg p-1.5"><div>Over 2.5: ${fmtB("Over 2.5")}</div><div>Under 2.5: ${fmtB("Under 2.5")}</div></div>` : ""}
      ${divAlert}
    </div>`;
  }

  document.getElementById("modalDynamic").innerHTML = `
    ${started ? `<div class="p-3 rounded-xl bg-slate-950 border ${!canEval ? 'border-amber-500/40' : (pickOk ? 'border-emerald-500/40' : 'border-rose-500/40')} flex justify-between items-center gap-2">
      <div><div class="text-[10px] text-slate-400">Risultato (${esc(m.statusTxt)}${m.isExtra ? " • mercati validi sui 90'" : ""})</div><div class="text-base font-extrabold text-white">${esc(m.home)} ${esc(m.scoreStr)} ${esc(m.away)}</div></div>
      ${evalBadge}
    </div>` : ""}
    <div class="grid grid-cols-2 gap-2.5">
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
        <div class="text-[11px] text-slate-400">Pronostico Top · ${p.mlActive ? "ML ibrido" : "Statistico"}</div>
        <div class="text-xl font-extrabold text-cyan-400">${esc(p.bestPick.code)} <span class="text-sm text-cyan-200">@${fairOdd(p.bestPick.prob)}</span></div>
        <div class="text-[11px] text-slate-300">${esc(p.bestPick.label)} (${(p.bestPick.prob * 100).toFixed(0)}%)</div>
      </div>
      <div class="p-3 rounded-xl border ${cs.bg} ${cs.border}">
        <div class="text-[11px] text-slate-300">Qualità dati (indice)</div>
        <div class="text-xl font-extrabold ${cs.text}">${p.confidence}%</div>
        <div class="text-[11px] text-slate-300">Gol attesi: ${p.lamH} - ${p.lamA}</div>
      </div>
    </div>
    ${oddsCard}
    <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
      <div class="flex justify-between text-[11px]"><span class="font-bold text-fuchsia-300">Over 2.5 (${overPct}%)</span><span class="px-2 py-0.5 rounded bg-slate-800 text-white font-semibold">${esc(p.ouPick.code)} @${fairOdd(p.ouPick.prob)}</span><span class="font-bold text-indigo-300">Under 2.5 (${underPct}%)</span></div>
      <div class="w-full h-2 rounded-full overflow-hidden flex bg-slate-800"><div class="bg-fuchsia-500" style="width:${overPct}%"></div><div class="bg-indigo-500" style="width:${underPct}%"></div></div>
    </div>
    <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-[11px]">
      <div class="flex justify-between items-center gap-2"><span class="text-slate-400 truncate">Forma ${esc(m.home)}</span><div class="flex gap-1 shrink-0">${renderFormBadges(m.formH)}</div></div>
      <div class="flex justify-between items-center gap-2"><span class="text-slate-400 truncate">Forma ${esc(m.away)}</span><div class="flex gap-1 shrink-0">${renderFormBadges(m.formA)}</div></div>
      <div class="pt-1.5 border-t border-slate-800/80 flex justify-between items-center"><span class="text-slate-400">Risultati esatti top:</span><div class="flex gap-1.5">${p.topScores.map(s => `<span class="px-2 py-0.5 rounded bg-slate-800 text-white font-bold">${esc(s.score)} <span class="text-slate-400 font-normal">${Math.round(s.prob * 100)}%</span></span>`).join("")}</div></div>
    </div>
    <div class="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[10px] text-slate-400 flex flex-wrap justify-between gap-1">
      <span>Casa: <strong class="text-slate-200">${esc(m.statSourceH)}</strong>${hHist?.elo ? ` (ELO ${hHist.elo})` : ""}</span>
      <span>Ospite: <strong class="text-slate-200">${esc(m.statSourceA)}</strong>${aHist?.elo ? ` (ELO ${aHist.elo})` : ""}</span>
    </div>
    ${h2h.length ? `<div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"><div class="text-[11px] font-bold text-slate-300">⚔️ Precedenti (Storico 10A)</div>${h2h.map(x => `<div class="flex justify-between text-[11px] text-slate-300"><span class="text-slate-500">${esc(x.d)} • ${esc(x.c)}</span><span class="font-bold text-white">${esc(x.t)} (${esc(x.s)})</span></div>`).join("")}</div>` : ""}
    <div class="space-y-1.5">
      <div class="text-[10px] font-bold text-slate-400">Mercati Principali (tocca per selezionare)</div>
      <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        ${[["1", p.probs.p1], ["X", p.probs.px], ["2", p.probs.p2], ["1X", p.probs.p1 + p.probs.px], ["X2", p.probs.px + p.probs.p2], ["Over 2.5", p.probs.pO], ["Under 2.5", p.probs.pU], ["Gol", p.probs.pG], ["No Gol", p.probs.pNG]].map(([k, v]) => pillBtn(k, v)).join("")}
      </div>
    </div>
    <div class="space-y-1.5">
      <div class="text-[10px] font-bold text-emerald-400">⚡ Combo &amp; Multigol (tocca per selezionare)</div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        ${p.combos.map(c => pillBtn(c.code, c.prob)).join("")}
      </div>
    </div>`;
  return p;
}

function closeModal() {
  currentModalToken++;
  document.body.classList.remove("overflow-hidden");
  const mod = document.getElementById("detailModal");
  mod.classList.add("hidden"); mod.classList.remove("flex");
}

function shiftDateParam(dpStr, deltaDays) {
  const y = Number(dpStr.slice(0, 4)), m = Number(dpStr.slice(4, 6)) - 1, d = Number(dpStr.slice(6, 8));
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
}

document.getElementById("viewPalinsesto").addEventListener("click", e => {
  const slipBtn = e.target.closest(".slip-toggle");
  if (slipBtn) { toggleSlipMatch(slipBtn.dataset.slipLid, slipBtn.dataset.slipMid); return; }
  const toggleBtn = e.target.closest(".league-toggle");
  if (toggleBtn) {
    const lid = toggleBtn.dataset.toggleLeague;
    st.collapsed.has(lid) ? st.collapsed.delete(lid) : st.collapsed.add(lid);
    renderSchedule(); return;
  }
  const card = e.target.closest(".match-card");
  if (card) openModal(card.dataset.lid, card.dataset.mid);
});

document.getElementById("teamLeaderboard").addEventListener("click", e => {
  const card = e.target.closest(".team-card");
  if (card) openTeamModal(card.dataset.tid);
});

document.getElementById("betLogList").addEventListener("click", async e => {
  const setBtn = e.target.closest("[data-bet-set]");
  if (setBtn) {
    const [id, status] = setBtn.dataset.betSet.split(":");
    const b = BET_LOG.find(x => x.id === id);
    if (b) { b.status = status; await saveBetLog(); renderDiario(); }
    return;
  }
  const delBtn = e.target.closest("[data-bet-del]");
  if (delBtn) {
    BET_LOG = BET_LOG.filter(x => x.id !== delBtn.dataset.betDel);
    await saveBetLog(); renderDiario();
  }
});

document.getElementById("btnAutoSettle").onclick = async () => {
  const btn = document.getElementById("btnAutoSettle");
  const stEl = document.getElementById("diarioStatus");
  const pending = BET_LOG.filter(b => b.status === "pending");
  if (!pending.length) {
    stEl.classList.remove("hidden"); stEl.textContent = "Nessuna giocata in attesa da verificare.";
    return;
  }

  btn.disabled = true;
  try {
    const byId = new Map();
    const addMatch = m => {
      if (m && m.stateType === "post" && m.hasScore && !m.isExtra) {
        byId.set(m.id, { hScore: m.hScore, aScore: m.aScore });
      }
    };
    LEAGUES.forEach(l => l.matches.forEach(addMatch));
    Object.values(DAY_CACHE).forEach(entry => (entry.leagues || []).forEach(l => l.matches.forEach(addMatch)));

    const toFetch = new Map();
    const queueLookup = (matchId, slug, dp, espnDp) => {
      if (!matchId || byId.has(matchId) || !slug) return;
      const targetDp = espnDp || dp;
      if (targetDp) toFetch.set(`${slug}|${targetDp}`, [slug, targetDp]);
      if (!espnDp && dp && AM_LEAGUES.has(slug)) {
        const prevDp = shiftDateParam(dp, -1);
        toFetch.set(`${slug}|${prevDp}`, [slug, prevDp]);
      }
    };

    pending.forEach(b => {
      if (Array.isArray(b.legs) && b.legs.length) {
        b.legs.forEach(leg => queueLookup(leg.matchId, leg.slug, leg.dp, leg.espnDp));
      } else {
        queueLookup(b.matchId, b.slug, b.dp, b.espnDp);
      }
    });

    if (toFetch.size) {
      stEl.classList.remove("hidden"); stEl.textContent = `Controllo ${toFetch.size} tornei/date passate su ESPN...`;
      await mapWithConcurrency(Array.from(toFetch.values()), 6, async ([slug, dp]) => {
        try {
          const events = await ESPNProvider.fetchScoreboard(slug, dp);
          events.forEach(ev => {
            const stType = ev.status?.type || {};
            const isExtra = EXTRA_RE.test((stType.shortDetail || "").toUpperCase()) || Number(ev.status?.period) > 2;
            const comp = ev.competitions?.[0] || {};
            const home = (comp.competitors || []).find(c => c.homeAway === "home");
            const away = (comp.competitors || []).find(c => c.homeAway === "away");
            const hasScore = home?.score !== undefined && home?.score !== "" && away?.score !== undefined && away?.score !== "";
            if (stType.state === "post" && stType.completed !== false && !isExtra && hasScore) {
              byId.set(ev.id, { hScore: Number(home.score), aScore: Number(away.score) });
            }
          });
        } catch {}
      });
    }

    let updated = 0;
    pending.forEach(b => {
      if (Array.isArray(b.legs) && b.legs.length) {
        const k = Number(b.systemK) || b.legs.length;
        const evalLegs = b.legs.map(leg => {
          const res = byId.get(leg.matchId);
          return res ? { ...leg, hit: isHit(leg.code, res.hScore, res.aScore) } : { ...leg, hit: null };
        });
        const settled = evalLegs.filter(x => x.hit !== null);
        const misses = settled.filter(x => x.hit === false).length;
        const maxPossibleHits = evalLegs.length - misses;

        if (maxPossibleHits < k) {
          b.status = "lost";
          updated++;
        } else if (settled.length === evalLegs.length) {
          if (k === evalLegs.length) {
            b.status = misses === 0 ? "won" : "lost";
          } else {
            const combos = getCombinations(evalLegs, k);
            const colStake = b.stake / combos.length;
            const totalReturn = combos.reduce((s, c) => s + (c.every(x => x.hit) ? colStake * c.reduce((p, x) => p * x.odd, 1) : 0), 0);
            b.odd = Number((totalReturn / b.stake).toFixed(3));
            b.status = totalReturn > 0 ? "won" : "lost";
          }
          updated++;
        }
      } else {
        const res = byId.get(b.matchId);
        if (res) {
          b.status = isHit(b.code, res.hScore, res.aScore) ? "won" : "lost";
          updated++;
        }
      }
    });

    stEl.classList.remove("hidden");
    if (updated) {
      await saveBetLog(); renderDiario();
      stEl.textContent = `✅ Verificate e chiuse ${updated} giocate!`;
    } else {
      stEl.textContent = "Nessuna nuova partita terminata trovata per le giocate in attesa.";
    }
  } finally {
    btn.disabled = false;
  }
};

document.getElementById("btnClearDiario").onclick = async () => {
  if (!BET_LOG.length || !confirm("Svuotare tutto il diario delle giocate?")) return;
  BET_LOG = []; await saveBetLog(); renderDiario();
  document.getElementById("diarioStatus").classList.add("hidden");
};

document.querySelectorAll(".tab-btn").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab-btn").forEach(x => {
    x.className = x.dataset.tab === "storico" ? "tab-btn px-2 py-1 text-xs font-semibold rounded-lg text-cyan-300"
      : x.dataset.tab === "diario" ? "tab-btn px-2 py-1 text-xs font-semibold rounded-lg text-amber-300"
      : "tab-btn px-2 py-1 text-xs font-semibold rounded-lg text-slate-300";
  });
  b.className = "tab-btn px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-500 text-slate-950";
  st.tab = b.dataset.tab;
  document.getElementById("viewPalinsesto").classList.toggle("hidden", st.tab === "storico" || st.tab === "diario");
  document.getElementById("viewStorico").classList.toggle("hidden", st.tab !== "storico");
  document.getElementById("viewDiario").classList.toggle("hidden", st.tab !== "diario");
  if (st.tab === "storico") renderTeamLeaderboard();
  else if (st.tab === "diario") renderDiario();
  else loadDay(dayOffset());
});

document.getElementById("importHistInput").onchange = async e => {
  const file = e.target.files?.[0];
  if (!file || isScanning) return;
  try {
    const clean = sanitizeTeamHist(JSON.parse(await file.text()));
    if (!Object.keys(clean).length) throw new Error("Empty or invalid");
    await saveTeamHist(clean);
    recalcAllPredictions(); renderTeamLeaderboard(); renderSchedule();
    document.getElementById("histScanWrap").classList.remove("hidden");
    document.getElementById("histScanStatus").textContent = `✅ Importate ${Object.keys(clean).length} squadre valide dal backup!`;
  } catch { alert("File JSON non valido o privo di dati squadra validi."); }
  finally { e.target.value = ""; }
};

document.getElementById("oddsFetchBtn").onclick = () => fetchOddsForCurrentDay(false);
document.getElementById("afBatchBtn").onclick = () => fetchAFForTopVisible();
document.getElementById("oddsKeyBtn").onclick = openApiKeysModal;
document.getElementById("autoCalToggle").onchange = e => { st.autoCal = e.target.checked; recalcAllPredictions(); syncSlipFromLeagues(); renderSchedule(); };
document.getElementById("marketBlendToggle").onchange = e => { st.useMarketBlend = e.target.checked; recalcAllPredictions(); syncSlipFromLeagues(); renderSchedule(); };
document.getElementById("onlyPlayableToggle").onchange = e => { st.onlyPlayable = e.target.checked; renderSchedule(); };
document.getElementById("onlyValueToggle").onchange = e => { st.onlyValue = e.target.checked; renderSchedule(); };
document.getElementById("sortFilter").onchange = e => {
  st.sort = e.target.value;
  document.getElementById("toggleAllBtn").classList.toggle("hidden", st.sort !== "league");
  renderSchedule();
};
document.getElementById("teamHistSearch").oninput = debounce(renderTeamLeaderboard, 150);
document.getElementById("minMatchesFilter").onchange = renderTeamLeaderboard;
document.getElementById("refreshBtn").onclick = () => loadDay(dayOffset(), true);
document.getElementById("searchInput").oninput = debounce(e => { st.search = e.target.value; renderSchedule(); }, 150);
document.getElementById("minConfSlider").oninput = e => { st.minConf = Number(e.target.value); document.getElementById("minConfLabel").textContent = st.minConf + "%"; renderSchedule(); };
document.getElementById("marketFilter").onchange = e => { st.market = e.target.value; renderSchedule(); };
document.getElementById("toggleAllBtn").onclick = e => {
  st.allCollapsed = !st.allCollapsed;
  st.collapsed = st.allCollapsed ? new Set(LEAGUES.map(l => l.id)) : new Set();
  e.target.textContent = st.allCollapsed ? "Espandi" : "Comprimi";
  renderSchedule();
};
document.getElementById("slipOpenBtn").onclick = openSlipModal;
document.getElementById("slipClearBtn").onclick = () => { SLIP.clear(); saveSlip(); renderSlipBar(); renderSchedule(); };
document.getElementById("closeModalBtn").onclick = closeModal;
document.getElementById("detailModal").onclick = e => { if (e.target.id === "detailModal") closeModal(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function shouldAutoRefreshToday() {
  if (!LEAGUES.length) return true;
  const now = Date.now();
  return LEAGUES.some(l => l.matches.some(m =>
    m.stateType === "in" || (m.stateType === "pre" && m.startTs && (m.startTs - now) <= 5 * 60 * 1000 && (now - m.startTs) <= 130 * 60 * 1000)
  ));
}

(async () => {
  const storagePromise = initStorage().then(() => {
    if (LEAGUES.length) { recalcAllPredictions(); syncSlipFromLeagues(); renderSchedule(); }
  });
  await Promise.race([storagePromise, new Promise(res => setTimeout(res, 1500))]);
  updateApiStatusBars();
  await loadDay(0);
  setInterval(() => {
    const modalOpen = !document.getElementById("detailModal").classList.contains("hidden");
    if (st.tab === "oggi" && !modalOpen && !document.hidden && shouldAutoRefreshToday()) loadDay(0, true);
  }, 60000);
})();
