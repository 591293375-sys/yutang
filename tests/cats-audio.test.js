import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catWindGain,prepareCatWindSample,synthesizeCatWind} from '../src/themes/cats/wind-audio.js';
import {CatAudio,CAT_CUES,synthesizeCatCue,catOutputGain,catAmbientDelay,CAT_SAMPLE_FILES,decodeCatSample} from '../src/themes/cats/audio.js';

function fixture(t,loader=async()=>null){
 let now=20000,resume=()=>Promise.resolve();const contexts=[];
 t.mock.method(performance,'now',()=>now);
 class Node{disconnected=false;connect(){}disconnect(){this.disconnected=true}}
 class Context{
  currentTime=0;sampleRate=48000;destination={};voices=[];gains=[];closed=false;bufferCount=0;
  constructor(){contexts.push(this)}
  resume(){return resume()}
  close(){this.closed=true;return Promise.resolve()}
  createBuffer(channels,length,rate){this.bufferCount++;assert.equal(channels,1);return {length,sampleRate:rate,copyToChannel(data){this.data=data}}}
  createBufferSource(){const voice=new Node();Object.assign(voice,{loop:true,starts:0,stops:0,start(){this.starts++},stop(){this.stops++;this.onended?.()},finish(){this.onended?.()}});this.voices.push(voice);return voice}
  createGain(){const gain=new Node();gain.gain={value:0,setValueAtTime(v){this.value=v},setTargetAtTime(v){this.value=v}};this.gains.push(gain);return gain}
 }
 const original=globalThis.AudioContext;globalThis.AudioContext=Context;
 const audio=new CatAudio(()=>{},Math.random,loader);audio.configure(true,.4);
 t.after(()=>{audio.destroy();if(original===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=original});
 return {audio,contexts,advance:ms=>{now+=ms},delayResume(){let finish;resume=()=>new Promise(resolve=>{finish=resolve});return()=>finish()},failResume(){resume=()=>Promise.reject(Error('disabled'))}};
}

test('procedural fallbacks remain finite short PCM with quiet peaks and click-free endpoints',()=>{
 for(const [kind,spec] of Object.entries(CAT_CUES))for(const rate of [44100,48000]){
  const pcm=synthesizeCatCue(kind,rate);assert.equal(pcm.length,Math.ceil(rate*spec.duration));
  assert.equal(pcm[0],0);assert.equal(pcm.at(-1),0);assert.ok(spec.duration<=2.25);
  let power=0,peak=0,dc=0,delta=0;
  for(let i=0;i<pcm.length;i++){const v=pcm[i];assert.ok(Number.isFinite(v));power+=v*v;dc+=v;peak=Math.max(peak,Math.abs(v));if(i)delta=Math.max(delta,Math.abs(v-pcm[i-1]))}
  assert.ok(peak<=.451);assert.ok(peak*catOutputGain(.6)<.33,'even maximum volume has ample headroom');assert.ok(Math.sqrt(power/pcm.length)>.001);assert.ok(Math.abs(dc/pcm.length)<.001);assert.ok(delta<.10);
  assert.deepEqual(pcm,synthesizeCatCue(kind,rate),'no random broadband noise');
 }
});

test('purr includes breathing and rapid throat flutter instead of a sustained sine beep',()=>{
 const pcm=synthesizeCatCue('purr'),energies=[];
 for(let i=12000;i<60000;i+=480){let n=0;for(let j=i;j<i+480;j++)n+=pcm[j]**2;energies.push(n/480)}
 assert.ok(Math.max(...energies)>Math.min(...energies)*5,'soft pulses retain separate low-energy intervals');
});

test('every courtyard tool has a distinct offline cue instead of silently falling back to tap',()=>{
 const kinds=['purr','food','scratch','yarn','mouse','feather','step','bird','cricket'];
 const signatures=new Set();
 for(const kind of kinds){assert.ok(CAT_CUES[kind],`${kind} must be registered`);const pcm=synthesizeCatCue(kind);let sum=0;for(let i=0;i<pcm.length;i+=31)sum+=pcm[i]**2;signatures.add(`${pcm.length}:${sum}`)}
 assert.equal(signatures.size,kinds.length);
});

test('busy interaction cues never overlap, loop or queue and same-kind cues stay rate limited',async t=>{
 const {audio,contexts,advance}=fixture(t);
 assert.equal(await audio.cue('purr'),true);const c=contexts[0];assert.equal(c.voices.length,1);assert.equal(c.voices[0].loop,false);
 for(const kind of ['meow','food','tap','purr'])assert.equal(await audio.cue(kind),false);
 c.voices[0].finish();assert.equal(audio.nodes.size,0);assert.equal(await audio.cue('tap'),false);
 advance(2000);assert.equal(await audio.cue('purr'),false);assert.equal(await audio.cue('tap'),true);
 c.voices[1].finish();advance(8000);assert.equal(await audio.cue('purr'),true);assert.equal(c.bufferCount,2,'PCM buffer reused per kind');
});

test('mute disconnects and stops the active source immediately, including zero-volume mute',async t=>{
 const {audio,contexts,advance}=fixture(t);await audio.cue('purr');const c=contexts[0];
 audio.configure(false,.4);assert.equal(audio.nodes.size,0);assert.equal(c.voices[0].stops,1);assert.equal(c.gains[0].disconnected,true);
 assert.equal(await audio.cue('meow'),false);advance(1000);audio.configure(true,.4);await audio.cue('meow');
 audio.configure(true,0);assert.equal(c.voices[1].stops,1);assert.equal(audio.nodes.size,0);
});

test('an audio resume finishing after mute or destruction cannot restart a stale voice',async t=>{
 const {audio,contexts,delayResume}=fixture(t);let done=delayResume();const pending=audio.cue('purr');
 assert.equal(await audio.cue('food'),false);audio.configure(false,.4);done();assert.equal(await pending,false);assert.equal(contexts[0].voices.length,0);
 audio.configure(true,.4);done=delayResume();const another=audio.cue('meow');audio.destroy();done();assert.equal(await another,false);assert.equal(contexts[0].voices.length,0);assert.equal(contexts[0].closed,true);
});

test('changing volume updates the live voice and invalid volume stays silent',async t=>{
 const {audio,contexts}=fixture(t);await audio.cue('food');audio.configure(true,10);assert.equal(contexts[0].gains[0].gain.value,catOutputGain(.6));
 audio.configure(true,.1);assert.equal(contexts[0].gains[0].gain.value,catOutputGain(.1));audio.configure(true,NaN);assert.equal(audio.nodes.size,0);assert.equal(await audio.cue(),false);
});

test('fallback cat source retains headroom before the extra quiet fallback gain',()=>{
 for(const kind of ['meow','purr']){const pcm=synthesizeCatCue(kind);let power=0;for(const v of pcm)power+=v*v;const rms=Math.sqrt(power/pcm.length)*catOutputGain(.18);assert.ok(rms>.025&&rms<.08,`${kind} default RMS ${rms}`)}
 assert.equal(catOutputGain(0),0);assert.equal(catOutputGain(NaN),0);
});

test('an interaction arriving during an acknowledgement survives in one replaceable slot',async t=>{
 const {audio,contexts,advance}=fixture(t);await audio.cue('meow');
 assert.equal(await audio.cue('purr',{priority:true}),true);assert.equal(audio.queued.id,'purr');assert.equal(contexts[0].voices.length,1);
 advance(800);contexts[0].voices[0].finish();await new Promise(r=>setTimeout(r,15));
 assert.equal(contexts[0].voices.length,2);assert.equal([...audio.nodes][0].kind,'purr');assert.equal(audio.queued,null);
 await audio.cue('scratch',{priority:true});await audio.cue('food',{priority:true});assert.equal(audio.queued.id,'food');
 audio.configure(false,.4);await new Promise(r=>setTimeout(r,15));assert.equal(audio.queued,null);assert.equal(audio.queueTimer,0);assert.equal(audio.nodes.size,0);
});

test('preview respects mute and can repeat without waiting for the interaction cooldown',async t=>{
 const {audio,contexts,advance}=fixture(t);audio.configure(false,.4);assert.equal(await audio.cue('meow',{preview:true}),false);
 audio.configure(true,.4);await audio.cue('meow',{preview:true});contexts[0].voices[0].finish();advance(1000);
 assert.equal(await audio.cue('meow'),false);assert.equal(await audio.cue('meow',{preview:true}),true);
});

test('observation ambience is sparse, day/night specific and never catches up offline',async t=>{
 const {audio,contexts,advance}=fixture(t);audio.random=()=>0;await audio.unlock();const day={season:'spring',time:'day'};
 audio.update(.1,day);await new Promise(r=>setTimeout(r,0));
 audio.ambientClock=audio.nextAmbient;audio.update(.1,day);await new Promise(r=>setTimeout(r,0));assert.equal([...audio.nodes][0]?.kind,'bird');
 [...audio.nodes][0].voice.finish();const count=contexts[0].voices.length;advance(100000);audio.update(86400,day);assert.equal(contexts[0].voices.length,count,'a resumed frame must not replay offline events');
 audio.update(.1,{season:'spring',time:'night'});assert.ok(audio.nextAmbient>=35);
 audio.ambientClock=audio.nextAmbient;audio.update(.1,{season:'spring',time:'night'});await new Promise(r=>setTimeout(r,0));assert.equal([...audio.nodes][0]?.kind,'cricket');
 audio.update(.1,{season:'winter',time:'night'});assert.equal(audio.nodes.size,0);assert.equal(audio.nextAmbient,Infinity);
 assert.ok(catAmbientDelay(day,false,0)>=35);assert.ok(catAmbientDelay(day,false,1)<=80);assert.ok(catAmbientDelay({time:'day',season:'winter'},false,0)>=90);
 audio.stop();assert.equal(audio.queued,null);assert.equal(audio.nextAmbient,Infinity);
});

test('audio rejection is contained and destroying closes the context and releases the PCM cache',async t=>{
 const {audio,contexts,failResume}=fixture(t);await audio.cue('tap');contexts[0].voices[0].finish();audio.stop();
 assert.equal(audio.buffers.size,1);audio.destroy();audio.destroy();assert.equal(audio.buffers.size,0);assert.equal(contexts[0].closed,true);assert.equal(await audio.cue('meow'),false);
 const second=new CatAudio();second.configure(true,.4);failResume();assert.equal(await second.cue(),false);assert.equal(second.starting,false);second.destroy();
});


test('recorded cat sample is awaited, played unchanged and cached without synthesis',async t=>{
 const recorded={sampleRate:24000,data:new Float32Array([0,.05,-.03,0])};let requests=0;
 const {audio,contexts,advance}=fixture(t,async()=>{requests++;return recorded});
 assert.equal(await audio.cue('meow'),true);const c=contexts[0];
 assert.equal(c.voices[0].buffer.sampleRate,24000);assert.deepEqual(c.voices[0].buffer.data,recorded.data);
 c.voices[0].finish();advance(10000);await audio.cue('meow');assert.equal(requests,1);
});

test('a recorded sample resolving after mute or destruction never starts a stale voice',async t=>{
 let resolve;const {audio,contexts}=fixture(t,()=>new Promise(r=>{resolve=r}));
 const pending=audio.cue('meow');await new Promise(r=>setTimeout(r,0));
 assert.equal(typeof resolve,'function');audio.configure(false,.4);resolve({sampleRate:24000,data:new Float32Array([0,.1,0])});
 assert.equal(await pending,false);assert.equal(contexts[0].voices.length,0);
 audio.configure(true,.4);const next=audio.cue('purr');await new Promise(r=>setTimeout(r,0));audio.destroy();resolve({sampleRate:24000,data:new Float32Array([0,.1,0])});
 assert.equal(await next,false);assert.equal(contexts[0].voices.length,0);assert.equal(contexts[0].closed,true);assert.equal(audio.buffers.size,0);
});

test('local sample failure produces a quiet fallback without rejecting the interaction',async t=>{
 const {audio,contexts}=fixture(t,async()=>{throw new Error('missing local asset')});
 assert.equal(await audio.cue('meow'),true);assert.equal(contexts[0].voices.length,1);assert.equal(contexts[0].voices[0].loop,false);
});


test('all locally bundled recordings decode with faded endpoints, bounded levels and documented CC0 sources',()=>{
 let totalBytes=0;const manifest=JSON.parse(readFileSync(new URL('../public/assets/cats/audio/sources.json',import.meta.url),'utf8'));
 assert.equal(manifest.license,'CC0 1.0');assert.equal(Object.keys(CAT_SAMPLE_FILES).length,10);
 for(const [kind,path] of Object.entries(CAT_SAMPLE_FILES)){
  const raw=readFileSync(new URL('../public/'+path,import.meta.url));totalBytes+=raw.length;
  const sample=decodeCatSample(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  assert.equal(sample.sampleRate,24000);assert.equal(sample.data.length,Math.round(CAT_CUES[kind].duration*24000));
  assert.equal(sample.data[0],0);assert.equal(sample.data.at(-1),0);let peak=0,power=0;
  for(const v of sample.data){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));power+=v*v}
  assert.ok(peak<=.281&&peak>.04);const rms=Math.sqrt(power/sample.data.length);assert.ok(rms>.009);
  if(kind==='meow'||kind==='purr')assert.ok(rms*catOutputGain(.18)>.012&&rms*catOutputGain(.18)<.035,'natural vocal remains gentle at the default setting');
  else if(kind!=='bird')assert.ok(peak*catOutputGain(.6)<.08,'foley stays below vocal loudness even at maximum');
  const clip=manifest.clips.find(c=>c.file===kind+'.wav');assert.ok(clip);assert.match(manifest.sources[clip.source].url,/^https:\/\/freesound\.org\/people\//);
 }
 assert.ok(totalBytes<450000,'short bank stays below 450 kB');
});

test('truncated, invalid or oversized local WAVs are rejected before playback',()=>{
 assert.throws(()=>decodeCatSample(new ArrayBuffer(4)),/Invalid/);
 const raw=readFileSync(new URL('../public/assets/cats/audio/meow.wav',import.meta.url));
 const bytes=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);assert.throws(()=>decodeCatSample(bytes.slice(0,bytes.byteLength-20)),/Truncated/);
 new DataView(bytes).setUint16(22,2,true);assert.throws(()=>decodeCatSample(bytes),/Unsupported/);
});


test('wind bed has its own loop and never occupies or blocks the interaction voice',async t=>{
 const {audio,contexts}=fixture(t,async id=>id==='wind'?{sampleRate:24000,data:new Float32Array(24000).fill(.03)}:null);
 await audio.unlock();audio.update(.1,{season:'spring',time:'day'});await new Promise(r=>setTimeout(r,0));
 const c=contexts[0];assert.ok(audio.wind);assert.equal(audio.wind.voice.loop,true);assert.equal(audio.nodes.size,0);
 const loop=audio.wind.voice;for(let i=0;i<50;i++)audio.update(.1,{season:'spring',time:'day'});
 assert.equal(c.voices.filter(v=>v.loop).length,1);assert.equal(await audio.cue('purr',{priority:true}),true);assert.equal(audio.nodes.size,1);assert.equal(audio.wind.voice,loop);
 assert.ok(audio.wind.gain.gain.value<catOutputGain(.4)*.15);
 audio.configure(false,.4);assert.equal(audio.wind,null);assert.equal(loop.stops,1);assert.equal(audio.nodes.size,0);
 audio.configure(true,.4);await audio.unlock();audio.update(.1,{season:'spring',time:'day'});await new Promise(r=>setTimeout(r,0));
 assert.ok(audio.wind);assert.notEqual(audio.wind.voice,loop);assert.equal(c.voices.filter(v=>v.loop&&v.stops===0).length,1);
 audio.stop();assert.equal(audio.wind,null);
});

test('wind sample loading cannot resurrect a muted or destroyed scene',async t=>{
 let resolve;const {audio,contexts}=fixture(t,id=>id==='wind'?new Promise(r=>{resolve=r}):Promise.resolve(null));
 await audio.unlock();audio.update(.1,{season:'summer',time:'day'});await new Promise(r=>setTimeout(r,0));assert.equal(typeof resolve,'function');
 audio.configure(false,.4);resolve({sampleRate:24000,data:new Float32Array(24000)});await new Promise(r=>setTimeout(r,0));
 assert.equal(contexts[0].voices.length,0);assert.equal(audio.wind,null);assert.equal(audio.windStarting,false);
 audio.configure(true,.4);await audio.unlock();audio.update(.1,{season:'summer',time:'day'});await new Promise(r=>setTimeout(r,0));audio.destroy();resolve(null);await new Promise(r=>setTimeout(r,0));
 assert.equal(contexts[0].voices.length,0);assert.equal(audio.wind,null);assert.equal(contexts[0].closed,true);
});

test('spontaneous meows are sparse and yield immediately to an explicit interaction',async t=>{
 const {audio,contexts,advance}=fixture(t);audio.random=()=>.5;await audio.unlock();const env={season:'summer',time:'day'};
 audio.update(.1,env);await new Promise(r=>setTimeout(r,0));assert.ok(audio.nextMeow>=70&&audio.nextMeow<=150);
 audio.nextAmbient=Infinity;audio.ambientClock=audio.nextMeow;audio.update(.1,env);await new Promise(r=>setTimeout(r,0));
 assert.equal([...audio.nodes][0]?.kind,'meow');assert.equal([...audio.nodes][0]?.ambient,true);const meow=[...audio.nodes][0].voice;
 assert.equal(await audio.cue('purr',{priority:true}),true);assert.equal(meow.stops,1);assert.equal([...audio.nodes][0].kind,'purr');assert.equal(audio.queued,null);
 const voice=[...audio.nodes][0].voice;audio.nextMeow=audio.ambientClock;audio.nextAmbient=audio.ambientClock;audio.update(.1,env);assert.equal(audio.queued,null);assert.equal([...audio.nodes][0].voice,voice);assert.ok(audio.nextMeow>audio.ambientClock);
 voice.finish();advance(10000);audio.lastAccentAt=audio.ambientClock;audio.nextAmbient=audio.ambientClock;audio.update(.1,env);assert.equal(audio.nodes.size,0,'bird and meow accents do not land back to back');
});


test('fallback breeze is band softened, cached and seamless without endpoint fades to silence',()=>{
 const sample=synthesizeCatWind();assert.equal(sample,synthesizeCatWind());assert.equal(sample.sampleRate,24000);assert.equal(sample.data.length,230400);
 let peak=0,power=0,delta=0,mean=0;for(let i=0;i<sample.data.length;i++){const v=sample.data[i];assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));power+=v*v;mean+=v;if(i)delta=Math.max(delta,Math.abs(v-sample.data[i-1]))}
 assert.ok(peak<=.161);assert.ok(Math.sqrt(power/sample.data.length)>.01&&Math.sqrt(power/sample.data.length)<.06);
 assert.ok(Math.abs(mean/sample.data.length)<.001);assert.ok(delta<.045,'no broadband sharp sample jumps');assert.ok(Math.abs(sample.data[0]-sample.data.at(-1))<=delta,'loop boundary is no sharper than normal waveform motion');
 assert.ok(catWindGain(catOutputGain(.18),5)<.04);assert.ok(catWindGain(.7,5,{duck:true})<catWindGain(.7,5));assert.ok(catWindGain(.7,5,{night:true})<catWindGain(.7,5));
 const peakBound=prepareCatWindSample({sampleRate:24000,data:new Float32Array(24000).fill(.9)});assert.ok(Math.max(...peakBound.data)<=.231);
 assert.throws(()=>prepareCatWindSample({sampleRate:24000,data:new Float32Array(10)}),/Invalid/);
});

test('an interaction preempts an optional ambient file read without late playback',async t=>{
 let resolve;const {audio,contexts}=fixture(t,id=>id==='meow'?new Promise(r=>{resolve=r}):Promise.resolve(null));
 const ambient=audio.cue('meow',{ambient:true});await new Promise(r=>setTimeout(r,0));assert.equal(typeof resolve,'function');
 assert.equal(await audio.cue('purr',{priority:true}),true);assert.equal(contexts[0].voices.length,1);assert.equal([...audio.nodes][0].kind,'purr');
 resolve({sampleRate:24000,data:new Float32Array([0,.1,0])});assert.equal(await ambient,false);assert.equal(contexts[0].voices.length,1);assert.equal([...audio.nodes][0].kind,'purr');assert.equal(audio.queued,null);
});


test('bundled breeze decodes, stays quiet and remains seamless after loop preparation',()=>{
 const raw=readFileSync(new URL('../public/assets/cats/audio/wind-bed.wav',import.meta.url));
 const decoded=decodeCatSample(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),30);
 assert.equal(decoded.sampleRate,24000);assert.equal(decoded.data.length,240000);
 const loop=prepareCatWindSample(decoded);assert.equal(loop.data.length,230400);
 let power=0,peak=0,delta=0;for(let i=0;i<loop.data.length;i++){const v=loop.data[i];power+=v*v;peak=Math.max(peak,Math.abs(v));if(i)delta=Math.max(delta,Math.abs(v-loop.data[i-1]))}
 assert.ok(peak<.23);assert.ok(Math.sqrt(power/loop.data.length)>.04&&Math.sqrt(power/loop.data.length)<.07);assert.ok(Math.abs(loop.data[0]-loop.data.at(-1))<=delta);
 assert.ok(peak*catWindGain(catOutputGain(.6),5)<.022,'maximum breeze level stays behind the foreground voices');
});

test('switching day/night cancels an in-flight bird but preserves meows and explicit interactions',async t=>{
 const resolvers={};const {audio,advance}=fixture(t,id=>['bird','meow','purr'].includes(id)?new Promise(r=>{resolvers[id]=r}):Promise.resolve(null));
 await audio.unlock();audio.update(.1,{season:'spring',time:'day'});await new Promise(r=>setTimeout(r,0));
 const bird=audio.cue('bird',{ambient:true});await new Promise(r=>setTimeout(r,0));
 audio.update(.1,{season:'spring',time:'night'});resolvers.bird({sampleRate:24000,data:new Float32Array([0,.1,0])});
 assert.equal(await bird,false);assert.equal(audio.nodes.size,0,'a daylight bird cannot arrive after nightfall');
 const meow=audio.cue('meow',{ambient:true});await new Promise(r=>setTimeout(r,0));
 audio.update(.1,{season:'summer',time:'day'});resolvers.meow({sampleRate:24000,data:new Float32Array([0,.1,0])});
 assert.equal(await meow,true);assert.equal([...audio.nodes][0].kind,'meow');[...audio.nodes][0].voice.finish();advance(10000);
 const pet=audio.cue('purr',{priority:true});await new Promise(r=>setTimeout(r,0));
 audio.update(.1,{season:'winter',time:'night'});resolvers.purr({sampleRate:24000,data:new Float32Array([0,.1,0])});
 assert.equal(await pet,true);assert.equal([...audio.nodes][0].kind,'purr');
});
