// Seasonal material follows the original paving/moss coordinates. This layer
// is baked only when a background is loaded; it never replaces paving geometry.
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const seed=(i,s)=>{const n=Math.sin(i*127.1+s*311.7)*43758.5453;return n-Math.floor(n)};
export const CAT_GROUND_POLYGON=Object.freeze([[.47,.22],[.80,.26],[.886,.38],[.893,.62],[.846,.82],[.77,1],[.225,1],[.262,.76],[.257,.55],[.275,.41],[.345,.31]]);
export const CAT_FIXED_FACILITIES=Object.freeze([[.739,.088,.091,.10],[.594,.219,.084,.077],[.269,.853,.058,.098],[.954,.440,.060,.213],[.865,.18,.038,.047]]);
export function isSeasonGroundPoint(x,y){
 let inside=false;for(let i=0,j=CAT_GROUND_POLYGON.length-1;i<CAT_GROUND_POLYGON.length;j=i++){
  const a=CAT_GROUND_POLYGON[i],b=CAT_GROUND_POLYGON[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside&&!CAT_FIXED_FACILITIES.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<1);
}
export function groundPigment(r,g,b,season,night=false){
 if(season==='summer')return [r,g,b,0];
 const moss=clamp((g-b-25)/55)*clamp((g-r+55)/65),light=(r+g+b)/765,shade=.63+light*.48;
 let rgb,alpha;
 if(season==='spring'){
  const fresh=[132*shade,188*shade,83*shade],stone=[r*.96+16,g*.96+5,b*.98+16];rgb=stone.map((v,i)=>v*(1-moss)+fresh[i]*moss);alpha=.25+moss*.42;
 }
 else if(season==='autumn'){
  const dry=[184*shade,133*shade,53*shade],stone=[r*.98+14,g*.94+6,b*.78+13];rgb=stone.map((v,i)=>v*(1-moss)+dry[i]*moss);alpha=.36+moss*.40;
 }
 else if(season==='winter'){
  // Frost grows on the existing irregular moss clumps, not an invented seam.
  // Their own luminosity stays in the snow, preserving the painted texture.
  const snow=[220+light*30,231+light*23,235+light*20],stone=[r*.66+63,g*.70+69,b*.85+61];
  rgb=stone.map((v,i)=>v*(1-moss)+snow[i]*moss);alpha=.67+moss*.27;
 }else return [r,g,b,0];
 if(night)rgb=rgb.map((v,i)=>v*([.48,.53,.59][i]));
 return [...rgb.map(v=>Math.round(clamp(v,0,255))),Math.round(alpha*255)];
}
export function groundDecorations(season){
 const count=season==='spring'?44:season==='autumn'?34:0,result=[];
 for(let i=1;result.length<count&&i<500;i++){
  const x=.28+seed(i,17)*.57,y=.305+seed(i,31)*.64;if(!isSeasonGroundPoint(x,y))continue;
  result.push({x,y,rotation:seed(i,7)*TAU,size:(season==='spring'?.0040:.0056)*(1+seed(i,11)*.65),variant:i%3,alpha:.78+seed(i,9)*.18});
 }
 return result;
}
/** Colour masks, never replacement image pixels: multiply and screen retain
 * the native paving's edges/grain even when the mask is sampled more cheaply. */
export function groundBlend(r,g,b,season,night=false){
 const source=[r,g,b],pigment=groundPigment(r,g,b,season),a=pigment[3]/255;
 const multiply=[],screen=[];
 for(let k=0;k<3;k++){
  const from=source[k],to=from+(pigment[k]-from)*a;
  multiply[k]=Math.round(to<from?255*to/Math.max(1,from):255);
  // Moonlit frost reflects some light; it must not recreate a noon-lit floor.
  screen[k]=Math.round(to>from?255*(to-from)/Math.max(1,255-from)*(night?.18:1):0);
 }
 return {multiply,screen};
}
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function petal(c,s){c.beginPath();c.moveTo(0,s);c.bezierCurveTo(-s*.95,s*.05,-s*.60,-s*.80,0,-s*.48);c.bezierCurveTo(s*.72,-s*.92,s*.85,s*.18,0,s);c.fill()}
function leaf(c,s){c.beginPath();c.moveTo(0,-s);for(const [x,y]of[[.21,-.4],[.71,-.61],[.55,-.13],[.95,.14],[.40,.31],[.31,.83],[0,.56],[-.32,.82],[-.42,.31],[-.94,.13],[-.52,-.15],[-.7,-.61],[-.2,-.38]])c.lineTo(x*s,y*s);c.closePath();c.fill()}
/** Bake at native output size. Two colour masks are sampled at 1920px, but
 * their multiply/screen operations act on the original 4K/6K stone pixels. */
export function drawSeasonGround(context,original,season,night=false){
 if(season==='summer')return;
 const width=context.canvas.width,height=context.canvas.height,sw=Math.min(1920,original.naturalWidth||original.width),sh=Math.round(sw*height/width),sample=surface(sw,sh),sc=sample.getContext('2d',{willReadFrequently:true});
 sc.drawImage(original,0,0,sw,sh);const paint=sc.getImageData(0,0,sw,sh);
 const mask=surface(sw,sh),m=mask.getContext('2d',{willReadFrequently:true});m.fillStyle='#fff';m.filter=`blur(${sw*.005}px)`;m.beginPath();CAT_GROUND_POLYGON.forEach(([x,y],i)=>i?m.lineTo(x*sw,y*sh):m.moveTo(x*sw,y*sh));m.closePath();m.fill();m.filter='none';m.globalCompositeOperation='destination-out';
 for(const[x,y,rx,ry]of CAT_FIXED_FACILITIES){m.beginPath();m.ellipse(x*sw,y*sh,rx*sw,ry*sh,0,0,TAU);m.fill()}
 const coverage=m.getImageData(0,0,sw,sh).data,light=surface(sw,sh),lc=light.getContext('2d'),highlight=lc.createImageData(sw,sh);
 for(let i=0;i<paint.data.length;i+=4){
  if(!coverage[i+3]){paint.data[i+3]=0;continue}
  const blend=groundBlend(paint.data[i],paint.data[i+1],paint.data[i+2],season,night);
  for(let k=0;k<3;k++){paint.data[i+k]=blend.multiply[k];highlight.data[i+k]=blend.screen[k]}
  paint.data[i+3]=coverage[i+3];highlight.data[i+3]=coverage[i+3];
 }
 sc.putImageData(paint,0,0);lc.putImageData(highlight,0,0);
 context.save();context.globalCompositeOperation='multiply';context.drawImage(sample,0,0,width,height);context.globalCompositeOperation='screen';context.drawImage(light,0,0,width,height);context.restore();
 // Permanent fallen petals/leaves are on the paving, below cats and props.
 // They remain when airborne particles are disabled and scale with scene UVs.
 for(const p of groundDecorations(season)){
  const x=p.x*width,y=p.y*height,size=p.size*width;context.save();context.translate(x,y);context.rotate(p.rotation);context.scale(1,.70);context.globalAlpha=p.alpha;
  context.save();context.translate(size*.16,size*.23);context.fillStyle=night?'#20332b30':'#68705228';(season==='spring'?petal:leaf)(context,size);context.restore();
  context.fillStyle=season==='spring'?(night?['#a393b0','#b9a3b7','#c4b5c6']:['#f4c4d2','#eeb5c7','#fff0e9'])[p.variant]:(night?['#876b41','#95644c','#a48549']:['#d6a348','#c37e43','#e6bc64'])[p.variant];(season==='spring'?petal:leaf)(context,size);
  if(season==='spring'&&p.variant===0){context.translate(size*1.6,-size*.3);context.rotate(1.1);petal(context,size*.7)}
  if(season==='autumn'){context.strokeStyle=night?'#4b403a70':'#996c4160';context.lineWidth=Math.max(.5,width/2500);context.beginPath();context.moveTo(0,size*.65);context.lineTo(0,-size*.66);context.stroke()}
  context.restore();
 }
}
