import {ITEMS,MAX_ITEMS,defaultItems} from './catalog.js';
import {validPlacement,fitPlacement} from './geometry.js';
import {upgradeMotion,bowlPlacement} from './habitat.js';
const clone=v=>structuredClone(v),record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v,d)=>Number.isFinite(v)?v:d;
const text=(v,n)=>[...String(typeof v==='string'?v:'').trim()].slice(0,n).join('');
const timestamp=(v,now)=>Math.min(now,Math.max(0,finite(v,now)));
export function incenseState(item,now=Date.now()){
 const inc=item?.incense;if(!inc||inc.status!=='burning')return{status:inc?.status==='spent'?'spent':'unlit',progress:inc?.status==='spent'?1:0,remaining:0};
 const elapsed=Math.max(0,now-inc.startedAt),duration=[180000,600000,1200000].includes(inc.duration)?inc.duration:600000;
 return{status:elapsed>=duration?'spent':'burning',progress:Math.min(1,elapsed/duration),remaining:Math.max(0,duration-elapsed)};
}
function sanitize(saved,now){
 const source=record(saved)?saved:{},seen=new Set();
 // The marker, not array length, distinguishes untouched and intentionally empty tables.
 const raw=source.initialized===true?(Array.isArray(source.items)?source.items:[]):defaultItems();
 const items=raw.filter(i=>record(i)&&Object.hasOwn(ITEMS,i.kind)).slice(0,MAX_ITEMS).flatMap((i,n)=>{
  if(i.kind==='burner'&&seen.has('burner'))return[];if(i.kind==='burner')seen.add('burner');let id=text(i.id,80)||'cy-repair-'+n;if(seen.has(id))id+='-'+n;seen.add(id);
  const item=fitPlacement({id,kind:i.kind,x:i.x,y:i.y,scale:i.scale,stored:!!i.stored,lit:!!i.lit,tea:Math.max(0,Math.min(1,finite(i.tea,0)))});
  if(i.kind==='plaque')item.wishId=Object.hasOwn(i,'wishId')?text(i.wishId,80)||null:source.version>=3?null:text(source.activeWishId,80)||null;
  if(i.kind==='burner'){const inc=record(i.incense)?i.incense:{};item.incense={status:['unlit','burning','spent'].includes(inc.status)?inc.status:'unlit',duration:[180000,600000,1200000].includes(inc.duration)?inc.duration:600000,startedAt:timestamp(inc.startedAt,now)};if(item.stored)item.incense.status='unlit';if(incenseState(item,now).status==='spent')item.incense.status='spent';}
  return[item];
 });
 const wishes=[],wishIds=new Set();for(const w of Array.isArray(source.wishes)?source.wishes.slice(0,300+MAX_ITEMS):[]){if(!record(w)||!text(w.content,60))continue;const id=text(w.id,80)||'wish-'+wishes.length;if(wishIds.has(id))continue;wishIds.add(id);wishes.push({id,content:text(w.content,60),action:text(w.action,160),createdAt:timestamp(w.createdAt,now),completedAt:w.completedAt?timestamp(w.completedAt,now):null,archived:!!w.archived,progress:(Array.isArray(w.progress)?w.progress:[]).filter(record).slice(-100).map(p=>({text:text(p.text,200),at:timestamp(p.at,now)}))})}
 // Older plaques shared activeWishId. Copy that visible text once per plaque,
 // preserving legacy metadata; the normal history limit leaves room for these copies.
 const assigned=new Set();let copySerial=0;
 for(const item of items.filter(i=>i.kind==='plaque')){
  if(!wishIds.has(item.wishId)){item.wishId=null;continue}
  if(assigned.has(item.wishId)){
   const original=wishes.find(w=>w.id===item.wishId);let id;
   do{id='wish-plaque-'+(++copySerial)}while(wishIds.has(id));
   wishes.push({...clone(original),id});wishIds.add(id);item.wishId=id;
  }
  assigned.add(item.wishId);
 }
 // Permanent lanterns, ambient breeze and standard motion also apply to older saves.
 // Breeze still obeys the global sound switch, volume, pause and visibility.
 const s=record(source.settings)?source.settings:{};
 // Retain old blessing records as dormant save data; no daily draw or collection remains.
 const daily=record(source.daily)&&/^\d{4}-\d{2}-\d{2}$/.test(source.daily.date)&&Number.isInteger(source.daily.index)&&source.daily.index>=0&&source.daily.index<36?{date:source.daily.date,index:source.daily.index}:null;
 const history=Object.fromEntries(Object.entries(record(source.blessingHistory)?source.blessingHistory:{}).filter(([date,id])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isInteger(id)&&id>=0&&id<36));
 if(daily)history[daily.date]=daily.index;
 return{version:3,initialized:true,motion:{version:source.motion?.version===1?1:0,position:{x:Math.max(.03,Math.min(.97,finite(source.motion?.position?.x,.4))),y:Math.max(.8,Math.min(.887,finite(source.motion?.position?.y,.883)))}},items,wishes,activeWishId:wishIds.has(source.activeWishId)?source.activeWishId:null,daily,blessingHistory:history,favorites:[...new Set((Array.isArray(source.favorites)?source.favorites:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<36))],settings:{showToad:s.showToad!==false,showLanterns:true,showAtmosphere:s.showAtmosphere!==false,motionIntensity:'standard',reduceMotion:!!s.reduceMotion,time:['auto','day','dusk','night'].includes(s.time)?s.time:'auto',volume:Math.max(0,Math.min(1,finite(s.volume,.65))),ambient:true,music:s.music!==false,effects:s.effects!==false,musicVolume:Math.max(0,Math.min(1,finite(s.musicVolume,.45))),duration:[3,10,20].includes(s.duration)?s.duration:10},serial:Math.max(20,Math.min(1e9,Math.round(finite(source.serial,20))))};
}
export class CaiyuanModel{
 constructor(saved,now=Date.now()){this.state=sanitize(saved,now);upgradeMotion(this.state);this.undoStack=[];this.tool=null;this.selectedId=null;this.events=[];this.effects=[]}
 snapshot(){return clone(this.state)}
 id(prefix){return prefix+'-'+Date.now().toString(36)+'-'+(++this.state.serial)}
 incense(now=Date.now(),id){return incenseState(this.state.items.find(i=>i.kind==='burner'&&(!id||i.id===id)),now)}
 tick(now){let changed=false;for(const item of this.state.items){if(item.incense?.status==='burning'&&incenseState(item,now).status==='spent'){item.incense.status='spent';this.effects.push({type:'smokeEnd',id:item.id,at:now,progress:1});this.events.push('complete');changed=true}}this.effects=this.effects.filter(e=>now-e.at<4000);return changed}
 remember(){this.undoStack.push(clone(this.state.items));if(this.undoStack.length>20)this.undoStack.shift()}
 view(now=Date.now()){return{...this.snapshot(),selectedId:this.selectedId,tool:this.tool,canUndo:this.undoStack.length>0,incense:this.incense(now)}}
 command(action,payload,now=Date.now()){
  const p=payload,find=id=>this.state.items.find(i=>i.id===id),ok=message=>({ok:true,message}),fail=message=>({ok:false,message});
  if(action!=='scale')this.scaleGesture=null;
  if(action==='tool'){this.tool=this.tool===p?null:p;this.selectedId=null;return ok()}
  if(action==='select'){this.selectedId=find(p)?.id||null;return ok()}
  if(action==='cancel'){this.tool=null;this.selectedId=null;return ok()}
  if(action==='add'){
   if(!Object.hasOwn(ITEMS,p?.kind))return fail('这个摆件暂不可用。');if(this.state.items.length>=MAX_ITEMS)return fail(`供桌最多保留 ${MAX_ITEMS} 件摆设，先收拾出一点空间。`);if(p.kind==='burner'&&this.state.items.some(i=>i.kind==='burner'))return fail('香炉只需一座，可以在布置里找回或移动。');
   const item={id:this.id('cy'),kind:p.kind,x:p.x,y:p.y,scale:1,stored:false,lit:p.kind==='lamp',tea:0};if(p.kind==='plaque')item.wishId=null;if(p.kind==='burner')item.incense={status:'unlit',startedAt:0,duration:600000};if(!validPlacement(item))return fail('请放在供桌内侧，留一点边缘。');this.remember();this.state.items.push(item);this.selectedId=item.id;this.events.push('place');return ok('已放好。')
  }
  if(['move','scale'].includes(action)){const item=find(p?.id);if(!item)return fail('请先选择摆件。');const changed=action==='move'?{...item,x:p.x,y:p.y,stored:false}:{...item,scale:Math.max(ITEMS[item.kind].min,Math.min(ITEMS[item.kind].max,finite(p.scale,item.scale)))};if(!validPlacement(changed))return fail('这里放不稳，摆件已回到原处。');if(changed.x===item.x&&changed.y===item.y&&changed.scale===item.scale&&changed.stored===item.stored)return ok();const continuing=action==='scale'&&this.scaleGesture?.id===item.id&&now>=this.scaleGesture.at&&now-this.scaleGesture.at<500;if(!continuing)this.remember();this.scaleGesture=action==='scale'?{id:item.id,at:now}:null;Object.assign(item,changed);return ok()}
  if(['store','remove','restore'].includes(action)){const item=find(p);if(!item)return fail('没有找到摆件。');this.remember();if(action==='remove')this.state.items=this.state.items.filter(i=>i.id!==p);else item.stored=action==='store';if(item.incense&&action!=='restore')item.incense={...item.incense,status:'unlit',startedAt:0};this.effects=this.effects.filter(e=>e.id!==p);this.selectedId=null;return ok(action==='restore'?'摆件已回到供桌。':'已收好。')}
  if(action==='undo'){
   if(!this.undoStack.length)return fail('还没有可撤销的摆设。');
   const live=new Map(this.state.items.map(i=>[i.id,i]));
   // Undo arrangement only; a later ritual must not be extinguished or restarted.
   this.state.items=sanitize({...this.state,items:this.undoStack.pop()},now).items.map(previous=>{
    const current=live.get(previous.id);
    const restored=current?{...current,x:previous.x,y:previous.y,scale:previous.scale,stored:previous.stored}:previous;
    if(restored.incense?.status==='burning'&&(!current||restored.stored))restored.incense={...restored.incense,status:'unlit',startedAt:0};
    return restored;
   });
   this.effects=this.effects.filter(e=>!e.id||this.state.items.some(i=>i.id===e.id&&!i.stored));this.selectedId=null;return ok('已撤销最近一次摆设。')
  }
  if(action==='reset'||action==='clearTable'){this.remember();this.state.items=action==='reset'?defaultItems():[];if(action==='reset'){const bowl=bowlPlacement(this.state.items);if(bowl)this.state.items.push(bowl)}this.selectedId=null;this.tool=null;this.effects=[];return ok(action==='reset'?'默认摆设已恢复，心愿记录仍保留。':'供桌已收空，心愿记录仍保留。')}
  if(action==='ignite'){const b=find(p?.id)||this.state.items.find(i=>i.kind==='burner'&&!i.stored);if(!b||b.kind!=='burner'||b.stored)return fail('先在供桌上放一座香炉。');const minutes=[3,10,20].includes(p?.minutes)?p.minutes:this.state.settings.duration;if(incenseState(b,now).status==='burning'&&!p?.restart)return fail('这炉香还在燃着，可在香炉面板重新上香。');this.effects=this.effects.filter(e=>e.id!==b.id||e.type!=='smokeEnd');b.incense={status:'burning',startedAt:now,duration:minutes*60000};this.state.settings.duration=minutes;this.events.push('incense');return ok('三炷清香，慢慢陪伴。')}
  if(action==='extinguish'){const b=find(p)||this.state.items.find(i=>i.kind==='burner');if(b?.incense?.status==='burning'){const progress=incenseState(b,now).progress;b.incense.status='unlit';b.incense.startedAt=0;this.effects.push({type:'smokeEnd',id:b.id,at:now,progress})}return ok('已熄香。')}
  if(action==='lamp'){const b=find(p);if(!b||b.kind!=='lamp'||b.stored)return fail('轻点一盏莲灯。');b.lit=!b.lit;this.events.push('lamp');return ok(b.lit?'留一盏暖光。':'灯已轻轻熄灭。')}
  if(action==='lamps'){this.state.items.filter(i=>i.kind==='lamp'&&!i.stored).forEach(i=>i.lit=!!p);this.events.push('lamp');return ok()}
  if(action==='tea'){const cup=find(p);if(!cup||cup.kind!=='cup'||cup.stored)return fail('请轻点一只茶杯。');if(!this.state.items.some(i=>i.kind==='teapot'&&!i.stored))return fail('先在桌上摆好茶壶，再添一杯茶。');cup.tea=1;this.effects.push({type:'tea',id:cup.id,at:now});this.events.push('tea');return ok('添一杯温茶。')}
  if(action==='wishSave'){
   if(!text(p?.content,60))return fail('先写下一点心愿。');
   const plaques=this.state.items.filter(i=>i.kind==='plaque'&&!i.stored);
   const plaque=p.plaqueId?plaques.find(i=>i.id===p.plaqueId):plaques.find(i=>i.id===this.selectedId)||(plaques.length===1?plaques[0]:null);
   if(!plaque)return fail('请先轻点要写心愿的祈愿牌。');
   let w=this.state.wishes.find(w=>w.id===p.id);
   // Selecting a historical note copies it onto this plaque; it never takes
   // ownership of another plaque's record (including one retained by undo).
   if(!w||plaque.wishId!==w.id||this.state.items.some(i=>i.kind==='plaque'&&i.id!==plaque.id&&i.wishId===w.id)){
    if(this.state.wishes.length>=300)return fail('心愿册已满，请先珍藏已有记录。');
    w={...(w?clone(w):{createdAt:now,completedAt:null,archived:false,progress:[]}),id:this.id('wish')};this.state.wishes.unshift(w);
   }
   w.content=text(p.content,60);if(p.action!==undefined||w.action===undefined)w.action=text(p.action,160);
   plaque.wishId=w.id;this.state.activeWishId=w.id;return {...ok('心愿已留在这块牌上。'),id:w.id};
  }
  if(action.startsWith('wish')){const w=this.state.wishes.find(w=>w.id===(record(p)?p.id:p));if(!w)return fail('没有找到这个心愿。');if(action==='wishProgress'){if(!text(p.text,200))return fail('写一点今天的进展吧。');w.progress.push({text:text(p.text,200),at:now});if(w.progress.length>100)w.progress.shift()}
   else if(action==='wishComplete'){if(!w.completedAt){w.completedAt=now;this.effects.push({type:'wish',at:now});this.events.push('sparkle')}}else if(action==='wishArchive'){w.archived=!w.archived;if(w.archived&&this.state.activeWishId===w.id)this.state.activeWishId=null}else if(action==='wishSelect'){this.state.activeWishId=w.id}return ok()}
  if(action==='settings'){this.state.settings=sanitize({...this.state,settings:{...this.state.settings,...p}},now).settings;return ok()}
  return fail('暂时无法完成这个操作。');
 }
}
export function timeOfDay(mode='auto',now=Date.now()){if(mode!=='auto')return mode;const h=new Date(now).getHours();return h>=19||h<6?'night':h>=17?'dusk':'day'}
