import {shoreLine,waterBoundary,pointInPolygon,blockedAt} from './geometry.js';
import {drawFoamMaterial} from './foam-material.js';
const clamp=n=>Math.max(0,Math.min(1,n));
const hash=n=>{const v=Math.sin(n*127.13+81.7)*43758.5453;return v-Math.floor(v);};
export const SURF_PERIOD=8.4;

/** Thin swash has no swimming depth. The tidal polygon remains the habitat boundary. */
export function surfState(time,index=0,level=0,reducedMotion=false){
  const phase=reducedMotion?.55:((Math.max(0,time)/SURF_PERIOD+index/2)%1);
  const arrival=.65,advance=clamp(phase/arrival),retreat=clamp((phase-arrival)/(1-arrival));
  const distance=phase<arrival?Math.pow(1-advance,1.18)*(82+level*30):retreat*23;
  const opacity=Math.sin(Math.PI*phase)**.8;
  return {phase,distance,width:14+(1-distance/120)*17,opacity,runup:phase>arrival?Math.sin(retreat*Math.PI)*(5+level*4):0};
}
export function surfRibbon(level,time,index=0,reducedMotion=false){
  if(reducedMotion)time=0;
  const state=surfState(time,index,level,reducedMotion),line=shoreLine(level),front=[],back=[],edge=[],reach=[],strength=[],normals=[];
  let arc=0;
  for(let i=0;i<line.length;i++){
    const p=line[i],a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)];
    if(i)arc+=Math.hypot(p.x-line[i-1].x,p.y-line[i-1].y);
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
    const variation=.65+.35*Math.sin(arc*.021+index*2.8)**2;
    const undulation=(Math.sin(arc*.019+index*2.3)+Math.sin(arc*.047-time*.38))*2.5;
    const d=Math.max(.2,state.distance*(.85+.15*Math.sin(arc*.008+index))+undulation*(1-state.distance/145));
    const localReach=state.runup*variation,localStrength=state.opacity*(.27+.73*Math.sin(arc*.023+index*3.1)**2);
    front.push({x:p.x+nx*d,y:p.y+ny*d});back.push({x:p.x+nx*(d+state.width),y:p.y+ny*(d+state.width)});
    edge.push({x:p.x-nx*localReach,y:p.y-ny*localReach});reach.push(localReach);strength.push(localStrength);normals.push({x:nx,y:ny});
  }
  return {...state,front,back,edge,line,reach,strength,normals};
}
let cached=null;
/** Shared by visual wash and sand erosion. Coordinates and time are world px / seconds. */
export function surfFootprint(level,time,reducedMotion=false){
  if(reducedMotion)time=0;
  if(cached&&cached.level===level&&cached.time===time&&cached.reducedMotion===reducedMotion)return cached;
  const ribbons=Array.from({length:reducedMotion?1:2},(_,i)=>surfRibbon(level,time,i,reducedMotion)),line=ribbons[0].line;
  const reach=line.map((_,i)=>Math.max(...ribbons.map(r=>r.reach[i]))),grid=new Map(),cell=48;
  for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i],pad=11;
    for(let y=Math.floor((Math.min(a.y,b.y)-pad)/cell);y<=Math.floor((Math.max(a.y,b.y)+pad)/cell);y++)
      for(let x=Math.floor((Math.min(a.x,b.x)-pad)/cell);x<=Math.floor((Math.max(a.x,b.x)+pad)/cell);x++){
        const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);
      }
  }
  const quads=ribbons.map(r=>r.line.slice(1).map((b,i)=>[r.line[i],b,r.edge[i+1],r.edge[i]]));
  return cached={level,time,reducedMotion,ribbons,line,reach,quads,grid,cell,boundary:waterBoundary(level)};
}
export function surfCoverageAt(x,y,level,time,reducedMotion=false){
  const f=surfFootprint(level,time,reducedMotion);
  if(pointInPolygon(x,y,f.boundary))return blockedAt(x,y)?0:1;
  const candidates=f.grid.get(Math.floor(x/f.cell)+','+Math.floor(y/f.cell));if(!candidates)return 0;
  let coverage=0;
  for(const i of candidates){
    const a=f.line[i-1],b=f.line[i],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy||1;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/den),px=a.x+t*dx,py=a.y+t*dy;
    const distance=Math.hypot(x-px,y-py),reach=f.reach[i-1]+(f.reach[i]-f.reach[i-1])*t;
    if(distance<reach&&f.quads.some(quads=>pointInPolygon(x,y,quads[i-1])))coverage=Math.max(coverage,clamp((reach-distance)/2.5));
  }
  return coverage&&blockedAt(x,y)?0:coverage;
}
function trace(ctx,points,start=0,end=points.length){for(let i=start;i<end;i++){const p=points[i];i===start?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);}}
export function drawSurf(ctx,{level,time,reducedMotion=false,waterPath}){
  if(reducedMotion)time=0;
  const footprint=surfFootprint(level,time,reducedMotion);
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(let wave=0;wave<footprint.ribbons.length;wave++){
    const r=footprint.ribbons[wave],near=clamp(1-r.distance/88);
    ctx.save();if(waterPath)ctx.clip(waterPath);
    // The broken lace stays behind the same advancing crest that drives the
    // wash footprint. Far offshore it dissolves into a translucent swell.
    for(let i=1;i<r.front.length-2;i+=2){
      const strength=r.strength[i],patch=hash(Math.floor(i/3)+wave*71);
      if(strength<.04)continue;
      const end=Math.min(r.front.length,i+3);
      ctx.beginPath();trace(ctx,r.front,i,end);for(let j=end-1;j>=i;j--)ctx.lineTo(r.back[j].x,r.back[j].y);ctx.closePath();
      ctx.fillStyle=`rgba(204,238,237,${strength*(.035+near*.085)})`;ctx.fill();
      ctx.beginPath();trace(ctx,r.front,i,end);
      ctx.strokeStyle=`rgba(220,246,245,${strength*(.085+near*.25)})`;ctx.lineWidth=3.4+near*3.5;ctx.stroke();
      if(patch<.87){ctx.strokeStyle=`rgba(248,253,250,${strength*(.15+near*.57)})`;ctx.lineWidth=.7+near*.8+patch*.5;ctx.stroke()}
      const p=r.front[i],n=r.normals[i],a=r.front[Math.max(0,i-1)],b=r.front[Math.min(r.front.length-1,i+2)];
      drawFoamMaterial(ctx,{x:p.x+n.x*1.1,y:p.y+n.y*1.1,nx:n.x,ny:n.y,
        length:Math.min(60,Math.max(26,Math.hypot(b.x-a.x,b.y-a.y)*1.35)),
        width:r.width*(.85+patch*.48),opacity:strength*(.30+near*.70),seed:i+wave*7});
    }
    ctx.restore();
    if(r.runup>.05){
      for(let i=1;i<r.line.length;i++){
        const a=r.line[i-1],b=r.line[i],ea=r.edge[i-1],eb=r.edge[i];
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(eb.x,eb.y);ctx.lineTo(ea.x,ea.y);ctx.closePath();
        ctx.fillStyle=`rgba(163,200,201,${r.opacity*.13})`;ctx.fill();
        if(hash(i+wave*41)>.50){ctx.beginPath();ctx.moveTo(ea.x,ea.y);ctx.lineTo(eb.x,eb.y);ctx.strokeStyle=`rgba(249,251,245,${r.strength[i]*.42})`;ctx.lineWidth=.8;ctx.stroke();}
      }
    }
  }
  // Residual bubbles left against the wet edge make a connected, varied
  // shoreline between breakers. They are entirely inside the tidal polygon.
  ctx.save();if(waterPath)ctx.clip(waterPath);
  const r=footprint.ribbons[0];
  for(let i=2;i<r.line.length-2;i+=3){
    const p=r.line[i],n=r.normals[i],a=r.line[i-1],b=r.line[i+2],seed=hash(i*29);
    const pulse=.5+.5*Math.sin(time*.35+i*.47),fade=.67+.22*pulse;
    drawFoamMaterial(ctx,{x:p.x+n.x*(.4+pulse),y:p.y+n.y*(.4+pulse),nx:n.x,ny:n.y,
      length:Math.min(75,Math.max(28,Math.hypot(b.x-a.x,b.y-a.y)*1.3)),width:26+seed*19,opacity:fade,seed:i+5});
  }
  ctx.restore();
  ctx.restore();
}
