import {windStrength} from './atmosphere.js';
import {landscapeDimensions} from './rendering.js';
const vertex=`attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=(aPosition+1.0)*.5;gl_Position=vec4(aPosition,0.,1.);}`;
const fragment=`precision highp float;
uniform sampler2D uImage;uniform vec2 uCover;uniform vec2 uSize;uniform vec2 uTexel;uniform vec3 uPointer;uniform float uTime;uniform float uWind;uniform float uMotion;uniform float uClarity;varying vec2 vUv;
float oval(vec2 p,vec2 c,vec2 s){return 1.-smoothstep(.55,1.,length((p-c)/s));}
void main(){
 vec2 screen=vec2(vUv.x,1.-vUv.y),uv=(screen-.5)*uCover+.5;
 vec3 original=texture2D(uImage,uv).rgb;
 // Animate only saturated leaf/blade pixels inside local rooted plant patches.
 // No displacement or oscillating lighting is applied to the water, soil or rocks.
 float water=smoothstep(.015,.08,min(original.g,original.b)-original.r);
 float chroma=max(original.r,original.g)-original.b;
 float plantColor=smoothstep(.09,.25,chroma)*(1.-water);
 float rocks=max(oval(uv,vec2(.88,.83),vec2(.19,.22)),max(oval(uv,vec2(.08,.06),vec2(.15,.14)),oval(uv,vec2(.145,.965),vec2(.2,.15))));
 float leftReeds=oval(uv,vec2(.055,.52),vec2(.11,.31))*smoothstep(.006,.085,uv.x);
 leftReeds=max(leftReeds,oval(uv,vec2(.125,.76),vec2(.125,.14))*smoothstep(.03,.18,uv.x));
 float rightReeds=oval(uv,vec2(.97,.49),vec2(.085,.16))*smoothstep(.005,.06,1.-uv.x);
 float upperLeaves=oval(uv,vec2(.92,.055),vec2(.24,.17))*smoothstep(.006,.12,uv.y);
 float lowerLeaves=oval(uv,vec2(.965,.94),vec2(.13,.15))*smoothstep(.005,.10,1.-uv.x);
 float tips=max(max(leftReeds,rightReeds),max(upperLeaves,lowerLeaves));
 float foliage=tips*plantColor*(1.-rocks);
 float gust=sin(uTime*.85+uv.y*19.)*.6+sin(uTime*.39+uv.x*27.)*.4;
 vec2 pointDelta=(screen-uPointer.xy)*uSize;
 float nearHand=(1.-smoothstep(0.,110.,length(pointDelta)))*uPointer.z;
 vec2 bend=vec2(gust*(1.7+uWind*1.5)+nearHand*sign(pointDelta.x)*2.8,sin(uTime*.7+uv.x*18.)*.65);
 vec2 sampleUv=clamp(uv+bend/uSize*uCover*foliage*uMotion,vec2(.0001),vec2(.9999));
 vec3 color=texture2D(uImage,sampleUv).rgb;
 // A restrained edge-contrast correction counters the illustration's soft
 // scaling; it does not invent texture detail. Clamp it to prevent bright halos.
 if(uClarity>0.){
  vec2 dx=vec2(uTexel.x*1.6,0.),dy=vec2(0.,uTexel.y*1.6);
  vec3 neighbors=(texture2D(uImage,sampleUv-dx).rgb+texture2D(uImage,sampleUv+dx).rgb+texture2D(uImage,sampleUv-dy).rgb+texture2D(uImage,sampleUv+dy).rgb)*.25;
  color+=clamp((color-neighbors)*uClarity,vec3(-.018),vec3(.018));
 }
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;
/** Stable illustration with small, rooted, color-masked leaf motion. Water waves are a separate layer. */
export class Landscape{
 constructor(canvas){
  this.canvas=canvas;this.images=new Map();this.textures=new Map();this.waterMasks=new Map();this.dead=false;this.ready=false;
  if(!canvas)return;
  this.lost=e=>{e.preventDefault();this.ready=false;this.lastDraw=null;canvas.style.opacity='0';this.textures.clear()};
  this.restored=()=>{try{this.init();this.season=null}catch{this.ready=false}};
  canvas.addEventListener('webglcontextlost',this.lost);canvas.addEventListener('webglcontextrestored',this.restored);
  try{this.init()}catch{canvas.style.opacity='0'}
 }
 init(){
  const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,powerPreference:'low-power'});if(!gl)return;this.gl=gl;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw Error('Landscape shader unavailable')}return s};
  const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){gl.deleteProgram(p);throw Error('Landscape program unavailable')}
  this.program=p;gl.useProgram(p);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const pos=gl.getAttribLocation(p,'aPosition');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  this.uniforms=Object.fromEntries(['uImage','uCover','uSize','uTexel','uPointer','uTime','uWind','uMotion','uClarity'].map(n=>[n,gl.getUniformLocation(p,n)]));gl.uniform1i(this.uniforms.uImage,0);
  const viewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  this.maxSurfaceSize=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),viewport[0],viewport[1]);
  this.lastDraw=null;this.ready=true;
 }
 resize(width,height,dpr){
  if(!this.canvas)return;this.width=width;this.height=height;
  const [w,h]=landscapeDimensions(width,height,dpr,this.maxSurfaceSize);
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.lastDraw=null}
 }
 getStats(){
  const image=this.images.get(this.season);
  return {backgroundSize:this.ready&&this.gl&&!this.gl.isContextLost()?[this.gl.drawingBufferWidth,this.gl.drawingBufferHeight]:null,
   sourceSize:image?.naturalWidth?[image.naturalWidth,image.naturalHeight]:null};
 }
 texture(season){
  if(this.textures.has(season))return this.textures.get(season);
  const image=this.images.get(season);
  if(image?.complete&&image.naturalWidth){
   const gl=this.gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);this.textures.set(season,texture);return texture;
  }
  if(!image){const img=new Image();this.images.set(season,img);img.onload=()=>{if(!this.dead){this.cacheWaterMask(season,img);this.onLoad?.()}};img.src=`${import.meta.env.BASE_URL}assets/${season==='summer'?'pond':season}.png?v=1.5`}
  return null;
 }
 cacheWaterMask(season,image){
  // A one-time small color mask prevents rain from drawing water rings on dry banks.
  const c=document.createElement('canvas');c.width=384;c.height=216;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,384,216);
  const pixels=ctx.getImageData(0,0,384,216).data,mask=new Uint8Array(384*216);
  for(let i=0;i<mask.length;i++)mask[i]=Math.min(pixels[i*4+1],pixels[i*4+2])-pixels[i*4]>10?1:0;
  this.waterMasks.set(season,mask);c.width=c.height=0;
 }
 waterAt(x,y){
  const mask=this.waterMasks.get(this.season);if(!mask||!this.width)return true;
  const ratio=this.width/this.height,cx=Math.min(1,ratio/(16/9)),cy=Math.min(1,(16/9)/ratio);
  const u=(x/this.width-.5)*cx+.5,v=(y/this.height-.5)*cy+.5;
  if(u<0||u>=1||v<0||v>=1)return false;
  return !!mask[Math.floor(v*216)*384+Math.floor(u*384)];
 }
 render(time,options,hand){
  if(!this.ready||!this.width||this.gl.isContextLost())return;
  const gl=this.gl,season=options.weather==='snowy'?'winter':options.season,texture=this.texture(season);
  if(!texture){this.canvas.style.opacity='0';return}
  this.season=season;this.canvas.style.opacity='1';const u=this.uniforms;
  // Large native backgrounds keep their full pixel grid. Only the tiny plant
  // sway samples at 30 Hz above 4K; fish, rain and water continue at 60 Hz.
  const rate=this.canvas.width*this.canvas.height>3840*2160?30:60;
  const tick=options.reducedMotion?0:Math.floor(time*rate+1e-6);
  const key=`${season}:${options.weather}:${options.reducedMotion}:${options.quality}:${options.desktopMode}`;
  if(this.lastDraw?.tick===tick&&this.lastDraw.key===key)return;
  this.lastDraw={tick,key};
  gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);gl.bindTexture(gl.TEXTURE_2D,texture);
  const ratio=this.width/this.height,aspect=3840/2160;
  gl.uniform2f(u.uCover,ratio<aspect?ratio/aspect:1,ratio>aspect?aspect/ratio:1);
  gl.uniform2f(u.uSize,this.width,this.height);gl.uniform3f(u.uPointer,(hand.x||0)/this.width,(hand.y||0)/this.height,Math.min(1,hand.life||0));
  const image=this.images.get(season);gl.uniform2f(u.uTexel,1/image.naturalWidth,1/image.naturalHeight);
  gl.uniform1f(u.uClarity,options.desktopMode&&options.quality!=='low'?.28:0);
  gl.uniform1f(u.uTime,time);gl.uniform1f(u.uWind,windStrength(options.weather,options.season));gl.uniform1f(u.uMotion,options.reducedMotion?0:1);gl.drawArrays(gl.TRIANGLES,0,6);
 }
 destroy(){
  this.dead=true;if(!this.canvas)return;this.canvas.removeEventListener('webglcontextlost',this.lost);this.canvas.removeEventListener('webglcontextrestored',this.restored);
  for(const image of this.images.values())image.onload=null;
  if(this.gl){for(const t of this.textures.values())this.gl.deleteTexture(t);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program)}this.images.clear();this.textures.clear();this.waterMasks.clear();this.canvas.width=this.canvas.height=0;
 }
}
