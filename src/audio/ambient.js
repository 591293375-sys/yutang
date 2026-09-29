export const AUDIO_TRACKS=[{id:'stream',file:'healing-stream.wav?v=1.9',loop:true},{id:'ocean',file:'ocean-waves.wav?v=1.12',loop:true},{id:'rain',file:'rain.wav?v=1.7',loop:true},{id:'wind',file:'wind.wav?v=1.5',loop:false},{id:'thunder',file:'thunder.wav',loop:false}];
export function ambientMix(weather,season,night=false,theme='koi'){
 // Wind is the peak of an occasional gust, never a continuous backing layer.
 const seasonal={spring:[.72,.07],summer:[.78,.05],autumn:[.65,.1],winter:[.3,.12]}[season]||[.7,.08];
 let [stream,wind]=seasonal,rain=0;
 if(weather==='cloudy'){stream*=.9;wind+=.025}
 if(weather==='rainy'){stream*=.32;rain=.34;wind*=.65}
 if(weather==='stormy'){stream*=.18;rain=.40;wind=.14}
 if(weather==='snowy'){stream*=.3;wind=Math.min(wind,.09)}
 if(weather==='foggy'){stream*=.85;wind*=.4}
 if(night){wind*=.8;stream*=.9;rain*=.9}
 let ocean=0;
 if(theme==='coast'){
  // The coast has its own quiet field recording; inactive water always has an explicit zero target.
  ocean=({rainy:.30,stormy:.28,snowy:.24,foggy:.32}[weather]??.4)*(night?.9:1);stream=0;wind=Math.min(wind,.07);
 }
 const total=Math.max(1,stream+ocean+wind+rain);return {stream:stream/total,ocean:ocean/total,rain:rain/total,wind:wind/total};
}
export function ambientDescription(weather,season,theme='koi'){
 if(theme==='coast'){
  if(weather==='stormy')return '轻缓海浪，伴着柔和雨水与偶尔远雷';
  if(weather==='rainy')return '轻缓海浪，细雨落在海面';
  return '轻缓海浪，偶尔一阵海风';
 }
 if(weather==='stormy')return '柔和雨水，偶尔一阵风与远雷';
 if(weather==='rainy')return '柔和雨水，落在潺潺溪流间';
 if(weather==='snowy')return '远处细细流水，偶尔一阵轻风';
 return {spring:'春水潺潺，偶尔微风拂叶',summer:'清凉流水，偶尔一阵夏风',autumn:'溪水流淌，偶尔秋风拂叶',winter:'细水缓流，偶尔一阵冬风'}[season]||'潺潺溪流，偶尔一阵轻风';
}
// Keep ownership on the media element with a global symbol: module-local maps are replaced by HMR.
const thunderOwner=Symbol.for('fusheng.ambient.thunderOwner');
const mediaOwner=Symbol.for('fusheng.ambient.mediaOwner');
/** Native audio layers, independent of render FPS; all assets are offline field recordings. */
export class AmbientMixer{
 constructor(media,onStatus=()=>{},random=Math.random){
  this.media=media;this.onStatus=onStatus;this.random=random;this.targets={};this.pending=new Map();this.failed=new Set();this.waiting=new Set();this.thunderTimer=0;this.timer=0;this.dead=false;this.windTimer=0;this.windEndTimer=0;this.windActive=false;this.generation=0;this.windRequest=null;
  this.thunderRequest=null;this.thunderAudible=false;
  const thunder=media.thunder;if(thunder){thunder[thunderOwner]=this;this.guardThunder=()=>this.enforceThunder();thunder.addEventListener('play',this.guardThunder);thunder.addEventListener('playing',this.guardThunder)}
  this.retry=()=>{if(this.enabled&&!this.dead){this.waiting.clear();this.playLayers();this.unlockThunder();this.unlockWind()}};
  this.errors=new Map();this.guards=new Map();
  for(const [id,a] of Object.entries(media)){
   a[mediaOwner]=this;a.volume=0;
   const fail=()=>{if(this.enabled&&!this.dead&&this.owns(id)){this.failed.add(id);this.report()}};a.addEventListener('error',fail);this.errors.set(id,fail);
   if(id!=='thunder'){const guard=()=>this.enforceLayer(id);a.addEventListener('play',guard);a.addEventListener('playing',guard);this.guards.set(id,guard)}
  }
 }
 configure({enabled,volume,weather,season,night,theme='koi'}){
  if(this.dead)return;
  const oldWeather=this.weather,oldTheme=this.theme,restartWind=this.enabled!==enabled||this.weather!==weather||this.season!==season||this.theme!==theme;
  if(restartWind)this.generation++;
  this.enabled=enabled;this.volume=Math.max(0,Math.min(.6,volume));this.weather=weather;this.season=season;this.theme=theme;
  const mix=ambientMix(weather,season,night,theme);this.targets=Object.fromEntries(Object.entries(mix).map(([id,weight])=>[id,enabled?weight*this.volume:0]));
  this.windLevel=this.targets.wind;this.targets.wind=this.windActive?this.windLevel:0;
  if(restartWind||!enabled||this.volume===0)this.stopWind();
  if(!this.canThunder()||oldTheme!==theme||oldWeather!==weather)this.stopThunder();else this.enforceThunder();
  if(!enabled){this.onStatus('off');this.removeRetry();this.waiting.clear();this.failed.clear()}
  else{if(oldWeather!==weather||oldTheme!==theme)this.failed.clear();this.playLayers();this.unlockThunder();if(this.volume>0){this.unlockWind();this.scheduleWind(true)}}
  this.fade();
 }
 owns(id){return this.media[id]?.[mediaOwner]===this}
 silenceLayer(id){const a=this.media[id];if(!a||!this.owns(id))return;a.volume=0;a.pause()}
 enforceLayer(id){
  if(!this.owns(id))return;
  const windPrime=id==='wind'&&this.windRequest?.generation===this.generation&&this.enabled&&this.volume>0&&!this.dead;
  if(windPrime&&!this.windActive)this.media.wind.volume=0;
  else if(this.dead||!this.enabled||!this.targets[id]||(id==='wind'&&!this.windActive))this.silenceLayer(id);
 }
 removeRetry(){window.removeEventListener('pointerdown',this.retry);window.removeEventListener('keydown',this.retry)}
 report(){
  if(!this.enabled||this.dead)return;
  const needed=Object.keys(this.targets).filter(id=>this.targets[id]>0);
  const blocked=needed.some(id=>this.waiting.has(id));
  this.onStatus(needed.some(id=>this.failed.has(id))?'error':blocked?'waiting':needed.some(id=>this.pending.has(id))?'loading':'playing');
  if(blocked){window.addEventListener('pointerdown',this.retry);window.addEventListener('keydown',this.retry)}else this.removeRetry();
 }
 playLayers(){
  for(const [id,target] of Object.entries(this.targets)){
   const a=this.media[id];if(target<=0||!a||!this.owns(id)||!a.paused||this.pending.has(id))continue;
   const request={generation:this.generation};this.pending.set(id,request);this.failed.delete(id);
   a.play().then(()=>{if(!this.owns(id))return;this.waiting.delete(id);if(this.dead||!this.enabled||this.targets[id]<=0||request.generation!==this.generation)this.silenceLayer(id);else this.fade()}).catch(error=>{
    if(this.dead||!this.enabled||!this.owns(id)||request.generation!==this.generation||this.targets[id]<=0)return;
    if(error.name==='NotAllowedError')this.waiting.add(id);else if(error.name!=='AbortError')this.failed.add(id);
   }).finally(()=>{if(this.pending.get(id)===request)this.pending.delete(id);if(!this.dead&&this.owns(id)&&request.generation!==this.generation)this.playLayers();this.report()});
  }
  this.report();
 }
 canThunder(){return !this.dead&&this.enabled&&this.weather==='stormy'&&this.volume>0}
 ownsThunder(){return this.media.thunder&&this.media.thunder[thunderOwner]===this}
 silenceThunder(){
  const a=this.media.thunder;if(!a||!this.ownsThunder())return;
  a.volume=0;a.pause();a.currentTime=0;
 }
 stopThunder(){
  clearTimeout(this.thunderTimer);this.thunderTimer=0;this.thunderRequest=null;this.thunderAudible=false;this.silenceThunder();
 }
 enforceThunder(){
  if(!this.ownsThunder())return;
  // Check at the actual media start as well as scheduling: play() may settle after weather changes.
  if(!this.canThunder()||(!this.thunderAudible&&this.thunderRequest?.kind!=='prime'))this.silenceThunder();
  else this.media.thunder.volume=this.thunderAudible?this.volume*.62:0;
 }
 unlockThunder(){
  // Only prime during a storm. Sunny/rainy weather must never start the thunder asset, even muted.
  const a=this.media.thunder;if(!a||!this.canThunder()||this.primed||this.thunderRequest||this.thunderTimer||!a.paused)return;
  const request={kind:'prime'};this.thunderRequest=request;a.volume=0;
  a.play().then(()=>{
   if(!this.ownsThunder())return;
   if(this.thunderRequest===request){this.primed=true;this.thunderRequest=null;this.silenceThunder()}else this.enforceThunder();
  }).catch(()=>{}).finally(()=>{if(this.thunderRequest===request)this.thunderRequest=null;this.enforceThunder()});
 }
 unlockWind(){
  const a=this.media.wind;if(!a||!this.owns('wind')||!this.enabled||this.volume<=0||this.dead||this.windPrimed||this.windRequest||!a.paused||this.windActive)return;
  const request={generation:this.generation};this.windRequest=request;a.volume=0;
  a.play().then(()=>{if(!this.owns('wind'))return;if(!this.dead&&this.enabled&&request.generation===this.generation)this.windPrimed=true;if(!this.windActive){this.silenceLayer('wind');a.currentTime=0}}).catch(()=>{}).finally(()=>{if(this.windRequest===request)this.windRequest=null;this.enforceLayer('wind')});
 }
 stopWind(){
  clearTimeout(this.windTimer);clearTimeout(this.windEndTimer);this.windTimer=this.windEndTimer=0;this.windActive=false;this.targets.wind=0;this.windRequest=null;
  this.fade();
 }
 scheduleWind(first=false){
  if(this.windTimer||this.windActive||!this.enabled||this.volume<=0||this.dead)return;
  // First gust after 60–120 seconds; later gusts separated by 90–180 seconds of quiet.
  this.windTimer=setTimeout(()=>{
   this.windTimer=0;if(!this.enabled||this.volume<=0||this.dead)return;
   const a=this.media.wind;if(!a)return;
   this.windActive=true;a.currentTime=this.random()*Math.max(0,(Number.isFinite(a.duration)?a.duration:45)-10);
   this.targets.wind=this.windLevel;this.playLayers();this.fade();
   this.windEndTimer=setTimeout(()=>{this.windEndTimer=0;this.windActive=false;this.targets.wind=0;this.fade();this.scheduleWind()},4500+this.random()*2500);
  },(first?60000:90000)+this.random()*(first?60000:90000));
 }
 fade(){
  if(this.timer||this.dead)return;
  const step=()=>{let moving=false;for(const [id,target] of Object.entries(this.targets)){
   const a=this.media[id];if(!a||!this.owns(id))continue;const diff=target-a.volume;
   if(Math.abs(diff)>.0005){a.volume=Math.max(0,Math.min(.6,a.volume+diff*.14));moving=true}else{a.volume=target;if(target===0&&!a.paused)a.pause()}
  }if(!moving){clearInterval(this.timer);this.timer=0}};
  this.timer=setInterval(step,40);step();
 }
 thunder({delay=1200}={}){
  if(!this.canThunder())return;
  clearTimeout(this.thunderTimer);
  this.thunderTimer=setTimeout(()=>{
   this.thunderTimer=0;if(!this.canThunder())return;
   const a=this.media.thunder;if(!a||!this.ownsThunder())return;
   const request={kind:'rumble'};this.thunderRequest=request;this.thunderAudible=true;a.currentTime=0;a.volume=this.volume*.62;
   a.play().then(()=>this.enforceThunder()).catch(error=>{
    if(this.thunderRequest!==request||!this.canThunder()||!this.ownsThunder())return;
    this.thunderAudible=false;
    if(error.name==='NotAllowedError'){this.primed=false;window.addEventListener('pointerdown',this.retry)}
   }).finally(()=>{if(this.thunderRequest===request)this.thunderRequest=null;this.enforceThunder()});
  },Math.max(0,Math.min(3000,delay)));
 }
 destroy(){
  if(this.dead)return;
  this.dead=true;this.stopThunder();
  const thunder=this.media.thunder;if(thunder){thunder.removeEventListener('play',this.guardThunder);thunder.removeEventListener('playing',this.guardThunder)}
  clearTimeout(this.thunderTimer);clearTimeout(this.windTimer);clearTimeout(this.windEndTimer);clearInterval(this.timer);this.removeRetry();
  for(const [id,a] of Object.entries(this.media)){this.silenceLayer(id);a.removeEventListener('error',this.errors.get(id));const guard=this.guards.get(id);if(guard){a.removeEventListener('play',guard);a.removeEventListener('playing',guard)}}
 }
}
