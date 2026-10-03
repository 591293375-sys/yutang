import {WORLD_WIDTH as W,WORLD_HEIGHT as H,ROCKS,DRY_ROCKS,blockedAt,habitatAt} from './geometry.js';
import {drawContactFoam} from './foam-material.js';
import {materialContactContours} from './contact-contours.js';
import {drawMaterialContactFoam} from './material-foam.js';
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t)};
const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
const trace=(ctx,polygons)=>{ctx.beginPath();for(const points of polygons){points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}};

// Marine pigment only reaches the narrow soaked edge. The face stays dry and
// opaque; an optical transition never changes the collision silhouette.
export function wetRockMix(distance){return .9*(1-smooth(distance/14))}
let samples;
let foamSamples;
// Render-only samples of the existing rock union. The narrow patch is checked
// in full, once, so foam cannot appear on a face or inside a touching seam.
function rockFoamSamples(){
  if(foamSamples)return foamSamples;
  foamSamples=[];
  for(const [rock,points] of ROCKS.entries()){
    const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a.x*b.y-b.x*a.y},0),sign=area>0?1:-1;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),steps=Math.ceil(length/19),nx=sign*dy/length,ny=-sign*dx/length;
      for(let j=0;j<steps;j++){
        const t=(j+.5)/steps,x=a.x+dx*t,y=a.y+dy*t;
        if(!blockedAt(x-nx*2,y-ny*2))continue;
        let safe=true;
        for(let d=1.5;d<=28.5&&safe;d+=2)for(let u=-17;u<=17;u+=2)if(blockedAt(x+nx*d+ny*u,y+ny*d-nx*u)){safe=false;break}
        if(safe)foamSamples.push({x,y,nx,ny,rock,seed:i*11+j+rock*43});
      }
    }
  }
  return foamSamples;
}
export function rockContactSamples(){
  if(samples)return samples;
  samples=[];
  for(const [rock,points] of DRY_ROCKS.entries()){
    const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a.x*b.y-b.x*a.y},0),sign=area>0?1:-1;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),steps=Math.ceil(length/7);
      const nx=sign*dy/length,ny=-sign*dx/length;
      for(let j=0;j<steps;j++){
        const t=(j+.5)/steps,x=a.x+dx*t,y=a.y+dy*t;
        // Test the union of ALL rocks, not individual overlapping cutouts.
        if(!blockedAt(x-nx*2,y-ny*2)||[3,5,9].some(d=>blockedAt(x+nx*d,y+ny*d)))continue;
        if([2.8,4.1].some(d=>[-3,0,3].some(t=>blockedAt(x+nx*d+ny*t,y+ny*d-nx*t))))continue;
        samples.push({x,y,nx,ny,rock});
      }
    }
  }
  return samples;
}
export function rockContactStrength(s,level){
  const h=habitatAt(s.x+s.nx*5,s.y+s.ny*5,level);
  return h.water?smooth(h.distance/26):0;
}

/** Two small terrain caches, rebuilt only on loading / quantized tide changes. */
export class RockContact {
  constructor(){this.rim=null;this.wet=null;this.key=-1;this.visible=[];this.foamVisible=[];this.contours=null;this.exterior=null;this.contacts=rockContactSamples();this.foamContacts=rockFoamSamples()}
  setMaterialSource(marine){
    const material=make(W,H),m=material.getContext('2d',{willReadFrequently:true});m.drawImage(marine,0,0,W,H);
    const rgba=m.getImageData(0,0,W,H).data;
    this.contours=materialContactContours(rgba,W,H);
    // Keep an optical wet edge over only the original visible rock pixels.
    // It has no relationship to, and never changes, the navigation material.
    this.bounds={x:0,y:0,w:W,h:H};
    this.rim=make(W,H);const r=this.rim.getContext('2d');
    const rimPath=new Path2D();this.exterior=new Path2D();this.exterior.rect(-10,-10,W+20,H+20);
    for(const contour of this.contours){
      const path=new Path2D();contour.points.forEach((p,i)=>i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y));path.closePath();
      rimPath.addPath(path);this.exterior.addPath(path);
    }
    r.strokeStyle='rgba(12,66,78,.24)';r.lineWidth=7;r.lineJoin='round';r.stroke(rimPath);
    r.globalCompositeOperation='destination-in';r.drawImage(material,0,0);r.globalCompositeOperation='source-over';
    this.wet=make(W,H);this.key=-1;this.visible=[];this.foamVisible=[];material.width=1;
  }
  setSource(marine,{dryMaterial=false}={}){
    if(!marine)return;
    if(this.rim)this.rim.width=1;if(this.wet)this.wet.width=1;
    this.contours=null;this.exterior=null;
    if(dryMaterial){this.setMaterialSource(marine);return}
    this.contacts=rockContactSamples();this.foamContacts=rockFoamSamples();
    this.foamContacts=this.foamContacts.map(s=>{
      const phase=s.x*.026+s.y*.019;
      return {...s,foamSin:Math.sin(phase),foamCos:Math.cos(phase),swellSin:Math.sin(phase*1.7),swellCos:Math.cos(phase*1.7),foamCluster:.18+.82*Math.max(0,Math.sin(phase*.81+.7)),foamSourceX:(Math.abs(s.seed)%12)*160};
    });
    this.contacts=this.contacts.filter(s=>Math.sin((s.x*.028+s.y*.021)*2.3)>=-.3).map(s=>{
      const phase=s.x*.028+s.y*.021;return {...s,glintSin:Math.sin(phase),glintCos:Math.cos(phase)};
    });
    const points=DRY_ROCKS.flat(),pad=20;
    const x=Math.floor(Math.min(...points.map(p=>p.x))-pad),y=Math.floor(Math.min(...points.map(p=>p.y))-pad);
    const w=Math.ceil(Math.max(...points.map(p=>p.x))-x+pad),h=Math.ceil(Math.max(...points.map(p=>p.y))-y+pad);
    this.bounds={x,y,w,h};
    const mask=make(w,h),ctx=mask.getContext('2d',{willReadFrequently:true});ctx.translate(-x,-y);ctx.fillStyle='#fff';trace(ctx,ROCKS);ctx.fill();
    const union=ctx.getImageData(0,0,w,h).data,d=new Float32Array(w*h),diag=Math.SQRT2;
    for(let i=0;i<d.length;i++)d[i]=union[i*4+3]>127?w+h:0;
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
      const i=yy*w+xx;let v=d[i];if(xx)v=Math.min(v,d[i-1]+1);if(yy)v=Math.min(v,d[i-w]+1);if(xx&&yy)v=Math.min(v,d[i-w-1]+diag);if(yy&&xx+1<w)v=Math.min(v,d[i-w+1]+diag);d[i]=v;
    }
    for(let yy=h-1;yy>=0;yy--)for(let xx=w-1;xx>=0;xx--){
      const i=yy*w+xx;let v=d[i];if(xx+1<w)v=Math.min(v,d[i+1]+1);if(yy+1<h)v=Math.min(v,d[i+w]+1);if(xx+1<w&&yy+1<h)v=Math.min(v,d[i+w+1]+diag);if(xx&&yy+1<h)v=Math.min(v,d[i+w-1]+diag);d[i]=v;
    }
    ctx.clearRect(x,y,w,h);trace(ctx,DRY_ROCKS);ctx.fill();const dry=ctx.getImageData(0,0,w,h).data;
    this.rim=make(w,h);const r=this.rim.getContext('2d',{willReadFrequently:true});
    r.drawImage(marine,x/W*marine.width,y/H*marine.height,w/W*marine.width,h/H*marine.height,0,0,w,h);
    const pixels=r.getImageData(0,0,w,h);
    for(let i=0;i<d.length;i++){
      pixels.data[i*4+3]=Math.round(dry[i*4+3]*wetRockMix(Math.max(0,d[i]-.5)));
    }
    r.putImageData(pixels,0,0);this.wet=make(w,h);this.key=-1;mask.width=1;
  }
  update(water){
    if(!this.rim||this.key===water.lastKey)return;
    this.key=water.lastKey;const {x,y,w,h}=this.bounds,c=this.wet.getContext('2d');
    c.clearRect(0,0,w,h);c.globalCompositeOperation='source-over';c.drawImage(this.rim,0,0);
    // Use the SAME shallows fade as the visible water. Nothing is baked into
    // the dry terrain, and a receding waterline cannot leave a blue dry halo.
    c.globalCompositeOperation='destination-in';c.drawImage(water.textureMask,x/W*water.textureMask.width,y/H*water.textureMask.height,w/W*water.textureMask.width,h/H*water.textureMask.height,0,0,w,h);
    c.globalCompositeOperation='source-over';
    // Reuse the water renderer's cached distance fade instead of performing
    // hundreds of nearest-shore searches while the user scrubs the tide.
    const mw=water.textureMask.width,mh=water.textureMask.height,data=water.texturePixels.data;
    if(this.contours){
      for(const contour of this.contours)for(const p of contour.points){
        const px=Math.max(0,Math.min(mw-1,Math.floor((p.x+p.nx*4)/W*mw))),py=Math.max(0,Math.min(mh-1,Math.floor((p.y+p.ny*4)/H*mh)));
        p.strength=data[(py*mw+px)*4+3]/255;
      }
      return;
    }
    this.visible=this.contacts.map(s=>{
      const px=Math.max(0,Math.min(mw-1,Math.floor((s.x+s.nx*5)/W*mw))),py=Math.max(0,Math.min(mh-1,Math.floor((s.y+s.ny*5)/H*mh)));
      return {...s,strength:data[(py*mw+px)*4+3]/255};
    }).filter(s=>s.strength>.015);
    this.foamVisible=this.foamContacts.map(s=>{
      const px=Math.max(0,Math.min(mw-1,Math.floor((s.x+s.nx*8)/W*mw))),py=Math.max(0,Math.min(mh-1,Math.floor((s.y+s.ny*8)/H*mh)));
      return {...s,strength:data[(py*mw+px)*4+3]/255};
    }).filter(s=>s.strength>.025);
  }
  draw(ctx,water,waterPath,time,reducedMotion){
    this.update(water);if(!this.wet)return;
    const {x,y,w,h}=this.bounds;ctx.save();ctx.clip(waterPath);ctx.drawImage(this.wet,x,y,w,h);
    if(this.contours){
      ctx.clip(this.exterior,'evenodd');drawMaterialContactFoam(ctx,this.contours,time,reducedMotion);ctx.restore();return;
    }
    // A fine, uneven necklace of aerated water clings to existing rock faces.
    // It breathes slowly and breaks into smaller cells away from the contact.
    drawContactFoam(ctx,this.foamVisible,time,reducedMotion);
    // The brighter short contact crest keeps individual foam cells connected
    // without tracing a continuous white outline over every stone.
    ctx.lineCap='round';
    const glintTime=reducedMotion?0:time*.72,sinGlint=Math.sin(glintTime),cosGlint=Math.cos(glintTime);
    ctx.lineWidth=.75;
    for(const s of this.visible){
      const pulse=.5+.5*(sinGlint*s.glintCos+cosGlint*s.glintSin);
      const distance=2.8+pulse*1.3,px=s.x+s.nx*distance,py=s.y+s.ny*distance;
      ctx.strokeStyle=`rgba(239,252,249,${s.strength*(.18+pulse*.22)})`;
      ctx.beginPath();ctx.moveTo(px+s.ny*2.7,py-s.nx*2.7);ctx.quadraticCurveTo(px+s.nx*.65,py+s.ny*.65,px-s.ny*2.7,py+s.nx*2.7);ctx.stroke();
    }
    ctx.restore();
  }
  destroy(){if(this.rim)this.rim.width=1;if(this.wet)this.wet.width=1;this.rim=this.wet=null;this.visible=[];this.foamVisible=[];this.contours=null;this.exterior=null}
}
