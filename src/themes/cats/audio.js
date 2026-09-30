import {CAT_WIND_FILE,catWindGain,prepareCatWindSample,synthesizeCatWind} from './wind-audio.js';
// Short locally bundled CC0 recordings; quiet procedural fallback if a file is unavailable.
// One quiet breeze bed, plus one voice and one replaceable interaction request; no per-cat timers.
export const CAT_CUES=Object.freeze({
 purr:{duration:1.65,gap:3200,peak:.45},meow:{duration:.60,gap:6000,peak:.36},
 food:{duration:.66,gap:1800,peak:.30},tap:{duration:.16,gap:900,peak:.22},
 step:{duration:.12,gap:1300,peak:.10},scratch:{duration:.82,gap:2400,peak:.25},
 yarn:{duration:.52,gap:1700,peak:.24},mouse:{duration:.48,gap:2000,peak:.20},
 feather:{duration:.64,gap:2000,peak:.17},bird:{duration:2.245375,gap:35000,peak:.06},
 cricket:{duration:.86,gap:60000,peak:.032},
});
export const CAT_SAMPLE_FILES=Object.freeze(Object.fromEntries(
 ['meow','purr','food','tap','step','scratch','yarn','mouse','feather','bird'].map(id=>[id,`assets/cats/audio/${id}.wav`])
));

/** The bundled bank is small mono 16-bit PCM WAV. Decode identically in browser and Electron. */
export function decodeCatSample(bytes,maxSeconds=3){
 const view=new DataView(bytes),text=(at,n)=>String.fromCharCode(...new Uint8Array(bytes,at,n));
 if(view.byteLength<44||text(0,4)!=='RIFF'||text(8,4)!=='WAVE')throw new Error('Invalid courtyard sample');
 let rate=0,dataAt=0,length=0;
 for(let at=12;at+8<=view.byteLength;){
  const type=text(at,4),size=view.getUint32(at+4,true),start=at+8;
  if(start+size>view.byteLength)throw new Error('Truncated courtyard sample');
  if(type==='fmt '){
   if(size<16||view.getUint16(start,true)!==1||view.getUint16(start+2,true)!==1||view.getUint16(start+14,true)!==16)throw new Error('Unsupported courtyard sample');
   rate=view.getUint32(start+4,true);
  }
  if(type==='data'){dataAt=start;length=size/2}
  at=start+size+(size%2);
 }
 if(!dataAt||!Number.isInteger(length)||!length||rate<8000||rate>96000||length>rate*maxSeconds)throw new Error('Invalid courtyard sample length');
 const data=new Float32Array(length);for(let i=0;i<length;i++)data[i]=view.getInt16(dataAt+i*2,true)/32768;
 return {data,sampleRate:rate};
}
async function loadCatSample(id,{signal}={}){
 const file=id==='wind'?CAT_WIND_FILE:CAT_SAMPLE_FILES[id];if(!file)return null;
 const response=await fetch(`${import.meta.env?.BASE_URL||'/'}${file}`,{signal});
 if(!response.ok)throw new Error('Courtyard sample unavailable');
 return decodeCatSample(await response.arrayBuffer(),id==='wind'?30:3);
}
const TAU=Math.PI*2;
const smooth=x=>{const v=Math.max(0,Math.min(1,x));return v*v*(3-2*v)};
const fade=(t,d,a=.04,r=.09)=>smooth(t/a)*smooth((d-t)/r);
const ambientKind=id=>id==='bird'||id==='cricket';
export function catOutputGain(volume){return Number.isFinite(volume)?Math.pow(Math.max(0,Math.min(.6,volume))/.6,.65)*.72:0}
export function catAmbientDelay(env,first=false,random=.5){
 const night=env?.night||env?.time==='night',r=Math.max(0,Math.min(1,random));
 if(env?.season==='winter')return night?Infinity:first?40+r*25:90+r*70;
 return first?(night?40+r*25:12+r*10):night?85+r*65:35+r*45;
}
export function catMeowDelay(random=.5){return 70+80*Math.max(0,Math.min(1,random))}

/** Bounded deterministic PCM, including short friction/impact textures. */
export function synthesizeCatCue(kind='tap',sampleRate=48000){
 const id=Object.hasOwn(CAT_CUES,kind)?kind:'tap',spec=CAT_CUES[id];
 const rate=Number.isFinite(sampleRate)?Math.max(8000,Math.min(96000,Math.round(sampleRate))):48000;
 const data=new Float32Array(Math.ceil(spec.duration*rate));let phase=0,peak=0;
 for(let i=0;i<data.length;i++){
  const t=i/rate;let value=0;
  if(id==='purr'){
   phase+=TAU*(91+3*Math.sin(TAU*.61*t))/rate;
   const breath=.57+.43*Math.sin(Math.PI*t/spec.duration)**2;
   const flutter=.24+.76*((1+Math.cos(TAU*(24*t+.055*Math.sin(TAU*.7*t))))/2)**2;
   value=(Math.sin(phase)+.47*Math.sin(2*phase+.25)+.21*Math.sin(3*phase-.4))*breath*flutter*fade(t,spec.duration,.14,.24);
  }else if(id==='meow'){
   const u=t/spec.duration,f0=330+190*smooth(u/.3)-210*smooth((u-.3)/.7);
   phase+=TAU*f0/rate;
   const mouth=Math.sin(Math.PI*u),formant=750+560*mouth;
   for(let h=1;h<=7;h++){
    const f=h*f0;if(f>rate*.43)continue;
    const resonant=.16+.62*Math.exp(-(((f-formant)/650)**2))+.20*Math.exp(-(((f-2050)/750)**2));
    value+=Math.sin(h*phase+.035*h)*resonant/h**1.35;
   }
   value*=fade(t,spec.duration,.065,.18)*(.7+.3*mouth);
  }else if(id==='bird'){
   // Two rounded, different chirps with silence between, not a repeating alarm.
   for(const [start,duration,f0,sweep] of [[.05,.24,1880,670],[.60,.34,2370,-490]]){
    const age=t-start;if(age<0||age>duration)continue;
    const u=age/duration;value+=Math.sin(TAU*(f0*age+sweep*duration/Math.PI*(1-Math.cos(Math.PI*u))))*Math.sin(Math.PI*u)**2;
   }
  }else if(id==='cricket'){
   for(const start of [.08,.22,.39]){const age=t-start;if(age<0||age>.09)continue;value+=Math.sin(TAU*2780*age)*Math.sin(Math.PI*age/.09)**2}
  }else if(id==='scratch'||id==='feather'){
   const starts=id==='scratch'?[.02,.26,.5]:[.03,.32],span=id==='scratch'?.20:.24;
   for(const start of starts){const age=t-start;if(age<0||age>span)continue;
    // Many soft inharmonic resonances give a small textured touch, with no hiss loop.
    let texture=0;for(let h=1;h<=9;h++){const freq=(id==='scratch'?180:340)*h**1.13;if(freq<rate*.42)texture+=Math.sin(TAU*freq*age+.7*Math.sin(TAU*(17+h*3.1)*age))/h**1.2}
    value+=texture*Math.sin(Math.PI*age/span)**2*(.6+.4*Math.sin(TAU*(id==='scratch'?42:13)*age)**2);
   }
  }else if(id==='mouse'){
   const age=t-.07;if(age>0&&age<.31){phase=TAU*(920*age-560*age*age);value=(Math.sin(phase)+.18*Math.sin(phase*2))*fade(age,.31,.05,.13)}
  }else{
   const touches=id==='food'?[.02,.17,.39]:id==='yarn'?[.015,.19,.34]:[0],frequency=id==='food'?360:id==='step'?135:id==='yarn'?185:235;
   for(let j=0;j<touches.length;j++){
    const age=t-touches[j];if(age<0)continue;
    const strike=Math.sin(TAU*frequency*age)+.22*Math.sin(TAU*frequency*1.49*age);
    value+=strike*smooth(age/.008)*Math.exp(-age*(id==='step'?47:id==='yarn'?34:31))*(j?Math.pow(.65,j):1);
   }
   value*=fade(t,spec.duration,.008,.06);
  }
  data[i]=value;peak=Math.max(peak,Math.abs(value));
 }
 if(peak)for(let i=0;i<data.length;i++)data[i]*=spec.peak/peak;
 data[0]=data[data.length-1]=0;return data;
}

export class CatAudio {
 constructor(onStatus=()=>{},random=Math.random,loadSample=loadCatSample){
  this.onStatus=onStatus;this.random=random;this.loadSample=loadSample;this.sampleAbort=null;this.status='off';this.context=null;this.nodes=new Set();this.buffers=new Map();this.last={};this.lastAny=-Infinity;
  this.enabled=false;this.volume=0;this.dead=false;this.pending=0;this.starting=false;this.unlocking=null;this.queued=null;this.queueTimer=0;
  this.ambientClock=0;this.ambientKey=null;this.nextAmbient=Infinity;this.nextMeow=Infinity;this.lastAccentAt=-Infinity;this.lastInteractionAt=-Infinity;
  this.wind=null;this.windStarting=false;this.windAbort=null;this.windBuffer=null;this.windClock=0;this.windModulationClock=0;this.windTails=new Set();this.environment={};this.cueSerial=0;this.startingAmbient=false;this.startingKind=null;
 }
 report(status){if(this.status!==status){this.status=status;this.onStatus(status)}}
 restingStatus(){return !this.enabled||!this.volume||this.dead?'off':!this.context||this.context.state==='suspended'?'waiting':this.wind?'playing':'ready'}
 configure(enabled,volume){
  if(this.dead)return;
  const wasAudible=this.enabled&&this.volume>0,previousVolume=this.volume;
  this.enabled=!!enabled;this.volume=Number.isFinite(volume)?Math.min(.6,Math.max(0,volume)):0;
  if(!this.enabled||!this.volume){if(wasAudible||this.nodes.size||this.starting||this.queued)this.stop();this.report('off');return}
  if(!wasAudible){this.ambientKey=null;this.ambientClock=0;this.nextAmbient=Infinity;this.report(this.restingStatus())}
  if(this.volume!==previousVolume){
   for(const group of this.nodes)group.gain.gain.setTargetAtTime(catOutputGain(this.volume),this.context.currentTime,.025);
   this.updateWindGain();
  }
 }
 async unlock(){
  if(this.dead||!this.enabled||!this.volume)return false;
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Audio){this.report('error');return false}
  try{
   const c=this.context??=new Audio();
   if(c.state!=='running'){
    this.report('waiting');
    if(!this.unlocking){const job=Promise.resolve(c.resume());this.unlocking=job;job.then(()=>{if(this.unlocking===job)this.unlocking=null},()=>{if(this.unlocking===job)this.unlocking=null})}
    await this.unlocking;
   }
   if(this.dead||this.context!==c||!this.enabled||!this.volume)return false;
   if(c.state==='suspended'){this.report('waiting');return false}
   this.report(this.nodes.size||this.wind?'playing':'ready');return true;
  }catch(error){if(!this.dead&&this.enabled)this.report(error?.name==='NotAllowedError'?'waiting':'error');return false}
 }
 async cue(kind='tap',{priority=false,preview=false,ambient=false}={}){
  if(this.dead||!this.enabled||!this.volume)return false;
  const id=Object.hasOwn(CAT_CUES,kind)?kind:'tap',now=performance.now();
  if(!ambient&&(priority||preview)){
   this.lastInteractionAt=now;
   if(this.startingAmbient){this.cueSerial++;this.sampleAbort?.abort();this.sampleAbort=null;this.starting=false;this.startingAmbient=false;this.startingKind=null;this.lastAny=-Infinity}
   for(const group of [...this.nodes])if(group.ambient){this.release(group);try{group.voice.stop()}catch{}this.lastAny=-Infinity}
  }
  if(!preview&&now-(this.last[id]??-Infinity)<CAT_CUES[id].gap)return false;
  if(this.starting||this.nodes.size||now-this.lastAny<200){
   if(priority||preview){this.queued={id,preview,expires:now+2400};this.flushSoon();return true}
   return false;
  }
  const generation=this.pending,serial=++this.cueSerial;this.starting=true;this.startingAmbient=ambient;this.startingKind=id;let group;
  try{
   if(!await this.unlock())return false;
   const c=this.context;if(this.dead||!this.enabled||!this.volume||generation!==this.pending||serial!==this.cueSerial||!c)return false;
   const key=id+':'+c.sampleRate;let buffer=this.buffers.get(key);
   if(!buffer){
    const abort=new AbortController();this.sampleAbort=abort;const timeout=setTimeout(()=>abort.abort(),2200);let sample;
    try{sample=await this.loadSample(id,{signal:abort.signal})}catch{/* A missing optional local sample never disables interaction. */}
    finally{clearTimeout(timeout);if(this.sampleAbort===abort)this.sampleAbort=null}
    // Local file reads may finish after a mute, scene pause or theme change.
    if(this.dead||!this.enabled||!this.volume||generation!==this.pending||serial!==this.cueSerial||this.context!==c)return false;
    const pcm=sample?.data||synthesizeCatCue(id,c.sampleRate),rate=sample?.sampleRate||c.sampleRate;
    if(!sample&&CAT_SAMPLE_FILES[id])for(let i=0;i<pcm.length;i++)pcm[i]*=.45;
    buffer=c.createBuffer(1,pcm.length,rate);buffer.copyToChannel(pcm,0);this.buffers.set(key,buffer);
   }
   const voice=c.createBufferSource(),gain=c.createGain();voice.buffer=buffer;voice.loop=false;
   gain.gain.setValueAtTime(catOutputGain(this.volume),c.currentTime);voice.connect(gain);gain.connect(c.destination);
   group={voice,gain,kind:id,ambient};this.nodes.add(group);voice.onended=()=>{this.release(group);this.flushSoon()};voice.start(c.currentTime);
   this.last[id]=performance.now();this.lastAny=this.last[id];if(ambient)this.lastAccentAt=this.ambientClock;this.updateWindGain();this.report('playing');return true;
  }catch{if(group)this.release(group);if(generation===this.pending&&serial===this.cueSerial)this.report('error');return false}
  finally{if(generation===this.pending&&serial===this.cueSerial){this.starting=false;this.startingAmbient=false;this.startingKind=null;this.flushSoon()}}
 }
 flushSoon(){
  if(!this.queued||this.nodes.size||this.starting||this.queueTimer||this.dead||!this.enabled||!this.volume)return;
  this.queueTimer=setTimeout(()=>{
   this.queueTimer=0;const q=this.queued;this.queued=null;
   if(q&&q.expires>=performance.now()&&!this.dead&&this.enabled&&this.volume)this.cue(q.id,{priority:true,preview:q.preview});
  },Math.max(0,205-(performance.now()-this.lastAny)));
 }
 async ensureWind(){
  if(this.wind||this.windStarting||this.dead||!this.enabled||!this.volume||!this.context||this.context.state==='suspended')return;
  const generation=this.pending,c=this.context;this.windStarting=true;
  try{
   let buffer=this.windBuffer;
   if(!buffer){
    const abort=new AbortController();this.windAbort=abort;const timeout=setTimeout(()=>abort.abort(),2200);let sample;
    try{sample=await this.loadSample('wind',{signal:abort.signal})}catch{}finally{clearTimeout(timeout);if(this.windAbort===abort)this.windAbort=null}
    if(this.dead||!this.enabled||!this.volume||generation!==this.pending||this.context!==c)return;
    try{sample=sample?prepareCatWindSample(sample):synthesizeCatWind()}catch{sample=synthesizeCatWind()}
    buffer=c.createBuffer(1,sample.data.length,sample.sampleRate);buffer.copyToChannel(sample.data,0);this.windBuffer=buffer;
   }
   if(this.dead||!this.enabled||!this.volume||generation!==this.pending||this.context!==c||this.wind)return;
   const voice=c.createBufferSource(),gain=c.createGain();voice.buffer=buffer;voice.loop=true;
   gain.gain.setValueAtTime(0,c.currentTime);voice.connect(gain);gain.connect(c.destination);
   this.wind={voice,gain};voice.start(c.currentTime);this.updateWindGain(1.2);this.report(this.restingStatus());
  }catch{/* Wind failure must never block cat interactions. */}
  finally{if(generation===this.pending)this.windStarting=false}
 }
 updateWindGain(smoothing=.65){
  if(!this.wind||!this.context)return;
  const value=catWindGain(catOutputGain(this.volume),this.windClock,{night:this.environment.night||this.environment.time==='night',duck:!!this.nodes.size});
  this.wind.gain.gain.setTargetAtTime(value,this.context.currentTime,smoothing);
 }
 stopWind(){
  this.windAbort?.abort();this.windAbort=null;this.windStarting=false;
  const group=this.wind;this.wind=null;if(!group)return;
  this.windTails.add(group);
  const clean=()=>{this.windTails.delete(group);group.voice.onended=null;try{group.voice.disconnect();group.gain.disconnect()}catch{}};
  group.voice.onended=clean;
  try{
   group.gain.gain.cancelScheduledValues?.(this.context.currentTime);
   group.gain.gain.setTargetAtTime(0,this.context.currentTime,.008);
   group.voice.stop(this.context.currentTime+.04);
  }catch{clean()}
 }
 update(dt,environment){
  if(this.dead||!this.enabled||!this.volume||!this.context||this.context.state==='suspended')return;
  const env=environment||{},key=env.season+':'+(env.night||env.time==='night'),elapsed=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  this.environment=env;void this.ensureWind();this.windClock+=elapsed;this.windModulationClock+=elapsed;
  if(this.windModulationClock>=.25){this.windModulationClock=0;this.updateWindGain()}
  if(key!==this.ambientKey){
   // A slow daylight recording must not become audible after switching to night.
   // Only ambient bird/insect reads are cancelled; a cat response stays valid.
   if(this.startingAmbient&&ambientKind(this.startingKind)){
    this.cueSerial++;this.sampleAbort?.abort();this.sampleAbort=null;this.starting=false;this.startingAmbient=false;this.startingKind=null;
    this.report(this.restingStatus());this.flushSoon();
   }
   this.ambientKey=key;this.nextAmbient=this.ambientClock+catAmbientDelay(env,true,this.random());
   for(const group of [...this.nodes])if(group.ambient&&ambientKind(group.kind)){this.release(group);try{group.voice.stop()}catch{}}
  }
  if(this.nextMeow===Infinity)this.nextMeow=this.ambientClock+catMeowDelay(this.random());
  this.ambientClock+=elapsed;
  const meowDue=this.ambientClock>=this.nextMeow,birdDue=this.ambientClock>=this.nextAmbient;
  if(!meowDue&&!birdDue)return;
  const meow=meowDue&&(!birdDue||this.nextMeow<=this.nextAmbient);
  // A busy courtyard drops the optional accent instead of storing another task.
  if(meowDue)this.nextMeow=this.ambientClock+catMeowDelay(this.random());
  if(birdDue)this.nextAmbient=this.ambientClock+catAmbientDelay(env,false,this.random());
  if(this.queued||this.nodes.size||this.starting||this.ambientClock-this.lastAccentAt<12||performance.now()-this.lastInteractionAt<6000)return;
  void this.cue(meow?'meow':env.night||env.time==='night'?'cricket':'bird',{ambient:true});
 }

 release(group){
  if(!this.nodes.delete(group))return;
  group.voice.onended=null;try{group.gain.disconnect();group.voice.disconnect()}catch{}
  if(!this.nodes.size){this.updateWindGain();this.report(this.restingStatus())}
 }
 stop(){
  this.pending++;this.cueSerial++;this.startingAmbient=false;this.startingKind=null;this.stopWind();this.sampleAbort?.abort();this.sampleAbort=null;this.starting=false;this.queued=null;clearTimeout(this.queueTimer);this.queueTimer=0;this.ambientKey=null;this.nextAmbient=Infinity;this.nextMeow=Infinity;this.lastAccentAt=-Infinity;
  for(const group of [...this.nodes]){this.release(group);try{group.voice.stop()}catch{}}
  this.report(this.restingStatus());
 }
 destroy(){
  if(this.dead)return;this.dead=true;this.stop();this.buffers.clear();this.unlocking=null;
  for(const group of this.windTails){group.voice.onended=null;try{group.voice.stop();group.voice.disconnect();group.gain.disconnect()}catch{}}
  this.windTails.clear();this.windBuffer=null;this.context?.close().catch(()=>{});this.context=null;
 }
}
