import {feedingMouthWorld,foodContact,mouthInsideFood,FOOD_GEOMETRY} from './feeding.js';
import {coverTransform,worldToScreen,screenToWorld,isWalkable,WALKABLE_POLYGONS,OBSTACLES} from './geometry.js';
import {getPreset,CAT_BACKGROUNDS} from './catalog.js';
import {renderCustomizedCat,customizationRenderKey,customizeActionFrame} from './morphology.js';
import {normalizeCustomization} from './customization.js';
import {drawSeasonEffects,drawCourtyardFireflies} from './season-effects.js';
import {courtyardBackground} from './background.js';
import {CatAnimationState,loadActionAtlas,getActionSpec,drawActionFrame,poseLayers,drawBlendedPoses} from './animation.js';
import {courtyardLight,contactShadow,groundedBodyShadow} from './lighting.js';
import {buildCanopyOcclusion} from './canopy.js';

const TAU=Math.PI*2;
const base=import.meta.env.BASE_URL;
// Same composition and facility map for future seasonal paintings. Null means
// intentionally use the supplied painting, not claim a finished seasonal plate.
export const SEASON_BACKGROUNDS=CAT_BACKGROUNDS.seasons;
export class CatRenderer {
 constructor(canvas,background,onLoad=()=>{}){
  this.canvas=canvas;this.bgCanvas=background;this.ctx=canvas.getContext('2d');this.bg=background.getContext('2d',{alpha:false});this.onLoad=onLoad;
  this.cover=coverTransform(1,1);this.scale=1;this.skins=new Map();this.bounds=new Map();this.dead=false;this.background=null;this.backgroundKey='';this.backgroundGeneration=0;this.pointer=null;
  this.animation=new CatAnimationState();this.drawnActions=new Map();this.shadow=document.createElement('canvas');this.shadow.width=192;this.shadow.height=80;const sc=this.shadow.getContext('2d'),g=sc.createRadialGradient(96,96,4,96,96,90);g.addColorStop(0,'#28312275');g.addColorStop(.55,'#28312235');g.addColorStop(1,'#28312200');sc.fillStyle=g;sc.scale(1,80/192);sc.fillRect(0,0,192,192);
  this.particles=Array.from({length:18},(_,i)=>({x:((i*71)%97)/100,y:((i*37)%99)/100,phase:i*2.399,speed:.009+(i%4)*.002}));
  this.nightMix=0;this.lightingAt=0;this.litSprites=new WeakMap();this.propSprites=new Map();this.poseBuffers={};this.catBuffers=new Map();this.catLightBuffer=document.createElement('canvas');
 }
 resize({width,height,scale}){
  this.cover=coverTransform(width,height);this.scale=scale;for(const c of [this.canvas,this.bgCanvas]){c.width=Math.round(width*scale);c.height=Math.round(height*scale)}
  this.loadBackground();this.drawBackground();
 }
 loadBackground(){
  const longEdge=Math.max(this.cover.drawWidth,this.cover.drawHeight)*this.scale,tier=longEdge>4000?6144:longEdge>2000?3840:1920;
  const key=`${tier}:${this.season||'summer'}:${this.timeOfDay||'day'}`;
  if(key===this.backgroundKey)return;
  this.backgroundKey=key;const generation=++this.backgroundGeneration;
  const season=this.season||'summer';
  courtyardBackground(tier,season,this.timeOfDay||'day').then(async img=>{
   const canopy=await buildCanopyOcclusion(img,season);
   if(this.dead||generation!==this.backgroundGeneration)return;
   this.previousBackground=this.background;this.previousCanopy=this.canopy;this.background=img;this.canopy=canopy;this.backgroundTransition=performance.now();this.drawBackground();this.onLoad();
  }).catch(()=>{if(!this.dead&&generation===this.backgroundGeneration)this.onLoad('庭院背景暂未载入，请重新打开主题。')});
 }
 drawBackground(){
  const c=this.bg,t=this.cover;c.setTransform(this.scale,0,0,this.scale,0,0);c.fillStyle='#5f745d';c.fillRect(0,0,t.width,t.height);
  const fade=this.previousBackground?Math.min(1,(performance.now()-this.backgroundTransition)/1400):1;
  if(this.previousBackground&&fade<1)c.drawImage(this.previousBackground,t.offsetX,t.offsetY,t.drawWidth,t.drawHeight);
  if(this.background){c.globalAlpha=fade;c.drawImage(this.background,t.offsetX,t.offsetY,t.drawWidth,t.drawHeight);c.globalAlpha=1}
  if(fade===1){this.previousBackground=null;this.previousCanopy=null}
 }
 skin(cat){
  const preset=getPreset(cat.presetId);if(!preset)return null;
  const customKey=customizationRenderKey(cat.customization);let entry=this.skins.get(cat.id);
  if(!entry||entry.presetId!==cat.presetId||entry.appearance!==cat.appearance||entry.customKey!==customKey){
   entry={presetId:cat.presetId,appearance:cat.appearance,customKey,image:null,atlas:null,actionStatus:getActionSpec(cat.presetId)?'loading':'missing'};
   this.skins.set(cat.id,entry);
   // The cache key and delayed frame transform must describe the same design.
   // Editing replaces cat.customization while the shared atlas may still load.
   const customization=normalizeCustomization(cat.customization);
   renderCustomizedCat(preset,cat.appearance,customization,{size:768}).then(image=>{if(this.dead||this.skins.get(cat.id)!==entry)return;entry.image=image;this.onLoad()}).catch(()=>{if(this.dead||this.skins.get(cat.id)!==entry)return;entry.error=true;this.onLoad('猫咪外观暂未载入，请重新打开主题。')});
   if(getActionSpec(cat.presetId))loadActionAtlas(preset,cat.appearance,{key:customKey,transformFrame:frame=>customizeActionFrame(frame,preset,customization)}).then(atlas=>{if(this.dead||this.skins.get(cat.id)!==entry)return;entry.atlas=atlas;entry.actionStatus=atlas?'ready':'missing';this.onLoad()}).catch(()=>{if(this.dead||this.skins.get(cat.id)!==entry)return;entry.actionStatus='failed';this.onLoad(`${preset.name}的动作图片未载入，请重新打开主题。`)});
  }
  return entry.image;
 }
 screenToWorld(x,y){const r=this.canvas.getBoundingClientRect();return screenToWorld({x:x-r.left,y:y-r.top},this.cover)}
 point(p){return worldToScreen(p,this.cover)}
 litImage(source){
  // Bake color lighting once on a small sprite, never once per mesh triangle
  // on the 4K surface. A settled night reuses the same bitmap indefinitely.
  const level=Math.round(this.nightMix*10);if(!level)return source;
  let cached=this.litSprites.get(source);if(cached?.level===level)return cached.image;
  if(!cached){const image=document.createElement('canvas');image.width=source.naturalWidth||source.width;image.height=source.naturalHeight||source.height;cached={image,level:-1};this.litSprites.set(source,cached)}
  const c=cached.image.getContext('2d');c.clearRect(0,0,cached.image.width,cached.image.height);c.filter=`brightness(${1-level*.042}) saturate(${1-level*.028})`;c.drawImage(source,0,0);c.filter='none';cached.level=level;return cached.image;
 }
 hitTest(x,y,cats){const r=this.canvas.getBoundingClientRect(),sx=x-r.left,sy=y-r.top,world=screenToWorld({x:sx,y:sy},this.cover);if(this.canopy?.alphaAt(world.x,world.y)>.8)return null;for(const cat of cats.filter(c=>c.active).sort((a,b)=>b.y-a.y)){const b=this.bounds.get(cat.id);if(b&&sx>=b.x&&sx<=b.x+b.w&&sy>=b.y&&sy<=b.y+b.h)return cat}return null}
 render(game,environment,options,time,selected,moveProp,debug=false){
  const c=this.ctx,t=this.cover;c.setTransform(this.scale,0,0,this.scale,0,0);c.clearRect(0,0,t.width,t.height);this.bounds.clear();
  const now=performance.now()/1000,lightDt=this.lightingAt?Math.min(.06,now-this.lightingAt):1;this.lightingAt=now;this.nightMix+=((environment.time==='night'?1:0)-this.nightMix)*Math.min(1,lightDt*3);
  if(this.season!==environment.season||this.timeOfDay!==environment.time){this.season=environment.season;this.timeOfDay=environment.time;this.loadBackground()}
  if(this.previousBackground)this.drawBackground();
  const active=game.cats.filter(cat=>cat.active);const ids=new Set(active.map(cat=>cat.id));this.animation.retain(ids);for(const id of this.skins.keys())if(!ids.has(id))this.skins.delete(id);for(const id of this.drawnActions.keys())if(!ids.has(id))this.drawnActions.delete(id);for(const id of this.catBuffers.keys())if(!ids.has(id))this.catBuffers.delete(id);
  drawSeasonEffects(c,t,environment,options,time,'ground');
  const sorted=[...game.props.map(p=>({kind:'prop',y:p.y,item:p})),...active.map(cat=>({kind:'cat',y:cat.y,item:cat}))].sort((a,b)=>a.y-b.y||(a.kind==='prop'?-1:1));
  for(const entry of sorted)if(entry.kind==='prop')this.drawProp(entry.item,time,options);else this.drawCat(entry.item,time,options,entry.item.task?.tool==='food'?game.props.find(p=>p.id===entry.item.task.propId):null);
  this.drawCanopy();
  drawSeasonEffects(c,t,environment,options,time,'air');
  this.drawFireflies(environment,options,time);
  if((selected||moveProp)&&this.pointer){const p=this.point(this.pointer),valid=isWalkable(this.pointer)||!!this.hoverId;c.save();c.strokeStyle=valid?'#fff7cfcc':'#ba675bcb';c.lineWidth=1.5;c.setLineDash([4,4]);c.beginPath();c.ellipse(p.x,p.y,13,7,0,0,TAU);c.stroke();c.setLineDash([]);if(selected==='wand'){c.strokeStyle='#dedabacc';c.beginPath();c.moveTo(p.x+9,p.y-25);c.quadraticCurveTo(p.x+22,p.y-12,p.x,p.y);c.stroke();c.fillStyle='#d2abb2';c.beginPath();c.ellipse(p.x,p.y-1,3,9,.6,0,TAU);c.fill()}c.restore()}
  if(debug)this.drawDebug();
 }
 drawCanopy(){
  const c=this.ctx,t=this.cover,fade=this.previousCanopy?Math.min(1,(performance.now()-this.backgroundTransition)/1400):1;
  const draw=(layer,opacity)=>{if(!layer||!opacity)return;const b=layer.bounds;c.save();c.globalAlpha=opacity;c.drawImage(layer.image,t.offsetX+b.x*t.drawWidth,t.offsetY+b.y*t.drawHeight,b.width*t.drawWidth,b.height*t.drawHeight);c.restore()};
  if(fade<1)draw(this.previousCanopy,1-fade);draw(this.canopy,fade);
 }
 drawCat(cat,time,options,foodBowl=null){
  const skin=this.skin(cat);if(!skin)return;
  const c=this.ctx,p=this.point(cat),preset=getPreset(cat.presetId),perspective=.88+cat.y*.18;
  c.save();
  const w=this.cover.drawWidth*(preset.scale||.068)*perspective*normalizeCustomization(cat.customization).size,h=w*skin.height/skin.width;
  const quiet=options.reducedMotion||options.quality==='low',sample=this.animation.sample(cat,preset,time,quiet),entry=this.skins.get(cat.id),atlas=entry?.atlas;
  const resting=['sleep','rest'].includes(sample.action),jump=cat.traverse?.phase==='jump'?(cat.traverse.jumpHeight||0)*this.cover.drawWidth:0;
  const light=courtyardLight(cat,this.nightMix,this.canopy?.sampleAt(cat.x,cat.y)||0);
  // The broad shadow is deliberately faint: the four small planted-paw shadows
  // below are what bind a walking cat to the paving. Height affects only real jumps.
  if(!atlas||![0,4].includes(sample.renderIndex??sample.index)){c.save();c.globalAlpha=light.castOpacity/(1+jump/w*2);c.drawImage(this.shadow,p.x-w*.38+light.shadowX*w,p.y-w*.065+light.shadowY*w,w*(resting?.85:.72),w*.13*(1+jump/w*2));c.restore()}
  const anchor=preset.anchor||{x:.5,y:.98},breath=quiet?0:Math.sin(time*1.7+(cat.phase||0))*.005;
  let measured={left:-w*anchor.x,top:-h*anchor.y,width:w,height:h},contacts=[],feeding=null;
  const drawContacts=(target,feet)=>{
   contacts=feet;const flip=sample.renderFlip??sample.flip;
   const body=groundedBodyShadow(feet,w,light,jump);c.save();c.globalAlpha=body.opacity;c.drawImage(this.shadow,p.x+flip*body.x+light.shadowX*w*.35-body.rx,p.y+body.y-body.ry,body.rx*2,body.ry*2);c.restore();
   for(const foot of feet){const shadow=contactShadow(foot,w,light,jump);c.save();c.globalAlpha=shadow.opacity;c.drawImage(this.shadow,p.x+flip*shadow.x-shadow.rx,p.y+shadow.y-shadow.ry,shadow.rx*2,shadow.ry*2);c.restore()}
  };
  const drawPose=(target,pose)=>{
   target.save();target.scale(pose.flip??sample.flip,1);
   if(atlas&&pose.index>=0){
    const frame=atlas.frames[pose.index];target.translate((pose.lean||0)*w,-(pose.bob||0)*w);
    const hindSourceFrame=pose.index===4?atlas.frames[5]:null;
    if(foodBowl&&pose.action==='eat'){const mouth=feedingMouthWorld(cat,{frame,atlas,flip:pose.flip??sample.flip,time:time+(cat.phase||0),reducedMotion:quiet,settle:pose.settle});feeding={mouth,foodPoint:foodContact(foodBowl,cat.task.feeding?.seat||0),bowl:{x:foodBowl.x,y:foodBowl.y,foodScale:foodBowl.foodScale||1,capacity:foodBowl.capacity},inside:mouthInsideFood(mouth,foodBowl),edibleRx:FOOD_GEOMETRY.edibleRx*(foodBowl.foodScale||1)/1600,edibleRy:FOOD_GEOMETRY.edibleRy*(foodBowl.foodScale||1)/1600/(9/16)};}
    measured=drawActionFrame(target,frame,atlas,w,pose.action,time+(cat.phase||0),{reducedMotion:quiet,mesh:true,gaitPhase:pose.gaitPhase,strideStrength:pose.strideStrength,motionStage:pose.motionStage,stageProgress:pose.stageProgress,settle:pose.settle,hindSourceFrame,locomotion:sample.locomotion,worldScale:this.cover.drawWidth,flip:pose.flip??sample.flip,drawContactShadows:drawContacts});
   }else target.drawImage(skin,-w*anchor.x,-h*(1+breath)*anchor.y,w,h*(1+breath));
   target.restore();return measured;
  };
  // Shade the completed small sprite once. Source frames remain stable across
  // tree shade/night transitions, so limb extraction and planted feet are not reset.
  const ratio=this.scale,side=Math.ceil(Math.max(w*2.4,h*1.7)*ratio/64)*64;
  let buffer=this.catBuffers.get(cat.id);if(!buffer){buffer=document.createElement('canvas');this.catBuffers.set(cat.id,buffer)}
  if(buffer.width!==side)buffer.width=buffer.height=side;
  const local=buffer.getContext('2d'),ox=side*.5,oy=side*.79;local.setTransform(1,0,0,1,0,0);local.clearRect(0,0,side,side);local.setTransform(ratio,0,0,ratio,ox,oy);
  drawBlendedPoses(local,poseLayers(sample,!!atlas),drawPose,w,ratio,this.poseBuffers);
  // A filter on the 4K destination forces an expensive offscreen GPU pass per
  // cat. Shade only this small sprite, then composite normally on the scene.
  // One grow-only scratch surface is shared by all cats and keeps memory bounded.
  const lit=this.catLightBuffer;if(lit.width<side||lit.height<side)lit.width=lit.height=side;
  const lc=lit.getContext('2d');lc.clearRect(0,0,side,side);lc.filter=`brightness(${light.brightness}) saturate(${light.saturation})`;lc.drawImage(buffer,0,0);lc.filter='none';
  c.drawImage(lit,0,0,side,side,p.x-ox/ratio,p.y-jump-oy/ratio,side/ratio,side/ratio);
  const flip=sample.renderFlip??sample.flip;this.bounds.set(cat.id,{x:p.x+(flip===1?measured.left:-measured.left-measured.width),y:p.y+measured.top-jump,w:measured.width,h:measured.height});
  this.drawnActions.set(cat.id,{action:sample.action,frame:atlas?(sample.renderIndex??sample.index):-1,flip,jump,poseSource:atlas&&sample.index>=0?'atlas':'standing',status:entry?.actionStatus,surfaceId:cat.surfaceId||'ground',light,feeding,contacts:contacts.map(foot=>({...foot,worldX:cat.x+flip*foot.x/this.cover.drawWidth,worldY:cat.y+foot.y/this.cover.drawHeight}))});
  this.drawForeground(cat,jump);
  const label=({heart:'♡',relaxed:'～',curious:'· · ·'}[cat.expression]||cat.expression)||(cat.state==='sleep'?'z Z':cat.state==='rest'?'…':null);
  if(label){c.save();c.font=`${Math.max(12,Math.min(18,w*.16))}px -apple-system,sans-serif`;c.textAlign='center';c.fillStyle='#365340';c.shadowColor='#fbffe5';c.shadowBlur=5;c.fillText(label,p.x+w*.3,p.y+measured.top-8-jump);c.restore()}
  if(this.hoverId===cat.id){c.save();c.font='12px -apple-system,sans-serif';c.textAlign='center';const tw=c.measureText(cat.name).width;c.fillStyle='#234b3edc';c.beginPath();c.roundRect(p.x-tw/2-10,p.y+7,tw+20,24,12);c.fill();c.fillStyle='#f3f7dd';c.fillText(cat.name,p.x,p.y+23);c.restore()}
  c.restore();
 }
 drawForeground(cat,jump=0){
  if(!this.background)return;const c=this.ctx,t=this.cover;let points=null;
  // These are pixels from the same painting, never a separately scaled rock.
  // Only a cat behind a lip is masked; cats standing in front remain unobscured.
  if(cat.surfaceId==='bed')points=[[.675,.116],[.684,.139],[.706,.156],[.739,.163],[.773,.152],[.795,.133],[.808,.111],[.804,.139],[.784,.165],[.747,.180],[.705,.169],[.679,.145]];
  else if(cat.surfaceId==='lower-platform'&&jump<1)points=[[.903,.564],[.927,.585],[.957,.592],[.984,.569],[.985,.583],[.960,.610],[.929,.600],[.904,.579]];
  else if(['step','porch'].includes(cat.surfaceId)&&cat.y<.23)points=[[.526,.224],[.542,.245],[.570,.259],[.605,.260],[.637,.245],[.650,.224],[.652,.239],[.629,.272],[.589,.280],[.549,.268],[.525,.244]];
  if(!points)return;c.save();c.filter='none';c.beginPath();points.forEach(([x,y],i)=>{const p=this.point({x,y});i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)});c.closePath();c.clip();c.drawImage(this.background,t.offsetX,t.offsetY,t.drawWidth,t.drawHeight);c.restore();
 }
 drawProp(prop,time,options){
  let sprite=this.propSprites.get(prop.tool);if(!sprite){sprite=document.createElement('canvas');sprite.width=384;sprite.height=384;this.drawPropArtwork(prop,0,{reducedMotion:true},sprite.getContext('2d'),{x:192,y:264},3.2);this.propSprites.set(prop.tool,sprite)}
  const c=this.ctx,p=this.point(prop),s=this.cover.drawWidth/1600*(prop.tool==='food'?(prop.foodScale||1):1);c.drawImage(this.litImage(sprite),p.x-60*s,p.y-82.5*s,120*s,120*s);
  if(prop.tool==='scratch'&&prop.catIds?.length&&!options.reducedMotion){c.save();c.strokeStyle=this.nightMix>.5?'#a6a88d':'#f9efbb';c.lineWidth=s;for(let i=0;i<3;i++){const x=p.x+(-6+i*5)*s;c.beginPath();c.moveTo(x,p.y-(15+Math.sin(time*5)*3)*s);c.lineTo(x+2*s,p.y-22*s);c.stroke()}c.restore()}
 }
 drawPropArtwork(prop,time,options,c,p,s){
  const active=prop.catIds?.length>0;c.save();c.translate(p.x,p.y);c.scale(s,s);c.lineWidth=1;c.strokeStyle='#687060';
  c.fillStyle='#3e493226';c.beginPath();c.ellipse(0,3,18,6,0,0,TAU);c.fill();
  if(prop.tool==='food'){
   c.fillStyle='#adc5bd';c.beginPath();c.ellipse(0,0,16,9,0,0,TAU);c.fill();c.stroke();c.fillStyle='#ece4c5';c.beginPath();c.ellipse(0,-3,13,6,0,0,TAU);c.fill();c.fillStyle='#987149';for(let i=0;i<8;i++){c.beginPath();c.ellipse(Math.cos(i*2.4)*8,Math.sin(i*2.4)*3-3,2.8,1.5,0,0,TAU);c.fill()}
  }else if(prop.tool==='yarn'){
   c.strokeStyle='#b68380';c.beginPath();c.moveTo(8,4);c.bezierCurveTo(25,0,28,16,37,6);c.stroke();c.fillStyle='#d9a7a0';c.beginPath();c.arc(0,0,11,0,TAU);c.fill();c.strokeStyle='#ae7978';for(let i=-2;i<3;i++){c.beginPath();c.ellipse(i*3,0,4,9,.4,0,TAU);c.stroke()}
  }else if(prop.tool==='scratch'){
   c.rotate(-.12);c.fillStyle='#c7b495';c.beginPath();c.roundRect(-24,-10,48,23,5);c.fill();c.strokeStyle='#aa9778';for(let i=-20;i<23;i+=4){c.beginPath();c.moveTo(i,-7);c.lineTo(i,9);c.stroke()}c.strokeStyle='#e4d5b8';c.strokeRect(-25,-11,50,24);
   if(active&&!options.reducedMotion){c.strokeStyle='#f9efbb';for(let i=0;i<3;i++){const x=-6+i*5;c.beginPath();c.moveTo(x,-15-Math.sin(time*5)*3);c.lineTo(x+2,-22);c.stroke()}}
  }else if(prop.tool==='mouse'){
   c.fillStyle='#a3a596';c.beginPath();c.ellipse(0,0,12,7,-.1,0,TAU);c.fill();c.fillStyle='#c1aba3';c.beginPath();c.arc(5,-5,4,0,TAU);c.fill();c.fillStyle='#314332';c.beginPath();c.arc(9,0,1.4,0,TAU);c.fill();c.strokeStyle='#a79c8e';c.beginPath();c.moveTo(-10,0);c.bezierCurveTo(-24,2,-15,12,-31,7);c.stroke();
  }else if(prop.tool==='wand'){
   c.strokeStyle='#a69274';c.beginPath();c.moveTo(-20,-30);c.lineTo(15,-55);c.stroke();c.strokeStyle='#e2d6b6';c.beginPath();c.moveTo(-20,-30);c.quadraticCurveTo(-9,-18,0,0);c.stroke();c.fillStyle='#c1a2bb';c.beginPath();c.ellipse(0,0,4,12,.6+Math.sin(time)*.1,0,TAU);c.fill();
  }else if(prop.tool==='pet'){
   c.fillStyle='#e6b6a3';c.font='19px serif';c.fillText('♡',-6,-22);
  }
  c.restore();
 }
 drawFireflies(env,options,time){drawCourtyardFireflies(this.ctx,this.cover,env,options,time)}
 drawDebug(){const c=this.ctx;c.save();c.fillStyle='#85e1b322';c.strokeStyle='#277654bb';for(const poly of WALKABLE_POLYGONS){c.beginPath();poly.forEach((p,i)=>{const q=this.point(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y)});c.closePath();c.fill();c.stroke()}c.fillStyle='#ec76694a';for(const o of OBSTACLES){const p=this.point(o);c.beginPath();c.ellipse(p.x,p.y,o.rx*this.cover.drawWidth,o.ry*this.cover.drawHeight,0,0,TAU);c.fill()}c.restore()}
 stats(){return{width:this.canvas.width,height:this.canvas.height,backgroundWidth:this.background?.naturalWidth||this.background?.width||0,backgroundHeight:this.background?.naturalHeight||this.background?.height||0,backgroundSize:[this.background?.naturalWidth||this.background?.width||0,this.background?.naturalHeight||this.background?.height||0],skinCount:this.skins.size,actionAtlases:[...this.skins.values()].filter(e=>e.atlas).length,missingActionCats:[...this.skins.entries()].filter(([,e])=>e.actionStatus==='missing'||e.actionStatus==='failed').map(([id])=>id),actions:[...this.drawnActions.entries()].map(([id,a])=>({id,...a}))}}
 destroy(){this.dead=true;this.backgroundGeneration++;this.skins.clear();this.bounds.clear();this.animation.clear();this.drawnActions.clear();this.propSprites.clear();this.catBuffers.clear();this.catLightBuffer.width=this.catLightBuffer.height=0;this.litSprites=new WeakMap();this.poseBuffers={};this.background=null;this.previousBackground=null;this.canopy=null;this.previousCanopy=null;this.backgroundMatte=null;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.bg.clearRect(0,0,this.bgCanvas.width,this.bgCanvas.height)}
}
