// Foreground alpha was traced/extracted from the existing seasonal paintings.
// Colour is always taken from the exact rendered background, including night.
export const CANOPY_BOUNDS=Object.freeze({x:0,y:0,width:1028/1920,height:.4});
export const CANOPY_MASKS=Object.freeze(Object.fromEntries(['spring','summer','autumn','winter'].map(season=>[season,`assets/cats/canopy-v1/${season}-mask.webp`])));
export const CANOPY_TEST_POINTS=Object.freeze({under:{x:.325,y:.30},edge:{x:.375,y:.275},open:{x:.46,y:.43}});
const masks=new Map(),layers=new WeakMap(),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
/** Exact leaf alpha for pointer occlusion; never substitute the lighting field. */
export function alphaSampler(alpha,width,height,bounds=CANOPY_BOUNDS){
 return(x,y)=>{
  const u=(x-bounds.x)/bounds.width,v=(y-bounds.y)/bounds.height;if(u<0||v<0||u>=1||v>=1)return 0;
  const gx=u*width-.5,gy=v*height-.5,ix=Math.floor(gx),iy=Math.floor(gy),tx=gx-ix,ty=gy-iy;
  const at=(xx,yy)=>xx<0||yy<0||xx>=width||yy>=height?0:alpha[yy*width+xx]/255;
  return(at(ix,iy)*(1-tx)+at(ix+1,iy)*tx)*(1-ty)+(at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx)*ty;
 };
}
/** A coarse averaged field, not the hard leaf pixels, keeps dappled light smooth. */
export function coverageSampler(alpha,width,height,bounds=CANOPY_BOUNDS){
 const cols=48,rows=24,values=new Float32Array(cols*rows),counts=new Uint32Array(cols*rows);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=Math.min(rows-1,Math.floor(y/height*rows))*cols+Math.min(cols-1,Math.floor(x/width*cols));values[index]+=alpha[y*width+x]/255;counts[index]++;
 }
 for(let i=0;i<values.length;i++)values[i]/=Math.max(1,counts[i]);
 const blurred=new Float32Array(values.length);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  let total=0,weight=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=cols||yy>=rows)continue;const w=(3-Math.abs(dx))*(3-Math.abs(dy));total+=values[yy*cols+xx]*w;weight+=w;
  }blurred[y*cols+x]=total/weight;
 }
 return(x,y)=>{
  const u=(x-bounds.x)/bounds.width,v=(y-bounds.y)/bounds.height;if(u<0||v<0||u>=1||v>=1)return 0;
  const gx=u*(cols-1),gy=v*(rows-1),ix=Math.floor(gx),iy=Math.floor(gy),tx=gx-ix,ty=gy-iy;
  const a=blurred[iy*cols+ix],b=blurred[iy*cols+Math.min(cols-1,ix+1)],c=blurred[Math.min(rows-1,iy+1)*cols+ix],d=blurred[Math.min(rows-1,iy+1)*cols+Math.min(cols-1,ix+1)];
  // Softly taper the cropped right/bottom boundaries of the light field.
  return clamp(((a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty)*clamp((1-u)*18)*clamp((1-v)*12));
 };
}
async function loadMask(season){
 const selected=CANOPY_MASKS[season]?season:'summer';if(masks.has(selected))return masks.get(selected);
 const promise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{
  try{const c=canvas(image.naturalWidth,image.naturalHeight),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,c.width,c.height).data,alpha=new Uint8Array(c.width*c.height);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];resolve({image,sampleAt:coverageSampler(alpha,c.width,c.height),alphaAt:alphaSampler(alpha,c.width,c.height)})}catch(error){masks.delete(selected);reject(error)}
 };image.onerror=()=>{masks.delete(selected);reject(new Error(`树冠遮罩暂未载入：${selected}`))};image.src=(import.meta.env?.BASE_URL||'./')+CANOPY_MASKS[selected]});
 masks.set(selected,promise);return promise;
}
/** Called once when a background changes. The returned crop stays in scene UVs.
 * Draw AFTER cats/props and BEFORE airborne particles, using the same cover
 * transform as the background. Pair its fade with that background's fade. */
export async function buildCanopyOcclusion(background,season='summer'){
 if(!background)return null;
 let cache=layers.get(background);if(!cache){cache=new Map();layers.set(background,cache)}if(cache.has(season))return cache.get(season);
 const task=(async()=>{
  const mask=await loadMask(season),b=CANOPY_BOUNDS,width=background.naturalWidth||background.width,height=background.naturalHeight||background.height;
  const foreground=canvas(Math.ceil(width*b.width),Math.ceil(height*b.height)),c=foreground.getContext('2d');
  c.drawImage(background,b.x*width,b.y*height,b.width*width,b.height*height,0,0,foreground.width,foreground.height);
  c.globalCompositeOperation='destination-in';c.drawImage(mask.image,0,0,foreground.width,foreground.height);c.globalCompositeOperation='source-over';
  return{image:foreground,bounds:b,sampleAt:mask.sampleAt,alphaAt:mask.alphaAt,season};
 })();cache.set(season,task);try{return await task}catch(error){cache.delete(season);throw error}
}
