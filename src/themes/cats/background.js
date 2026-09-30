import {CAT_BACKGROUNDS} from './catalog.js';
import {CAT_FIXED_FACILITIES,drawSeasonGround} from './ground-season.js';

// Seasonal paint is composited once, never filtered/rebuilt in the animation loop.
// Keep the supplied high-resolution paving, steps and furnishings pixel aligned.
const images=new Map();
export const CAT_SEASON_PAINTINGS=Object.freeze({...CAT_BACKGROUNDS.seasons,spring:'assets/cats/art-v3/courtyard-sakura.webp'});
function image(file){
 if(!images.has(file))images.set(file,new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>{images.delete(file);reject(new Error(file))};i.src=import.meta.env.BASE_URL+file}));
 return images.get(file);
}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
export const CAT_FOLIAGE_REGIONS=[
 [[0,0],[.515,0],[.528,.094],[.483,.169],[.471,.235],[.408,.307],[.335,.283],[.303,.378],[.257,.431],[.252,.542],[.287,.655],[.274,.746],[.241,.816],[.222,.932],[.202,1],[0,1]],
 [[.885,0],[1,0],[1,1],[.758,1],[.819,.937],[.877,.818],[.897,.747],[.911,.665],[.889,.607],[.89,.452],[.877,.332],[.857,.276],[.854,.204],[.88,.112]],
];
function vegetationMask(w,h){
 const m=canvas(w,h),c=m.getContext('2d');c.fillStyle='#fff';c.filter=`blur(${Math.max(2,w*.005)}px)`;
 for(const poly of CAT_FOLIAGE_REGIONS){c.beginPath();poly.forEach(([x,y],i)=>i?c.lineTo(x*w,y*h):c.moveTo(x*w,y*h));c.closePath();c.fill()}
 // These original painted facilities must not move with a regenerated plant edge.
 c.filter='none';c.globalCompositeOperation='destination-out';
 for(const [x,y,rx,ry] of CAT_FIXED_FACILITIES){c.beginPath();c.ellipse(x*w,y*h,rx*w,ry*h,0,0,Math.PI*2);c.fill()}
 return m;
}
export async function courtyardBackground(tier,season,time){
 const original=await image(`assets/cats/courtyard-${tier}.webp`),night=time==='night';
 const seasonal=CAT_SEASON_PAINTINGS[season];
 const seasonalFile=season!=='summer'&&typeof seasonal==='string'?seasonal:null;
 const [plate,nightPlate]=await Promise.all([seasonalFile?image(seasonalFile):null,night&&CAT_BACKGROUNDS.night?image(CAT_BACKGROUNDS.night):null]);
 // Only retain one high-resolution base texture. Small painted seasonal plates are shared.
 for(const key of images.keys())if(/courtyard-\d+\.webp$/.test(key)&&key!==`assets/cats/courtyard-${tier}.webp`)images.delete(key);
 const result=canvas(original.naturalWidth,original.naturalHeight),c=result.getContext('2d',{alpha:false});
 c.drawImage(original,0,0,result.width,result.height);
 if(nightPlate){c.filter='brightness(.58) saturate(.70)';c.drawImage(original,0,0,result.width,result.height);c.filter='none';c.globalAlpha=.94;c.drawImage(nightPlate,0,0,result.width,result.height);c.globalAlpha=1}
 if(plate){
  const layer=canvas(result.width,result.height),lc=layer.getContext('2d');
  if(night)lc.filter='brightness(.48) saturate(.60)';lc.drawImage(plate,0,0,layer.width,layer.height);lc.filter='none';
  lc.globalCompositeOperation='destination-in';lc.drawImage(vegetationMask(layer.width,layer.height),0,0);c.drawImage(layer,0,0);
 }
 drawSeasonGround(c,original,season,night);
 if(night){
  // Soft broad moonlight is a painted-light complement, not a black dimming sheet.
  const moon=c.createRadialGradient(result.width*.54,result.height*.49,result.width*.025,result.width*.54,result.height*.49,result.width*.47);
  moon.addColorStop(0,'rgba(193,216,233,.12)');moon.addColorStop(.55,'rgba(160,190,218,.05)');moon.addColorStop(1,'rgba(139,174,205,0)');c.fillStyle=moon;c.fillRect(0,0,result.width,result.height);
 }
 result.naturalWidth=original.naturalWidth;result.naturalHeight=original.naturalHeight;
 result.plateResolution=plate||nightPlate?CAT_BACKGROUNDS.generatedPlateSize:null;
 return result;
}
