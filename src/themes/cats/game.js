import {feedingDock,foodBowlLayout} from './feeding.js';
import {normalizeCustomization} from './customization.js';
import {prepareSurfacePath,sameSurface,supportedTraversalPoint} from './traversal.js';
import { getPreset, MAX_ACTIVE_CATS } from './catalog.js';
import { DEFAULT_CAT_ENVIRONMENT, normalizeEnvironment } from './environment.js';
import { validateDesign, normalizeCats, MAX_CAT_COLLECTION } from './storage.js';
import { distance, isWalkable, nearestWalkable, findPath, segmentWalkable, randomWalkable, FACILITIES, ASPECT, surfaceAt, SLEEP_SLOTS, SLEEP_SLOT_MAP } from './geometry.js';
export const CAT_TOOLS=Object.freeze(['food','yarn','scratch','wand','mouse','pet']);
export const CAT_LIMITS=Object.freeze({active:MAX_ACTIVE_CATS,collection:MAX_CAT_COLLECTION,temporaryProps:6,scratchBoards:3,visible:MAX_ACTIVE_CATS});
const durations={food:7,yarn:7,scratch:5,wand:18,mouse:7,pet:3.5};
export const CAT_PERSONAL_SPACE=.054;
const COLLISION_SPACE=.045;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const sizeCache=new WeakMap();
const catSize=cat=>{
 if(!cat||typeof cat!=='object')return 1;const source=cat.customization,cached=sizeCache.get(cat);
 if(cached&&cached.source===source&&cached.rawSize===source?.size)return cached.value;
 const value=normalizeCustomization(source).size;sizeCache.set(cat,{source,rawSize:source?.size,value});return value;
};
const spacing=(a,b,base=CAT_PERSONAL_SPACE)=>base*Math.max(.82,(catSize(a)+catSize(b))/2);
const personalityProfiles={
  active:{speed:1.13,rest:.19,night:.50,wait:1},relaxed:{speed:.85,rest:.33,night:.60,wait:1.3},friendly:{speed:1,rest:.19,night:.50,wait:1},
  curious:{speed:1.06,rest:.15,night:.43,wait:.78},shy:{speed:.90,rest:.28,night:.55,wait:1.15},independent:{speed:1,rest:.26,night:.51,wait:1.1},
  playful:{speed:1.17,rest:.13,night:.40,wait:.8},sleepy:{speed:.78,rest:.56,night:.72,wait:1.5},
};
const personalityOf=cat=>personalityProfiles[cat.personality]||personalityProfiles.friendly;
const clone=value=>JSON.parse(JSON.stringify(value));
const copyPoint=p=>({x:p.x,y:p.y});
function defaultCats(){return [
  {id:'cat-first-ragdoll',presetId:'ragdoll',name:'糯米',personality:'friendly',x:.50,y:.49},
  {id:'cat-first-blue',presetId:'british-shorthair',name:'蓝莓',personality:'relaxed',x:.66,y:.59},
  {id:'cat-first-orange',presetId:'domestic-orange-white',name:'橘子',personality:'active',x:.58,y:.75},
].map(c=>({...c,appearance:{version:1,strokes:[]},active:true}));}
export class CatGame{
  constructor(saved,{random=Math.random}={}){
    this.random=random;this.time=0;this.serial=1;this.pointerPoint=null;this.lastPointerAt=0;this.events=[];this.decisionClock=0;
    const data=normalizeCats(saved);
    this.environment=normalizeEnvironment(data?.environment||DEFAULT_CAT_ENVIRONMENT);
    this.cats=(data?data.cats:defaultCats()).map(c=>this._runtimeCat(c));
    this.props=(data?.props||[]).map(p=>({...p,origin:copyPoint(p),catIds:[],age:0,ttl:Infinity,phase:0}));
    this.serial=data?.nextId||1;this.nextDecision=0;
    for(let i=0;i<this.cats.length;i++){const cat=this.cats[i];if(cat.active&&this.cats.slice(0,i).some(other=>other.active&&distance(cat,other)<spacing(cat,other))){const point=this._freePoint(cat,cat);if(point)Object.assign(cat,point);}}
    for(const cat of this.cats)if(cat.active&&cat.restIntent)this._resumeRest(cat);
  }
  _runtimeCat(c){const point=nearestWalkable(c),surface=surfaceAt(point);return {...clone(c),...point,state:'idle',facing:c.facing===-1?-1:1,heading:Number.isFinite(c.heading)?c.heading:c.facing===-1?Math.PI:0,motionDx:0,motionDy:0,motionHeading:Number.isFinite(c.heading)?c.heading:c.facing===-1?Math.PI:0,strideDistance:0,movementAcceleration:0,surfaceId:surface?.id||'ground',elevation:surface?.elevation||0,surfaceLayer:surface?.layer||0,worldFoot:copyPoint(point),restIntent:c.restIntent?clone(c.restIntent):null,traverse:null,climbAction:null,pendingCommand:null,manualRoute:false,target:null,path:[],task:null,expression:null,animTime:this.random()*6,phase:this.random()*Math.PI*2,speed:0,wait:1+this.random()*4,stateTime:0,interactions:c.interactions||0};}
  _id(kind){let id;do{id=`cat-${kind}-${this.serial++}`;}while(this.cats.some(c=>c.id===id)||this.props.some(p=>p.id===id));return id;}
  _event(type,cat,tool){
    if(type==='step'&&this.events.some(event=>event.type==='step'&&event.at===this.time))return;
    this.events.push({type,catId:cat?.id,tool,at:this.time});
    if(this.events.length>12){const step=this.events.findIndex(event=>event.type==='step');this.events.splice(step<0?0:step,1);}
  }
  drainEvents(){return this.events.splice(0);}
  _release(cat,keepProp=false){
    if(cat.task){const p=this.props.find(p=>p.id===cat.task.propId);if(p){p.catIds=p.catIds.filter(id=>id!==cat.id);if(!keepProp&&!p.persistent&&!p.catIds.length)p.ttl=Math.min(p.ttl,p.age+.8);}}
    cat.task=null;cat.target=null;cat.path=[];cat.traverse=null;cat.climbAction=null;cat.pendingCommand=null;cat.manualRoute=false;cat.afterWalk=null;cat.restZone=null;cat.restIntent=null;cat.sleepSlotId=null;cat.speed=0;cat.state='idle';cat.stateTime=0;cat.expression=null;cat.wait=1.8+this.random()*3;
  }
  _cancelInteraction(cat,keepProp=false){if(cat.traverse?.kind==='surface')this._queueGroundAction(cat,{type:'wake'});else this._release(cat,keepProp);}
  _removeProp(prop){for(const c of this.cats)if(c.task?.propId===prop.id)this._cancelInteraction(c,true);this.props=this.props.filter(p=>p!==prop);}
  _avoidCats(cat){return this.cats.filter(c=>c!==cat&&c.active).flatMap(c=>[{x:c.x,y:c.y,radius:spacing(cat,c,.046)},...(c.traverse?[{...c.traverse.to,radius:spacing(cat,c,.046)}]:[])]);}
  _route(cat,point){const path=findPath(cat,point);if(!path)return false;cat.target=copyPoint(point);cat.path=path;cat.state=cat.task?'approach':'walk';cat.stateTime=0;cat.progressAt=this.time;cat.bestDistance=Infinity;return true;}
  _near(point,index=0,size=1){
    if(index===0&&isWalkable(point))return copyPoint(point);
    for(let i=0;i<20;i++){const a=(i*.618+index*.5)*Math.PI*2,r=(.029+Math.floor(i/6)*.008)*Math.max(1,size);const p={x:point.x+Math.cos(a)*r,y:point.y+Math.sin(a)*r/ASPECT};if(isWalkable(p))return p;}return null;
  }
  _clearSpot(point,cat,min=CAT_PERSONAL_SPACE){
    return this.cats.every(other=>other===cat||!other.active||(distance(point,other)>=spacing(cat,other,min)&&(!other.target||distance(point,other.target)>=spacing(cat,other,min))&&(!other.traverse||distance(point,other.traverse.to)>=spacing(cat,other,min))));
  }
  _freePoint(anchor,cat,{nearOnly=false,avoidZone=null,maxRadius=.15}={}){
    const allowed=p=>isWalkable(p)&&surfaceAt(p)?.id!=='lower-platform'&&this._clearSpot(p,cat)&&(!avoidZone||distance(p,avoidZone)>.16);
    if(allowed(anchor))return copyPoint(anchor);
    // Increasing rings distribute feet around facilities, not identical offsets
    // on a single tiny circle. Targets also reserve room before cats arrive.
    const phase=(cat.id.length%7)*.31;
    for(let i=0;i<80;i++){const radius=.035+Math.sqrt(i/79)*(maxRadius-.035),a=phase+i*2.39996323,p={x:anchor.x+Math.cos(a)*radius,y:anchor.y+Math.sin(a)*radius/ASPECT};if(allowed(p))return p;}
    if(nearOnly)return null;
    let best=null,score=-Infinity;
    for(let i=0;i<72;i++){const p=randomWalkable(this.random);if(!allowed(p))continue;const nearest=Math.min(...this.cats.filter(c=>c!==cat&&c.active).map(c=>distance(p,c.target||c)),1);const value=nearest-distance(p,anchor)*.12;if(value>score){best=p;score=value;}}
    return best;
  }
  _restTarget(cat,anchor,zone){
    const nearby=this.cats.filter(c=>c!==cat&&c.active&&c.restZone===zone).length;
    const target=this._freePoint(anchor,cat,nearby>=3?{avoidZone:anchor}:{});
    return target?{target,zone:distance(target,anchor)<.145?zone:'garden'}:null;
  }
  _slotAvailable(slot,cat){return this.cats.every(c=>c===cat||!c.active||(c.restIntent?.slotId!==slot.id&&c.sleepSlotId!==slot.id&&distance(c.target||c,slot)>=spacing(cat,c,COLLISION_SPACE)));}
  _chooseSleepSlot(cat,preferred='bed'){
    const preference=slot=>slot.surfaceId===preferred?0:slot.surfaceId==='bed'?1:slot.surfaceId==='safe-rock'?2:3;
    return SLEEP_SLOTS.filter(slot=>!slot.traversal).sort((a,b)=>preference(a)-preference(b)||distance(cat,a)-distance(cat,b)).find(slot=>this._slotAvailable(slot,cat)&&findPath(cat,slot));
  }
  _assignRest(cat,slot,{persistent=true,kind='sleep'}={}){
    if(slot.traversal==='jump')return this._assignClimb(cat);
    const path=findPath(cat,slot);if(!path)return false;this._release(cat);cat.active=true;cat.sleepSlotId=slot.id;
    cat.restIntent=persistent?{slotId:slot.id,surfaceId:slot.surfaceId,target:copyPoint(slot),kind}:null;
    cat.restZone=slot.surfaceId==='bed'?'bed':slot.surfaceId==='safe-rock'?'rock':'garden';
    cat.target=copyPoint(slot);cat.path=path;cat.afterWalk=kind;cat.state='approach';cat.wait=0;
    if(distance(cat,slot)<.003){cat.path=[];this._arrive(cat);}return true;
  }
  _resumeRest(cat){
    const intent=cat.restIntent;if(!intent)return;
    const requested=SLEEP_SLOT_MAP[intent.slotId],slot=requested&&this._slotAvailable(requested,cat)?requested:this._chooseSleepSlot(cat,intent.surfaceId);
    if(slot)this._assignRest(cat,slot,{persistent:true,kind:intent.kind});
    else{cat.state=intent.kind;cat.wait=Infinity;cat.target=null;cat.path=[];}
  }
  _arrive(cat){
    cat.target=null;cat.path=[];cat.speed=0;cat.manualRoute=false;
    if(cat.climbAction==='up'){cat.climbAction=null;this._startTraverse(cat,'up');return;}
    if(cat.task){this._begin(cat);return;}
    cat.state=cat.restIntent?.kind||cat.afterWalk||'idle';cat.afterWalk=null;cat.stateTime=0;cat.wait=cat.restIntent?Infinity:3+this.random()*6;
  }
  _platformReserved(cat){return this.cats.some(c=>c!==cat&&c.active&&(c.restIntent?.surfaceId==='lower-platform'||c.climbAction||c.traverse?.kind==='climb'||surfaceAt(c)?.id==='lower-platform'));}
  _onPlatform(cat){return surfaceAt(cat)?.id==='lower-platform';}
  _assignClimb(cat){
    if(this._platformReserved(cat))return false;
    const slot=SLEEP_SLOT_MAP['climbing-lower'];
    if(this._onPlatform(cat)&&!cat.traverse){this._release(cat);cat.restIntent={slotId:slot.id,surfaceId:slot.surfaceId,target:copyPoint(slot),kind:'rest'};cat.sleepSlotId=slot.id;cat.state='rest';cat.wait=Infinity;return true;}
    const target=FACILITIES.climbing.approach,path=findPath(cat,target);if(!path)return false;
    this._release(cat);cat.restIntent={slotId:slot.id,surfaceId:slot.surfaceId,target:copyPoint(slot),kind:'rest'};cat.sleepSlotId=slot.id;cat.climbAction='up';cat.path=path;cat.target=copyPoint(target);cat.state='approach';cat.wait=0;
    if(distance(cat,target)<.003){cat.path=[];this._arrive(cat);}return true;
  }
  _startTraverse(cat,direction){
    const ground=FACILITIES.climbing.approach;
    const to=direction==='up'?FACILITIES.climbing.landing:this._freePoint(ground,cat,{nearOnly:true,maxRadius:.065})||ground;
    const from=copyPoint(cat),fromElevation=surfaceAt(from)?.elevation||0,toElevation=surfaceAt(to)?.elevation||0;
    cat.path=[];cat.target=null;cat.task=null;cat.climbAction=null;cat.speed=0;cat.state='crouch';cat.stateTime=0;
    cat.traverse={kind:'climb',direction,from,to:copyPoint(to),phase:'crouch',elapsed:0,progress:0,jumpProgress:0,jumpHeight:0,fromElevation,toElevation};
    cat.facing=to.x>=from.x?1:-1;cat.heading=Math.atan2((to.y-from.y)*ASPECT,to.x-from.x);
  }
  _startSurfaceTraverse(cat,jump){
    // Retain the route, destination, interaction reservation and sleep intent.
    // Only locomotion pauses while the paws leave one physical surface.
    const from=copyPoint(cat),to=copyPoint(jump.to);
    cat.speed=0;cat.state='crouch';cat.stateTime=0;
    cat.traverse={kind:'surface',direction:jump.direction,from,to,fromSurface:jump.fromSurface,toSurface:jump.toSurface,arc:jump.arc,phase:'crouch',elapsed:0,progress:0,jumpProgress:0,jumpHeight:0,fromElevation:surfaceAt(from)?.elevation||0,toElevation:surfaceAt(to)?.elevation||0};
    cat.motionHeading=cat.heading=Math.atan2((to.y-from.y)*ASPECT,to.x-from.x);cat.facing=to.x>=from.x?1:-1;
  }
  _queueGroundAction(cat,action){
    // A new command replaces the one pending action, never interrupts a cat
    // in mid-air or piles up a queue of future interactions.
    if(cat.traverse){
      if(cat.traverse.kind==='surface'){
        // Release the old target immediately, but finish the current safe hop.
        const move=cat.traverse;this._release(cat);cat.traverse=move;cat.state=move.phase==='jump'?'jump':'crouch';
      }
      cat.pendingCommand=action;cat.restIntent=null;cat.sleepSlotId=null;return {ok:true,catIds:[cat.id],pending:true,message:`${cat.name}落稳后就过来。`};}
    this._release(cat);cat.pendingCommand=action;this._startTraverse(cat,'down');return {ok:true,catIds:[cat.id],pending:true,message:`${cat.name}正轻轻跳回庭院。`};
  }
  _runPending(cat,action){
    if(!action){cat.state='observe';cat.wait=2;return;}
    if(action.type==='tool')this.command(action.tool,action.point,cat.id);
    else if(action.type==='facility')this.visitFacility(action.id,cat.id);
    else if(action.type==='prop')this.useProp(action.id,cat.id);
    else if(action.type==='rest')this.setActive(cat.id,false);
    else{cat.state='observe';cat.wait=2;}
  }
  _updateTraverse(cat,dt){
    const move=cat.traverse;if(!move)return;move.elapsed+=dt;const shortHop=move.kind==='surface',crouchDuration=shortHop?.24:.32,jumpDuration=shortHop?.54:.82,landDuration=shortHop?.22:.28;
    if(move.phase==='crouch'){
      cat.state='crouch';move.progress=Math.min(1,move.elapsed/crouchDuration);
      if(move.elapsed>=crouchDuration){move.phase='jump';move.elapsed=0;move.progress=0;cat.state='jump';cat.stateTime=0;}
      return;
    }
    if(move.phase==='jump'){
      const progress=Math.min(1,move.elapsed/jumpDuration);move.progress=progress;move.jumpProgress=progress;move.jumpHeight=Math.sin(progress*Math.PI)*(move.arc||.045);
      const t=progress*progress*(3-2*progress);cat.x=move.from.x+(move.to.x-move.from.x)*t;cat.y=move.from.y+(move.to.y-move.from.y)*t;cat.state='jump';
      if(progress>=1){Object.assign(cat,move.to);move.phase='land';move.elapsed=0;move.progress=0;move.jumpHeight=0;cat.state='crouch';cat.stateTime=0;this._event('land',cat,shortHop?'step':'climbing');}
      return;
    }
    cat.state='crouch';move.progress=Math.min(1,move.elapsed/landDuration);if(move.elapsed<landDuration)return;
    const pending=cat.pendingCommand;cat.traverse=null;cat.pendingCommand=null;
    if(shortHop){
      cat.motionHeading=cat.heading;cat.bestDistance=Infinity;cat.progressAt=this.time;cat.stateTime=0;
      if(pending){this._release(cat);this._runPending(cat,pending);}
      else if(cat.path.length)cat.state=cat.task||cat.restIntent?'approach':'walk';
      else this._arrive(cat);
      return;
    }
    if(move.direction==='up'){
      if(pending){cat.pendingCommand=pending;this._startTraverse(cat,'down');}
      else{const slot=SLEEP_SLOT_MAP['climbing-lower'];cat.restIntent={slotId:slot.id,surfaceId:slot.surfaceId,target:copyPoint(slot),kind:'rest'};cat.sleepSlotId=slot.id;cat.state='rest';cat.stateTime=0;cat.wait=Infinity;}
    }else{this._release(cat);this._runPending(cat,pending);}
  }
  _planFood(anchor,candidates,maxCats){
    const tryGroup=group=>{
      const variants=group.length===2?[group,[...group].reverse()]:[group];let best=null;
      for(const ordered of variants){
        const bowl=foodBowlLayout(ordered,anchor),seats=ordered.length===2?[[-1,1]]:[[-1],[1]];
        for(const order of seats){const assignments=[];let score=0;
          for(let i=0;i<ordered.length;i++){
            const cat=ordered[i],dock=feedingDock(cat,bowl,order[i]);
            if(!dock||!isWalkable(dock)||!sameSurface(dock,anchor)||!segmentWalkable(dock,anchor))break;
            if(assignments.some(a=>distance(a.target,dock)<spacing(a.cat,cat,COLLISION_SPACE)))break;
            if(this.cats.some(other=>other.active&&!ordered.includes(other)&&distance(other.target||other,dock)<spacing(cat,other,COLLISION_SPACE)))break;
            const path=findPath(cat,dock);if(!path)break;
            const target=copyPoint(dock);assignments.push({cat,target,path,feeding:{seat:dock.seat,facing:dock.facing}});score+=distance(cat,target);
          }
          if(assignments.length===ordered.length&&(!best||score<best.score))best={assignments,bowl,score};
        }
      }return best;
    };
    if(maxCats===2)for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const plan=tryGroup([candidates[i],candidates[j]]);if(plan)return plan;}
    for(const cat of candidates){const plan=tryGroup([cat]);if(plan)return plan;}return null;
  }
  command(tool,point,catId){
    if(!CAT_TOOLS.includes(tool))return {ok:false,message:'先选择一个互动道具。'};
    if(tool==='wand'){
      const old=this.props.find(p=>p.tool==='wand');if(old&&(!catId||old.catIds.includes(catId))){this._removeProp(old);return {ok:true,message:'收起逗猫棒，让它歇一会儿。',ended:true};}
    }
    const selected=catId?this.cats.find(c=>c.id===catId&&c.active):null;
    if(catId&&!selected)return {ok:false,message:'这只猫正在回窝休息。'};
    if(selected&&(selected.traverse||this._onPlatform(selected)))return this._queueGroundAction(selected,{type:'tool',tool,point:point&&copyPoint(point)});
    const anchor=selected?copyPoint(selected):point;
    if(!anchor||!isWalkable(anchor))return {ok:false,message:'这里是花丛或设施，试试空一点的石板地。'};
    if(tool==='scratch'&&this.props.filter(p=>p.tool==='scratch').length>=CAT_LIMITS.scratchBoards)return {ok:false,message:'庭院已有三块猫抓板，可以先挪动或收起一块。'};
    const candidates=selected?[selected]:this.cats.filter(c=>c.active&&!c.task&&!c.traverse&&!this._onPlatform(c)).sort((a,b)=>(!!a.restIntent-!!b.restIntent)||distance(a,anchor)-distance(b,anchor));
    if(!candidates.length)return {ok:false,message:'猫咪们正在玩，轻点一只猫可以换一个互动。'};
    const foodPlan=tool==='food'?this._planFood(anchor,candidates,selected?1:2):null;
    const assignments=foodPlan?.assignments||[];
    for(const cat of tool==='food'?[]:candidates){
      const target=selected&&tool==='pet'?copyPoint(cat):this._near(anchor,assignments.length+1,catSize(cat));
      if(!target)continue;const path=findPath(cat,target);if(!path)continue;
      assignments.push({cat,target,path});if(assignments.length>=(tool==='food'&&!selected?2:1))break;
    }
    if(!assignments.length)return {ok:false,message:'猫咪暂时走不到这里，换一块石板试试。'};
    if(tool==='wand'){const old=this.props.find(p=>p.tool==='wand');if(old)this._removeProp(old);}
    const temporary=this.props.filter(p=>!p.persistent);
    if(tool!=='scratch'&&temporary.length>=CAT_LIMITS.temporaryProps)this._removeProp(temporary[0]);
    const prop={id:this._id('prop'),tool,...copyPoint(anchor),...(foodPlan?{foodScale:foodPlan.bowl.foodScale,capacity:foodPlan.bowl.capacity}:{}),origin:copyPoint(anchor),catIds:[],age:0,ttl:tool==='scratch'?Infinity:40,persistent:tool==='scratch',phase:0,lastPointerAt:this.time};
    for(const {cat,target,path,feeding} of assignments){
      this._release(cat);cat.task={tool,propId:prop.id,target,elapsed:0,phase:'approach',round:0,manual:true,...(feeding?{feeding}: {})};
      cat.target=copyPoint(target);cat.path=path;cat.state='approach';cat.wait=0;cat.expression=tool==='pet'?'heart':null;prop.catIds.push(cat.id);
      if(selected&&tool==='pet'){cat.path=[];cat.target=null;this._begin(cat);}
    }
    this.props.push(prop);this.lastPointerAt=this.time;
    return {ok:true,catIds:[...prop.catIds],propId:prop.id};
  }
  pointer(point){
    if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return;
    if(this.pointerPoint&&distance(this.pointerPoint,point)<.001)return;
    this.pointerPoint=copyPoint(point);this.lastPointerAt=this.time;
    const prop=this.props.find(p=>p.tool==='wand');if(!prop)return;
    const d=distance(point,prop.origin),r=.055,t=d>r?r/d:1;
    const target={x:prop.origin.x+(point.x-prop.origin.x)*t,y:prop.origin.y+(point.y-prop.origin.y)*t};
    if(isWalkable(target)&&segmentWalkable(prop,target)){prop.x=target.x;prop.y=target.y;prop.lastPointerAt=this.time;}
  }
  _begin(cat){const firstArrival=cat.task?.phase==='approach';if(firstArrival&&cat.task?.tool==='wand'){const prop=this.props.find(p=>p.id===cat.task.propId);if(prop)prop.lastPointerAt=this.time;}cat.state=cat.task?.tool==='food'?'observe':'interact';cat.stateTime=0;if(cat.task){cat.task.phase=cat.task.tool==='food'?'orient':'interact';cat.task.orientElapsed=0;}cat.speed=0;cat.target=null;cat.path=[];this._event('interaction',cat,cat.task?.tool);}
  _interact(cat,dt){
    const task=cat.task,prop=this.props.find(p=>p.id===task.propId);if(!prop){this._release(cat);return;}
    if(task.tool==='food'&&task.phase==='orient'){
      task.orientElapsed+=dt;const facing=task.feeding?.facing||1,heading=facing===1?0:Math.PI;
      cat.heading+=clamp(angleDelta(cat.heading,heading),-4.8*dt,4.8*dt);cat.motionHeading=cat.heading;
      if(Math.abs(angleDelta(cat.heading,heading))<.35)cat.facing=facing;
      if(task.orientElapsed>=.45&&Math.abs(angleDelta(cat.heading,heading))<.04){cat.facing=facing;task.phase='interact';task.elapsed=0;cat.stateTime=0;}return;
    }
    task.elapsed+=dt;
    if(task.tool==='food'){cat.state=task.elapsed<1?'observe':task.elapsed<5.5?'eat':'groom';cat.expression=task.elapsed>5.8?'heart':null;}
    else if(task.tool==='pet'){cat.state='interact';cat.expression='heart';}
    else if(task.tool==='scratch'){cat.state='interact';cat.expression=task.elapsed>3.5?'relaxed':null;}
    else if(task.tool==='wand'){
      cat.state='observe';cat.expression=Math.sin(task.elapsed*2)>0?'curious':null;
      if(task.elapsed>task.round*.9+.9&&distance(cat,prop)>.014){task.round++;const target=this._near(prop,1,catSize(cat));if(target&&distance(target,prop.origin)<.09)this._route(cat,target);}
      if(this.time-prop.lastPointerAt>12){this._release(cat);return;}
    }else{
      cat.state='interact';cat.expression=task.elapsed<.6?'curious':null;
      if(task.round<2&&task.elapsed>1+task.round*2){
        task.round++;const a=this.random()*Math.PI*2,point={x:prop.x+Math.cos(a)*.028,y:prop.y+Math.sin(a)*.028/ASPECT};
        if(isWalkable(point)&&segmentWalkable(prop,point)){prop.moveTarget=point;const target=this._near(point,1,catSize(cat));if(target)this._route(cat,target);}
      }
    }
    if(task.elapsed>=durations[task.tool]){cat.interactions++;this._event('finished',cat,task.tool);this._release(cat);cat.state=task.tool==='food'?'groom':'rest';cat.expression='heart';cat.wait=2+this.random()*2;}
  }
  _move(cat,dt){
    // A cat may settle into a destination after a route was planned. Shift the
    // destination locally rather than pushing forever against its resting body.
    if(!cat.restIntent&&cat.task?.tool!=='food'&&cat.target&&this.time>(cat.nextRepath||0)&&distance(cat,cat.target)<.085&&this.cats.some(c=>c!==cat&&c.active&&!c.path.length&&distance(c,cat.target)<COLLISION_SPACE)){
      cat.nextRepath=this.time+1.5;const prop=cat.task&&this.props.find(p=>p.id===cat.task.propId);const target=this._freePoint(prop||cat.target,cat,{nearOnly:true,maxRadius:prop?.075:.15,avoidZone:cat.afterWalk==='sleep'&&cat.restZone==='garden'?FACILITIES.bed.approach:null});if(target)this._route(cat,target);
    }
    cat.path=prepareSurfacePath(cat,cat.path);
    let next=cat.path[0];if(!next){this._arrive(cat);return;}
    const distanceToNext=distance(cat,next);
    if(distanceToNext<(cat.bestDistance??Infinity)-.002){cat.bestDistance=distanceToNext;cat.progressAt=this.time;}
    if(cat.target&&this.time-(cat.progressAt??0)>2.2&&this.time>(cat.nextDynamicRoute||0)){
      cat.nextDynamicRoute=this.time+2;const path=findPath(cat,cat.target,{avoid:this._avoidCats(cat)});
      if(path){cat.path=prepareSurfacePath(cat,path);cat.bestDistance=Infinity;cat.progressAt=this.time;next=cat.path[0];}
      else if(!cat.task&&!cat.restIntent&&!cat.manualRoute&&!next.jump){this._release(cat);cat.wait=1;return;}
    }
    // Round a navigation corner only when the shortcut stays on a legal
    // surface. The body follows a curve; it never teleports to a path node.
    if(cat.path.length>1&&!next.jump&&sameSurface(cat,cat.path[1])&&distance(cat,next)<Math.max(.006,cat.speed*.30)&&segmentWalkable(cat,cat.path[1])){cat.path.shift();next=cat.path[0];cat.bestDistance=Infinity;cat.progressAt=this.time;}
    const d=distance(cat,next),remaining=distance(cat,next.jump?next:cat.target||next),preset=getPreset(cat.presetId);
    const base=typeof preset?.speed==='number'?clamp(preset.speed,.012,.045):.024,personality=personalityOf(cat);
    const direction=Math.atan2((next.y-cat.y)*ASPECT,next.x-cat.x),oldHeading=Number.isFinite(cat.motionHeading)?cat.motionHeading:cat.heading;
    const turn=angleDelta(oldHeading,direction),turnRate=4.8;
    cat.motionHeading=d<Math.max(.002,cat.speed/turnRate*1.15)?direction:oldHeading+clamp(turn,-turnRate*dt,turnRate*dt);
    const turnFactor=clamp(Math.cos(turn),.13,1),cruise=base*personality.speed*Math.sqrt(catSize(cat))*(cat.task&&['mouse','yarn'].includes(cat.task.tool)?1.22:1);
    const braking=.075,desired=Math.min(cruise*turnFactor,Math.sqrt(2*braking*.72*Math.max(0,remaining-.00008)));
    const previousSpeed=cat.speed,acceleration=desired>cat.speed?.065:braking;
    cat.speed+=clamp(desired-cat.speed,-acceleration*dt,acceleration*dt);cat.movementAcceleration=(cat.speed-previousSpeed)/Math.max(dt,.000001);
    const step=Math.min(d,cat.speed*dt);
    if(d>.00001){
      let proposed={x:cat.x+Math.cos(cat.motionHeading)*step,y:cat.y+Math.sin(cat.motionHeading)*step/ASPECT};
      // Tight steps and narrow porch entries may not have room for an arc.
      // Continue the legal segment as the facing catches up; never cut flowers.
      if((!sameSurface(cat,proposed)||!isWalkable(proposed)||!segmentWalkable(cat,proposed))&&Math.abs(turn)<.65)proposed={x:cat.x+(next.x-cat.x)*step/d,y:cat.y+(next.y-cat.y)*step/d};
      for(const other of this.cats)if(other!==cat&&other.active){const near=distance(proposed,other),personal=spacing(cat,other);if(near>.0001&&near<personal+.005){
        const push=Math.max(0,personal-near)*Math.min(.16,dt*3),vx=(next.x-cat.x)/d,vy=(next.y-cat.y)*ASPECT/d;
        const toward=vx*(other.x-cat.x)+vy*(other.y-cat.y)*ASPECT;
        const cross=vx*(other.y-cat.y)*ASPECT-vy*(other.x-cat.x),side=cross>=0?-1:1,lateral=toward>0?step*.65:0;
        const shifted={x:proposed.x+(proposed.x-other.x)/near*push-vy*lateral*side,y:proposed.y+(proposed.y-other.y)/near*push+vx*lateral*side/ASPECT};
        if(sameSurface(cat,shifted)&&isWalkable(shifted)&&segmentWalkable(cat,shifted))proposed=shifted;
      }}
      const overlaps=this.cats.some(other=>other!==cat&&other.active&&[other,...(other.traverse?[other.traverse.to]:[])].some(occupied=>distance(proposed,occupied)<spacing(cat,other,COLLISION_SPACE)&&distance(proposed,occupied)<distance(cat,occupied)));
      if(!overlaps&&sameSurface(cat,proposed)&&isWalkable(proposed)&&segmentWalkable(cat,proposed)){cat.x=proposed.x;cat.y=proposed.y;}
      else cat.speed=Math.max(0,cat.speed-braking*dt);
    }
    // Settle the final paw placement within a subpixel tolerance instead of
    // stopping five screen pixels early at every waypoint.
    if(distance(cat,next)<.00012){
      if(segmentWalkable(cat,next)&&!this.cats.some(other=>other!==cat&&other.active&&distance(next,other)<spacing(cat,other,COLLISION_SPACE)))Object.assign(cat,copyPoint(next));
      if(next.jump&&!this._clearSpot(next.jump.to,cat,COLLISION_SPACE)){cat.speed=0;return;}
      cat.path.shift();cat.bestDistance=Infinity;cat.progressAt=this.time;if(next.jump){this._startSurfaceTraverse(cat,next.jump);return;}if(!cat.path.length)this._arrive(cat);
    }
  }

  _decide(cat,env){
    if(cat.task||cat.traverse||cat.path.length||cat.wait>0)return;
    if(cat.restIntent){this._resumeRest(cat);return;}
    cat.expression=null;cat.restZone=null;cat.sleepSlotId=null;const roll=this.random(),profile=personalityOf(cat),night=env?.night||env?.time==='night';
    if(roll<(night?profile.night:profile.rest)){
      const sleep=night||this.random()<.3,slot=this._chooseSleepSlot(cat,sleep?'bed':'ground');
      if(slot&&this._assignRest(cat,slot,{persistent:false,kind:sleep?'sleep':'rest'}))return;
      cat.state=sleep?'sleep':'rest';cat.restZone='garden';cat.wait=(8+this.random()*14)*profile.wait;
    }else if(roll<.48){cat.state=this.random()<.55?'groom':'observe';cat.expression=cat.state==='observe'?'curious':null;cat.wait=(3+this.random()*5)*profile.wait;}
    else{
      let target=null;for(let i=0;i<12;i++){const p=randomWalkable(this.random);if(distance(p,cat)<.20&&distance(p,cat)>.045&&this._clearSpot(p,cat)){target=p;break;}}
      if(target)this._route(cat,target);else{cat.state='idle';cat.wait=3;}
    }
  }
  update(dt,env={}){
    dt=Math.max(0,Math.min(.12,Number(dt)||0));this.time+=dt;this.decisionClock+=dt;const decide=this.decisionClock>=.5;if(decide)this.decisionClock=0;
    for(const prop of [...this.props]){prop.age+=dt;prop.phase+=dt;if(prop.moveTarget){const d=distance(prop,prop.moveTarget),step=Math.min(d,dt*(prop.tool==='mouse'?.034:.023));if(d>.00001){const point={x:prop.x+(prop.moveTarget.x-prop.x)*step/d,y:prop.y+(prop.moveTarget.y-prop.y)*step/d};if(segmentWalkable(prop,point))Object.assign(prop,point);else prop.moveTarget=null;}if(d<=step+.0001)prop.moveTarget=null;}if(prop.age>=prop.ttl)this._removeProp(prop);}
    for(const cat of this.cats){if(!cat.active)continue;const before=copyPoint(cat);cat.animTime+=dt;cat.phase+=dt*(cat.path.length?5:1.2);cat.stateTime+=dt;cat.wait=Math.max(0,cat.wait-dt);
      if(cat.traverse)this._updateTraverse(cat,dt);else if(cat.path.length)this._move(cat,dt);else if(cat.task){if(cat.task.phase==='approach')this._begin(cat);this._interact(cat,dt);}else if(decide)this._decide(cat,env);
      cat.motionDx=cat.x-before.x;cat.motionDy=cat.y-before.y;const travel=distance(cat,before);if(!cat.traverse){
        cat.strideDistance+=travel;
        if(travel>.000001&&cat.strideDistance>=(cat.nextFootstepDistance??.014*catSize(cat))){
          cat.nextFootstepDistance=cat.strideDistance+.022*catSize(cat);this._event('step',cat);
        }
      }
      if(travel>.000001){
        const desired=Math.atan2(cat.motionDy*ASPECT,cat.motionDx),delta=angleDelta(cat.heading,desired);cat.heading+=clamp(delta*(1-Math.exp(-dt*10)),-5.6*dt,5.6*dt);
        // Horizontal hysteresis keeps near-vertical walks from flickering mirror
        // direction on tiny sideways avoidance movements.
        const horizontal=Math.cos(cat.heading);if(horizontal>.24)cat.facing=1;else if(horizontal<-.24)cat.facing=-1;
      }
      const surface=surfaceAt(cat);const airborne=cat.traverse?.phase==='jump';cat.surfaceId=airborne?'air':surface?.id||'ground';cat.elevation=airborne?cat.traverse.fromElevation+(cat.traverse.toElevation-cat.traverse.fromElevation)*cat.traverse.jumpProgress:surface?.elevation||0;cat.surfaceLayer=airborne?4:surface?.layer||0;cat.worldFoot=copyPoint(cat);
    }
  }
  clearTransient(){for(const c of this.cats){const rest=c.restIntent&&clone(c.restIntent);if(c.traverse)Object.assign(c,supportedTraversalPoint(c));this._release(c);if(rest){c.restIntent=rest;this._resumeRest(c);}}this.props=this.props.filter(p=>p.persistent).map(p=>({...p,catIds:[],age:0,ttl:Infinity}));this.pointerPoint=null;this.events=[];}
  view(){const visibleCount=this.cats.filter(c=>c.active).length,sleepingCount=this.cats.filter(c=>c.active&&c.restIntent).length,awakeCount=visibleCount-sleepingCount;return {cats:this.cats,props:this.props,environment:this.environment,activeCount:awakeCount,awakeCount,sleepingCount,visibleCount,collectionCount:this.cats.length,maxActive:MAX_ACTIVE_CATS,maxVisible:MAX_ACTIVE_CATS};}
  snapshot(){return normalizeCats({version:1,cats:this.cats.map(c=>c.traverse?{...c,...supportedTraversalPoint(c)}:c),props:this.props.filter(p=>p.persistent),environment:this.environment,nextId:this.serial});}
  addCat(value){
    const design=validateDesign(value);if(!design)return {ok:false,message:'猫咪设计格式不正确。'};
    if(this.cats.length>=MAX_CAT_COLLECTION)return {ok:false,message:'猫咪收藏已满，请先导出珍藏的设计。'};
    const active=this.cats.filter(c=>c.active).length<MAX_ACTIVE_CATS;
    let p={x:.58,y:.60},best=-1;for(let i=0;i<28;i++){const candidate=randomWalkable(this.random);if(surfaceAt(candidate)?.id!=='ground')continue;const score=Math.min(...this.cats.filter(c=>c.active).map(c=>distance(c,candidate)),1);if(score>best){best=score;p=candidate;}}
    const cat=this._runtimeCat({...design,id:this._id('friend'),active,...p});this.cats.push(cat);return {ok:true,cat,message:active?`${cat.name}来庭院玩了。`:'庭院已满，这只猫先在收藏里休息。'};
  }
  _revalidateSize(cat){
    // A reserved foot position was planned for the old body size. Keep the
    // intent, but release an undersized bed slot before walking to a new one.
    if(!cat.active||cat.traverse||this._onPlatform(cat))return true;
    const resting=cat.restIntent||cat.sleepSlotId&&['sleep','rest'].includes(cat.afterWalk||cat.state);
    if(resting){
      const slot=SLEEP_SLOT_MAP[cat.restIntent?.slotId||cat.sleepSlotId];
      if(slot&&this._slotAvailable(slot,cat))return true;
      // In the small mat the inner cat can be trapped behind its neighbour.
      // Prefer moving this cat, then a resting neighbour with an open exit.
      const neighbours=this.cats.filter(other=>other!==cat&&other.active&&!other.task&&!other.traverse&&(other.restIntent||other.sleepSlotId)&&distance(other.target||other,slot||cat)<spacing(cat,other));
      for(const moving of [cat,...neighbours]){
        const originalSlot=SLEEP_SLOT_MAP[moving.restIntent?.slotId||moving.sleepSlotId];
        const preference=s=>s.surfaceId===originalSlot?.surfaceId?0:s.surfaceId==='bed'?1:s.surfaceId==='safe-rock'?2:3;
        const slots=SLEEP_SLOTS.filter(s=>!s.traversal&&s.id!==originalSlot?.id).sort((a,b)=>preference(a)-preference(b)||distance(moving,a)-distance(moving,b));
        for(const replacement of slots){
          if(!this._slotAvailable(replacement,moving))continue;
          const path=findPath(moving,replacement,{avoid:this._avoidCats(moving)});if(!path)continue;
          if(this._assignRest(moving,replacement,{persistent:!!moving.restIntent,kind:moving.restIntent?.kind||moving.afterWalk||moving.state})){moving.path=path;return true;}
        }
      }
      return false;
    }
    if(cat.task?.tool==='food'){
      const prop=this.props.find(p=>p.id===cat.task.propId);if(!prop)return false;
      const diners=this.cats.filter(c=>c.task?.propId===prop.id),bowl={...prop},plans=[];
      if(diners.length===2){
        for(let i=0;i<3;i++){
          const [a,b]=diners.map(c=>feedingDock(c,bowl,c.task.feeding.seat)),required=spacing(diners[0],diners[1])+.001,gap=distance(a,b);
          if(gap>=required)break;
          bowl.foodSeatX=Math.min(12,(bowl.foodSeatX||10)+(required-gap)*1600/(2*bowl.foodScale));
        }
      }
      for(const diner of diners){
        const dock=feedingDock(diner,bowl,diner.task.feeding?.seat||-1),path=dock&&findPath(diner,dock);
        if(!dock||!path||!sameSurface(dock,bowl)||this.cats.some(c=>c.active&&!diners.includes(c)&&distance(c.target||c,dock)<spacing(diner,c,COLLISION_SPACE)))return false;
        if(plans.some(p=>distance(p.dock,dock)<spacing(p.cat,diner)))return false;
        plans.push({cat:diner,dock,path});
      }
      if(bowl.foodSeatX)prop.foodSeatX=bowl.foodSeatX;
      for(const {cat:diner,dock,path} of plans){
        if(diner!==cat&&distance(diner.task.target,dock)<.000001)continue;
        diner.task.target=copyPoint(dock);diner.task.feeding={seat:dock.seat,facing:dock.facing};diner.task.phase='approach';diner.task.elapsed=0;
        diner.target=copyPoint(dock);diner.path=path;diner.state='approach';diner.stateTime=0;
      }return true;
    }
    const currentTarget=cat.target||cat.task?.target||cat;
    if(this._clearSpot(currentTarget,cat))return true;
    const prop=cat.task&&this.props.find(p=>p.id===cat.task.propId);
    const target=this._freePoint(prop||currentTarget,cat,{nearOnly:true,maxRadius:prop?.09:.15});
    if(!target||!findPath(cat,target))return false;
    const previousState=cat.state;
    if(cat.task){cat.task.target=copyPoint(target);cat.task.phase='approach';}
    if(!this._route(cat,target))return false;
    if(!cat.task)cat.afterWalk=['rest','sleep'].includes(previousState)?previousState:'observe';
    return true;
  }
  editCat(id,value){
    const cat=this.cats.find(c=>c.id===id),design=validateDesign(value);
    if(!cat||!design)return {ok:false,message:'没有保存，设计格式不正确。'};
    const previous=validateDesign(cat),oldSize=catSize(cat);Object.assign(cat,design);
    if((cat.task?.tool==='food'||catSize(cat)>oldSize+.0001)&&!this._revalidateSize(cat)){
      Object.assign(cat,previous);return {ok:false,message:'这里有点挤，先叫醒它或腾出一个休息位，再调整大小。'};
    }
    return {ok:true,cat};
  }
  setActive(id,active){
    const cat=this.cats.find(c=>c.id===id);if(!cat)return {ok:false,message:'没有找到这只猫。'};
    if(cat.traverse||(active&&cat.active&&this._onPlatform(cat)))return this._queueGroundAction(cat,{type:active?'wake':'rest'});
    if(!active){
      if(!cat.active)return {ok:true,cat,message:'这只猫正在收藏里休息。'};
      if(cat.restIntent)return {ok:true,cat,message:`${cat.name}正在去它喜欢的地方休息。`};
      const slot=this._chooseSleepSlot(cat,'bed');if(!slot||!this._assignRest(cat,slot))return {ok:false,message:'休息位暂时被占着，等旁边的猫走开一点再试试。'};
      return {ok:true,cat,message:`${cat.name}正走去${slot.label}，睡一会儿。`};
    }
    if(!cat.active&&this.cats.filter(c=>c.active).length>=MAX_ACTIVE_CATS)return {ok:false,message:'庭院最多同时容纳十二只猫，先把一只休息的猫收回收藏吧。'};
    const wasPresent=cat.active;this._release(cat);cat.active=true;if(!wasPresent)Object.assign(cat,this._freePoint(nearestWalkable(cat),cat)||nearestWalkable(cat));cat.state='observe';cat.wait=1.5;return {ok:true,cat,message:`${cat.name}醒来陪你了。`};
  }
  archiveCat(id){const cat=this.cats.find(c=>c.id===id);if(!cat)return {ok:false};if(cat.traverse)Object.assign(cat,supportedTraversalPoint(cat));this._release(cat);cat.active=false;return {ok:true,cat,message:`${cat.name}已收回收藏，名字和毛色都在。`};}
  removeCat(id){const cat=this.cats.find(c=>c.id===id);if(!cat)return {ok:false};this._release(cat);this.cats=this.cats.filter(c=>c!==cat);return {ok:true};}
  useProp(id,catId){
    const prop=this.props.find(p=>p.id===id&&p.persistent);if(!prop)return {ok:false,message:'这个道具已经收起。'};
    const selected=catId&&this.cats.find(c=>c.id===catId&&c.active);if(selected&&(selected.traverse||this._onPlatform(selected)))return this._queueGroundAction(selected,{type:'prop',id});
    const candidates=catId?this.cats.filter(c=>c.id===catId&&c.active):this.cats.filter(c=>c.active&&!c.task&&!c.traverse&&!this._onPlatform(c)).sort((a,b)=>(!!a.restIntent-!!b.restIntent)||distance(a,prop)-distance(b,prop));
    for(const cat of candidates){const target=this._near(prop,1,catSize(cat)),path=target&&findPath(cat,target);if(!path)continue;
      for(const occupying of this.cats)if(occupying.task?.propId===prop.id)this._cancelInteraction(occupying,true);
      this._release(cat);cat.task={tool:prop.tool,propId:id,target,elapsed:0,phase:'approach',round:0,manual:true};cat.path=path;cat.target=target;cat.state='approach';cat.wait=0;prop.catIds=[cat.id];return {ok:true,catIds:[cat.id],propId:id};
    }return {ok:false,message:'暂时没有能过来玩的猫，点一只猫再试试。'};
  }
  visitFacility(id,catId){
    const facility=FACILITIES[id];if(!facility||facility.available===false)return {ok:false,message:'这个位置暂时不开放。'};
    const selected=catId&&this.cats.find(c=>c.id===catId&&c.active);if(selected&&(selected.traverse||(this._onPlatform(selected)&&id!=='climbing')))return this._queueGroundAction(selected,{type:'facility',id});
    if(id==='climbing'&&this._platformReserved(selected))return {ok:false,message:'低平台已经有一只猫啦，等它下来再去。'};
    const cats=catId?this.cats.filter(c=>c.id===catId&&c.active):this.cats.filter(c=>c.active&&!c.task&&!c.traverse&&!this._onPlatform(c)).sort((a,b)=>(!!a.restIntent-!!b.restIntent)||distance(a,facility.approach)-distance(b,facility.approach));
    for(const cat of cats){
      if(id==='climbing'){if(this._assignClimb(cat))return {ok:true,catIds:[cat.id],message:`${cat.name}会先走到爬架旁，再轻轻跳上低平台。`};continue;}
      if(['bed','rock','sun'].includes(id)){const slot=this._chooseSleepSlot(cat,id==='rock'?'safe-rock':id==='sun'?'ground':'bed');if(slot&&this._assignRest(cat,slot,{persistent:true,kind:id==='bed'?'sleep':'rest'}))return {ok:true,catIds:[cat.id],message:`${cat.name}正走去${slot.label}。`};continue;}
      const target=facility.approach,path=findPath(cat,target);if(!path)continue;this._release(cat);cat.path=path;cat.target=copyPoint(target);cat.state='approach';cat.manualRoute=true;cat.afterWalk='observe';cat.expression=null;return {ok:true,catIds:[cat.id]};
    }
    return {ok:false,message:'猫咪现在过不去，等它走近一些。'};
  }
  removeProp(id){const prop=this.props.find(p=>p.id===id);if(!prop)return {ok:false};this._removeProp(prop);return {ok:true};}
  moveProp(id,point){const prop=this.props.find(p=>p.id===id);if(!prop||!prop.persistent)return {ok:false,message:'这个道具不能移动。'};if(!isWalkable(point)||surfaceAt(point)?.id==='lower-platform')return {ok:false,message:'请放在空一点的石板地。'};for(const c of this.cats)if(c.task?.propId===id)this._cancelInteraction(c,true);Object.assign(prop,copyPoint(point),{origin:copyPoint(point),catIds:[]});return {ok:true};}
  setEnvironment(patch){this.environment=normalizeEnvironment({...this.environment,...patch});return this.environment;}
}
