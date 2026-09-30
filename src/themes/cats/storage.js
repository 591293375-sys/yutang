import { getPreset, MAX_ACTIVE_CATS } from './catalog.js';
import { validateAppearance } from './appearance.js';
import { normalizeEnvironment } from './environment.js';
import {normalizeCustomization,validateCustomization,PERSONALITY_IDS} from './customization.js';
import { nearestWalkable, SLEEP_SLOT_MAP, surfaceAt, FACILITIES } from './geometry.js';
export const CATS_STORAGE_KEY='mofish-cats-v1';
export const CAT_DRAFT_KEY='mofish-cats-draft-v1';
export const MAX_CAT_COLLECTION=100;
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const bounded=(n,a,b,fallback=a)=>Number.isFinite(n)?Math.min(b,Math.max(a,n)):fallback;
export function validateDesign(value){
  try{
    if(!record(value)||typeof value.presetId!=='string')return null;
    const preset=getPreset(value.presetId);if(!preset||preset.id!==value.presetId||preset.available===false)return null;
    if(typeof value.name!=='string')return null;
    const name=value.name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,16);if(!name)return null;
    if(value.personality!==undefined&&!PERSONALITY_IDS.includes(value.personality))return null;
    const appearance=validateAppearance(value.appearance);
    const customization=value.customization==null?normalizeCustomization():validateCustomization(value.customization);
    return {presetId:value.presetId,name,personality:value.personality||'friendly',appearance:JSON.parse(JSON.stringify(appearance)),customization};
  }catch{return null;}
}
export function exportDesign(value){const design=validateDesign(value);if(!design)throw new Error('猫咪设计格式不正确');return JSON.stringify({format:'mofish-cat',version:1,design});}
export function importDesign(value){try{if(typeof value==='string'){if(value.length>2500000)return null;value=JSON.parse(value);}if(!record(value)||value.format!=='mofish-cat'||value.version!==1)return null;return validateDesign(value.design);}catch{return null;}}
export function normalizeCats(value){
  if(!record(value)||value.version!==1||!Array.isArray(value.cats))return null;
  const cats=[],seen=new Set();let activeCount=0,platformOccupied=false;
  for(const c of value.cats.slice(0,MAX_CAT_COLLECTION)){
    const design=validateDesign(c);if(!design||typeof c.id!=='string'||!c.id||c.id.length>120||seen.has(c.id))continue;
    let p=nearestWalkable({x:bounded(c.x,0,1,.55),y:bounded(c.y,0,1,.58)});if(!p)continue;
    const active=c.active!==false&&activeCount<MAX_ACTIVE_CATS;if(active)activeCount++;
    const slot=record(c.restIntent)&&Object.hasOwn(SLEEP_SLOT_MAP,c.restIntent.slotId)?SLEEP_SLOT_MAP[c.restIntent.slotId]:null;
    const onPlatform=surfaceAt(p)?.id==='lower-platform';
    if(onPlatform&&(!active||platformOccupied))p={...FACILITIES.climbing.approach};
    let restIntent=active&&slot?{slotId:slot.id,surfaceId:slot.surfaceId,target:{x:slot.x,y:slot.y},kind:c.restIntent.kind==='rest'?'rest':'sleep'}:null;
    if(active&&(onPlatform||restIntent?.surfaceId==='lower-platform')){
      if(platformOccupied){if(restIntent?.surfaceId==='lower-platform')restIntent=null;}
      else{platformOccupied=true;if(onPlatform){const platformSlot=SLEEP_SLOT_MAP['climbing-lower'];restIntent={slotId:platformSlot.id,surfaceId:platformSlot.surfaceId,target:{x:platformSlot.x,y:platformSlot.y},kind:'rest'};}}
    }
    cats.push({...design,id:c.id,active,...p,restIntent,surfaceId:surfaceAt(p)?.id||'ground',heading:Number.isFinite(c.heading)?Math.atan2(Math.sin(c.heading),Math.cos(c.heading)):c.facing===-1?Math.PI:0,interactions:Math.floor(bounded(c.interactions,0,1e9)),facing:c.facing===-1?-1:1});seen.add(c.id);
  }
  const props=[],propIds=new Set();
  for(const prop of (Array.isArray(value.props)?value.props:[]).slice(0,3)){
    if(!record(prop)||prop.tool!=='scratch'||typeof prop.id!=='string'||prop.id.length>120||!prop.id||propIds.has(prop.id))continue;
    const p=nearestWalkable({x:bounded(prop.x,0,1,.6),y:bounded(prop.y,0,1,.6)});if(!p)continue;
    props.push({id:prop.id,tool:'scratch',...(surfaceAt(p)?.id==='lower-platform'?FACILITIES.climbing.approach:p),persistent:true});propIds.add(prop.id);
  }
  return {version:1,cats,props,environment:normalizeEnvironment(value.environment),nextId:Math.floor(bounded(value.nextId,1,1e12,1))};
}
export function loadCats(storage){try{const raw=(storage??globalThis.localStorage)?.getItem(CATS_STORAGE_KEY);return raw&&raw.length<12e6?normalizeCats(JSON.parse(raw)):null;}catch{return null;}}
export function saveCats(value,storage){try{const result=normalizeCats(value),target=storage??globalThis.localStorage;if(!result||!target)return false;target.setItem(CATS_STORAGE_KEY,JSON.stringify(result));return true;}catch{return false;}}
