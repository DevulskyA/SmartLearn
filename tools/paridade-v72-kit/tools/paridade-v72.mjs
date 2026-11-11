#!/usr/bin/env node
/** SmartLearn Visual Parity Gate V7.2 — read-only, local Playwright. No DB writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'..');
const defs=['today','materials','plan','stats','settings','account','register','study-now','exam'];
const args={app:'http://127.0.0.1:5188',screens:'today,materials,plan,stats,settings,account',widths:'897,1440',out:path.join(os.tmpdir(),`smartlearn-parity-v72-${Date.now()}`)};
for(let i=2;i<process.argv.length;i++) {
  const key=process.argv[i].replace(/^--/,'');
  if(key==='help') { console.log('node tools/paridade-v72.mjs --app http://127.0.0.1:5188 [--screens settings|today,materials,...|all] [--widths 897,1440] [--state <playwright-storageState.json>] [--out <pasta temporaria>]');process.exit(0); }
  if(!(key in args) && key!=='state') throw new Error(`Argumento desconhecido: --${key}`);
  args[key]=process.argv[++i];
}
if(!args.app.startsWith('http://127.0.0.1:')&&!args.app.startsWith('http://localhost:')) throw new Error('Somente preview local loopback; nao use producao ou IP externo.');
const screens=args.screens==='all'?defs:args.screens.split(',').map(s=>s.trim());
for(const s of screens) if(!defs.includes(s)) throw new Error(`Tela invalida: ${s}`);
const widths=args.widths.split(',').map(Number);for(const w of widths)if(![897,1440].includes(w))throw new Error('Somente larguras da referencia: 897 e 1440.');
const req=createRequire(import.meta.url);
let chromium;
try { chromium=req(req.resolve('@playwright/test',{paths:[process.cwd(),root]})).chromium; }
catch(e) { throw new Error('Necessario @playwright/test do projeto. Execute a partir da pasta SmartLearn que ja tem npm install.'); }
const browser=await chromium.launch({headless:true});
const rows=[];
const inventoryScript=(screen) => {
 const root=document.querySelector('#screen-'+screen);
 const found=Boolean(root && root.getBoundingClientRect().width>0 && root.getBoundingClientRect().height>0);
 const records=[];
 if(root) for(const e of root.querySelectorAll('h1,h2,h3,button,select,input,textarea,summary,[role="tab"],[role="switch"]')) {
   const b=e.getBoundingClientRect(), style=getComputedStyle(e);
   if(b.width<1 || b.height<1 || e.hidden || style.visibility==='hidden' || style.display==='none') continue;
   const label=(e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '').trim().replace(/\s+/g,' ').slice(0,120);
   records.push({role:e.tagName.toLowerCase(),id:e.id||null,label,x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height),background:style.backgroundColor,color:style.color,font:style.fontSize});
 }
 const rg=(sel)=>root?[...root.querySelectorAll(sel)].filter(e=>e.getBoundingClientRect().width>1 && e.getBoundingClientRect().height>1).length:0;
 const themeButtons=root?[...root.querySelectorAll('#theme-picker button')].filter(e=>e.getBoundingClientRect().width>1):[];
 const xLight=themeButtons.slice(1,10).map(e=>Math.round(e.getBoundingClientRect().x));
 const themeColumns=[...new Set(xLight)].length;
 return {screen,found,viewport:{width:innerWidth,height:innerHeight},selectedTheme:document.documentElement.getAttribute('data-theme')||'',themeColumns,totals:{headings:rg('h1,h2,h3'),buttons:rg('button'),inputs:rg('input:not([type=hidden])'),selects:rg('select'),cards:rg('.settings-card'),themeOptions:themeButtons.length,themeSwatches:rg('.sl-theme-swatch')},themeGroups:screen==='settings'?[...root.querySelectorAll('.sl-theme-group')].map(g=>({name:g.querySelector('h3')?.textContent.trim(),items:g.querySelectorAll('button').length})):[],elements:records};
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
const omitLang=q=>q.replace(/\b(nenhuma|sem dados|demo)\b/g,'').trim();
function compare(ref,actual) {
 const differences=[];
 if(!actual.found)differences.push('Painel nao ficou visivel apos navegacao.');
 for(const typ of ['headings','buttons','inputs','selects']) {
  const a=ref.totals[typ],b=actual.totals[typ];
  if(a>b)differences.push(`${typ}: ${a} referencia, ${b} atual (omissoes possiveis; verificar dados/estado).`);
  if(a<b)differences.push(`${typ}: ${a} referencia, ${b} atual (extras podem ser funcoes nativas legitimas).`);
 }
 if(ref.screen==='settings') {
  const a=ref.totals.themeOptions,b=actual.totals.themeOptions;
  if(a!==b)differences.push(`Temas: ${a} opcoes na V7.2; ${b} na aplicacao.`);
  const cols=ref.viewport.width===897?3:4;
  if(actual.themeColumns!==cols)differences.push(`Layout das opcoes claras: ${cols} colunas na V7.2, ${actual.themeColumns} colunas na aplicacao.`);
  if(actual.totals.themeSwatches!==24)differences.push(`Miniaturas: a V7.2 possui 24 componentes .sl-theme-swatch com desenho especifico; atual ${actual.totals.themeSwatches}.`);
  const expectedGroups=ref.themeGroups.map(x=>`${x.name}=${x.items}`).join('; ');
  if(actual.themeGroups.length) {
    const found=actual.themeGroups.map(x=>`${x.name}=${x.items}`).join('; ');
    if(found!==expectedGroups)differences.push(`Grupos de temas divergentes: referencia ${expectedGroups}; atual ${found}.`);
  }
 }
 const headings=ref.elements.filter(x=>x.role==='h1'||x.role==='h2'||x.role==='h3');
 for(const el of headings) {
   if(!el.label)continue;
   const match=actual.elements.find(x=>x.role===el.role && norm(x.label)===norm(el.label));
   if(!match)differences.push(`Titulo ausente/diferente: ${el.role} "${el.label.slice(0,65)}".`);
   else if(Math.abs(match.x-el.x)>48||Math.abs(match.y-el.y)>80)differences.push(`Titulo fora de posicao: "${el.label.slice(0,42)}" difere ${match.x-el.x}px horizontal, ${match.y-el.y}px vertical.`);
 }
 const sharedIDs=ref.elements.filter(x=>x.id&&['button','input','select'].includes(x.role));
 const missingIDs=sharedIDs.filter(x=>!actual.elements.some(y=>y.id===x.id));
 if(missingIDs.length)differences.push('IDs visiveis divergentes: '+missingIDs.slice(0,12).map(x=>x.id).join(', ')+(missingIDs.length>12?` (+${missingIDs.length-12})`:''));
 // Geometria and pixels are *not* automatic proof; all screens require the image comparison.
 return differences;
}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
await fs.mkdir(args.out,{recursive:true});
try{
 for(const width of widths){
  const height=width===897?713:900;
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,...(args.state?{storageState:path.resolve(args.state)}:{})});
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=500)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
  for(const screen of screens){
   const basename=`${screen}-${width}`;
   const ref=JSON.parse(await fs.readFile(path.join(root,'reference',basename+'.json'),'utf8'));
   const targetImage=path.join(args.out,basename+'-app.png');
   const refImage=path.join(args.out,basename+'-ref.png');
   let status='capturado', diff=[], actual=null, note='';
   try{
    if(page.url()==='about:blank'||screen==='today') await page.goto(args.app,{waitUntil:'domcontentloaded',timeout:20000});
    if(screen==='study-now'||screen==='exam'){
      note='Exige jornada real ate este painel; executar helper E2E da aplicacao para abri-lo.';
      status='BLOQUEADO_FLUXO';
    } else if(screen==='register'){
      await page.evaluate(()=>{location.hash='#register';});
      await page.waitForTimeout(180);
    } else {
      const nav=page.locator(`[data-screen="${screen}"]`).first();
      if(await nav.count() && await nav.isVisible()) await nav.click({timeout:8000});
      else { await page.evaluate(s=>{location.hash='#'+s;},screen);await page.waitForTimeout(200); }
    }
    await page.waitForTimeout(320);
    actual=await page.evaluate(inventoryScript,screen);
    if(!actual.found){status=status==='BLOQUEADO_FLUXO'?status:'BLOQUEADO_NAVEGACAO';note||='Tela nao visivel (sessao, login ou rota).';}
    if(actual.found){await page.screenshot({path:targetImage,fullPage:true,animations:'disabled'});}
    diff=compare(ref,actual);
    await fs.writeFile(path.join(args.out,basename+'-app.json'),JSON.stringify(actual,null,2));
    await fs.copyFile(path.join(root,'reference',basename+'.png'),refImage);
    if(errors.length)diff.push('Erros durante captura: '+errors.slice(-3).join('; ').slice(0,280));
    console.log(`${width} ${screen}: ${status}; divergencias estruturais=${diff.length}${note?'; '+note:''}`);
   }catch(e){status='BLOQUEADO_ERRO';note=String(e.message).slice(0,250);console.warn(`${width} ${screen}: ${note}`);}
   rows.push({width,screen,status,diff,note,refImage:path.basename(refImage),targetImage:path.basename(targetImage),actual});
  }
  await ctx.close();
 }
}finally{await browser.close();}
const styles=`body{font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#24242b;background:#f2f3fa;margin:0;padding:24px}main{max-width:1250px;margin:auto}.box{background:#fff;border:1px solid #d8dce6;border-radius:12px;padding:20px;margin:18px 0}h1{font-size:28px}h2{font-size:18px;margin:0 0 8px}.muted{color:#616975}summary{cursor:pointer;font-weight:650}img{display:block;max-width:100%;border:1px solid #d4d7e0}.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}code{background:#f0f2f6;padding:2px 4px;border-radius:4px}li{margin:4px 0}.overlay{position:relative;max-width:897px;margin-top:12px}.overlay img{width:100%;height:auto}.overlay .target{position:absolute;inset:0;opacity:0.5}.hint{padding:12px 14px;border-left:4px solid #7250ca;background:#f5f1ff}.tag{font-size:12px;font-weight:700;color:#603cad}@media(max-width:720px){.cols{grid-template-columns:1fr}}`;
const sections=rows.map((r,i)=>`<section class="box"><h2>${esc(r.screen)} · ${r.width}px <span class="tag">${esc(r.status)}</span></h2><p class="muted">${r.diff.length} diferenças sinalizadas · verificar imagem e funções independentemente</p>${r.note?`<p class="hint">${esc(r.note)}</p>`:''}<details ${r.diff.length?'open':''}><summary>Inventário e divergências (${r.diff.length})</summary><ul>${r.diff.map(d=>`<li>${esc(d)}</li>`).join('')||'<li>Nenhuma divergência detectada pelo inventário básico. A comparação visual continua obrigatória.</li>'}</ul></details><div class="cols"><div><p><b>Referência V7.2</b></p><img src="${esc(r.refImage)}" alt="Referência ${esc(r.screen)}"></div><div><p><b>Aplicação local</b></p>${r.actual?.found?`<img src="${esc(r.targetImage)}" alt="Implementação ${esc(r.screen)}">`:'<p>Captura indisponível — verificar login/fluxo</p>'}</div></div>${r.actual?.found?`<details><summary>Sobreposição (alinhamento visual)</summary><p>Arraste para variar a transparência da implementação.</p><input type="range" min="0" max="100" value="50" oninput="document.getElementById('overlay-${i}').style.opacity=this.value/100"><div class="overlay"><img src="${esc(r.refImage)}"><img id="overlay-${i}" class="target" src="${esc(r.targetImage)}"></div></details>`:''}</section>`).join('');
const report=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SmartLearn · Paridade V7.2</title><style>${styles}</style><main><h1>SmartLearn V7.2 — verificador de paridade</h1><p class="hint"><b>Fonte de verdade:</b> HTML V7.2 e manifestos/capturas gerados diretamente da referência. <b>Comparação apenas:</b> nenhuma alteração de código, banco ou login. Contagens são indícios, não aprovação. Um controle extra pode ser uma função nativa necessária.</p><p class="muted">Execução local: ${esc(args.app)}. Dados potencialmente privados nas capturas: mantenha este relatório fora do Git e não o compartilhe sem anonimizar.</p>${sections}</main></html>`;
await fs.writeFile(path.join(args.out,'report.html'),report,'utf8');
await fs.writeFile(path.join(args.out,'results.json'),JSON.stringify(rows.map(({actual,...rest})=>rest),null,2),'utf8');
console.log('\nRELATORIO:',pathToFileURL(path.join(args.out,'report.html')).href);
console.log('Estados BLOQUEADO exigem resolucao no fluxo de autenticacao ou E2E, nunca aprovacao presumida.');
