// All poses share one local-foot canvas. Mixing their premultiplied pixels with
// `lighter` preserves opacity; source-over fades would dim the body at mid-hop.
export const TOAD_POSES=Object.freeze({idle:{w:72,foot:.975,cx:.52},blink:{w:72,foot:.975,cx:.52},hop:{w:70,foot:.965,cx:.53},carry:{w:72.6,foot:.976,cx:.52},sleep:{w:79.6,foot:.965,cx:.52}});
export const TOAD_BLEND_SECONDS=.14;
const LEFT=-48,TOP=-84,WIDTH=100,HEIGHT=100;
const painters=new WeakMap();
function surface(ratio){const c=document.createElement('canvas');c.width=c.height=Math.ceil(WIDTH*ratio);return c}
function smooth(value){const u=Math.max(0,Math.min(1,value));return u*u*(3-2*u)}
export function compositeToadPoses(ctx,previous,target,blend){
 ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.save();
 ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1-blend;if(blend<1)ctx.drawImage(previous,0,0);
 ctx.globalCompositeOperation='lighter';ctx.globalAlpha=blend;if(blend>0)ctx.drawImage(target,0,0);ctx.restore();
}
function mix(painter,time){
 const blend=smooth((time-painter.changedAt)/TOAD_BLEND_SECONDS);
 compositeToadPoses(painter.current.getContext('2d'),painter.from,painter.target,blend);
}
function paintTarget(painter,images,pose){
 const c=painter.target,g=c.getContext('2d'),tex=images['motion/toad_'+pose+'.webp'],a=TOAD_POSES[pose],w=a.w,h=w*tex.height/tex.width;
 g.clearRect(0,0,c.width,c.height);g.save();g.scale(painter.ratio,painter.ratio);g.translate(-LEFT,-TOP);g.drawImage(tex,-w*a.cx,-h*a.foot,w,h);g.restore();
}
export function drawToadPose(ctx,images,life,pose){
 if(!images['motion/toad_'+pose+'.webp'])pose=images['motion/toad_idle.webp']?'idle':null;
 if(!pose)return;
 const transform=ctx.getTransform(),ratio=Math.min(4,Math.max(1,Math.ceil(Math.hypot(transform.a,transform.b))));
 let painter=painters.get(life);
 if(!painter||painter.ratio!==ratio){
  painter={ratio,from:surface(ratio),target:surface(ratio),current:surface(ratio),pose,changedAt:life.time-TOAD_BLEND_SECONDS};
  paintTarget(painter,images,pose);painters.set(life,painter);
 }
 // Finish the old blend at this exact instant before retargeting. Fast clicks,
 // blink endings and short consecutive hops cannot reset to an unseen frame.
 mix(painter,life.time);
 if(painter.pose!==pose){
  const g=painter.from.getContext('2d');g.clearRect(0,0,painter.from.width,painter.from.height);g.drawImage(painter.current,0,0);
  painter.pose=pose;painter.changedAt=life.time;paintTarget(painter,images,pose);
 }
 ctx.drawImage(painter.current,LEFT,TOP,WIDTH,HEIGHT);
}
