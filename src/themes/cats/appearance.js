/** Paint is stored in the source sprite's UV coordinates, never in viewport pixels. */
export const APPEARANCE_VERSION = 1;
export const EMPTY_APPEARANCE = Object.freeze({version:1,strokes:[]});
export const PAINT_LIMITS = Object.freeze({strokes:300,pointsPerStroke:1600,totalPoints:40000});
const regions = new Set(['all','head','body','tail','legs']);

export function validateAppearance(value) {
  if(value == null) return {version:1,strokes:[]};
  if(value.version !== 1 || !Array.isArray(value.strokes) || value.strokes.length > PAINT_LIMITS.strokes) throw new Error('不支持的毛色数据');
  let total=0;
  const strokes=value.strokes.map(s=>{
    if(!s || !/^#[\da-f]{6}$/i.test(s.color) || !Number.isFinite(s.size) || s.size<.002 || s.size>.2 || !regions.has(s.region || 'all') || !Array.isArray(s.points) || !s.points.length || s.points.length>PAINT_LIMITS.pointsPerStroke) throw new Error('画笔数据不完整');
    total+=s.points.length;if(total>PAINT_LIMITS.totalPoints) throw new Error('这份毛色图案太复杂了');
    const points=s.points.map(p=>{
      if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x<0 || p.x>1 || p.y<0 || p.y>1) throw new Error('画笔坐标无效');
      return {x:p.x,y:p.y};
    });
    return {color:s.color.toLowerCase(),size:s.size,erase:!!s.erase,points,region:s.region||'all',symmetric:!!s.symmetric};
  });
  return {version:1,strokes};
}

/** Useful for editor hit mapping; pan/zoom are already reflected in the DOM rectangle. */
export function pointInCatCanvas(clientX,clientY,rect) {
  if(!rect?.width || !rect?.height) return null;
  const x=(clientX-rect.left)/rect.width,y=(clientY-rect.top)/rect.height;
  return x>=0&&x<=1&&y>=0&&y<=1 ? {x,y} : null;
}

const images=new Map(),renders=new Map();
export function loadCatImage(preset) {
  const source=preset?.image;
  if(!source) return Promise.reject(new Error('这款猫咪的素材还在准备中'));
  if(images.has(source)) return images.get(source);
  const promise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(source);reject(new Error('猫咪图片暂时没有加载成功'))};image.src=source});
  images.set(source,promise);return promise;
}

function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function regionRect(preset,key){const r=preset?.regions?.[key];return Array.isArray(r)&&r.length===4?r:[0,0,1,1]}
export function mirrorCatPoint(point,axis=[{x:.5,y:0},{x:.5,y:1}]) {
  const [a,b]=axis,dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  if(!length)return {x:point.x,y:point.y};
  const t=((point.x-a.x)*dx+(point.y-a.y)*dy)/length;
  return {x:2*(a.x+t*dx)-point.x,y:2*(a.y+t*dy)-point.y};
}
export function drawStroke(ctx,stroke,preset,w,h){
  ctx.save();
  if(stroke.region!=='all'){const [x,y,rw,rh]=regionRect(preset,stroke.region);ctx.beginPath();ctx.rect(x*w,y*h,rw*w,rh*h);ctx.clip()}
  ctx.globalCompositeOperation=stroke.erase?'destination-out':'source-over';
  ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.size*w;ctx.lineJoin='round';ctx.lineCap='round';
  for(const mirror of stroke.symmetric?[false,true]:[false]){
    const at=p=>{const q=mirror?mirrorCatPoint(p,preset.symmetryAxis):p;return[q.x*w,q.y*h]};
    if(stroke.points.length===1){const [x,y]=at(stroke.points[0]);ctx.beginPath();ctx.arc(x,y,stroke.size*w/2,0,Math.PI*2);ctx.fill()}
    else {ctx.beginPath();stroke.points.forEach((p,i)=>{const [x,y]=at(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}
  }
  ctx.restore();
}
function protectedPixel(preset,x,y) {
  return (preset.protectedAreas||[]).some(a=>{
    const cx=a.x??a.cx,cy=a.y??a.cy,rx=a.rx??a.r??.025,ry=a.ry??a.r??.025;
    return ((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
  });
}

/** Canvas is shared by editor, thumbnails and scene. Alpha and facial details remain original. */
export async function renderCatAppearance(preset,appearance,{size=640,cache=true}={}) {
  const normalized=validateAppearance(appearance),limit=Math.min(1536,Math.max(64,Math.round(size)));
  const key=`${preset.id}:${limit}:${JSON.stringify(normalized)}`;
  if(cache&&renders.has(key)){const old=renders.get(key);renders.delete(key);renders.set(key,old);return old}
  const job=(async()=>{
    const image=await loadCatImage(preset),ratio=limit/Math.max(image.naturalWidth,image.naturalHeight),w=Math.round(image.naturalWidth*ratio),h=Math.round(image.naturalHeight*ratio);
    const result=makeCanvas(w,h),ctx=result.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,w,h);if(!normalized.strokes.length)return result;
    const overlay=makeCanvas(w,h),paint=overlay.getContext('2d',{willReadFrequently:true});
    normalized.strokes.forEach(s=>drawStroke(paint,s,preset,w,h));
    const base=ctx.getImageData(0,0,w,h),color=paint.getImageData(0,0,w,h);
    for(let i=0;i<base.data.length;i+=4){
      if(!base.data[i+3]||!color.data[i+3])continue;
      const x=(i/4%w+.5)/w,y=(Math.floor(i/4/w)+.5)/h;
      if(protectedPixel(preset,x,y))continue;
      const lum=(.2126*base.data[i]+.7152*base.data[i+1]+.0722*base.data[i+2])/255;
      // Keep fine dark ink/fur strands visible, but allow the body of dark cats to be tinted.
      const coverage=color.data[i+3]/255*.88*(lum<.13?.45:1),shade=.32+.78*lum;
      for(let channel=0;channel<3;channel++)base.data[i+channel]=Math.round(base.data[i+channel]*(1-coverage)+Math.min(255,color.data[i+channel]*shade)*coverage);
      // Original alpha is deliberately untouched: painting cannot create a new silhouette.
    }
    ctx.putImageData(base,0,0);return result;
  })();
  if(cache){renders.set(key,job);while(renders.size>36)renders.delete(renders.keys().next().value);job.catch(()=>renders.delete(key))}
  return job;
}

export function clearAppearanceCache(){renders.clear()}
