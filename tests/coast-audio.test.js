import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AmbientMixer,ambientMix,ambientDescription} from '../src/audio/ambient.js';

function fixture(t){
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const oldWindow=globalThis.window;globalThis.window=new EventTarget();
 class Media extends EventTarget{
  paused=true;volume=0;currentTime=0;duration=90;calls=0;
  play(){this.calls++;this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve()}
  pause(){this.paused=true}
 }
 const media=Object.fromEntries(['stream','ocean','rain','wind','thunder'].map(id=>[id,new Media()]));
 const mixer=new AmbientMixer(media,()=>{},()=>0);
 const configure=changes=>mixer.configure({enabled:true,volume:.3,weather:'sunny',season:'summer',theme:'coast',...changes});
 t.after(()=>{mixer.destroy();globalThis.window=oldWindow});
 return {media,mixer,configure};
}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
async function advance(t,ms){for(let elapsed=0;elapsed<ms;elapsed+=100){t.mock.timers.tick(Math.min(100,ms-elapsed));await settle()}}
function deferred(media){
 let finish;media.play=()=>{media.calls++;return new Promise(resolve=>{finish=()=>{media.paused=false;media.dispatchEvent(new Event('playing'));resolve()}})};
 return ()=>{assert.ok(finish);finish()};
}

test('coast replaces stream with a modest surf layer and describes the sea',()=>{
 for(const weather of ['sunny','cloudy','rainy','stormy','snowy','foggy']){
  const coast=ambientMix(weather,'summer',false,'coast');
  assert.equal(coast.stream,0);assert.ok(coast.ocean>0&&coast.ocean<=.4);
  assert.ok(Object.values(coast).reduce((sum,value)=>sum+value,0)<=1);
  const koi=ambientMix(weather,'summer');assert.equal(koi.ocean,0);assert.ok(koi.stream>0);
 }
 assert.match(ambientDescription('sunny','summer','coast'),/海浪/);
});

test('the offline ocean loop is long, quiet, unclipped and has a continuous seam',()=>{
 const bytes=readFileSync(new URL('../public/assets/ocean-waves.wav',import.meta.url));
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 let data,rate,channels,bits;
 for(let offset=12;offset+8<=bytes.length;){
  const id=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
  if(id==='fmt '){assert.equal(bytes.readUInt16LE(start),1);channels=bytes.readUInt16LE(start+2);rate=bytes.readUInt32LE(start+4);bits=bytes.readUInt16LE(start+14)}
  if(id==='data')data=bytes.subarray(start,start+size);
  offset=start+size+(size%2);
 }
 assert.equal(channels,2);assert.equal(rate,48000);assert.equal(bits,16);assert.ok(data);
 const frames=data.length/4;assert.ok(frames/rate>=60&&frames/rate<=120);
 let energy=0,peak=0;
 for(let offset=0;offset<data.length;offset+=2){const value=data.readInt16LE(offset)/32768;energy+=value*value;peak=Math.max(peak,Math.abs(value))}
 const rms=Math.sqrt(energy/(data.length/2));assert.ok(rms>.002&&rms<.016);assert.ok(peak<.06);
 for(let channel=0;channel<2;channel++)assert.ok(Math.abs(data.readInt16LE(channel*2)-data.readInt16LE(data.length-4+channel*2))<=1);
});

test('theme changes fade out the inactive water layer and keep only the selected one playing',async t=>{
 const {media,configure}=fixture(t);configure({theme:'koi'});await settle();await advance(t,3000);
 assert.equal(media.stream.paused,false);assert.equal(media.ocean.paused,true);
 configure();await settle();await advance(t,3000);
 assert.equal(media.stream.paused,true);assert.equal(media.stream.volume,0);assert.equal(media.ocean.paused,false);assert.ok(media.ocean.volume>0);
 configure({theme:'koi'});await settle();await advance(t,3000);
 assert.equal(media.ocean.paused,true);assert.equal(media.ocean.volume,0);assert.equal(media.stream.paused,false);
});

test('a water play request resolving after switching themes stays silent',async t=>{
 const {media,configure}=fixture(t);const finish=deferred(media.ocean);configure();configure({theme:'koi'});finish();await settle();await advance(t,3000);
 assert.equal(media.ocean.paused,true);assert.equal(media.ocean.volume,0);assert.equal(media.stream.paused,false);
});

test('theme switch cancels pending thunder even if both themes have storm weather',async t=>{
 const {media,mixer,configure}=fixture(t);configure({weather:'stormy'});await settle();
 mixer.thunder({delay:1000});const before=media.thunder.calls;configure({weather:'stormy',theme:'koi'});await advance(t,2000);
 assert.equal(media.thunder.calls,before);assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
 const finish=deferred(media.thunder);mixer.thunder({delay:0});t.mock.timers.tick(1);configure({weather:'stormy'});finish();await settle();
 assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
});

test('coast non-storm weather never starts thunder, including muted priming',async t=>{
 const {media,mixer,configure}=fixture(t);
 for(const weather of ['sunny','cloudy','rainy','snowy','foggy']){
  configure({weather});window.dispatchEvent(new Event('pointerdown'));mixer.thunder({delay:0});await advance(t,1000);
  assert.equal(media.thunder.calls,0);assert.equal(media.thunder.paused,true);
 }
});

test('switching theme resets the long quiet gap before the next gust',async t=>{
 const {media,configure}=fixture(t);configure();await settle();await advance(t,50000);configure({theme:'koi'});await settle();await advance(t,15000);
 assert.equal(media.wind.paused,true);assert.equal(media.wind.volume,0);
 await advance(t,47000);assert.equal(media.wind.paused,false);assert.ok(media.wind.volume>0);
});

test('late wind priming and gust requests cannot restart after disable or theme change',async t=>{
 const {media,configure}=fixture(t);let finish=deferred(media.wind);configure();configure({enabled:false});finish();await settle();
 assert.equal(media.wind.paused,true);assert.equal(media.wind.volume,0);
 media.wind.play=()=>{media.wind.paused=false;return Promise.resolve()};configure();await settle();finish=deferred(media.wind);await advance(t,61000);
 configure({theme:'koi'});finish();await settle();assert.equal(media.wind.paused,true);assert.equal(media.wind.volume,0);
});

test('a late loop or wind promise is stopped after disposal when this mixer still owns it',async t=>{
 const {media,mixer,configure}=fixture(t);const finishOcean=deferred(media.ocean),finishWind=deferred(media.wind);
 configure();mixer.destroy();finishOcean();finishWind();await settle();
 assert.equal(media.ocean.paused,true);assert.equal(media.ocean.volume,0);assert.equal(media.wind.paused,true);assert.equal(media.wind.volume,0);
});

test('late promises from disposed mixer do not pause the replacement owner',async t=>{
 const {media,mixer,configure}=fixture(t);const finish=deferred(media.ocean);configure();mixer.destroy();
 const {AmbientMixer:Refreshed}=await import('../src/audio/ambient.js?coast-owner-test');
 const replacement=new Refreshed(media);try{
  media.ocean.play=()=>{media.ocean.paused=false;return Promise.resolve()};
  replacement.configure({enabled:true,volume:.3,weather:'sunny',season:'summer',theme:'coast'});await settle();finish();await settle();
  assert.equal(media.ocean.paused,false);assert.ok(media.ocean.volume>0);
 }finally{replacement.destroy()}
});
