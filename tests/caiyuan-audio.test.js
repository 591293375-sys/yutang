import test from 'node:test';
import assert from 'node:assert/strict';
import {CaiyuanAudio} from '../src/themes/caiyuan/audio.js';
function setup(t){
 const nodes=[];let deferred=false;
 class Audio{constructor(src){this.src=src;this.paused=true;this.currentTime=12;this.duration=194;nodes.push(this)}play(){this.plays=(this.plays||0)+1;this.paused=false;if(deferred)return new Promise(resolve=>{this.resolve=()=>{this.paused=false;resolve()}});return Promise.resolve()}pause(){this.paused=true}removeAttribute(){this.src=''}load(){this.loaded=true}}
 t.mock.method(globalThis,'Audio',function(src){return new Audio(src)});const audio=new CaiyuanAudio();return{audio,nodes,defer:()=>{deferred=true}};
}
// Audio is supplied by browsers; the stub keeps these lifecycle checks offline.
if(!globalThis.Audio)globalThis.Audio=function(){};
test('no sound starts before gesture; music, wind and cues follow independent settings',async t=>{
 const {audio}=setup(t);audio.configure(true,.3);assert.ok(audio.music.paused&&audio.wind.paused);audio.unlock();await Promise.resolve();audio.update(.1);
 assert.equal(audio.music.paused,false);assert.equal(audio.wind.paused,false);assert.ok(audio.music.volume>0&&audio.music.volume<.15);
 audio.configure(true,.3,true,{music:false});assert.equal(audio.music.paused,true);assert.equal(audio.wind.paused,false);
 audio.configure(true,.3,false,{effects:false});assert.equal(audio.wind.paused,true);assert.equal(audio.cue('tea'),false);
});
test('mute, zero volume, pause and destroy stop all media and stale playback promises',async t=>{
 const {audio,defer}=setup(t);defer();audio.configure(true,.3);audio.unlock();audio.cue('tea');const voices=[audio.music,audio.wind,...audio.voices];
 audio.stop();for(const v of voices)v.resolve();await Promise.resolve();assert.ok(voices.every(v=>v.paused));assert.equal(audio.voices.size,0);
 audio.configure(true,0);assert.equal(audio.enabled,false);audio.configure(true,.3);audio.unlock();audio.destroy();audio.music.resolve();audio.wind.resolve();await Promise.resolve();assert.ok(audio.music.paused&&audio.wind.paused);assert.equal(audio.music.src,'');assert.equal(audio.wind.src,'');assert.equal(audio.pending.size,0);
});
test('repeated cues are bounded; changing volume and effects updates playing cues',async t=>{
 const {audio}=setup(t);audio.configure(true,.4);audio.unlock();for(let i=0;i<20;i++)audio.cue('tea');assert.equal(audio.voices.size,1);
 audio.cue('lamp');audio.cue('incense');audio.cue('place');assert.equal(audio.voices.size,3);
 audio.configure(true,.1);assert.ok([...audio.voices].every(a=>a.volume<=.1));audio.configure(true,.1,true,{effects:false});assert.equal(audio.voices.size,0);
});
test('background music gently fades at loop boundary; silent levels stop its playback',t=>{
 const {audio}=setup(t);audio.configure(true,.4,true,{musicVolume:.5});audio.unlock();audio.fade=1;
 audio.music.currentTime=100;audio.update(0);const middle=audio.music.volume;audio.music.currentTime=.1;audio.update(0);assert.ok(audio.music.volume<middle*.1);
 audio.music.currentTime=193.9;audio.update(0);assert.ok(audio.music.volume<middle*.1);
 audio.configure(true,.4,true,{musicVolume:0});assert.equal(audio.music.paused,true);audio.configure(true,NaN);assert.ok(audio.wind.paused);assert.equal(audio.wind.volume,0);
});
