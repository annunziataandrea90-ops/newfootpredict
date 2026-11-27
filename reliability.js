/* V15: prospective reliability audit; historical bins are descriptive, not match guarantees. */
function v15Wilson(hits, n) {
  if (!Number.isFinite(hits) || !Number.isFinite(n) || n <= 0 || hits < 0 || hits > n) return null;
  const z = 1.96, p = hits / n, d = 1 + z*z/n;
  return Math.max(0, (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n)))/d);
}
function v15Audit({pick, sample, conf, lowData, validMarket, marketDiv, calibrated, base, final, live}) {
  const reasons = [];
  if (!live) reasons.push('Analisi storica o partita non futura');
  if (!calibrated) reasons.push('Calibrazione non attiva');
  if (lowData || !Number.isFinite(sample) || sample < 10) reasons.push('Campione squadra insufficiente');
  if (!Number.isFinite(conf) || conf < 75) reasons.push('Qualità dati insufficiente');
  if (!validMarket) reasons.push('Riferimento mercato assente');
  else if (!Number.isFinite(marketDiv) || marketDiv > .10) reasons.push('Divergenza mercato elevata');
  if (!Number.isFinite(base) || !Number.isFinite(final) || Math.abs(base-final) > .08) reasons.push('Previsione instabile tra modelli');
  const bins = typeof V14_DATA !== 'undefined' ? V14_DATA.report.markets[pick.code]?.bins : null;
  const bin = Number.isFinite(final) && bins?.find(b => final >= b.lo - 1e-10 && (final < b.lo+.05-1e-10 || (final === 1 && b.lo >= .95)));
  const lower = bin ? v15Wilson(Math.round(bin.y*bin.n),bin.n) : null;
  if (!bin || bin.n < 100) reasons.push('Fascia storica poco rappresentata');
  if (!Number.isFinite(final) || final < .80) reasons.push('Probabilità stimata sotto 80%');
  if (lower === null || lower < .75) reasons.push('Evidenza storica insufficiente');
  return {version:'15.0', passed:reasons.length===0, reasons, sample, historicalN:bin?.n ?? 0, historicalRate:bin?.y ?? null, historicalLower:lower, modelDelta:Number.isFinite(base)&&Number.isFinite(final)?Math.abs(base-final):null};
}
function v15Render() {
  const el = document.getElementById('v15Panel'); if (!el) return;
  let n=0, passed=0, hits=0, brier=0, allHits=0;
  for(const s of Object.values(predictionSnapshots)) {
    const a=s.v15, r=s.result;
    if(!a || !r || !Number.isFinite(a.capturedAt) || a.capturedAt >= s.startTs || !Number.isFinite(a.prob)) continue;
    const y=Number(isHit(a.code,r.h,r.a)); n++; allHits+=y;
    if(a.audit.passed){passed++;hits+=y;brier+=(a.prob-y)**2;}
  }
  const pct=(x,d)=>d?(100*x/d).toFixed(1)+'%':'—';
  el.textContent=`V15 · Audit prospettico (prima previsione, ultimi 180 giorni). Risolti: ${n}; con controlli superati: ${passed} (${pct(passed,n)}); frequenza esiti corretti: ${pct(hits,passed)}; tutti: ${pct(allHits,n)}; Brier gruppo controllato: ${passed?(brier/passed).toFixed(4):'—'}. Fasce V14 indicative, non garanzia individuale. Soglie V15 da validare su nuovi dati.`;
}
