import sharp from 'sharp';
import { ocrPages } from './src/pdf/ocr-fallback.js';
const lines = [
 'A insuficiência cardíaca congestiva caracteriza-se pela incapacidade',
 'do coração de bombear sangue suficiente para atender às demandas',
 'metabólicas dos tecidos. Os principais sinais incluem dispneia,',
 'edema de membros inferiores e ortopneia. O tratamento envolve',
 'inibidores da ECA, betabloqueadores e diuréticos de alça (furosemida 40 mg).',
 'A fração de ejeção < 40% define disfunção sistólica; pH 7,35–7,45;',
 'Na+ 140 mEq/L; K+ 3,5–5,0; creatinina 1,2 mg/dL; PA 120/80 mmHg;',
 'FC 72 bpm; glicemia 98 mg/dL; hemoglobina 13,5 g/dL; INR 2,0–3,0.'];
const W=1240,H=760;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/>${lines.map((l,i)=>`<text x="40" y="${70+i*80}" font-size="30" font-family="Times New Roman">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text>`).join('')}</svg>`;
const base=await sharp(Buffer.from(svg)).png().toBuffer();
const V={
 limpo: await sharp(base).jpeg({quality:90}).toBuffer(),
 baixaRes: await sharp(base).resize(620).resize(W).jpeg({quality:60}).toBuffer(),
 girado3: await sharp(base).rotate(3,{background:'#fff'}).jpeg({quality:70}).toBuffer(),
 ruido: await sharp(base).blur(1.1).linear(0.7,40).jpeg({quality:35}).toBuffer(),
 foto: await sharp(base).rotate(-2,{background:'#ddd'}).blur(1.3).linear(0.6,70).resize(800).resize(W).jpeg({quality:30}).toBuffer(),
};
function pdf(jpg,H2){const o=[],p=[Buffer.from('%PDF-1.4\n')];const add=b=>{o.push(p.reduce((a,x)=>a+x.length,0));p.push(Buffer.isBuffer(b)?b:Buffer.from(b));};
add('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');add('2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n');
add(`3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H2}]/Contents 4 0 R/Resources<</XObject<</Im 5 0 R>>>>>>endobj\n`);
const c=`q ${W} 0 0 ${H2} 0 0 cm /Im Do Q`;add(`4 0 obj<</Length ${c.length}>>stream\n${c}\nendstream endobj\n`);
add(Buffer.concat([Buffer.from(`5 0 obj<</Type/XObject/Subtype/Image/Width ${W}/Height ${H2}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpg.length}>>stream\n`),jpg,Buffer.from('\nendstream endobj\n')]));
const b=Buffer.concat(p);return new Uint8Array(Buffer.concat([b,Buffer.from(`xref\n0 6\n0000000000 65535 f \n`+o.map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+`trailer<</Size 6/Root 1 0 R>>\nstartxref\n${b.length}\n%%EOF`)]));}
const tok=s=>s.split(/\s+/).filter(Boolean);
const T=tok(lines.join(' '));
function align(a,b){const m=a.length,n=b.length,d=Array.from({length:m+1},()=>new Array(n+1).fill(0));
 for(let i=0;i<=m;i++)d[i][0]=i;for(let j=0;j<=n;j++)d[0][j]=j;
 for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 const out=[];let i=m,j=n;while(i||j){if(i&&j&&d[i][j]===d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){if(a[i-1]!==b[j-1])out.push([a[i-1],b[j-1]]);i--;j--;}else if(i&&d[i][j]===d[i-1][j]+1){out.push([a[i-1],'∅']);i--;}else{out.push(['∅',b[j-1]]);j--;}}
 return out.reverse();}
const noAcc=s=>s.normalize('NFD').replace(/\p{M}/gu,'');
const dash=s=>s.replace(/[–—]/g,'-');
for(const [k,img] of Object.entries(V)){
 const got=tok(((await ocrPages(pdf(img,H),[1])).get(1))??'');
 const diffs=align(T,got); const c={pontuacao:0,acento:0,conteudo:0};const det=[];
 for(const [a,b] of diffs){let cls='conteudo';if(a!=='∅'&&b!=='∅'){if(dash(a)===b)cls='pontuacao';else if(noAcc(a)===noAcc(b))cls='acento';else if(a.replace(/[\p{P}]/gu,'')===b.replace(/[\p{P}]/gu,'')||a.replace(/[,.:;]/g,'')===b.replace(/[,.:;]/g,''))cls='pontuacao';}
  c[cls]++;det.push(`${a}→${b} [${cls}]`);}
 console.log(`${k}: ${T.length} palavras | divergentes ${diffs.length} (pontuação ${c.pontuacao}, acento ${c.acento}, conteúdo ${c.conteudo})`);
 for(const x of det) console.log('   ',x);
}
