import {renderCatAppearance} from './appearance.js';
import {normalizeCustomization} from './customization.js';
import {CAT_ACTION_EYES} from './action-eye-landmarks.js';

// Parameters belong to a cat, not the screen. Both portraits and action poses
// use their body landmarks; changes are baked once and shared by the renderer.
const portraits=new Map();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ellipse=(p,c,rx,ry)=>Math.exp(-2*((p.x-c.x)**2/(rx*rx)+(p.y-c.y)**2/(ry*ry)));
function remap(p,from,to){return {x:to[0]+(p.x-from[0])/from[2]*to[2],y:to[1]+(p.y-from[1])/from[3]*to[3]}}
export function catLandmarks(preset,frame=null){
 const head=frame?.parts?.head||preset.regions.head,body=frame?.parts?.body||preset.regions.body;
 const originalHead=preset.regions.head;
 const map=frame?.sourceMapping;
 // Each pose has its own measured iris, independent of the portrait's face.
 // Hidden/closed eyes are deliberately empty: never paint a guessed face spot.
 const eyes=frame?(map?(CAT_ACTION_EYES[preset.id]?.[frame.index]||[]).map(e=>({x:map.x+e.x*map.width,y:map.y+e.y*map.height,rx:e.rx*map.width,ry:e.ry*map.height})):[]):(preset.protectedAreas||[]).slice(0,2).map(e=>({...e,rx:e.rx*.50,ry:e.ry*.44}));
 const sourceEyes=(preset.protectedAreas||[]).slice(0,2);
 const ears=sourceEyes.map((e,i)=>{
  const tip={x:e.x+(i===0?-.028:.044),y:e.y-.127},root={x:tip.x+(i===0?.026:-.026),y:tip.y+.075};
  return {tip:frame?remap(tip,originalHead,head):tip,root:frame?remap(root,originalHead,head):root};
 });
 return {head,body,eyes,ears};
}
export function deformCatPoint(p,landmarks,value){
 const config=value,body=landmarks.body,head=landmarks.head;
 let dx=0,dy=0;
 if(config.build!==1){
  const center={x:body[0]+body[2]*.52,y:body[1]+body[3]*.5},hc={x:head[0]+head[2]*.5,y:head[1]+head[3]*.5};
  const ax=center.x-hc.x,ay=center.y-hc.y,length=Math.hypot(ax,ay)||1,nx=-ay/length,ny=ax/length;
  const across=(p.x-center.x)*nx+(p.y-center.y)*ny;
  const weight=ellipse(p,center,body[2]*.8,body[3]*.75);
  dx+=nx*across*(config.build-1)*weight*1.65;dy+=ny*across*(config.build-1)*weight*1.65;
 }
 if(config.earSize!==1||config.earShape!=='natural')for(const ear of landmarks.ears){
  const length=Math.hypot(ear.tip.x-ear.root.x,ear.tip.y-ear.root.y),weight=ellipse(p,ear.tip,length*.8,length*.92);
  const extra=config.earShape==='pointed'?.14:config.earShape==='rounded'?-.15:0;
  dx+=(p.x-ear.root.x)*(config.earSize-1+extra*.35)*weight;
  dy+=(p.y-ear.root.y)*(config.earSize-1+extra)*weight;
 }
 return {x:p.x+dx,y:p.y+dy};
}
export function inverseCatPoint(p,landmarks,config){
 let q={...p};for(let i=0;i<3;i++){const forward=deformCatPoint(q,landmarks,config);q={x:q.x+p.x-forward.x,y:q.y+p.y-forward.y}}
 return q;
}
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function colorIris(data,w,h,bounds,landmarks,hex){
 if(hex==='original')return;
 const color=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 for(const eye of landmarks.eyes){
  const x0=clamp(Math.floor((eye.x-eye.rx-bounds[0])/bounds[2]*w),0,w),x1=clamp(Math.ceil((eye.x+eye.rx-bounds[0])/bounds[2]*w),0,w);
  const y0=clamp(Math.floor((eye.y-eye.ry-bounds[1])/bounds[3]*h),0,h),y1=clamp(Math.ceil((eye.y+eye.ry-bounds[1])/bounds[3]*h),0,h);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   const px=bounds[0]+(x+.5)/w*bounds[2],py=bounds[1]+(y+.5)/h*bounds[3];
   const d=((px-eye.x)/eye.rx)**2+((py-eye.y)/eye.ry)**2;if(d>=1)continue;
   const i=(y*w+x)*4,a=data[i+3];if(a<40)continue;
   const max=Math.max(data[i],data[i+1],data[i+2]),min=Math.min(data[i],data[i+1],data[i+2]);
   const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
   // Leave black pupils, white catchlights and the uncoloured eyelid intact.
   if(lum<38||lum>232||(max-min)<13)continue;
   const mix=clamp((1-d)*2.8,0,1)*.85,shade=.30+lum/255*.95;
   for(let k=0;k<3;k++)data[i+k]=Math.round(data[i+k]*(1-mix)+Math.min(255,color[k]*shade)*mix);
  }
 }
}
function customizeBitmap(source,bounds,landmarks,config){
 const w=source.width||source.naturalWidth,h=source.height||source.naturalHeight,out=surface(w,h),c=out.getContext('2d',{willReadFrequently:true});
 c.drawImage(source,0,0,w,h);const input=c.getImageData(0,0,w,h);colorIris(input.data,w,h,bounds,landmarks,config.eyeColor);
 if(config.build===1&&config.earSize===1&&config.earShape==='natural'){c.putImageData(input,0,0);return out}
 const output=c.createImageData(w,h),src=input.data,dst=output.data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p={x:bounds[0]+(x+.5)/w*bounds[2],y:bounds[1]+(y+.5)/h*bounds[3]},q=inverseCatPoint(p,landmarks,config);
  const sx=(q.x-bounds[0])/bounds[2]*w-.5,sy=(q.y-bounds[1])/bounds[3]*h-.5;
  if(sx<0||sy<0||sx>=w-1||sy>=h-1)continue;
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],points=[(iy*w+ix)*4,(iy*w+ix+1)*4,((iy+1)*w+ix)*4,((iy+1)*w+ix+1)*4];
  let a=0,r=0,g=0,b=0;for(let n=0;n<4;n++){const i=points[n],v=weights[n]*src[i+3];a+=v;r+=src[i]*v;g+=src[i+1]*v;b+=src[i+2]*v}
  if(a>.5){const i=(y*w+x)*4;dst[i]=r/a;dst[i+1]=g/a;dst[i+2]=b/a;dst[i+3]=a}
 }
 c.putImageData(output,0,0);return out;
}
function isDefault(c){return c.build===1&&c.earSize===1&&c.earShape==='natural'&&c.eyeColor==='original'}
export function customizationRenderKey(value){const c=normalizeCustomization(value);return JSON.stringify({build:c.build,earSize:c.earSize,earShape:c.earShape,eyeColor:c.eyeColor})}
export async function renderCustomizedCat(preset,appearance,value,{size=512,cache=true}={}){
 const config=normalizeCustomization(value),key=`${preset.id}:${size}:${JSON.stringify(appearance||{})}:${customizationRenderKey(config)}`;
 if(cache&&portraits.has(key))return portraits.get(key);
 const job=renderCatAppearance(preset,appearance,{size,cache}).then(source=>isDefault(config)?source:customizeBitmap(source,[0,0,1,1],catLandmarks(preset),config));
 if(cache){portraits.set(key,job);while(portraits.size>20)portraits.delete(portraits.keys().next().value);job.catch(()=>portraits.delete(key))}
 return job;
}
export function customizeActionFrame(frame,preset,value){
 const config=normalizeCustomization(value);if(isDefault(config))return frame;
 // A gutter lets fluffy bodies and enlarged ears extend into transparent space
 // without changing the common action-cell coordinates or the ground anchor.
 const padding=Math.ceil(Math.max(frame.image.width,frame.image.height)*.12),image=surface(frame.image.width+padding*2,frame.image.height+padding*2);
 image.getContext('2d').drawImage(frame.image,padding,padding);
 const bounds=[frame.bounds[0]-padding/frame.cellWidth,frame.bounds[1]-padding/frame.cellHeight,image.width/frame.cellWidth,image.height/frame.cellHeight];
 const landmarks=catLandmarks(preset,frame);
 // Keep the painted source and its deformation together: the locomotion rig
 // samples fur before reshaping, then applies the same shape to its landmarks.
 return {...frame,bounds,image:customizeBitmap(image,bounds,landmarks,config),rigSource:frame,rigMorph:{landmarks,config}};
}
