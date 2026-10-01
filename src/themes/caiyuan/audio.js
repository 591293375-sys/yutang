// Local original instrumental/tea recordings plus the project's documented CC0
// soft tap, cloth and wind. No procedural noise in the ritual soundscape.
const base=import.meta.env?.BASE_URL||'/';
const clamp=(v,max=1)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;
export const CAIYUAN_CUES=Object.freeze({
 place:{file:'cats/audio/tap.wav',gain:.8},incense:{file:'cats/audio/tap.wav',gain:.75},
 lamp:{file:'cats/audio/tap.wav',gain:.6},
 sparkle:{file:'cats/audio/feather.wav',gain:.8},complete:{file:'cats/audio/tap.wav',gain:.65},
 tea:{file:'caiyuan/audio/tea.mp3',gain:.52}
});
export class CaiyuanAudio{
 constructor(){
  this.enabled=false;this.unlocked=false;this.dead=false;this.volume=0;this.ambient=true;this.musicEnabled=true;this.effects=true;this.suspended=false;this.musicVolume=.45;this.fade=0;this.duck=1;this.voices=new Set();this.cooldowns=new Map();this.pending=new Map();this.errors=new Set();
  this.wind=this.track('caiyuan/audio/temple-breeze.wav');this.music=this.track('caiyuan/audio/temple-music.m4a');
 }
 track(file){const audio=new Audio(`${base}assets/${file}`);audio.loop=true;audio.preload='none';audio.volume=0;audio.onerror=()=>{if(!this.dead){this.errors.add(audio);this.pending.delete(audio)}};return audio}
 configure(enabled,volume,ambient=true,settings={}){
  if(this.dead)return;this.volume=clamp(volume,.6);this.enabled=!!enabled&&this.volume>0;this.ambient=ambient!==false;this.musicEnabled=settings.music!==false;this.effects=settings.effects!==false;this.musicVolume=settings.musicVolume===undefined?.45:clamp(settings.musicVolume);
  if(!this.enabled){this.stop();return}this.suspended=false;
  if(!this.effects)this.stopVoices();for(const voice of this.voices)voice.volume=this.volume*voice.cueGain;
  this.sync();this.update(0);
 }
 allowed(a){return!this.dead&&!this.suspended&&this.enabled&&this.unlocked&&!this.errors.has(a)&&(a===this.wind?this.ambient:this.musicEnabled&&this.musicVolume>0)}
 start(a){
  if(!a.paused||this.pending.has(a)||!this.allowed(a))return;
  const token={};this.pending.set(a,token);
  a.play().then(()=>{if(this.pending.get(a)===token)this.pending.delete(a);if(!this.allowed(a))a.pause()}).catch(error=>{if(this.pending.get(a)===token)this.pending.delete(a);if(error?.name!=='AbortError'&&error?.name!=='NotAllowedError'&&!this.dead)this.errors.add(a)});
 }
 sync(){for(const a of [this.wind,this.music]){if(this.allowed(a))this.start(a);else{a.pause();a.volume=0;this.pending.delete(a)}}}
 unlock(){if(this.dead)return;this.unlocked=true;this.sync()}
 update(dt){
  if(this.dead||this.suspended||!this.enabled||!this.unlocked)return;
  this.fade=Math.min(1,this.fade+Math.max(0,Math.min(.1,dt))/1.8);
  this.duck+=((this.voices.size ? .4 : 1)-this.duck)*Math.min(1,Math.max(0,dt)*4);
  this.wind.volume=this.allowed(this.wind)?this.volume*.055*this.fade:0;
  const t=this.music.currentTime||0,d=this.music.duration,edge=Number.isFinite(d)?Math.min(1,Math.max(0,t/2.5),Math.max(0,(d-t)/3)):0;
  this.music.volume=this.allowed(this.music)?this.volume*this.musicVolume*.85*this.fade*edge*this.duck:0;
 }
 cue(kind,{preview=false}={}){
  const cue=CAIYUAN_CUES[kind],now=Date.now();if(this.dead||this.suspended||!this.enabled||!this.unlocked||!this.effects||!cue)return false;
  if(!preview&&now-(this.cooldowns.get(kind)??-Infinity)<(kind==='tea'?1800:550)||this.voices.size>=3)return false;
  this.cooldowns.set(kind,now);const a=new Audio(`${base}assets/${cue.file}`);a.cueGain=cue.gain;a.volume=this.volume*cue.gain;this.voices.add(a);
  const finish=()=>{this.voices.delete(a);a.onended=a.onerror=null};a.onended=finish;a.onerror=finish;
  a.play().then(()=>{if(this.dead||!this.enabled||!this.effects||!this.voices.has(a)){a.pause();finish()}}).catch(finish);return true;
 }
 stopVoices(){for(const a of this.voices){a.pause();a.removeAttribute('src');a.onended=a.onerror=null}this.voices.clear()}
 stop(){this.suspended=true;this.fade=0;this.duck=1;this.wind.pause();this.music.pause();this.wind.volume=this.music.volume=0;this.pending.clear();this.stopVoices()}
 get status(){if(this.dead||!this.enabled)return'off';if(!this.unlocked)return'waiting';if((this.musicEnabled&&this.errors.has(this.music))||(this.ambient&&this.errors.has(this.wind)))return'error';return!this.music.paused||!this.wind.paused?'playing':'ready'}
 destroy(){this.dead=true;this.stop();for(const a of [this.wind,this.music]){a.onerror=null;a.removeAttribute('src');a.load()}this.errors.clear()}
}
