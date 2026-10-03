import {bottlePose} from './bottle-interaction.js';
const viewOf=value=>Array.isArray(value?.bottles)?value:typeof value?.view==='function'?value.view():value;
export function hitTestBottle(x,y,driftOrView,{cover=1,time=0,reducedMotion=false,launches=driftOrView?.launchEffects}={}){
 const bottles=viewOf(driftOrView)?.bottles??[],scale=Number.isFinite(cover)&&cover>0?cover:1;
 let hit=null,best=Infinity;
 for(let i=bottles.length-1;i>=0;i--){
  const b=bottles[i];if(!['incoming','outgoing'].includes(b.kind)||launches?.has(b.id,time))continue;
  const pose=bottlePose(b,time,{reducedMotion});if(pose.alpha<.1)continue;
  const dx=x-pose.x,dy=y-pose.y,c=Math.cos(-pose.angle),s=Math.sin(-pose.angle),lx=dx*c-dy*s,ly=dx*s+dy*c;
  const halfWidth=Math.max(13,22/scale),halfHeight=Math.max(24,22/scale),distance=Math.hypot(dx,dy);
  if(Math.abs(lx)<=halfWidth&&Math.abs(ly)<=halfHeight&&distance<best){hit=b.id;best=distance;}
 }
 return hit;
}
/** Draw in the coast's 1600×900 world coordinates. All glass/letter art is original vector work. */
function drawBottle(ctx,pose,{airborne=false}={}){
  ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.globalAlpha=pose.alpha;
  if(!airborne){
  ctx.fillStyle='#153e5825';ctx.beginPath();ctx.ellipse(1,7,18,7,.35,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ddf6f761';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,8,21,7,0,.15,2.8);ctx.stroke();
  }
  ctx.beginPath();ctx.moveTo(-4,-19);ctx.lineTo(4,-19);ctx.lineTo(4,-11);ctx.bezierCurveTo(5,-8,10,-6,10,-1);ctx.lineTo(10,13);ctx.quadraticCurveTo(10,18,5,19);ctx.lineTo(-5,19);ctx.quadraticCurveTo(-10,18,-10,13);ctx.lineTo(-10,-1);ctx.bezierCurveTo(-10,-6,-5,-8,-4,-11);ctx.closePath();
  // The same neck/body contour and pickup pose, now with a blue glass wall,
  // a clear centre and a rounded rim instead of a uniformly green fill.
  const glass=ctx.createLinearGradient(-10,0,11,4);
  glass.addColorStop(0,'#7eb5c994');glass.addColorStop(.17,'#e0f4f1a4');
  glass.addColorStop(.34,'#c8eae957');glass.addColorStop(.61,'#89c4d33c');
  glass.addColorStop(.84,'#3c839766');glass.addColorStop(1,'#bfdedfa8');
  ctx.fillStyle=glass;ctx.fill();ctx.strokeStyle='#37687da8';ctx.lineWidth=1.3;ctx.stroke();
  ctx.save();ctx.rotate(.13);
  const paper=ctx.createLinearGradient(-5,0,5,0);paper.addColorStop(0,'#c7b88bcf');paper.addColorStop(.28,'#f0e7cadb');paper.addColorStop(.58,'#f5efd9db');paper.addColorStop(1,'#c9bd97d1');
  ctx.fillStyle=paper;ctx.strokeStyle='#a49572a0';ctx.lineWidth=.75;ctx.beginPath();ctx.roundRect(-5,-6,10,21,2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#ded2adc9';ctx.beginPath();ctx.ellipse(0,-5,5,1.7,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#927f6270';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-2,-1);ctx.lineTo(3,-1);ctx.moveTo(-2,3);ctx.lineTo(2,3);ctx.moveTo(-2,7);ctx.lineTo(3,7);ctx.stroke();ctx.restore();
  ctx.strokeStyle='#edffffac';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-6,-3);ctx.lineTo(-6,11);ctx.moveTo(-2,-17);ctx.lineTo(-2,-11);ctx.stroke();
  // Rounded glass bottom stays wholly inside the original illustration bounds.
  ctx.strokeStyle='#b3e1e595';ctx.lineWidth=.75;ctx.beginPath();ctx.ellipse(0,15.5,7.2,1.65,0,0,Math.PI);ctx.stroke();
  const cork=ctx.createLinearGradient(-4.5,-22,4.5,-17);cork.addColorStop(0,'#dab98c');cork.addColorStop(.45,'#b99569');cork.addColorStop(1,'#806149');
  ctx.fillStyle=cork;ctx.strokeStyle='#75694f';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-4.5,-22,9,5,1);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#f0d8b3a6';ctx.beginPath();ctx.moveTo(-3,-20);ctx.lineTo(2,-20);ctx.stroke();
  ctx.restore();
}

export function drawBottles(ctx,driftOrView,time=0,{reducedMotion=false}={}){
 for(const b of viewOf(driftOrView)?.bottles??[]){
  if(driftOrView?.launchEffects?.has(b.id,time))continue;
  drawBottle(ctx,bottlePose(b,time,{reducedMotion}));
 }
}
/** Airborne bottles are drawn after shoreline foreground, then settle into water. */
export function drawBottleLaunches(ctx,driftOrView,effects,time=0){
 for(const b of viewOf(driftOrView)?.bottles??[]){
  if(!effects.has(b.id,time))continue;const pose=effects.pose(b,time);if(!pose)continue;
  drawBottle(ctx,pose,{airborne:pose.airborne});
  if(pose.splash!==null&&pose.splash<1){
   const p=pose.splash;ctx.save();ctx.translate(pose.waterX,pose.waterY+7);ctx.globalAlpha=(1-p)*.62;ctx.strokeStyle='#e3f7e3';ctx.lineWidth=1.2;
   ctx.beginPath();ctx.ellipse(0,0,12+p*24,4+p*7,0,0,Math.PI*2);ctx.stroke();
   if(!pose.reducedMotion){ctx.fillStyle='#eefbe7';for(let i=0;i<5;i++){const a=Math.PI*(i/4),x=Math.cos(a)*(8+p*18),y=-Math.sin(a)*Math.sin(p*Math.PI)*17;ctx.beginPath();ctx.ellipse(x,y,1.2,1.9,0,0,Math.PI*2);ctx.fill();}}
   ctx.restore();
  }
 }
}
