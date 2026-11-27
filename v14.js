/* Frozen V14 marginal calibration + shadow monitor. */
function v14Candidate(pred, league) {
  const raw = buildPickMap(pred), out = {};
  for (const k of Object.keys(V14_DATA.report.markets)) {
    const p = raw[k]; if (!Number.isFinite(p)) continue;
    const m = V14_DATA.models[k];
    if (!m) { out[k] = p; continue; }
    const x = Math.min(1 - 1e-5, Math.max(1e-5, p));
    out[k] = 1 / (1 + Math.exp(-(m.a + m.b * Math.log(x / (1 - x)) + (Object.hasOwn(m.offsets, league) ? m.offsets[league] : 0))));
  }
  return out;
}

function v14Capture(m) {
  if (typeof V14_DATA === "undefined" || !m.prediction || m.stateType !== 'pre' || Date.now() >= m.startTs) return;
  const snap = predictionSnapshots[String(m.id) + ':' + String(m.startTs)];
  if (!snap || snap.v14 || m.startTs <= Date.parse(V14_DATA.report.end + 'T23:59:59Z')) return;
  const src = m.prediction.v13Base || m.prediction;
  snap.v14 = {
    version: 1,
    capturedAt: Date.now(),
    base: buildPickMap(src),
    candidate: v14Candidate(src, m.leagueName),
    league: m.leagueName
  };
}

function v14Render() {
  const el = document.getElementById('v14Panel'); if (!el) return;
  if (typeof V14_DATA === 'undefined') { el.textContent = 'Modello V14 non caricato: controllare v14-model.js.'; return; }
  const r = V14_DATA.report, fmt = x => Number(x).toFixed(5), pct = x => (100 * x).toFixed(2) + '%';
  let liveN = 0, lb = 0, lc = 0, ln = 0;
  for (const s of Object.values(predictionSnapshots)) {
    if (!s.result || !s.v14 || s.v14.capturedAt >= s.startTs) continue;
    let valid = 0;
    for (const k of Object.keys(r.markets)) {
      const p = s.v14.base[k], q = s.v14.candidate[k];
      if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
      const y = Number(isHit(k, s.result.h, s.result.a));
      lb += (p - y) ** 2; lc += (q - y) ** 2; ln++; valid++;
    }
    if (valid) liveN++;
  }
  const win = w => w === null ? 'Base' : w === 0 ? 'Max' : w + 'a';
  const table = Object.entries(r.markets).map(([k, m]) => `<tr><td>${esc(k)}</td><td>${fmt(m.base)}</td><td>${fmt(m.candidate)}</td><td>${pct(m.skill)}</td><td>${win(m.window)}${m.halfLife ? ' / 365g' : ''}${m.local ? ' / lega' : ''}</td></tr>`).join('');
  const sel = document.getElementById('v14Market')?.value || 'Over 1.5';
  const m = r.markets[sel] || r.markets['Over 1.5'];
  const bands = m.bins.map(b => `<tr><td>${Math.round(100 * b.lo)}–${Math.round(100 * (b.lo + .05))}%</td><td>${b.n}</td><td>${pct(b.p)}</td><td>${pct(b.y)}</td></tr>`).join('');
  el.innerHTML = `<div class="font-bold text-emerald-300">V14 · Calibrazione attiva (IPF) + Shadow Monitor</div><div class="text-slate-400">${r.train} training / ${r.validation} validazione / ${r.test} test | test dal ${r.testStart} al ${r.end}.</div><div class="font-bold">Brier V13 ${fmt(r.meanBase)} → V14 ${fmt(r.meanCandidate)} | riferimento ${fmt(r.meanReference)}</div><div>Live V14: ${liveN} partite / ${ln} esiti ${ln ? '| Brier base ' + fmt(lb / ln) + ' / V14 ' + fmt(lc / ln) : '| in attesa di risultati'}</div><div class="overflow-x-auto"><table class="w-full text-left"><thead><tr><th>Mercato</th><th>V13</th><th>V14</th><th>Skill</th><th>Finestra</th></tr></thead><tbody>${table}</tbody></table></div><label>Calibrazione test: <select id="v14Market" class="bg-slate-900" onchange="v14Render()">${Object.keys(r.markets).map(k => `<option ${k === sel ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label><div class="overflow-x-auto"><table class="w-full text-left"><thead><tr><th>Fascia</th><th>N</th><th>Previsto</th><th>Reale</th></tr></thead><tbody>${bands}</tbody></table></div><div>Finestre: Brier validazione 1a ${fmt(m.windows['1'])} | 3a ${fmt(m.windows['3'])} | 5a ${fmt(m.windows['5'])} | max ${fmt(m.windows['0'])}</div><div class="text-amber-300">Calibrazione marginale proiettata via IPF sulla matrice congiunta; monitoraggio live su snapshot pre-partita attivo.</div>`;
}