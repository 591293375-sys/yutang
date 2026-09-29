import {shoreLine,waterBoundary,pointInPolygon,blockedAt} from './geometry.js';
const TAU=Math.PI*2;
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
    // Intermittent watercolor tongues replace the continuous parallel rails.
    for(let i=2;i<r.front.length-3;i+=3){
      const strength=r.strength[i],patch=hash(Math.floor(i/3)+wave*71);
      if(patch>.68||strength<.16)continue;
      const end=Math.min(r.front.length,i+2+Math.floor(patch*4));
      ctx.beginPath();trace(ctx,r.front,i,end);for(let j=end-1;j>=i;j--)ctx.lineTo(r.back[j].x,r.back[j].y);ctx.closePath();
      ctx.fillStyle=`rgba(218,250,231,${strength*(.014+near*.022)})`;ctx.fill();
      ctx.beginPath();trace(ctx,r.front,i,end);ctx.strokeStyle=`rgba(251,255,230,${strength*(.14+near*.38)})`;ctx.lineWidth=.55+near*.8+patch*.55;ctx.stroke();
      // A few irregular bubbles cling behind each advancing crest.
      const p=r.front[i],n=r.normals[i];ctx.fillStyle=`rgba(251,255,237,${strength*(.18+near*.34)})`;
      for(let k=0;k<3;k++){const drift=2+hash(i*9+k)*9;ctx.beginPath();ctx.ellipse(p.x+n.x*drift+(hash(i+k)-.5)*7,p.y+n.y*drift+(hash(i+k+90)-.5)*5,.45+hash(i+k+30)*1.1,.35+hash(i+k+40)*.45,i*.8,0,TAU);ctx.fill();}
    }
    ctx.restore();
    if(r.runup>.05){
      for(let i=1;i<r.line.length;i++){
        const a=r.line[i-1],b=r.line[i],ea=r.edge[i-1],eb=r.edge[i];
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(eb.x,eb.y);ctx.lineTo(ea.x,ea.y);ctx.closePath();
        ctx.fillStyle=`rgba(175,214,190,${r.opacity*.13})`;ctx.fill();
        if(hash(i+wave*41)>.50){ctx.beginPath();ctx.moveTo(ea.x,ea.y);ctx.lineTo(eb.x,eb.y);ctx.strokeStyle=`rgba(250,249,220,${r.strength[i]*.38})`;ctx.lineWidth=.75;ctx.stroke();}
      }
    }
  }
  ctx.restore();
}
