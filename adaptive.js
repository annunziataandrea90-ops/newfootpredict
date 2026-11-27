/* V13 experimental: regularized conditional exponential model on joint scores.
   Training uses only historical final scores available before forecast day. */
const V13_KEY = 'fp_adaptive_v13_1';
const V13_FLAGS = (h,a) => [+(h>a), +(h===a), +(h+a>=2), +(h+a>=3), +(h+a<=3), +(h>0&&a>0)];
const V13_DIM = 6, V13_F = 6;
const v13Zero = () => Array.from({length:V13_DIM},()=>Array(V13_F).fill(0));
const v13Group = () => ({n:0,w:v13Zero(),base:0,alt:0,fastBase:0,fastAlt:0});
const v13Fresh = () => ({version:1,global:v13Group(),leagues:{},through:0});
let v13Model = v13Fresh();
const v13Features = (m,h,a) => [1,clamp(Math.log((h+a)/2.65),-1.5,1.5),clamp(Math.log(h/a),-2,2),clamp((safeNum(m.stats.hFF,1)-safeNum(m.stats.aFF,1))*3,-1,1),clamp(Math.log1p(Math.min(safeNum(m.stats.sampleH,0),safeNum(m.stats.sampleA,0)))/4,0,1),clamp(safeNum(m.stats.restDiff,0)/7,-1,1)];
const v13Dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
const v13Gate = g => g && g.n>=300 && g.alt < g.base*0.995 && g.fastAlt <= g.fastBase*1.03;
function v13Distribution(scores,m,h,a,model,at) {
  const f=v13Features(m,h,a), g=model.global, l=model.leagues[m.slug];
  const localWeight=l ? Math.min(0.65,l.n/(l.n+500)) : 0;
  const weights=g.w.map((w,i)=>v13Dot(w,f)+localWeight*(l?v13Dot(l.w[i],f):0));
  const base=Array(V13_DIM).fill(0), alt=Array(V13_DIM).fill(0);
  let z=0; const groups=new Map();
  for(const s of scores){ const key=(s.i>s.j?1:s.i===s.j?2:0)+(s.i+s.j>=2?4:0)+(s.i+s.j>=3?8:0)+(s.i+s.j<=3?16:0)+(s.i>0&&s.j>0?32:0); let q=groups.get(key); if(!q){const flags=V13_FLAGS(s.i,s.j);q={flags,p:0,mult:Math.exp(clamp(v13Dot(weights,flags),-3,3))};groups.set(key,q);} q.p+=s.p;s.v13q=q; }
  for(const q of groups.values()){z+=q.p*q.mult;for(let i=0;i<V13_DIM;i++)base[i]+=q.p*q.flags[i];}
  for(const q of groups.values())for(let i=0;i<V13_DIM;i++)alt[i]+=q.p*q.mult/z*q.flags[i];
  const active=v13Gate(g) && (!l || l.n<300 || v13Gate(l)) && (!at || (model.through<at && at-model.through<60*86400000));
  const mix=active?0.65:0;
  for(const s of scores){s.p*=1-mix+mix*s.v13q.mult/z;delete s.v13q;}
  return {f,base,alt,active,localWeight,league:m.slug};
}
function v13Learn(model,obs,h,a){
  const y=V13_FLAGS(h,a), l=model.leagues[obs.league] ||= v13Group();
  const b=y.reduce((sum,v,i)=>sum+(v-obs.base[i])**2,0)/V13_DIM;
  const p=y.map((v,i)=>0.35*obs.base[i]+0.65*obs.alt[i]);
  const e=y.reduce((s,v,i)=>s+(v-p[i])**2,0)/V13_DIM;
  for(const [g,scale] of [[model.global,1],[l,0.6]]){
    g.n++;const r=0.025*scale/Math.sqrt(1+g.n/3000);
    g.base+=(b-g.base)/g.n;g.alt+=(e-g.alt)/g.n;
    const alpha=g.n===1?1:0.025;g.fastBase+=(b-g.fastBase)*alpha;g.fastAlt+=(e-g.fastAlt)*alpha;
    for(let i=0;i<V13_DIM;i++)for(let j=0;j<V13_F;j++)g.w[i][j]=clamp(g.w[i][j]+r*((y[i]-obs.alt[i])*obs.f[j]-0.015*g.w[i][j]),-1.2,1.2);
  }
}
async function v13Load(){try{const m=await idbGet(V13_KEY);if(m?.version===1&&m.global?.w?.length===V13_DIM)v13Model=m;}catch(e){console.warn('ML load',e);}}
async function v13Save(m){await idbSet(V13_KEY,m);v13Model=m;}
function v13Status(){const g=v13Model.global;const el=document.getElementById('v13Status');if(!el)return;el.textContent=g.n?`ML: ${g.n.toLocaleString('it-IT')} match | Brier medio base ${g.base.toFixed(4)} / candidato ${g.alt.toFixed(4)} | recente ${g.fastBase.toFixed(4)} / ${g.fastAlt.toFixed(4)} | ${v13Gate(g)&&Date.now()-v13Model.through<60*86400000?'abilitato dove validato':'fallback statistico'} | ${new Date(v13Model.through).toLocaleDateString('it-IT')}`:'ML non addestrato: avvia la scansione storica. Modello statistico attivo.';}
function v13Rest(h,a,ts){const last=id=>{const m=getTeamHist()[id]?.m||[];for(let i=m.length-1;i>=0;i--){const t=Number(m[i].ts)||Date.parse(m[i].d);if(Number.isFinite(t)&&t+4*3600000<ts)return t;}return 0;};const x=last(h),y=last(a);return x&&y?(y-x)/86400000:0;}
