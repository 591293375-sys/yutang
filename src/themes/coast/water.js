import {WORLD_WIDTH as W,WORLD_HEIGHT as H,waterBoundary,PAINTED_WATER_BOUNDARY} from './geometry.js';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const path=points=>{const p=new Path2D();points.forEach((q,i)=>i?p.lineTo(q.x,q.y):p.moveTo(q.x,q.y));p.closePath();return p;};
const FIELD_W=400,FIELD_H=225,PIXEL=W/FIELD_W;
// A small cached distance field gives the shoreline a continuous optical depth.
// It is independent of output resolution; the final exact geometry clip stays
// at native canvas resolution. No full-screen blur/filter runs in a frame.
function distanceToMask(mask,inside){
  const d=new Float32Array(mask.length),far=FIELD_W+FIELD_H;
  for(let i=0;i<d.length;i++)d[i]=!!mask[i]===inside?far:0;
  const diag=Math.SQRT2;
  for(let y=0;y<FIELD_H;y++)for(let x=0;x<FIELD_W;x++){
    const i=y*FIELD_W+x;let v=d[i];if(x)v=Math.min(v,d[i-1]+1);if(y)v=Math.min(v,d[i-FIELD_W]+1);if(x&&y)v=Math.min(v,d[i-FIELD_W-1]+diag);if(y&&x+1<FIELD_W)v=Math.min(v,d[i-FIELD_W+1]+diag);d[i]=v;
  }
  for(let y=FIELD_H-1;y>=0;y--)for(let x=FIELD_W-1;x>=0;x--){
    const i=y*FIELD_W+x;let v=d[i];if(x+1<FIELD_W)v=Math.min(v,d[i+1]+1);if(y+1<FIELD_H)v=Math.min(v,d[i+FIELD_W]+1);if(x+1<FIELD_W&&y+1<FIELD_H)v=Math.min(v,d[i+FIELD_W+1]+diag);if(x&&y+1<FIELD_H)v=Math.min(v,d[i+FIELD_W-1]+diag);d[i]=v;
  }
  return d;
}
export class CoastWater {
  constructor(){
    this.mask=make(FIELD_W,FIELD_H);this.maskCtx=this.mask.getContext('2d',{willReadFrequently:true});
    this.layer=make(FIELD_W,FIELD_H);this.ctx=this.layer.getContext('2d');
    this.pixels=this.ctx.createImageData(FIELD_W,FIELD_H);this.lastKey=-1;this.lastTime=-1;this.level=0;
    this.textureMask=make(FIELD_W,FIELD_H);this.textureCtx=this.textureMask.getContext('2d');
    this.texturePixels=this.textureCtx.createImageData(FIELD_W,FIELD_H);this.seaSource=null;this.seaLayer=null;this.textureDirty=false;
    // Keep the approved high-water colour treatment referenced to its original
    // painting. Moving low tide must not recolour the entire permanent sea.
    const low=this.rasterBoundary(PAINTED_WATER_BOUNDARY),din=distanceToMask(low,true),dout=distanceToMask(low,false);
    this.lowDistance=Float32Array.from(low,(v,i)=>(v?-din[i]:dout[i])*PIXEL);
  }
  rasterBoundary(boundary){
    const ctx=this.maskCtx;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,FIELD_W,FIELD_H);ctx.setTransform(1/PIXEL,0,0,1/PIXEL,0,0);ctx.fillStyle='#fff';ctx.fill(path(boundary));
    const data=ctx.getImageData(0,0,FIELD_W,FIELD_H).data,mask=new Uint8Array(FIELD_W*FIELD_H);for(let i=0;i<mask.length;i++)mask[i]=data[i*4+3]>127?1:0;return mask;
  }
  raster(level){return this.rasterBoundary(waterBoundary(level));}
  setSea(source){
    this.seaSource=source;this.seaLayer=make(source.width,source.height);this.textureDirty=true;
  }
  rebuildSea(){
    if(!this.seaSource||!this.seaLayer)return;
    const ctx=this.seaLayer.getContext('2d'),w=this.seaLayer.width,h=this.seaLayer.height;
    ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation='source-over';ctx.drawImage(this.seaSource,0,0,w,h);
    ctx.globalCompositeOperation='destination-in';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';ctx.drawImage(this.textureMask,0,0,w,h);
    ctx.globalCompositeOperation='source-over';this.textureDirty=false;
  }
  update(level,wetPeak,time){
    const key=Math.round(level*500),wetKey=Math.round(wetPeak*80);
    if(key===this.lastKey&&wetKey===this.lastWetKey){if(this.textureDirty)this.rebuildSea();return;}
    if(this.lastTime>=0&&time-this.lastTime<.06&&Math.abs(level-this.level)<.012)return;
    this.lastKey=key;this.lastWetKey=wetKey;this.lastTime=time;this.level=level;
    const mask=this.raster(level),inside=distanceToMask(mask,true);
    let peak=null,peakDistance=null;if(wetPeak>level+.01){peak=this.raster(wetPeak);peakDistance=distanceToMask(peak,true);}
    const data=this.pixels.data,texture=this.texturePixels.data;
    for(let i=0;i<mask.length;i++){
      const depth=mask[i]?Math.max(0,(inside[i]-.5)*PIXEL):0;
      const land=smooth(-88,36,this.lowDistance[i]),edge=smooth(0,58,depth),deep=smooth(15,235,depth);
      // Sand grain stays visible through the shallows. The original painted
      // permanent sea keeps its own colour and detail instead of being washed flat.
      const waterAlpha=mask[i]?edge*(.008*level+land*(.19+deep*.21)):0;
      const wetAlpha=peak?.[i]?land*.085*smooth(0,34,peakDistance[i]*PIXEL)*(1-smooth(0,52,depth)):0;
      const alpha=waterAlpha+wetAlpha*(1-waterAlpha),q=alpha?waterAlpha/alpha:0;
      const r=75-deep*42,g=184-deep*28,b=172+deep*2;
      data[i*4]=Math.round(144*(1-q)+r*q);data[i*4+1]=Math.round(134*(1-q)+g*q);data[i*4+2]=Math.round(101*(1-q)+b*q);data[i*4+3]=Math.round(alpha*255);
      // The detailed marine painting stays at its native source resolution;
      // only this feather mask is coarse. A final exact water clip keeps all
      // interpolation inside the habitat boundary.
      texture[i*4]=texture[i*4+1]=texture[i*4+2]=255;texture[i*4+3]=mask[i]?Math.round(smooth(0,26,depth)*255):0;
    }
    this.ctx.putImageData(this.pixels,0,0);
    this.textureCtx.putImageData(this.texturePixels,0,0);this.rebuildSea();
  }
  drawSea(ctx,waterPath){if(!this.seaLayer)return;ctx.save();ctx.clip(waterPath);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';ctx.drawImage(this.seaLayer,0,0,W,H);ctx.restore();}
  draw(ctx){ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';ctx.drawImage(this.layer,0,0,W,H);ctx.restore();}
  destroy(){this.layer.width=1;this.mask.width=1;this.textureMask.width=1;if(this.seaLayer)this.seaLayer.width=1;this.seaSource=null;this.seaLayer=null;this.pixels=null;this.texturePixels=null;this.lowDistance=null;}
}
