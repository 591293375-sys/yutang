const base=import.meta.env?.BASE_URL||'/';
const clamp=(v,max=1)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;
export const CAT_MUSIC_FILE='assets/cats/audio/courtyard-music.m4a';

// A streamed, local instrumental. The scene owns its clock and lifetime; no
// additional animation loop, interval, remote request or decoded PCM cache.
export class CatMusic {
 constructor(makeAudio=src=>typeof Audio==='function'?new Audio(src):null){
  this.track=makeAudio(`${base}${CAT_MUSIC_FILE}`);this.enabled=false;this.unlocked=false;this.suspended=true;this.dead=false;this.failed=false;this.blocked=false;this.pending=null;this.fade=0;this.duck=1;this.volume=0;this.level=.35;
  if(this.track){this.track.loop=true;this.track.preload='none';this.track.volume=0;this.track.onerror=()=>{this.failed=true;this.stop()}}
 }
 allowed(){return !!this.track&&!this.dead&&!this.failed&&!this.suspended&&this.enabled&&this.unlocked&&this.volume>0&&this.level>0}
 configure(enabled,volume,settings={}){
  if(this.dead)return;
  this.enabled=!!enabled&&settings.music!==false;this.volume=clamp(volume,.6);this.level=settings.musicVolume===undefined?.35:clamp(settings.musicVolume);
  if(!this.enabled||!this.volume||!this.level){this.stop();return}
  this.suspended=false;this.start();this.update(0);
 }
 unlock(){if(this.dead)return;this.unlocked=true;this.blocked=false;this.start()}
 start(){
  if(!this.allowed()||this.blocked||this.pending||!this.track.paused)return;
  const token={};this.pending=token;
  Promise.resolve(this.track.play()).then(()=>{
   if(this.pending===token)this.pending=null;
   if(!this.allowed())this.track.pause();
  }).catch(error=>{
   if(this.pending!==token||this.dead)return;this.pending=null;
   if(error?.name==='NotAllowedError')this.blocked=true;
   else if(error?.name!=='AbortError')this.failed=true;
  });
 }
 update(dt,hasCatVoice=false){
  if(!this.allowed())return;
  const elapsed=clamp(dt,.1);this.fade=Math.min(1,this.fade+elapsed/2.5);
  this.duck+=((hasCatVoice?.55:1)-this.duck)*Math.min(1,elapsed*3);
  const t=this.track.currentTime||0,d=this.track.duration;
  const edge=Number.isFinite(d)?Math.min(1,Math.max(0,t/2),Math.max(0,(d-t)/4)):0;
  this.track.volume=this.volume*this.level*.72*this.fade*edge*this.duck;
 }
 stop(){this.suspended=true;this.pending=null;this.fade=0;this.duck=1;if(this.track){this.track.volume=0;this.track.pause()}}
 destroy(){if(this.dead)return;this.dead=true;this.stop();if(this.track){this.track.onerror=null;this.track.removeAttribute('src');this.track.load()}}
 get status(){return this.failed?'error':!this.enabled||this.suspended?'off':this.blocked||!this.unlocked?'waiting':this.track&&!this.track.paused?'playing':'ready'}
}
