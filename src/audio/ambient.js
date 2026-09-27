export const AUDIO_TRACKS=[{id:'stream',file:'healing-stream.wav?v=1.9',loop:true},{id:'rain',file:'rain.wav?v=1.7',loop:true},{id:'wind',file:'wind.wav?v=1.5',loop:false},{id:'thunder',file:'thunder.wav',loop:false}];
export function ambientMix(weather,season,night=false){
 // Wind is the peak of an occasional gust, never a continuous backing layer.
 const seasonal={spring:[.72,.07],summer:[.78,.05],autumn:[.65,.1],winter:[.3,.12]}[season]||[.7,.08];
 let [stream,wind]=seasonal,rain=0;
 if(weather==='cloudy'){stream*=.9;wind+=.025}
 if(weather==='rainy'){stream*=.32;rain=.34;wind*=.65}
 if(weather==='stormy'){stream*=.18;rain=.40;wind=.14}
 if(weather==='snowy'){stream*=.3;wind=Math.min(wind,.09)}
 if(weather==='foggy'){stream*=.85;wind*=.4}
 if(night){wind*=.8;stream*=.9;rain*=.9}
 const total=Math.max(1,stream+wind+rain);return {stream:stream/total,rain:rain/total,wind:wind/total};
}
export function ambientDescription(weather,season){
 if(weather==='stormy')return '柔和雨水，偶尔一阵风与远雷';
 if(weather==='rainy')return '柔和雨水，落在潺潺溪流间';
 if(weather==='snowy')return '远处细细流水，偶尔一阵轻风';
 return {spring:'春水潺潺，偶尔微风拂叶',summer:'清凉流水，偶尔一阵夏风',autumn:'溪水流淌，偶尔秋风拂叶',winter:'细水缓流，偶尔一阵冬风'}[season]||'潺潺溪流，偶尔一阵轻风';
}
// Keep ownership on the media element with a global symbol: module-local maps are replaced by HMR.
const thunderOwner=Symbol.for('fusheng.ambient.thunderOwner');
/** Native audio layers, independent of render FPS; all assets are offline field recordings. */
export class AmbientMixer{
 constructor(media,onStatus=()=>{},random=Math.random){
  this.media=media;this.onStatus=onStatus;this.random=random;this.targets={};this.pending=new Set();this.failed=new Set();this.waiting=new Set();this.thunderTimer=0;this.timer=0;this.dead=false;this.windTimer=0;this.windEndTimer=0;this.windActive=false;
  this.thunderRequest=null;this.thunderAudible=false;
  const thunder=media.thunder;if(thunder){thunder[thunderOwner]=this;this.guardThunder=()=>this.enforceThunder();thunder.addEventListener('play',this.guardThunder);thunder.addEventListener('playing',this.guardThunder)}
  this.retry=()=>{if(this.enabled&&!this.dead){this.waiting.clear();this.playLayers();this.unlockThunder();this.unlockWind()}};
  this.errors=new Map();
  for(const [id,a] of Object.entries(media)){a.volume=0;const fail=()=>{if(this.enabled){this.failed.add(id);this.report()}};a.addEventListener('error',fail);this.errors.set(id,fail)}
 }
 configure({enabled,volume,weather,season,night}){
  if(this.dead)return;
  const oldWeather=this.weather,restartWind=this.enabled!==enabled||this.weather!==weather||this.season!==season;
  this.enabled=enabled;this.volume=Math.max(0,Math.min(.6,volume));this.weather=weather;this.season=season;
  const mix=ambientMix(weather,season,night);this.targets=Object.fromEntries(Object.entries(mix).map(([id,weight])=>[id,enabled?weight*this.volume:0]));
  this.windLevel=this.targets.wind;this.targets.wind=this.windActive?this.windLevel:0;
  if(restartWind||!enabled||this.volume===0)this.stopWind();
  if(!this.canThunder())this.stopThunder();else this.enforceThunder();
  if(!enabled){this.onStatus('off');this.removeRetry();this.waiting.clear();this.failed.clear()}
  else{if(oldWeather!==weather)this.failed.clear();this.playLayers();this.unlockThunder();if(this.volume>0){this.unlockWind();this.scheduleWind(true)}}
  this.fade();
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
   const a=this.media[id];if(target<=0||!a||!a.paused||this.pending.has(id))continue;
   this.pending.add(id);this.failed.delete(id);
   a.play().then(()=>{if(this.dead)return;this.waiting.delete(id);if(!this.enabled||this.targets[id]<=0)a.pause();else this.fade()}).catch(error=>{
    if(this.dead||!this.enabled)return;
    if(error.name==='NotAllowedError')this.waiting.add(id);else if(error.name!=='AbortError')this.failed.add(id);
   }).finally(()=>{this.pending.delete(id);this.report()});
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
  const a=this.media.wind;if(!a||this.windPrimed||this.windPriming||!a.paused||this.windActive)return;
  this.windPriming=true;a.volume=0;
  a.play().then(()=>{if(this.dead)return;this.windPrimed=true;if(!this.windActive){a.pause();a.currentTime=0}}).catch(()=>{}).finally(()=>{this.windPriming=false});
 }
 stopWind(){
  clearTimeout(this.windTimer);clearTimeout(this.windEndTimer);this.windTimer=this.windEndTimer=0;this.windActive=false;this.targets.wind=0;
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
   const a=this.media[id];if(!a)continue;const diff=target-a.volume;
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
  for(const [id,a] of Object.entries(this.media)){a.pause();a.volume=0;a.removeEventListener('error',this.errors.get(id))}
 }
}
