import {LIFE_FILES,drawLanterns,drawAir,drawMist,drawToad,drawCoin,drawDelivery,drawBowlGlow,drawCoinPreview} from './life-renderer.js';
import {ITEMS,ASSET_ROOT} from './catalog.js';
import {sceneTransform,toWorld,toScreen,bounds,validPlacement,TABLE,incenseGeometry,lampAnchor} from './geometry.js';
import {incenseState,timeOfDay} from './model.js';
import {advanceMotion,drawCurtains,flamePose,windAt} from './atmosphere.js';
import {drawIncenseSmoke} from './smoke.js';
import {drawTempleBackdrop} from './backdrop.js';
const asset=file=>`${import.meta.env.BASE_URL}${ASSET_ROOT}${file}`;
export class CaiyuanRenderer{
 constructor(canvas,background,onReady){this.canvas=canvas;this.background=background;this.ctx=canvas.getContext('2d');this.bg=background.getContext('2d');this.images={};this.alpha={};this.dead=false;this.pointer=null;this.drag=null;this.currentNight=0;this.backgroundKey='';this.error=false;this.motionTime=0;this.lastElapsed=0;this.clothCache={};
  const files=[...Object.values(ITEMS).map(i=>i.file),'incense_stick.webp','incense_smoke.webp','lamp_flame.webp',...LIFE_FILES];this.ready=Promise.all(files.map(file=>this.load(file))).then(()=>{if(!this.dead)onReady()}).catch(()=>{if(!this.dead){this.error=true;onReady('有摆件图片未加载，请刷新页面重试。')}})
 }
 async load(file){if(this.images[file])return this.images[file];const img=new Image();img.src=asset(file);await img.decode();if(this.dead)return null;this.images[file]=img;if(!/temple-|smoke|flame/.test(file)){const c=document.createElement('canvas');c.width=160;c.height=Math.max(8,Math.round(160*img.height/img.width));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);this.alpha[file]={width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data}}return img}
 resize(width,height,scale){this.width=width;this.height=height;this.dpr=scale;this.t=sceneTransform(width,height);for(const c of [this.canvas,this.background]){c.width=Math.round(width*scale);c.height=Math.round(height*scale)}this.backgroundKey='';const file=this.t.width*scale>2100?'temple-3840.webp':'temple-1920.webp';this.backgroundFile=file;this.load(file).then(()=>{if(!this.dead)this.drawBackground()}).catch(()=>{this.error=true});this.drawBackground()}
 drawBackground(){if(!this.t)return;const ctx=this.bg,t=this.t;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='#3c3029';ctx.fillRect(0,0,this.width,this.height);const img=this.images[this.backgroundFile];if(img){drawTempleBackdrop(ctx,img,t,this.width,this.height);this.backgroundKey=this.backgroundFile}}
 world(x,y){const b=this.canvas.getBoundingClientRect();return toWorld({x:x-b.left,y:y-b.top},this.t)}
 hit(p,items){if(!p)return null;const tolerance=7/this.t.width;for(const i of items.filter(i=>!i.stored).sort((a,b)=>a.y-b.y).reverse()){const b=bounds(i);if(i.kind==='burner'){const sticks=incenseGeometry(i,incenseState(i).progress);if(sticks.some(s=>Math.abs(p.x-s.x)<tolerance&&p.y>=s.tipY-.005&&p.y<=s.baseY))return i}if(p.x<b.x-tolerance||p.x>b.x+b.w+tolerance||p.y<b.y-tolerance||p.y>b.y+b.h+tolerance)continue;const mask=this.alpha[ITEMS[i.kind].file];if(!mask)return i;for(const [dx,dy] of [[0,0],[tolerance,0],[-tolerance,0],[0,tolerance],[0,-tolerance]]){const u=Math.floor((p.x+dx-b.x)/b.w*mask.width),v=Math.floor((p.y+dy-b.y)/b.h*mask.height);if(u>=0&&v>=0&&u<mask.width&&v<mask.height&&mask.data[(v*mask.width+u)*4+3]>28)return i}}
 return null}
 draw(model,options,elapsed=0,immersive=false){
  if(this.dead||!this.t)return;if(!this.backgroundKey)this.drawBackground();const now=Date.now(),state=model.state,mode=timeOfDay(state.settings.time,now),target=mode==='night'?1:mode==='dusk'?.38:0;this.currentNight=options.paused?target:this.currentNight+(target-this.currentNight)*.035;if(Math.abs(target-this.currentNight)<.001)this.currentNight=target;
  const reduced=options.reducedMotion||state.settings.reduceMotion;this.motionTime=advanceMotion(this.motionTime,elapsed-this.lastElapsed,{...options,reducedMotion:reduced});this.lastElapsed=elapsed;const clock=this.motionTime;
  const ctx=this.ctx,t=this.t;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
  ctx.save();ctx.translate(t.x,t.y);ctx.scale(t.width/1600,t.height/900);drawCurtains(ctx,this.images[this.backgroundFile],clock,this.clothCache);ctx.restore();
  if(this.currentNight>.001){ctx.fillStyle=`rgba(13,25,45,${this.currentNight*.39})`;ctx.fillRect(0,0,this.width,this.height);ctx.fillStyle=`rgba(168,88,28,${(mode==='dusk'?.08:.015)*this.currentNight})`;ctx.fillRect(t.x,t.y,t.width,t.height)}
  ctx.save();ctx.translate(t.x,t.y);ctx.scale(t.width/1600,t.height/900);
  const life=this.life;drawLanterns(ctx,this.images,clock,life,this.currentNight,state.settings,reduced);drawAir(ctx,clock,this.currentNight,state.settings,reduced,options.quality);
  const local=items=>items.map(i=>this.drag?.id===i.id?{...i,x:this.drag.x,y:this.drag.y}:i);
  const items=local(state.items.filter(i=>!i.stored)).sort((a,b)=>a.y-b.y);
  if(!immersive&&(this.drag||model.tool==='arrange'||model.tool?.startsWith('place:'))){ctx.save();ctx.beginPath();TABLE.forEach((p,i)=>i?ctx.lineTo(p.x*1600,p.y*900):ctx.moveTo(p.x*1600,p.y*900));ctx.closePath();ctx.fillStyle='#ffe3a00b';ctx.fill();ctx.strokeStyle='#fae5ac88';ctx.lineWidth=1;ctx.setLineDash([6,7]);ctx.stroke();ctx.restore()}
  const entries=items.map(item=>({type:'item',item,y:item.y}));if(life){if(life.visible&&state.settings.showToad)entries.push({type:'toad',y:life.position.y});for(const coin of life.coins.filter(c=>c.status==='ground'||c.status==='fading'))entries.push({type:'coin',coin,y:coin.y})}entries.sort((a,b)=>a.y-b.y);
  for(const entry of entries){if(entry.type==='toad'){drawToad(ctx,this.images,life,this.currentNight,reduced);continue}if(entry.type==='coin'){drawCoin(ctx,this.images,entry.coin,life.time);continue}const item=entry.item;if(item.kind==='bowl'&&life)drawDelivery(ctx,this.images,life,item);const b=bounds(item),x=b.x*1600,y=b.y*900,w=b.w*1600,h=b.h*900;
   ctx.save();ctx.translate(item.x*1600,item.y*900);ctx.scale(w*ITEMS[item.kind].base*.55,Math.max(2,w*.024));const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#26191065');g.addColorStop(1,'#26191000');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
   ctx.save();ctx.filter=this.currentNight>.001?`brightness(${1-this.currentNight*.26})`:'none';
   if(item.kind==='burner'){ctx.save();ctx.filter='none';this.drawIncense(ctx,item,now,clock,model,options);ctx.restore()}
   const img=this.images[ITEMS[item.kind].file];if(img){if(!immersive&&model.selectedId===item.id){ctx.shadowColor=this.drag?.id===item.id&&this.drag.invalid?'#f19b88':'#fff0b0';ctx.shadowBlur=7;}ctx.drawImage(img,x,y,w,h);ctx.shadowBlur=0}
   if(item.kind==='burner'&&incenseState(item,now).status==='spent'){ctx.fillStyle='#bcb1a598';for(let i=0;i<12;i++){ctx.beginPath();ctx.ellipse(x+w*(.34+i*.026),y+h*(.143+Math.sin(i*7)*.01),w*.005,h*.008,0,0,7);ctx.fill()}}
   if(item.kind==='plaque'){const wish=state.wishes.find(v=>v.id===state.activeWishId);if(wish){ctx.save();ctx.beginPath();ctx.rect(x+w*.2,y+h*.31,w*.61,h*.51);ctx.clip();ctx.fillStyle='#704223';ctx.font=`${Math.max(8,w*.145)}px "Songti SC","STSong",serif`;ctx.textAlign='center';const chars=[...wish.content];const short=chars.length>12?[...chars.slice(0,11),'…']:chars;for(let n=0;n<short.length;n++){const col=Math.floor(n/6),row=n%6;ctx.fillText(short[n],x+w*(short.length>6?.61-col*.23:.5),y+h*(.365+row*.072))}ctx.restore()}}
   ctx.restore();
   if(this.drag?.id===item.id){ctx.strokeStyle=this.drag.invalid?'#f19b88':'#eee5b1';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(item.x*1600,item.y*900,w*ITEMS[item.kind].base*.5,4,0,0,7);ctx.stroke()}
   if(item.kind==='lamp'&&item.lit)this.drawLamp(ctx,item,clock);if(item.kind==='bowl'&&life)drawBowlGlow(ctx,life,item);
   const e=model.effects.find(e=>e.id===item.id&&e.type==='tea');if(e){const u=(now-e.at)/2200;ctx.strokeStyle=`rgba(255,235,182,${Math.max(0,(1-u)*.7)})`;ctx.lineWidth=1;for(let k=0;k<2;k++){ctx.beginPath();ctx.ellipse(x+w*.51,y+h*.26,w*(.15+u*.2+k*.06),h*(.027+u*.04),0,0,7);ctx.stroke()}}
  }
  for(const e of model.effects.filter(e=>e.type==='wish')){const u=(now-e.at)/3000;if(u<0||u>1)continue;const plaque=items.find(i=>i.kind==='plaque');const x=(plaque?.x??.5)*1600,y=(plaque?.y??.84)*900;const g=ctx.createRadialGradient(x,y,0,x,y,80);g.addColorStop(0,`rgba(248,216,137,${Math.sin(u*Math.PI)*.2})`);g.addColorStop(1,'#ffe7a000');ctx.fillStyle=g;ctx.fillRect(x-80,y-80,160,160)}
  drawMist(ctx,this.images,clock,state.settings,reduced);if(!immersive&&!this.drag&&model.tool==='coin')drawCoinPreview(ctx,this.images,this.pointer,items);
  if(!immersive&&!this.drag&&this.pointer&&model.tool?.startsWith('place:')){const kind=model.tool.slice(6);const i={kind,...this.pointer,scale:1};if(ITEMS[kind]){const b=bounds(i),img=this.images[ITEMS[kind].file];ctx.globalAlpha=.5;if(img)ctx.drawImage(img,b.x*1600,b.y*900,b.w*1600,b.h*900);ctx.globalAlpha=1;ctx.strokeStyle=validPlacement(i)?'#e4efb6':'#f1a798';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(i.x*1600,i.y*900,b.w*550,4,0,0,7);ctx.stroke()}}
  ctx.restore();
 }
 drawIncense(ctx,item,now,clock,model,options){
  const inc=incenseState(item,now),stick=this.images['incense_stick.webp'],smoke=this.images['incense_smoke.webp'];
  const trailing=model.effects.find(e=>e.type==='smokeEnd'&&e.id===item.id),tailAge=trailing?Math.max(0,now-trailing.at)/1000:0;
  const fade=inc.status==='burning'?1:trailing?Math.max(0,1-tailAge/3):0;
  const origins=incenseGeometry(item,inc.status==='burning'?inc.progress:trailing?.progress??inc.progress);
  for(const [j,s] of incenseGeometry(item,inc.progress).entries()){
   const x=s.x*1600,y=s.tipY*900,h=s.height*900,w=s.width*1600;
   if(stick){const crop=stick.height*inc.progress*.78;ctx.drawImage(stick,0,crop,stick.width,stick.height-crop,x-w/2,y,w,h+5)}
   if(inc.status==='burning'){
    const glow=ctx.createRadialGradient(x,y,0,x,y,3*item.scale);glow.addColorStop(0,'#ffad6880');glow.addColorStop(1,'#e66d3900');ctx.fillStyle=glow;ctx.fillRect(x-3*item.scale,y-3*item.scale,6*item.scale,6*item.scale);
    ctx.fillStyle='#ed8d57';ctx.beginPath();ctx.ellipse(x,y+1,1.25*item.scale,.85*item.scale,0,0,7);ctx.fill();
   }
   if(fade<=0)continue;
   // Smoke follows the current ember, but remains sparse near the faces.
   const tip=origins[j].tipY*900,plumeHeight=Math.min(180,Math.max(85,(tip-355)/item.scale));
   const ignition=inc.status==='burning'?Math.min(1,Math.max(0,(now-item.incense.startedAt)/1700)):1;
   ctx.save();ctx.translate(x,tip-tailAge*10*item.scale);
   drawIncenseSmoke(ctx,smoke,{time:clock,seed:j,height:plumeHeight,scale:item.scale,opacity:fade*ignition,low:options.quality==='low'});
   ctx.restore();
  }
 }
 drawLamp(ctx,item,clock){
  const a=lampAnchor(item),x=a.x*1600,y=a.y*900,b=bounds(item),flame=this.images['lamp_flame.webp'],pose=flamePose(clock,item.x);
  const radius=b.w*1600*(.66+this.currentNight*.7),brightness=pose.glow;
  ctx.save();const light=ctx.createRadialGradient(x,y,0,x,y,radius);
  light.addColorStop(0,`rgba(255,202,112,${(.13+this.currentNight*.17)*brightness})`);
  light.addColorStop(.35,`rgba(255,178,76,${(.055+this.currentNight*.055)*brightness})`);light.addColorStop(1,'#ffd18c00');
  ctx.fillStyle=light;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  if(flame){
   const h=b.w*1600*.38*pose.height,w=h*flame.width/flame.height*pose.width;
   ctx.translate(x,y+3*item.scale);ctx.transform(1,0,pose.lean,1,0,0);
   ctx.globalAlpha=.9+.06*pose.glow;ctx.drawImage(flame,-w/2,-h,w,h);
  }
  ctx.restore();
 }
 stats(){return{width:this.canvas.width,height:this.canvas.height,backgroundSize:this.images[this.backgroundFile]?[this.images[this.backgroundFile].width,this.images[this.backgroundFile].height]:null,loaded:Object.keys(this.images).length,transform:this.t,motionTime:this.motionTime,wind:windAt(this.motionTime),life:this.life?.stats()}}
 destroy(){this.dead=true;this.images={};this.alpha={};this.clothCache={};this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height)}
}
