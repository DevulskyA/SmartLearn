/** SmartLearn analytics: pure, deterministic selectors. Evidence is the authority;
 * study dates anchor classes, answer dates anchor performance/trends. */
import { aggregateEvidence, evidenceBand, normalizeSearch, validDate, sortByColumn } from './model.mjs';
import { trendOfEvidence, lastEvidenceDate, dailyEvidence } from './telemetry.mjs';

export const BAND_LABELS_V5 = Object.freeze({
  critical:'Crítico', attention:'Atenção', adequate:'Adequado', strong:'Forte', insufficient:'Pouca evidência',
});
const TREND_ORDER = Object.freeze({ DECLINING: 0, STABLE: 1, IMPROVING: 2, INSUFFICIENT: 3 });
const byDateDesc = (a,b) => (b ?? '').localeCompare(a ?? '');
const normalizedTitle = title => normalizeSearch(title).replace(/\s+/g,' ');
const validAnswer = e => e && e.id != null && validDate(e.date) && Number.isInteger(e.questions) && e.questions>0 && Number.isInteger(e.correct) && e.correct>=0 && e.correct<=e.questions;
const band = r => evidenceBand(r.questions,r.accuracy).key;
const stableLabel = (a,b) => a.localeCompare(b,'pt-BR',{sensitivity:'base',numeric:true});
export function buildStatsV5({ subjects, units, evidence, reviews=[], today, period='90' }) {
  if (!validDate(today)) throw new RangeError('today must be an ISO date');
  if (!Array.isArray(subjects)||!Array.isArray(units)||!Array.isArray(evidence)) throw new TypeError('Stats collections must be arrays');
  const cut = period === 'all' ? '0000-01-01' : (()=>{ const date=new Date(`${today}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-Number(period));return date.toISOString().slice(0,10) })();
  const orderedSubjects = subjects.map(s=>({...s}));
  const subjectById = new Map(orderedSubjects.map(s=>[Number(s.id),s]));
  const unitById = new Map(units.map(u=>[Number(u.id),u]));
  const scope = e=> Number(unitById.get(Number(e.unitId))?.subjectId??e.subjectId);
  const uniq = new Set();
  const history = evidence.filter(validAnswer).filter(e=>e.date<=today).filter(e=>{const id=String(e.id);if(uniq.has(id))return false;uniq.add(id);return true});
  const within = history.filter(e=>e.date>=cut);
  const groupedSubject = new Map(orderedSubjects.map(s=>[Number(s.id),{within:[],history:[],units:[]}]));
  const groupedUnit = new Map(units.map(u=>[Number(u.id),{within:[],history:[]} ]));
  for(const u of units) groupedSubject.get(Number(u.subjectId))?.units.push(u);
  for(const e of history){
    const s=groupedSubject.get(scope(e));if(s)s.history.push(e);
    const u=groupedUnit.get(Number(e.unitId));if(u)u.history.push(e);
    if(e.date>=cut){if(s)s.within.push(e);if(u)u.within.push(e)}
  }
  const subjectsRows = orderedSubjects.map(s=>{
    const g=groupedSubject.get(Number(s.id));const totals=aggregateEvidence(g?.within??[]);
    const t=trendOfEvidence(g?.history??[],today);
    return {...s,subjectId:Number(s.id), subjectName:s.name, ...totals,
      unitsCount:g?.units.length??0,lastEvidenceDate:lastEvidenceDate(g?.history??[]),trend:t,trendScore:TREND_ORDER[t.direction],
      band:band(totals), studyDate:g?.units.map(u=>u.studyDate).filter(validDate).sort().at(-1)??null,
      firstUnitId:g?.units[0]?.id??null};
  });
  const lessonRows = units.map(u=>{
    const subj=subjectById.get(Number(u.subjectId));const g=groupedUnit.get(Number(u.id));const totals=aggregateEvidence(g?.within??[]);
    const t=trendOfEvidence(g?.history??[],today);
    return {...u, subjectName:subj?.name??'Sem disciplina',subjectColor:subj?.color??'#7b62bd',...totals,
      band:band(totals),lastEvidenceDate:lastEvidenceDate(g?.history??[]),trend:t,trendScore:TREND_ORDER[t.direction],
      unitIds:[u.id],unitCount:1};
  });
  const contents=new Map();
  for(const u of lessonRows){const key=`${u.subjectId}:${normalizedTitle(u.title)}`;
    if(!contents.has(key))contents.set(key,{subjectId:u.subjectId,subjectName:u.subjectName,subjectColor:u.subjectColor,title:u.title,
      unitIds:[],units:[],studyDate:null,latestLessonDate:null,sourceText:u.sourceText??'',archived:true});
    const g=contents.get(key);g.unitIds.push(u.id);g.units.push(u);g.archived=g.archived&&Boolean(u.archived);
    if(validDate(u.studyDate)&&(!g.studyDate||u.studyDate>g.studyDate))g.studyDate=u.studyDate;
    if(validDate(u.lessonDate)&&(!g.latestLessonDate||u.lessonDate>g.latestLessonDate))g.latestLessonDate=u.lessonDate;
  }
  const contentRows=[...contents].map(([key,c])=>{
    const ids=new Set(c.unitIds.map(Number)),groupHistory=history.filter(e=>ids.has(Number(e.unitId))),groupPeriod=groupHistory.filter(e=>e.date>=cut);
    const totals=aggregateEvidence(groupPeriod),t=trendOfEvidence(groupHistory,today);
    return {...c,id:key,unitCount:c.unitIds.length,...totals,band:band(totals),lastEvidenceDate:lastEvidenceDate(groupHistory),trend:t,trendScore:TREND_ORDER[t.direction]};
  });
  const totals=aggregateEvidence(within);
  const activeReviews=reviews.filter(r=>!r.archived);
  return {period,from:cut,today,within,history,subjects:subjectsRows,lessons:lessonRows,contents:contentRows,
    totals, withEvidence:subjectsRows.filter(r=>r.questions>0).length,
    attention:subjectsRows.filter(r=>['critical','attention'].includes(r.band)).length,
    completedReviews:activeReviews.filter(r=>r.done).length,pendingReviews:activeReviews.filter(r=>!r.done).length,
    daily:dailyEvidence(within)};
}

/** Missing evidence always last; tie-breaking is stable and deterministic. */
export function sortStatsV5(rows,key='accuracy',ascending=true){
  const keys=new Set(['name','subjectName','title','studyDate','lessonDate','lastEvidenceDate','questions','correct','accuracy','unitsCount','unitCount','trendScore']);
  if(!keys.has(key))throw new RangeError('Unsupported stats sort: '+key);
  if(key==='unitCount'||key==='correct'||key==='lessonDate'){
    const col=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
    const arr=rows.map((r,i)=>({r,i}));return arr.sort((a,b)=>{
      const x=a.r[key],y=b.r[key],mx=x==null||x==='',my=y==null||y==='';
      if(mx||my)return mx===my?a.i-b.i:mx?1:-1;
      const d=typeof x==='number'&&typeof y==='number'?x-y:col.compare(String(x),String(y));
      return (ascending?d:-d)||a.i-b.i;
    }).map(x=>x.r);
  }
  return sortByColumn(rows,key,ascending);
}

export function filterStatsV5(rows,{subjectId=0,band='all',trend='all',query='',includeArchived=true}={}){
  return rows.filter(r=>(!subjectId||Number(r.subjectId??r.id)===Number(subjectId))
    &&(band==='all'||r.band===band)&&(trend==='all'||r.trend?.direction===trend)
    &&(includeArchived||!r.archived)
    &&(!query||normalizeSearch(`${r.name??''} ${r.subjectName??''} ${r.title??''} ${r.studyDate??''} ${r.lessonDate??''}` ).includes(normalizeSearch(query))));
}
export function rankStatsV5(rows,{worst=false,limit=null}={}){
  const measured=rows.filter(r=>r.questions>=10&&Number.isFinite(r.accuracy));
  const sorted=sortStatsV5(measured,'accuracy',worst);
  const stable=sorted.sort((a,b)=>a.accuracy===b.accuracy ? stableLabel(a.subjectName??a.name,b.subjectName??b.name) : 0);
  return limit==null?stable:stable.slice(0,limit);
}
export function modelStatsExport(rows,mode){
  const heading=['Disciplina','Conteúdo / Aula','Data de estudo','Última resposta','Questões','Acertos','Desempenho %','Tendência','Aulas'];
  const values=rows.map(r=>[r.subjectName??r.name??'',mode==='subject'?'':r.title??'',r.studyDate??'',r.lastEvidenceDate??'',r.questions??0,r.correct??0,r.accuracy==null?'':r.accuracy.toFixed(2),r.trend?.direction??'INSUFFICIENT',r.unitCount??r.unitsCount??'']);
  return [heading,...values];
}
