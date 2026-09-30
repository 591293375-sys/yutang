import {WORLD_WIDTH as W,WORLD_HEIGHT as H,ROCKS,DRY_ROCKS,blockedAt,habitatAt} from './geometry.js';
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t)};
const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
const trace=(ctx,polygons)=>{ctx.beginPath();for(const points of polygons){points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}};

// Marine pigment only reaches the narrow soaked edge. The face stays dry and
// opaque; an optical transition never changes the collision silhouette.
export function wetRockMix(distance){return .9*(1-smooth(distance/14))}
let samples;
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
  constructor(){this.rim=null;this.wet=null;this.key=-1;this.visible=[]}
  setSource(marine){
    if(!marine)return;
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
    for(let i=0;i<d.length;i++)pixels.data[i*4+3]=Math.round(dry[i*4+3]*wetRockMix(Math.max(0,d[i]-.5)));
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
    this.visible=rockContactSamples().map(s=>{
      const px=Math.max(0,Math.min(mw-1,Math.floor((s.x+s.nx*5)/W*mw))),py=Math.max(0,Math.min(mh-1,Math.floor((s.y+s.ny*5)/H*mh)));
      return {...s,strength:data[(py*mw+px)*4+3]/255};
    }).filter(s=>s.strength>.015);
  }
  draw(ctx,water,waterPath,time,reducedMotion){
    this.update(water);if(!this.wet)return;
    const {x,y,w,h}=this.bounds;ctx.save();ctx.clip(waterPath);ctx.drawImage(this.wet,x,y,w,h);
    // Broken, quiet glints follow the outside of the union; no complete white
    // outline and no ripples across the rock top or between touching stones.
    ctx.lineCap='round';
    for(const s of this.visible){
      const phase=s.x*.028+s.y*.021,pulse=.5+.5*Math.sin((reducedMotion?0:time*.72)+phase);
      if(Math.sin(phase*2.3)<.25)continue;
      const distance=2.8+pulse*1.3,px=s.x+s.nx*distance,py=s.y+s.ny*distance;
      ctx.strokeStyle=`rgba(218,249,233,${s.strength*(.035+pulse*.09)})`;ctx.lineWidth=.65;
      ctx.beginPath();ctx.moveTo(px+s.ny*2.7,py-s.nx*2.7);ctx.quadraticCurveTo(px+s.nx*.65,py+s.ny*.65,px-s.ny*2.7,py+s.nx*2.7);ctx.stroke();
    }
    ctx.restore();
  }
  destroy(){if(this.rim)this.rim.width=1;if(this.wet)this.wet.width=1;this.rim=this.wet=null;this.visible=[]}
}
