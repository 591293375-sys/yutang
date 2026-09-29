import {blockedAt,pointInPolygon,waterBoundary,shoreDistance,POOL} from './geometry.js';
import {emptyDrawing,normalizeDrawing,hasDrawing,jsonBytes} from './letter-drawing.js';
import {CURATED_LETTERS,CURATED_LETTERS_BY_ID} from './letter-catalog.js';
import {validTideArrivalKey} from './tide.js';

export const BOTTLE_STORAGE_KEY='mofish-bottles-v1';
export const BOTTLE_LIMITS=Object.freeze({incoming:1,outgoing:2,collection:100,sent:100,body:600,signature:24,storageBytes:1500000});
const MINUTE=60000;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const text=(v,max)=>typeof v==='string'?v.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,max):'';
const idValid=v=>typeof v==='string'&&/^[\w:-]{1,100}$/.test(v);
const copy=v=>JSON.parse(JSON.stringify(v));
const storageDefault=()=>{try{return globalThis.localStorage}catch{return null}};
const ok=(message,extra={})=>({ok:true,message,...extra});
const fail=message=>({ok:false,message});

// Original, bundled fiction. These are never described as messages from other users.
export const SHORE_LETTERS=Object.freeze([
 {title:'今天，也可以慢一点',body:'潮水没有催过哪一枚贝壳。\n\n如果今天有许多事情等着你，先把肩膀放松，看看这一小片海。再走一步也好，歇一会儿也好。',signature:'海边手记'},
 {title:'留一点空白',body:'石头之间留着缝，浪花才有地方经过。\n\n今天的安排里，也给自己留一道小小的空隙吧。什么都不用完成。',signature:'海边手记'},
 {title:'一枚普通的贝壳',body:'今天捡到的贝壳没有特别的花纹，但放在掌心，刚好。\n\n有些欢喜很小，小到不用向谁解释。愿你也遇见属于自己的那一枚。',signature:'海边手记'},
 {title:'海风路过',body:'风把潮线边的脚印轻轻抚平，又把一声鸟鸣送到更远的地方。\n\n让那些暂时想不明白的事，也吹一会儿风。',signature:'海边手记'},
 {title:'退潮以后',body:'海退开一点，藏着的小世界就露出一点。\n\n有时慢下来，才能看见一直在身旁的细小光亮。',signature:'海边手记'},
 {title:'借你一片蓝',body:'这封信里没有需要回复的问题。\n\n只是借你一片浅浅的蓝，一阵缓缓的浪，以及一个可以安静待着的下午。',signature:'海边手记'},
 {title:'下一阵浪',body:'刚才那朵浪花已经散开，下一阵正在远处赶来。\n\n不必把每一刻都留住。此刻听见它，就已经很好。',signature:'海边手记'},
 {title:'小小的归处',body:'螃蟹找到一条石缝，小鱼回到清凉的水里。\n\n愿你忙了一天之后，也有一处能把心轻轻放下的地方。',signature:'海边手记'},
]);

const sea=waterBoundary(0);
function seaPoint(x,y){return !blockedAt(x,y)&&!pointInPolygon(x,y,POOL)&&pointInPolygon(x,y,sea)}
// Float inside permanent sea water: a changing tide can never strand or teleport it.
export function bottleWaterPoint(x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 for(const [dx,dy]of[[0,0],[23,0],[-23,0],[0,23],[0,-23],[16,16],[-16,16],[16,-16],[-16,-16]])if(!seaPoint(x+dx,y+dy))return false;
 return true;
}
export function bottleWaterPath(a,b){
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/6));
 for(let i=0;i<=steps;i++)if(!bottleWaterPoint(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
 return true;
}
let waterGrid=null;
function grid(){
 if(waterGrid)return waterGrid;
 const nodes=new Map(),step=28;
 // Cover cropping on a 390×844 viewport exposes world x≈592..1008.
 // Keep the whole 23px bottle footprint in a central connected sea corridor,
 // including its resting place; passing briefly through the crop is not enough.
 for(let y=28;y<880;y+=step)for(let x=28;x<1580;x+=step)if(x>=660&&x<=940&&bottleWaterPoint(x,y))nodes.set(`${x},${y}`,{x,y,key:`${x},${y}`,edges:null});
 const edges=node=>node.edges??(node.edges=[[-step,0],[step,0],[0,-step],[0,step],[-step,-step],[step,-step],[-step,step],[step,step]].map(([dx,dy])=>nodes.get(`${node.x+dx},${node.y+dy}`)).filter(n=>n&&bottleWaterPath(node,n)));
 const entries=[...nodes.values()].filter(n=>n.y===56&&n.x>810);
 // These shore-side cells stay above the mobile bottom controls. Outgoing
 // bottles use the reversed route, so their launch point is visible too.
 const shores=[...nodes.values()].filter(n=>n.y>280&&n.y<680&&n.x>840&&shoreDistance(n.x,n.y,0)<60&&shoreDistance(n.x,n.y,0)>18);
 waterGrid={nodes,edges,entries,shores};return waterGrid;
}
function makeRoute(random){
 const g=grid(),start=g.entries[Math.floor(random()*g.entries.length)];if(!start)return null;
 const target=g.shores[Math.floor(random()*g.shores.length)],queue=[start],previous=new Map([[start.key,null]]),cost=new Map([[start.key,0]]),closed=new Set();let found=null;
 const score=node=>cost.get(node.key)+Math.hypot(node.x-target.x,node.y-target.y);
 while(queue.length){
  queue.sort((a,b)=>score(a)-score(b));const node=queue.shift();if(closed.has(node.key))continue;closed.add(node.key);if(node===target){found=node;break}
  for(const next of g.edges(node)){const nextCost=cost.get(node.key)+Math.hypot(next.x-node.x,next.y-node.y);if(nextCost<(cost.get(next.key)??Infinity)){cost.set(next.key,nextCost);previous.set(next.key,node);queue.push(next)}}
 }
 if(!found)return null;
 const points=[];for(let node=found;node;node=previous.get(node.key))points.push({x:node.x,y:node.y});points.reverse();
 // Remove unnecessary grid corners only when the complete straight segment is safe.
 const route=[points[0]];let index=0;
 while(index<points.length-1){let next=points.length-1;while(next>index+1&&!bottleWaterPath(points[index],points[next]))next--;route.push(points[next]);index=next}
 return route;
}
function letter(value){
 if(!record(value)||!idValid(value.id)||!['shore','local'].includes(value.source))return null;
 const content=value.source==='shore'&&typeof value.contentId==='string'&&Object.hasOwn(CURATED_LETTERS_BY_ID,value.contentId)?CURATED_LETTERS_BY_ID[value.contentId]:null;
 const drawing=normalizeDrawing(value.drawing)??emptyDrawing(),body=text(value.body,600);
 if(!content&&!body.trim()&&!hasDrawing(drawing))return null;
 return{id:value.id,title:content?.title||text(value.title,48)||'写给海的一封信',body,drawing,signature:content?.signature||text(value.signature,24)||'匿名',source:value.source,
  ...(content?{contentId:content.id}:{}),
  createdAt:finite(value.createdAt),receivedAt:Number.isFinite(value.receivedAt)?value.receivedAt:null,sentAt:Number.isFinite(value.sentAt)?value.sentAt:null,
  ...(idValid(value.requestId)?{requestId:value.requestId}:{})};
}
export function normalizeBottles(value){
 if(!record(value)||value.version!==1||!Number.isFinite(value.nextArrivalAt)||!Array.isArray(value.bottles)||!Array.isArray(value.collection)||!Array.isArray(value.sent))return null;
 const seen=new Set(),contents=new Set(),list=(items,max)=>items.slice(0,300).flatMap(item=>{const l=letter(item);if(!l||seen.has(l.id)||(l.contentId&&contents.has(l.contentId)))return[];seen.add(l.id);if(l.contentId)contents.add(l.contentId);return[l]}).slice(0,max);
 const collection=list(value.collection,100),sent=list(value.sent,100),bottles=[];let incoming=0,outgoing=0;
 // Keep the content ledger independent of visible rows and reconstruct it for
 // older saves. Image bytes/URLs are never accepted from storage.
 const collectedContentIds=[...new Set([...(Array.isArray(value.collectedContentIds)?value.collectedContentIds.slice(0,300):[]),...collection.map(l=>l.contentId)].filter(id=>typeof id==='string'&&Object.hasOwn(CURATED_LETTERS_BY_ID,id)))];
 for(const item of value.bottles.slice(0,12)){
  if(!record(item)||!idValid(item.id)||bottles.some(b=>b.id===item.id)||!['incoming','outgoing'].includes(item.kind))continue;
  if(item.kind==='incoming'&&(incoming>=1||collection.some(l=>l.id===item.id)))continue;
  if(item.kind==='outgoing'&&outgoing>=2)continue;
  const l=letter(item.letter),route=Array.isArray(item.route)?item.route.slice(0,80).filter(p=>record(p)&&bottleWaterPoint(p.x,p.y)).map(p=>({x:p.x,y:p.y})):[];
  if(!l||l.id!==item.id||route.length<2||!bottleWaterPoint(item.x,item.y)||route.some((p,i)=>i>0&&!bottleWaterPath(route[i-1],p)))continue;
  if(item.kind==='incoming'&&l.contentId&&collectedContentIds.includes(l.contentId))continue;
  const routeIndex=Math.floor(clamp(finite(item.routeIndex,1),1,route.length));
  if(routeIndex<route.length&&!bottleWaterPath(item,route[routeIndex]))continue;
  bottles.push({id:item.id,kind:item.kind,letter:l,x:item.x,y:item.y,route,routeIndex,heading:finite(item.heading),opacity:clamp(finite(item.opacity,1),0,1),createdAt:finite(item.createdAt),expiresAt:finite(item.expiresAt),arrivedAt:Number.isFinite(item.arrivedAt)?item.arrivedAt:null});
  item.kind==='incoming'?incoming++:outgoing++;
 }
 const draft={id:idValid(value.draft?.id)?value.draft.id:'draft-1',body:text(value.draft?.body,600),signature:text(value.draft?.signature,24),drawing:normalizeDrawing(value.draft?.drawing)??emptyDrawing()};
 const ids=[draft.id,...collection.map(l=>l.id),...sent.map(l=>l.id),...bottles.map(b=>b.id)],maxId=Math.max(0,...ids.map(id=>{const n=Number(id.match(/-(\d+)$/)?.[1]);return Number.isSafeInteger(n)&&n<=1e12?n:0}));
 return{version:1,nextId:Math.max(maxId+1,Math.floor(clamp(finite(value.nextId,1),1,1e12))),nextArrivalAt:value.nextArrivalAt,lastArrivalTideKey:validTideArrivalKey(value.lastArrivalTideKey)?value.lastArrivalTideKey:null,lastSeenAt:finite(value.lastSeenAt),letterIndex:Math.floor(clamp(finite(value.letterIndex),0,1e9)),draft,collection,collectedContentIds,sent,bottles};
}
export function loadBottles(storage=storageDefault()){
 try{const raw=storage?.getItem(BOTTLE_STORAGE_KEY);return raw&&raw.length<=BOTTLE_LIMITS.storageBytes&&jsonBytes(raw)<=BOTTLE_LIMITS.storageBytes?normalizeBottles(JSON.parse(raw)):null}catch{return null}
}
export function saveBottles(state,storage=storageDefault()){
 try{const clean=normalizeBottles(state);if(!clean||!storage)return false;const raw=JSON.stringify(clean);if(jsonBytes(raw)>BOTTLE_LIMITS.storageBytes)return false;storage.setItem(BOTTLE_STORAGE_KEY,raw);return true}catch{return false}
}

export class BottleDrift{
 constructor({storage=storageDefault(),nowMs=Date.now(),random=Math.random,getTide=()=>null,persistTide=()=>true}={}){
  this.storage=storage;this.getTide=getTide;this.persistTide=persistTide;this.random=()=>clamp(finite(random(),.5),0,.999999);this.storageError=false;this.lastPersist=nowMs;this.lastAttempt=-Infinity;this.lastArrivalAttemptKey=null;
  const stored=loadBottles(storage);
  // Retain the old deadline field for save compatibility; only tide keys now
  // schedule arrivals, so no old random timer can create an extra bottle.
  this.state=stored??{version:1,nextId:2,nextArrivalAt:0,lastArrivalTideKey:null,lastSeenAt:nowMs,letterIndex:0,draft:{id:'draft-1',body:'',signature:'',drawing:emptyDrawing()},collection:[],collectedContentIds:[],sent:[],bottles:[]};
  const next=stored?this.reconcileOffline(this.state,nowMs,true):this.state;if(!stored||next!==this.state)this.commit(next);this.state.lastSeenAt=Math.max(this.state.lastSeenAt,nowMs);
 }
 reconcileOffline(state,now,returning=false){
  if(!returning&&now-state.lastSeenAt<MINUTE)return state;
  return{...state,lastSeenAt:now,bottles:state.bottles.filter(b=>b.expiresAt>now)};
 }
 snapshot(){return copy(this.state)}
 get bottles(){return this.state.bottles}
 view(){return{...this.snapshot(),contentTotal:CURATED_LETTERS.length,collectionComplete:this.state.collectedContentIds.length>=CURATED_LETTERS.length,storageError:this.storageError,limits:BOTTLE_LIMITS}}
 commit(next){
  if(!saveBottles(next,this.storage)){this.storageError=true;return false}
  this.state=next;this.storageError=false;this.lastPersist=next.lastSeenAt;return true;
 }
 persist(){return this.commit(this.state)}
 update(dt,nowMs=Date.now(),level=0){
  const now=Math.max(this.state.lastSeenAt,finite(nowMs,Date.now()));
  const offline=this.reconcileOffline(this.state,now);
  if(offline!==this.state){if(!this.commit(offline))return this.bottles;dt=0}
  const bottles=[];
  for(const original of this.state.bottles){
   if(original.expiresAt<=now)continue;
   const b={...original},speed=b.kind==='incoming'?4.8:6.5;let step=clamp(finite(dt),0,2)*speed;
   while(step>0&&b.routeIndex<b.route.length){const target=b.route[b.routeIndex],dx=target.x-b.x,dy=target.y-b.y,distance=Math.hypot(dx,dy);b.heading=Math.atan2(dy,dx);
    if(distance<=step){b.x=target.x;b.y=target.y;step-=distance;b.routeIndex++}else{b.x+=dx/distance*step;b.y+=dy/distance*step;step=0}}
   if(b.routeIndex===b.route.length){if(b.kind==='outgoing')continue;b.arrivedAt??=now}
   const end=b.route.at(-1),fade=b.kind==='outgoing'?Math.min(1,Math.hypot(b.x-end.x,b.y-end.y)/45):1;
   b.opacity=(b.kind==='outgoing'?1:clamp((now-b.createdAt)/6000,0,1))*fade;bottles.push(b);
  }
  this.state={...this.state,lastSeenAt:now,bottles};
  const tide=this.getTide(now),arrivalKey=tide?.phase==='rising'&&!tide.debug&&validTideArrivalKey(tide.key)?tide.key:null;
  if(arrivalKey&&arrivalKey!==this.state.lastArrivalTideKey&&(arrivalKey!==this.lastArrivalAttemptKey||now-this.lastAttempt>=5000)){
   this.lastAttempt=now;this.lastArrivalAttemptKey=arrivalKey;
   // The coast clock and bottle collection live in different stores. Make the
   // clock durable first: a failed tide save must not let a collectible bottle
   // replace the old tide receipt, then replay that old tide after a restart.
   let tideSaved=false;try{tideSaved=this.persistTide()===true}catch{}
   if(!tideSaved){this.storageError=true;return this.bottles}
   const next={...this.state,lastArrivalTideKey:arrivalKey};
   if(!bottles.some(b=>b.kind==='incoming')&&next.collection.length<100){const bottle=this.createBottle(next,'incoming',now);if(bottle)next.bottles=[...bottles,bottle]}
   this.commit(next);
  }else if(now-this.lastPersist>=5000&&now-this.lastAttempt>=5000){this.lastAttempt=now;this.persist()}
  return this.bottles;
 }
 createBottle(state,kind,now,ownLetter){
  const available=CURATED_LETTERS.filter(l=>!state.collectedContentIds.includes(l.id)&&!state.bottles.some(b=>b.kind==='incoming'&&b.letter.contentId===l.id));
  if(!ownLetter&&!available.length)return null;
  const route=makeRoute(this.random);if(!route)return null;if(kind==='outgoing')route.reverse();
  const id=ownLetter?.id??'bottle-'+state.nextId++,source=ownLetter?null:available[Math.floor(this.random()*available.length)];
  const l=ownLetter??{id,contentId:source.id,title:source.title,signature:source.signature,body:'',drawing:emptyDrawing(),source:'shore',createdAt:now,receivedAt:null,sentAt:null};if(!ownLetter)state.letterIndex++;
  return{id,kind,letter:l,...route[0],route,routeIndex:1,heading:Math.atan2(route[1].y-route[0].y,route[1].x-route[0].x),opacity:kind==='outgoing'?1:0,createdAt:now,expiresAt:now+(kind==='incoming'?20:5)*MINUTE,arrivedAt:null};
 }
 pickup(id,nowMs=Date.now()){
  const bottle=this.state.bottles.find(b=>b.id===id);if(!bottle||bottle.expiresAt<=nowMs)return fail('这只漂流瓶已经随海水离开了。');
  if(bottle.kind==='outgoing')return ok('这是你写给海的一封信，正随海浪远行。',{action:'read-sent',letter:copy(bottle.letter)});
  if(this.state.collection.length>=100)return fail('收藏已满 100 封，这封信先留在海里。');
  const l={...bottle.letter,receivedAt:nowMs},collectedContentIds=[...new Set([...this.state.collectedContentIds,...(l.contentId?[l.contentId]:[])])],next={...this.state,collection:[l,...this.state.collection],collectedContentIds,bottles:this.state.bottles.filter(b=>b.id!==id)};
  if(!this.commit(next))return fail('没能保存到本机，漂流瓶还留在原处，请稍后再试。');
  return ok('拾到一封海边手记。',{letter:copy(l)});
 }
 setDraft(input={}){
  if(input.id&&input.id!==this.state.draft.id)return fail('这份草稿已经放流，请使用新的信纸。');
  if(typeof input.body!=='string'||input.body.length>600||typeof(input.signature??'')!=='string'||(input.signature??'').length>24)return fail('信纸最多 600 字，署名最多 24 字。');
  const drawing=normalizeDrawing(input.drawing===undefined?this.state.draft.drawing:input.drawing);
  if(!drawing)return fail('画纸内容超出限制或无法读取，请撤销最后一笔后重试。');
  const next={...this.state,draft:{...this.state.draft,body:text(input.body,600),signature:text(input.signature??'',24),drawing}};
  return this.commit(next)?ok('草稿已保存在本机。',{draft:copy(this.state.draft)}):{...fail('草稿暂未保存，请留在当前信纸并重试。'),draft:copy(this.state.draft)};
 }
 sendLetter(input={},nowMs=Date.now(),level=0){
  const requestId=idValid(input.requestId)?input.requestId:this.state.draft.id;
  const previous=this.state.sent.find(l=>l.requestId===requestId);
  if(previous)return ok('这封信已经放流。',{letter:copy(previous),bottle:copy(this.state.bottles.find(b=>b.id===previous.id)??null),alreadySent:true});
  const body=typeof input.body==='string'?text(input.body,601).trim():'',signature=typeof(input.signature??'')==='string'?text(input.signature??'',25).trim():'';
  const drawing=normalizeDrawing(input.drawing===undefined?this.state.draft.drawing:input.drawing);
  if(!drawing)return fail('画纸内容超出限制或无法读取，请撤销最后一笔后重试。');
  if((!body&&!hasDrawing(drawing))||(input.body??'').length>600||body.length>600||(input.signature??'').length>24||typeof(input.signature??'')!=='string')return fail('写几句话，或画一幅小画，再放回海里吧。文字最多 600 字，署名不超过 24 字。');
  const sent=!input.requestId&&this.state.sent.find(l=>nowMs-l.sentAt>=0&&nowMs-l.sentAt<1000&&l.body===body&&l.signature===(signature||'匿名')&&JSON.stringify(l.drawing??emptyDrawing())===JSON.stringify(drawing));
  if(sent)return ok('这封信已经放流。',{letter:copy(sent),bottle:copy(this.state.bottles.find(b=>b.id===sent.id)??null),alreadySent:true});
  if(this.state.bottles.filter(b=>b.kind==='outgoing').length>=2)return fail('先让海上的两只瓶子漂远一些，再放流下一封吧。');
  if(this.state.sent.length>=100)return fail('本机已保存 100 封放流信，请先留在草稿里。');
  const next={...this.state,nextId:this.state.nextId},id='bottle-'+next.nextId++;
  const l={id,title:body.split('\n')[0].slice(0,24)||(hasDrawing(drawing)?'画给海的一张小笺':'写给海的一封信'),body,drawing,signature:signature||'匿名',source:'local',createdAt:nowMs,receivedAt:null,sentAt:nowMs,requestId};
  const bottle=this.createBottle(next,'outgoing',nowMs,l);if(!bottle)return fail('暂时没有合适的放流位置，请稍后再试。');
  next.sent=[l,...next.sent];next.bottles=[...next.bottles,bottle];next.draft={id:'draft-'+next.nextId++,body:'',signature:signature,drawing:emptyDrawing()};
  if(!this.commit(next))return fail('没能保存到本机，这封信尚未放流，请保留当前信纸后重试。');
  return ok('信已留在本机，漂流瓶正慢慢漂向海上。',{letter:copy(l),bottle:copy(bottle)});
 }
}
