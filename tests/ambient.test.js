import test from 'node:test';import assert from 'node:assert/strict';
import {AmbientMixer} from '../src/audio/ambient.js';
function fixture(t){
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const target=new EventTarget(),old=globalThis.window;globalThis.window=target;
 class Media extends EventTarget{paused=true;volume=1;currentTime=0;calls=0;play(){this.paused=false;this.calls++;return Promise.resolve()}pause(){this.paused=true}}
 const media=Object.fromEntries(['stream','rain','wind','thunder'].map(k=>[k,new Media()]));const mix=new AmbientMixer(media);t.after(()=>{mix.destroy();globalThis.window=old});
 const configure=changes=>mix.configure({enabled:true,volume:.2,weather:'stormy',season:'autumn',...changes});
 return {media,mix,configure};
}
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
test('muting cancels delayed thunder and fades every loop to silence',async t=>{
 const {media,mix,configure}=fixture(t);configure();await settle();t.mock.timers.tick(2000);mix.thunder({delay:1000});const calls=media.thunder.calls;
 configure({enabled:false});await settle();t.mock.timers.tick(4000);
 assert.equal(media.thunder.calls,calls);assert.ok(Object.values(media).every(a=>a.paused&&a.volume===0));
});
test('changing out of storm cancels rumble; global volume zero also stops an active thunder',async t=>{
 const {media,mix,configure}=fixture(t);configure();await settle();mix.thunder({delay:100});t.mock.timers.tick(200);await settle();assert.equal(media.thunder.paused,false);
 configure({volume:0});await settle();t.mock.timers.tick(4000);assert.ok(Object.values(media).every(a=>a.paused&&a.volume===0));
 configure();await settle();mix.thunder({delay:1000});const calls=media.thunder.calls;configure({weather:'sunny'});t.mock.timers.tick(2000);await settle();assert.equal(media.thunder.calls,calls);assert.equal(media.thunder.paused,true);
});
test('crossfade preserves stream position and rapid off/on/off cannot leave any media playing',async t=>{
 const {media,configure}=fixture(t);configure({weather:'sunny'});await settle();t.mock.timers.tick(2000);media.stream.currentTime=23;
 configure({weather:'rainy'});await settle();t.mock.timers.tick(2000);assert.equal(media.stream.currentTime,23);assert.ok(media.rain.volume>media.stream.volume);
 configure({enabled:false});configure();configure({enabled:false});await settle();t.mock.timers.tick(4000);assert.ok(Object.values(media).every(a=>a.paused&&a.volume===0));
});
test('a stale play promise from a disposed mixer cannot pause its replacement',async t=>{
 const {media,mix,configure}=fixture(t);let finish;media.stream.play=()=>{media.stream.paused=false;return new Promise(r=>finish=r)};
 configure({weather:'sunny'});mix.destroy();
 const replacement=new AmbientMixer(media);
 media.stream.play=()=>{media.stream.paused=false;return Promise.resolve()};replacement.configure({enabled:true,volume:.2,weather:'sunny',season:'spring'});
 await settle();finish();await settle();assert.equal(media.stream.paused,false);
 replacement.destroy();
});

function deferPlayback(media){
 let finish;
 media.play=()=>{media.calls++;return new Promise(resolve=>{finish=()=>{media.paused=false;media.dispatchEvent(new Event('playing'));resolve()}})};
 return ()=>{assert.ok(finish,'a playback request should be pending');finish()};
}
test('sunny and other non-storm weather never prime or start the thunder recording',async t=>{
 const {media,mix,configure}=fixture(t);
 for(const weather of ['sunny','cloudy','rainy','snowy','foggy']){
  configure({weather});window.dispatchEvent(new Event('pointerdown'));mix.thunder({delay:0});t.mock.timers.tick(4000);await settle();
  assert.equal(media.thunder.calls,0,`${weather} must not request thunder playback`);assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
 }
});
test('a pending rumble cannot start after leaving storm, even if play resolves after pause',async t=>{
 const {media,mix,configure}=fixture(t);configure();await settle();const finish=deferPlayback(media.thunder);
 mix.thunder({delay:0});t.mock.timers.tick(1);configure({weather:'sunny'});finish();await settle();
 assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);assert.equal(media.thunder.currentTime,0);
});
test('leaving and returning to storm does not revive a stale pending rumble',async t=>{
 const {media,mix,configure}=fixture(t);configure();await settle();const finish=deferPlayback(media.thunder);
 mix.thunder({delay:0});t.mock.timers.tick(1);configure({weather:'sunny'});configure();finish();await settle();
 assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
});
test('zero volume and disposal silence a thunder play that finishes late',async t=>{
 const {media,mix,configure}=fixture(t);configure();await settle();let finish=deferPlayback(media.thunder);
 mix.thunder({delay:0});t.mock.timers.tick(1);configure({volume:0});finish();await settle();assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
 configure();finish=deferPlayback(media.thunder);mix.thunder({delay:0});t.mock.timers.tick(1);mix.destroy();finish();await settle();assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
});
test('a pending muted prime is stopped on weather change and on disposal',async t=>{
 const {media,mix,configure}=fixture(t);const finish=deferPlayback(media.thunder);configure();configure({weather:'sunny'});finish();await settle();
 assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
 mix.primed=false;const finishNext=deferPlayback(media.thunder);configure();mix.destroy();finishNext();await settle();assert.equal(media.thunder.paused,true);assert.equal(media.thunder.volume,0);
});
test('stale thunder completion cannot mute a replacement mixer valid storm playback',async t=>{
 const {media,mix,configure}=fixture(t);configure();await settle();const finish=deferPlayback(media.thunder);mix.thunder({delay:0});t.mock.timers.tick(1);mix.destroy();
 const replacement=new AmbientMixer(media);media.thunder.play=()=>{media.thunder.paused=false;return Promise.resolve()};replacement.configure({enabled:true,volume:.2,weather:'stormy',season:'spring'});await settle();replacement.thunder({delay:0});t.mock.timers.tick(1);await settle();
 finish();await settle();assert.equal(media.thunder.paused,false);assert.ok(media.thunder.volume>0);replacement.destroy();
});
test('thunder ownership survives a real module refresh with a different mixer class',async t=>{
 const {AmbientMixer:RefreshedMixer}=await import('../src/audio/ambient.js?replacement=thunder-hmr');
 assert.notEqual(RefreshedMixer,AmbientMixer);
 const {media,mix,configure}=fixture(t);configure();await settle();const finish=deferPlayback(media.thunder);mix.thunder({delay:0});t.mock.timers.tick(1);mix.destroy();
 const replacement=new RefreshedMixer(media);try{
 media.thunder.play=()=>{media.thunder.paused=false;return Promise.resolve()};replacement.configure({enabled:true,volume:.2,weather:'stormy',season:'spring'});await settle();replacement.thunder({delay:0});t.mock.timers.tick(1);await settle();
 finish();await settle();assert.equal(media.thunder.paused,false,'old module must not pause replacement playback');assert.ok(media.thunder.volume>0);
 }finally{replacement.destroy()}
});
