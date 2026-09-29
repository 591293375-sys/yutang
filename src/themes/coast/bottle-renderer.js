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
  ctx.fillStyle='#154f4b25';ctx.beginPath();ctx.ellipse(1,7,18,7,.35,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#d5f8e761';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,8,21,7,0,.15,2.8);ctx.stroke();
  }
  ctx.beginPath();ctx.moveTo(-4,-19);ctx.lineTo(4,-19);ctx.lineTo(4,-11);ctx.bezierCurveTo(5,-8,10,-6,10,-1);ctx.lineTo(10,13);ctx.quadraticCurveTo(10,18,5,19);ctx.lineTo(-5,19);ctx.quadraticCurveTo(-10,18,-10,13);ctx.lineTo(-10,-1);ctx.bezierCurveTo(-10,-6,-5,-8,-4,-11);ctx.closePath();
  const glass=ctx.createLinearGradient(-10,0,11,4);glass.addColorStop(0,'#a6deca86');glass.addColorStop(.35,'#e1f9d66b');glass.addColorStop(.72,'#65afaa50');glass.addColorStop(1,'#d5eee89c');ctx.fillStyle=glass;ctx.fill();ctx.strokeStyle='#315f54d9';ctx.lineWidth=1.3;ctx.stroke();
  ctx.save();ctx.rotate(.13);ctx.fillStyle='#f5e7bccf';ctx.strokeStyle='#a58b57aa';ctx.lineWidth=.75;ctx.beginPath();ctx.roundRect(-5,-6,10,21,2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(0,-5,5,1.7,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#a58b5780';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-2,-1);ctx.lineTo(3,-1);ctx.moveTo(-2,3);ctx.lineTo(2,3);ctx.moveTo(-2,7);ctx.lineTo(3,7);ctx.stroke();ctx.restore();
  ctx.strokeStyle='#f0fff0bb';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-6,-3);ctx.lineTo(-6,11);ctx.moveTo(-2,-17);ctx.lineTo(-2,-11);ctx.stroke();
  ctx.fillStyle='#af8155';ctx.strokeStyle='#5d6647';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-4.5,-22,9,5,1);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#f4d4a5a6';ctx.beginPath();ctx.moveTo(-3,-20);ctx.lineTo(2,-20);ctx.stroke();
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
