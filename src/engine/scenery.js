import {rainPosition} from './atmosphere.js';
const TAU=Math.PI*2;
/** Cache soft cloud edges once, instead of blurring the 4K canvas every frame. */
export class Scenery{
 constructor(){
  this.cloud=document.createElement('canvas');this.cloud.width=640;this.cloud.height=320;
  const c=this.cloud.getContext('2d');
  c.filter='blur(8px)';c.fillStyle='rgba(232,244,234,.78)';c.beginPath();
  for(const [x,y,rx,ry] of [[140,185,76,44],[222,138,76,69],[310,118,80,77],[386,156,80,61],[475,184,64,41],[315,196,173,44]]){
   c.moveTo(x+rx,y);c.ellipse(x,y,rx,ry,0,0,TAU);
  }c.fill();c.filter='none';

  this.leafSprites=new Map();
 }
 leafSprite(season,variant){
  const key=season+variant;if(this.leafSprites.has(key))return this.leafSprites.get(key);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d');c.translate(64,64);c.scale(2.1,2.1);
  const spring=season==='spring';const colors=spring?['#f4d7d5','#f2b6be','#e8c7c8']:season==='summer'?['#799354','#759351','#b6ad58']:['#d69a38','#cb6337','#e1b745'];
  const g=c.createLinearGradient(-12,-18,14,18);g.addColorStop(0,colors[variant]);g.addColorStop(1,spring?'#d591a2':season==='summer'?'#467451':'#ab7134');c.fillStyle=g;
  c.beginPath();
  if(spring){c.moveTo(0,-19);c.bezierCurveTo(19,-26,22,0,0,22);c.bezierCurveTo(-18,3,-19,-19,0,-19)}
  else if(variant===2){c.moveTo(0,20);c.bezierCurveTo(-9,6,-27,-9,-20,-19);c.quadraticCurveTo(-8,-31,0,-19);c.quadraticCurveTo(10,-30,23,-18);c.quadraticCurveTo(26,-6,0,20)}
  else{for(const [i,p] of [[0,-25],[5,-12],[16,-19],[13,-7],[24,-5],[16,3],[22,11],[7,12],[2,22],[-4,15],[-17,20],[-15,7],[-25,3],[-13,-5],[-18,-17],[-5,-12]].entries())i?c.lineTo(...p):c.moveTo(...p)}
  c.closePath();c.fill();c.strokeStyle=spring?'rgba(181,108,128,.35)':'rgba(102,73,37,.4)';c.lineWidth=.65;c.beginPath();c.moveTo(0,-16);c.lineTo(0,25);
  if(!spring)for(let i=0;i<4;i++){c.moveTo(0,12-i*7);c.lineTo(-14,4-i*6);c.moveTo(0,12-i*7);c.lineTo(14,3-i*6)}c.stroke();
  this.leafSprites.set(key,canvas);return canvas;
 }
 clouds(ctx,a,w,h,o){
  if(!['cloudy','rainy','stormy'].includes(o.weather))return;
  const t=o.reducedMotion?0:a.time,storm=o.weather==='stormy';
  ctx.save();ctx.globalAlpha=o.night?.08:storm?.13:o.weather==='rainy'?.14:.28;
  for(let i=0;i<4;i++){
   const cw=Math.min(w*.6,740),ch=cw*.38;
   const x=((i*.31*w+t*(storm?8:4))%(w+cw))-cw*.6;
   const y=h*(.17+i*.18)+Math.sin(t*.08+i)*12;
   ctx.save();ctx.translate(x+cw*.5,y+ch*.5);ctx.rotate(Math.sin(t*.13+i)*.018);
   ctx.drawImage(this.cloud,-cw*.5,-ch*.5,cw,ch);ctx.restore();
  }ctx.restore();
 }
 leaves(ctx,a,w,h,o){
  for(const l of a.leaves){
   const falling=l.phase==='fall',p=falling?Math.min(1,l.age/l.fallTime):1,alt=falling?(1-p)*90:0;
   const x=l.u*w+(falling?(1-p)*(l.fromRight?120:-120)+Math.sin(p*10)*16*(1-p):0),y=l.v*h-alt;
   const fade=Math.min(1,l.age/(falling?.4:2),(l.life-l.age)/8);
   ctx.save();ctx.translate(x,y);ctx.rotate(l.angle+(falling?Math.sin(p*9)*.9:Math.sin((o.reducedMotion?0:a.time)*.35+l.seed*7)*.08));
   const size=l.size*2.15;ctx.globalAlpha=Math.max(0,fade)*.14;ctx.drawImage(this.leafSprite(o.season,l.variant),-size*.5+2,-size*.5+4+alt*.25,size,size);
   ctx.globalAlpha=Math.max(0,fade)*.88;ctx.scale(1,falling?.7+Math.abs(Math.sin(p*6))*.3:.82);ctx.drawImage(this.leafSprite(o.season,l.variant),-size*.5,-size*.5,size,size);ctx.restore();
  }
 }
 rain(ctx,a,w,h,o){
  ctx.save();ctx.strokeStyle=o.night?'rgba(224,242,239,.31)':'rgba(235,251,240,.5)';ctx.lineWidth=.85;ctx.beginPath();
  for(const d of a.drops){const {x,y,slant}=rainPosition(d,w,h,o);ctx.moveTo(x+4*slant,y-12-d.seed*9);ctx.lineTo(x,y)}ctx.stroke();
  for(const r of a.impacts){const p=r.age/r.life,rad=2+p*(r.kind==='rain'?24:32);ctx.lineWidth=.8;
   ctx.strokeStyle=`rgba(226,246,222,${(1-p)**1.5*(o.night?.33:.55)})`;ctx.beginPath();ctx.ellipse(r.x,r.y,rad,rad*.47,-.1,0,TAU);ctx.stroke();
   if(p>.17){ctx.strokeStyle=`rgba(224,246,225,${(1-p)**2*.3})`;ctx.beginPath();ctx.ellipse(r.x,r.y,rad*.65,rad*.3,-.1,0,TAU);ctx.stroke()}
   if(p<.12){ctx.fillStyle=`rgba(238,253,239,${(.12-p)*4})`;ctx.fillRect(r.x-1,r.y-3,1.4,3)}
  }
  if(a.flash>0){ctx.fillStyle=`rgba(216,231,243,${a.flash})`;ctx.fillRect(0,0,w,h)}ctx.restore();
 }
 destroy(){this.cloud.width=this.cloud.height=0;for(const c of this.leafSprites.values())c.width=c.height=0;this.leafSprites.clear()}
}
