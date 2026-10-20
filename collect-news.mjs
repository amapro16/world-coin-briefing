import fs from 'node:fs/promises';

// RSS 기본 해석: 별도 npm 패키지가 필요하지 않습니다.
const text=(s='')=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>{const n=s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):Number(s);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,s)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[s])).replace(/\s+/g,' ').trim();
const tag=(s,n)=>s.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`,'i'))?.[1]||'';
const validUrl=s=>{try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const sources=[{name:'CoinWeek',url:'https://coinweek.com/feed/'},{name:'CoinNews.net',url:'https://www.coinnews.net/feed/'}];
const errors=[];
const results=await Promise.all(sources.map(async source=>{
 try{
  const response=await fetch(source.url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'WorldCoinBriefing/0.1 (RSS reader)'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const xml=await response.text();if(!/<rss\b|<feed\b|<rdf:RDF\b/i.test(xml))throw Error('RSS 형식이 아닙니다.');
  const articles=[...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(([, ,item])=>{
   const title=text(tag(item,'title'));const excerpt=text(tag(item,'description')||tag(item,'summary'));
   const link=validUrl(text(tag(item,'link'))||item.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]);
   const rawDate=text(tag(item,'pubDate')||tag(item,'published')||tag(item,'updated'));
   const published=Number.isFinite(Date.parse(rawDate))?new Date(rawDate).toISOString():null;
   const content=title+' '+excerpt;
   const category=/tax|legislat|regulat|policy|tariff/i.test(content)?'제도·정책':/sales|demand|sold|sellout/i.test(content)?'판매·수요':'신제품·발행';
   return {title,url:link,published,publisher:source.name,category,summary:'한국어 요약 연결 전입니다. 아래는 RSS에서 제공한 원문 발췌입니다.\n\n'+(excerpt.slice(0,900)||'발췌문이 없습니다. 원문 기사에서 확인하세요.'),keywords:['불리온 관련 후보','자동 분류·확인 필요'],figures:[],_content:content};
  }).filter(a=>a.title&&a.url&&/bullion|gold\s+coins?|silver\s+coins?|krugerrand|maple leaf|britannia|american eagle/i.test(a._content));
  console.log(source.name+': 관련 후보 '+articles.length+'건');return articles;
 }catch(error){errors.push(source.name+': '+error.message);return [];}
}));
if(errors.length===sources.length)throw Error('모든 출처 수집 실패. 기존 화면을 유지합니다. '+errors.join(' / '));
const seen=new Set();
const articles=results.flat().sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0)).filter(a=>{const key=a.title.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,20).map(({_content,...a})=>a);
// 첫 연결 테스트에서는 RSS에 현재 제공되는 기사만 확인합니다.
// 48시간 재검색, 사건별 병합, AI 분류와 한국어 요약은 후속 단계입니다.
const data={generatedAt:new Date().toISOString(),demo:false,errors,articles};
let html=await fs.readFile('index.html','utf8');
if(!html.includes('briefing-data')||!html.includes('function show(data)'))throw Error('버튼이 활성화된 최신 index.html이 필요합니다.');
html=html.replace(/<script id="briefing-data" type="application\/json">[\s\S]*?<\/script>\s*/g,'');
const json=JSON.stringify(data).replace(/</g,'\\u003c');
html=html.replace('<script>','<script id="briefing-data" type="application/json">'+json+'</script>\n<script>');
html=html.replace(/<div id="status" role="status" aria-live="polite">[\s\S]*?<\/div>/,'<div id="status" role="status" aria-live="polite">'+(errors.length?'일부 출처 수집 실패 — 자세한 내용은 Actions 실행 기록을 확인하세요.':'RSS 연결 확인 단계 · 한국어 요약 연결 전')+'</div>');
await fs.writeFile('news.json',JSON.stringify(data,null,2));
await fs.writeFile('index.html',html);
for(const error of errors)console.warn(error);
console.log('화면 갱신 완료: '+articles.length+'건. 한국어 요약은 아직 연결 전입니다.');
