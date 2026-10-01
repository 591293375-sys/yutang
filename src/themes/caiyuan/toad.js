import {freePoint,nearestFree,safePoints,pathTo,approach,clearSegment,distance} from './habitat.js';
import {timeOfDay} from './model.js';
const lerp=(a,b,t)=>a+(b-a)*t;
export const arrangement=tool=>tool==='arrange'||tool?.startsWith('place:');
export class CaiyuanLife{
 constructor(model,random=Math.random){this.model=model;this.random=random;this.time=0;this.phase='idle';this.age=0;this.position=nearestFree(model.state.motion.position,model.state.items);this.visible=!!this.position;this.direction=1;this.height=0;this.squash=1;this.path=[];this.goal=null;this.hop=null;this.coins=[];this.serial=0;this.blinks=0;this.nextBlink=this.between(3,7);this.nextMove=this.between(8,15);this.nextEvent=this.between(120,240);this.lastInteraction=0;this.lanternKicks=[-100,-100];this.glows=[];this.traces=[];this.delivered=0;this.dissolved=0;this.hops=0;this.positionDirty=false;this.cues=[];this.hoverAge=0;this.hoverCooldown=0;this.mutedForLayout=false;this.storeFoot()}
 between(a,b){return a+(b-a)*this.random()}
 get items(){return this.model.state.items}
 get settings(){return this.model.state.settings}
 setPhase(phase){this.phase=phase;this.age=0;this.traces.push({phase,time:this.time});if(this.traces.length>40)this.traces.shift()}
 storeFoot(){if(this.position&&freePoint(this.position,this.items)){this.model.state.motion.position={...this.position};this.positionDirty=true}}
 takeDirty(){const v=this.positionDirty;this.positionDirty=false;return v}
 resetRoute(){this.respondingTrip=false;this.pendingClick=false;this.path=[];this.hop=null;this.height=0;this.squash=1;this.goal=null}
 settle(){this.resetRoute();this.setPhase('idle');this.nextMove=this.time+this.between(15,40)*(timeOfDay(this.settings.time)==='night'?1.8:1);this.storeFoot()}
 layoutChanged(){this.resetRoute();this.setPhase('idle');const p=nearestFree(this.position||this.model.state.motion.position,this.items);this.position=p;this.visible=!!p;this.storeFoot();this.nextMove=this.time+2;for(const c of this.coins){if(c.status==='ground'&&!freePoint(c,this.items,{x:8,y:3}))c.status='fading';if(c.status==='fading')c.fadeAt=this.time}}
 onAction(action){this.lastInteraction=this.time;this.hoverAge=0;
  if(['move','scale','store','remove','restore','undo','reset','clearTable','add'].includes(action))this.layoutChanged();
  if(action==='clearTable'||(action==='settings'&&!this.settings.showToad)){this.coins=[];this.resetRoute();this.setPhase('idle')}
  if(action==='wishComplete'){const bowl=this.items.find(i=>i.kind==='bowl'&&!i.stored);if(bowl)this.glows.push({id:bowl.id,at:this.time});if(!this.carried()&&this.position){this.resetRoute();this.goal={kind:'respond'};this.path=[{...this.position}];this.startHop()}}
  if(action==='ignite'&&!this.carried()&&this.position){this.resetRoute();const b=this.items.find(i=>i.kind==='burner'&&!i.stored);if(b)this.direction=b.x>=this.position.x?1:-1;this.setPhase('attention')}
  if(action==='add'&&this.random()<.45&&!this.carried()){const fruit=this.items.at(-1);if(fruit?.kind==='fruit')this.visit(fruit,'visit')}
 }
 drop(p){if(!this.settings.showToad)return{ok:false,message:'先在设置里唤回小金蟾吧。'};if(!freePoint(p,this.items,{x:10,y:4}))return{ok:false,message:'在供桌空处放一枚铜钱，避开摆件。'};if(this.coins.length>=3)return{ok:false,message:'桌上已有三枚铜钱，等小金蟾慢慢收好。'};
  if(!this.position||!pathTo(this.position,p,this.items))return{ok:false,message:'小金蟾暂时到不了这里，换一处更开阔的位置吧。'};
  if(this.coins.some(c=>c.status==='ground'&&distance(c,p)<20))return{ok:false,message:'给铜钱留一点间隔吧。'};
  this.coins.push({...p,id:'coin-'+(++this.serial),at:this.time,status:'ground'});this.lastInteraction=this.time;this.cues.push('place');if(!this.carried()){this.resetRoute();this.setPhase('idle')}return{ok:true};
 }
 carried(){return this.coins.find(c=>c.status==='carried'||c.status==='delivering')}
 route(p,goal,path){path=path||pathTo(this.position,p,this.items);if(!path)return false;const steps=[];let a=this.position;for(const b of path){const n=Math.max(1,Math.ceil(distance(a,b)/39));for(let i=1;i<=n;i++)steps.push({x:lerp(a.x,b.x,i/n),y:lerp(a.y,b.y,i/n)});a=b}this.path=steps;this.goal=goal;this.setPhase('notice');return true}
 startHop(){const end=this.path.shift();if(!end){this.arrive();return}if(!clearSegment(this.position,end,this.items)){this.settle();return}this.direction=Math.abs(end.x-this.position.x)>.002?(end.x>this.position.x?1:-1):this.direction;this.hop={start:{...this.position},end,duration:.68+distance(this.position,end)/240};this.setPhase('hop');this.hops++}
 arrive(){const goal=this.goal;this.hop=null;this.height=0;this.squash=1;this.path=[];this.storeFoot();
  if(goal?.kind==='coin'){const coin=this.coins.find(c=>c.id===goal.id&&c.status==='ground');if(coin){coin.status='carried';this.setPhase('carry');return}}
  if(goal?.kind==='bowl'){const bowl=this.items.find(i=>i.id===goal.id&&!i.stored);const c=this.carried();if(bowl&&c){c.status='delivering';this.delivery={id:bowl.id,coinId:c.id,at:this.time,start:{...this.position},end:{x:bowl.x,y:bowl.y}};this.setPhase('deliver');return}}
  if(goal?.kind==='nap'){this.setPhase('sleep');this.sleepFor=this.between(12,23);return}
  this.settle();
 }
 deliverRoute(){const bowls=this.items.filter(i=>i.kind==='bowl'&&!i.stored);for(const b of bowls){const dest=approach(b,this.position,this.items);if(dest&&this.route(dest.p,{kind:'bowl',id:b.id},dest.path))return}this.setPhase('dissolve')}
 visit(item,kind){if(!this.position)return false;const dest=approach(item,this.position,this.items);return !!dest&&this.route(dest.p,{kind,id:item.id},dest.path)}
 click(){if(!this.settings.showToad||!this.visible)return false;this.lastInteraction=this.time;this.cues.push('lamp');if(this.phase==='hop'||this.phase==='deliver'){this.pendingClick=true;return true}this.resetRoute();this.setPhase('response');return true}
 kickLantern(index){this.lanternKicks[index]=this.time;this.lastInteraction=this.time;this.cues.push('lamp')}
 update(dt,{paused=false,reducedMotion=false,editing=false,pointer=null,interactive=true}={}){
  if(paused)return;dt=Math.max(0,Math.min(.06,Number.isFinite(dt)?dt:0));this.time+=dt;this.glows=this.glows.filter(g=>this.time-g.at<2.5).slice(-4);
  const blocked=editing||arrangement(this.model.tool);
  if(blocked){this.mutedForLayout=true;return}if(this.mutedForLayout){this.mutedForLayout=false;this.layoutChanged()}
  // Coin and hop clocks pause together while the table is being arranged.
  this.age+=dt;
  for(const c of this.coins){c.activeAge=(c.activeAge||0)+dt;if(c.status==='ground'&&c.activeAge>45){c.status='fading';c.fadeAt=this.time}}
  this.coins=this.coins.filter(c=>c.status!=='fading'||this.time-c.fadeAt<1);
  if(!this.settings.showToad||!this.visible)return;
  const gentle=reducedMotion||this.settings.reduceMotion;
  const night=timeOfDay(this.settings.time)==='night';
  if(this.phase==='hop'){
   const h=this.hop;if(!h){this.settle();return}const u=Math.min(1,this.age/h.duration);
   const air=Math.max(0,Math.min(1,(u-.16)/.65)),next={x:lerp(h.start.x,h.end.x,air),y:lerp(h.start.y,h.end.y,air)};
   if(!freePoint(next,this.items)){this.position=h.start;this.settle();return}
   this.position=next;this.height=Math.sin(Math.PI*air)*(gentle?9:this.settings.motionIntensity==='gentle'?12:18);this.squash=u<.16?1-.055*Math.sin(u/.16*Math.PI):u>.81?1-.04*Math.sin((u-.81)/.19*Math.PI):1;
   if(u>=1){this.position={...h.end};this.storeFoot();if(this.pendingClick){this.pendingClick=false;this.respondingTrip=true;this.hop=null;this.height=0;this.squash=1;this.setPhase('response')}else if(this.path.length)this.startHop();else this.arrive()}return;
  }
  if(this.phase==='notice'){if(this.age>.45)this.startHop();return}
  if(this.phase==='carry'){if(this.age>.8)this.deliverRoute();return}
  if(this.phase==='deliver'){
   const bowl=this.items.find(i=>i.id===this.delivery?.id&&!i.stored);
   if(!bowl){this.setPhase('dissolve');return}
   if(this.age>1.15){this.coins=this.coins.filter(c=>c.id!==this.delivery.coinId);this.glows.push({id:bowl.id,at:this.time});this.delivered++;this.cues.push('sparkle');const respond=this.pendingClick;this.settle();if(respond)this.setPhase('response')}return;
  }
  if(this.phase==='dissolve'){if(this.age>1.6){const c=this.carried();if(c){this.coins=this.coins.filter(v=>v!==c);this.dissolved++}this.settle()}return}
  if(this.phase==='response'||this.phase==='attention'){if(this.age>(this.phase==='response'?.85:2)){if(this.respondingTrip){this.respondingTrip=false;if(this.path.length)this.startHop();else this.arrive()}else if(this.carried())this.setPhase('carry');else this.settle()}return}
  if(this.phase==='sleep'){if(this.age>this.sleepFor){this.settle()}else if(!this.coins.some(c=>c.status==='ground'))return;else this.settle()}
  // Retry no more than once a second, and only from a quiet state.
  if(this.time>=(this.nextDecision||0)){this.nextDecision=this.time+1;
   if(this.carried()){this.setPhase('carry');return}
   for(const c of this.coins.filter(c=>c.status==='ground'&&(c.activeAge||0)>.35)){if(this.route(c,{kind:'coin',id:c.id}))return}
  }
  if(this.time>=this.nextBlink){this.blinkAt=this.time;this.doubleBlink=this.random()<.18;this.blinks++;this.nextBlink=this.time+this.between(3,7)}
  if(interactive&&pointer&&distance(pointer,this.position)<115&&this.time>this.hoverCooldown&&!this.coins.length){this.hoverAge+=dt;if(this.hoverAge>1.3){this.hoverAge=0;this.hoverCooldown=this.time+16;this.lastInteraction=this.time;if(!gentle&&distance(pointer,this.position)>45&&distance(pointer,this.position)<90&&freePoint(pointer,this.items)&&this.route(pointer,{kind:'visit'}))return;this.direction=pointer.x>=this.position.x?1:-1;this.setPhase('attention');return}}else this.hoverAge=0;
  if(!gentle&&this.time>this.nextEvent&&this.time-this.lastInteraction>15&&!this.coins.length){this.nextEvent=this.time+this.between(120,240);const kind=['bowl','fruit','lamp'][Math.floor(this.random()*3)],item=this.items.find(i=>i.kind===kind&&!i.stored);if(item){if(kind==='bowl'){this.glows.push({id:item.id,at:this.time});this.direction=item.x>=this.position.x?1:-1;this.setPhase('attention')}else this.visit(item,kind==='lamp'?'nap':'visit');return}}
  if(!gentle&&this.time>=this.nextMove){this.nextMove=this.time+this.between(15,40)*(night?1.8:1);
   if(this.time-this.lastInteraction>65&&this.random()<(night?.6:.17)){this.sleepFor=this.between(night?20:12,night?35:24);this.setPhase('sleep');return}
   const candidates=safePoints(this.items).filter(p=>distance(p,this.position)>36&&distance(p,this.position)<135);for(let i=0;i<Math.min(12,candidates.length);i++){const n=Math.floor(this.random()*candidates.length),p=candidates.splice(n,1)[0];if(this.route(p,{kind:'wander'}))return}
  }
 }
 isBlink(){const d=this.time-(this.blinkAt??-100);return d>=0&&(d<.14||(this.doubleBlink&&d>.24&&d<.38))}
 pose(){if(this.phase==='sleep')return'sleep';if(this.carried())return'carry';if(this.phase==='hop')return this.height>.7?'hop':'idle';if(this.phase==='response'||this.isBlink())return'blink';return'idle'}
 stats(){return{phase:this.phase,position:this.position,height:this.height,hops:this.hops,blinks:this.blinks,coins:this.coins.map(c=>({...c})),delivered:this.delivered,dissolved:this.dissolved,visible:this.visible,trace:this.traces}}
 destroy(){this.resetRoute();this.coins=[];this.glows=[];this.cues=[];this.visible=false}
}
