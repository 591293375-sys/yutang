// Small scene-coordinate details; shared time from CatRenderer, no private RAF/timers.
import {surfaceAt} from './geometry.js';
const TAU=Math.PI*2;
const seed=(i,s=1)=>{const n=Math.sin(i*127.1+s*311.7)*43758.5453;return n-Math.floor(n)};
const point=(p,cover)=>({x:cover.offsetX+p.x*cover.drawWidth,y:cover.offsetY+p.y*cover.drawHeight});
// Sample once in scene space, on the paving only. Keep this sparse: the cached
// seasonal background already supplies moss, snow and most fallen petals/leaves.
const groundDetails=Object.freeze(Array.from({length:30},(_,i)=>{
 const p={x:.29+(i%6+seed(i+2,7)*.65)*.088,y:.35+(Math.floor(i/6)+seed(i+2,8)*.65)*.105};
 return {...p,rotation:i*2.399,fold:.8,size:.0019+seed(i+2,9)*.0012,alpha:.45,variant:i%3};
}).filter(p=>surfaceAt(p)?.id==='ground').sort((a,b)=>seed(a.rotation,3)-seed(b.rotation,3)));
export function seasonGroundDetails(environment,options={}){
 if(!environment.particles||!['spring','autumn'].includes(environment.season))return [];
 return groundDetails.slice(0,options.quality==='low'?8:14);
}
export function seasonParticleCount(environment,options={}){
 if(!environment.particles)return 0;
 const count={spring:26,summer:0,autumn:18,winter:22}[environment.season]||0;
 return options.reducedMotion?Math.min(count,5):options.quality==='low'?Math.ceil(count*.45):count;
}
export function seasonParticles(environment,options={},time=0){
 const count=seasonParticleCount(environment,options),t=Math.max(0,time)*(options.reducedMotion?.22:1),winter=environment.season==='winter';
 return Array.from({length:count},(_,i)=>{
  const phase=seed(i+1,2),speed=(winter?.028:.016)+seed(i+1,5)*.012,progress=(phase+t*speed)%1;
  const drift=(.18+seed(i+1,6)*.24)*progress,origin=.025+seed(i+1,3)*(winter?.84:.52);
  return {x:origin+drift+Math.sin(t*.44+i*1.7)*.014,y:(winter?-.03:.03+seed(i+1,4)*.19)+progress*(winter?1.10:.79),
   rotation:i*2.399+t*(.55+seed(i+1,9)),fold:.35+.65*Math.abs(Math.cos(t*.8+i)),
   size:winter?.0013+seed(i+1,7)*.0007:.0025+seed(i+1,7)*.0022,
   alpha:Math.min(1,progress*12,(1-progress)*9)*(winter?.58:.82),variant:i%3};
 });
}
function petal(c,size){
 c.beginPath();c.moveTo(0,size);c.bezierCurveTo(-size*1.1,size*.1,-size*.7,-size,.0,-size*.48);c.bezierCurveTo(size*.72,-size,size*1.1,size*.1,0,size);c.fill();
}
function leaf(c,size,variant){
 c.beginPath();
 if(variant%2){c.moveTo(0,size);c.bezierCurveTo(-size*1.2,0,-size*.8,-size*.9,0,-size);c.bezierCurveTo(size*.8,-size*.9,size*1.2,0,0,size)}
 else{c.moveTo(0,-size);for(const [x,y] of [[.25,-.4],[.8,-.67],[.55,-.1],[1,.15],[.42,.32],[.36,.85],[0,.53],[-.36,.85],[-.42,.32],[-1,.15],[-.55,-.1],[-.8,-.67],[-.25,-.4]])c.lineTo(x*size,y*size);c.closePath()}
 c.fill();c.strokeStyle='rgba(110,71,37,.25)';c.lineWidth=Math.max(.5,size*.10);c.beginPath();c.moveTo(0,size*.7);c.lineTo(0,-size*.5);c.stroke();
}
function paint(c,p,cover,env){
 const xy=point(p,cover),size=p.size*cover.drawWidth;c.save();c.translate(xy.x,xy.y);c.rotate(p.rotation);c.scale(p.fold||1,1);c.globalAlpha=p.alpha*(env.night?.68:1);
 if(env.season==='spring'){c.fillStyle=['#f8d7e1','#f1bccc','#fff0ee'][p.variant];petal(c,size)}
 else if(env.season==='autumn'){c.fillStyle=['#d99c35','#c47840','#e2b74d'][p.variant];leaf(c,size*1.2,p.variant)}
 else{c.fillStyle=env.night?'#c5d4e2':'#f4f8fa';c.beginPath();c.arc(0,0,size,0,TAU);c.fill()}
 c.restore();
}
/** Call ground before cats/props, air after cats. Static winter snow is in background art. */
export function drawSeasonEffects(c,cover,environment,options={},time=0,layer='air'){
 if(!environment.particles)return;
 c.save();c.beginPath();c.rect(cover.offsetX,cover.offsetY,cover.drawWidth,cover.drawHeight);c.clip();
 if(layer==='ground'&&['spring','autumn'].includes(environment.season)){
  for(const p of seasonGroundDetails(environment,options))paint(c,p,cover,environment);
 }else if(layer==='air')for(const p of seasonParticles(environment,options,time))paint(c,p,cover,environment);
 c.restore();
}
export function courtyardFireflies(environment,options={},time=0){
 const n=environment.time==='night'&&environment.fireflies!==false?Math.min(environment.fireflyCount||0,options.reducedMotion?3:options.quality==='low'?5:12):0;
 return Array.from({length:n},(_,i)=>({x:i%2?.858+Math.sin(time*.16+i*2.399)*.020:.205+Math.sin(time*.13+i*2.399)*.025,y:.28+(i%5)*.13+Math.cos(time*.11+i*2.399)*.018,alpha:.14+(1+Math.sin(time*.65+i*2.399))*.17}));
}
export function drawCourtyardFireflies(c,cover,environment,options={},time=0){
 c.save();
 for(const p of courtyardFireflies(environment,options,time)){const q=point(p,cover);c.globalAlpha=p.alpha;c.fillStyle='#dceca5';c.beginPath();c.arc(q.x,q.y,3.2,0,TAU);c.fill();c.globalAlpha=Math.min(.82,p.alpha+.26);c.fillStyle='#f2f9c6';c.beginPath();c.arc(q.x,q.y,1.1,0,TAU);c.fill()}
 c.restore();
}
