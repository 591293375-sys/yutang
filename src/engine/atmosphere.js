const TAU=Math.PI*2;
export function windStrength(weather,season){return ({stormy:1.7,rainy:.85,cloudy:.65,snowy:.5,foggy:.18}[weather]??.28)+({autumn:.25,winter:.2,spring:.07}[season]??0)}
const wet=w=>w==='rainy'||w==='stormy';
/** Overscan both ends of a streak: rain covers the viewport, including its bottom edge. */
export function rainPosition(drop,width,height,options={}){
 const slant=windStrength(options.weather,options.season)*.25;
 const fall=drop.height*(1-Math.min(1,drop.age/drop.life)),margin=drop.height*slant+12;
 return {x:drop.u*(width+margin*2)-margin+fall*slant,y:drop.v*(height+drop.height)-fall,slant};
}
/** Bounded, time-based weather particles. Rain and leaves each own their landing event. */
export class Atmosphere{
 constructor(options={},random=Math.random){this.random=random;this.options={};this.time=0;this.leaves=[];this.drops=[];this.impacts=[];this.flash=0;this.landings=0;this.rainHits=0;this.configure(options)}
 point(){return {u:.18+this.random()*.62,v:.12+this.random()*.72}}
 drop(){return {u:this.random(),v:this.random(),age:0,life:.65+this.random()*.7,seed:this.random(),height:140+this.random()*140}}
 leaf(falling=false){const p=this.point();return {...p,phase:falling?'fall':'float',age:0,life:95+this.random()*90,fallTime:2.8+this.random()*1.8,angle:this.random()*TAU,seed:this.random(),size:(this.options.season==='spring'?5:12)+this.random()*(this.options.season==='spring'?6:13),variant:Math.floor(this.random()*3),fromRight:this.random()>.5}}
 configure(partial){
  const previous=this.options;this.options={season:'autumn',weather:'sunny',quality:'high',reducedMotion:false,...previous,...partial};
  const o=this.options;
  if(previous.season!==o.season||!this.leaves.length){const count=o.season==='autumn'?19:o.season==='spring'?16:o.season==='summer'?6:3;this.leaves=Array.from({length:count},()=>this.leaf());this.nextLeaf=3}
  if(previous.weather!==o.weather||previous.quality!==o.quality||previous.reducedMotion!==o.reducedMotion){
   const count=wet(o.weather)?(o.reducedMotion?10:o.quality==='low'?32:o.weather==='stormy'?96:72):0;
   this.drops=Array.from({length:count},()=>{const d=this.drop();d.age=this.random()*d.life;return d});
   this.impacts=this.impacts.filter(p=>p.kind!=='rain');this.flash=0;
   if(previous.weather!==o.weather)this.nextThunder=o.weather==='stormy'?8+this.random()*6:Infinity;
  }
 }
 impact(x,y,kind){if(this.impacts.length>=160)this.impacts.shift();this.impacts.push({x,y,age:0,life:kind==='rain'?1.35:2.1,kind});if(kind==='rain')this.rainHits++;else this.landings++}
 update(dt,width,height,fish=[],hand={},isWater=()=>true){
  dt=Math.max(0,Math.min(.05,dt));this.time+=dt;const events=[],o=this.options,wind=windStrength(o.weather,o.season);
  this.impacts=this.impacts.filter(p=>(p.age+=dt)<p.life);
  for(const d of this.drops){d.age+=dt;if(d.age>=d.life){const p=rainPosition(d,width,height,o);if(p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height&&isWater(p.x,p.y))this.impact(p.x,p.y,'rain');Object.assign(d,this.drop())}}
  this.flash=Math.max(0,this.flash-dt*.22);
  if(o.weather==='stormy'&&(this.nextThunder-=dt)<=0){this.nextThunder=23+this.random()*22;this.flash=o.reducedMotion?0:.075;events.push({delay:900+this.random()*1200})}
  if(o.reducedMotion)return events;
  this.nextLeaf-=dt;
  if(this.nextLeaf<=0){if(this.leaves.length<30)this.leaves.push(this.leaf(true));this.nextLeaf=({autumn:4,spring:5,summer:14,winter:24}[o.season])+this.random()*6}
  for(const l of this.leaves){
   l.age+=dt;l.angle+=dt*(.025+wind*.035)*Math.sin(l.seed*TAU+this.time*.3);
   if(l.phase==='fall'){
    if(l.age>=l.fallTime){l.phase='float';l.age=0;this.impact(l.u*width,l.v*height,'leaf')}
   }else{
    const frozen=o.season==='winter'||o.weather==='snowy';if(frozen)continue;
    l.u+=dt*(3.3+wind*4+Math.sin(this.time*.18+l.seed*9)*1.6)/width;
    l.v+=dt*(1.2+Math.sin(this.time*.22+l.seed*7)*1.8)/height;
    const push=(x,y,radius,power)=>{const dx=l.u*width-x,dy=l.v*height-y,d=Math.hypot(dx,dy);if(d>1&&d<radius){const f=(1-d/radius)**2*power*dt;l.u+=dx/d*f/width;l.v+=dy/d*f/height;l.angle+=f*.006}};
    for(const f of fish)push(f.x,f.y,80,26);
    if(hand.life>0)push(hand.x,hand.y,100,60);
   }
  }
  this.leaves=this.leaves.filter(l=>l.age<l.life&&l.u<.88&&l.v<.91);
  return events;
 }
}
