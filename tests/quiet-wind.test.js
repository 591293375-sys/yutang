import test from 'node:test';
import assert from 'node:assert/strict';
import {AmbientMixer} from '../src/audio/ambient.js';
function fixture(t){
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const previous=globalThis.window;globalThis.window=new EventTarget();
 class Media extends EventTarget{paused=true;volume=0;currentTime=0;duration=45;play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}}
 const media=Object.fromEntries(['stream','rain','wind','thunder'].map(id=>[id,new Media()]));
 const mixer=new AmbientMixer(media,()=>{},()=>0),configure=changes=>mixer.configure({enabled:true,volume:.3,weather:'sunny',season:'autumn',...changes});
 t.after(()=>{mixer.destroy();globalThis.window=previous});return {media,mixer,configure};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
const advance=async(t,ms)=>{for(let n=0;n<ms;n+=50){t.mock.timers.tick(Math.min(50,ms-n));await settle()}};
test('wind leaves long quiet gaps and plays only brief gusts, while water keeps flowing',async t=>{
 const {media,configure}=fixture(t);configure();await settle();await advance(t,50000);await settle();
 assert.equal(media.wind.paused,true,'wind must not be a continuous hiss');assert.equal(media.wind.volume,0);assert.equal(media.stream.paused,false);
 await advance(t,12000);await settle();await advance(t,1500);await settle();assert.equal(media.wind.paused,false);assert.ok(media.wind.volume>0);
 await advance(t,12000);await settle();assert.equal(media.wind.paused,true);assert.equal(media.wind.volume,0);
 await advance(t,60000);await settle();assert.equal(media.wind.paused,true,'no frequent repeated wind');assert.equal(media.stream.paused,false);
});
test('muting, weather changes and disposing cancel an active or scheduled gust',async t=>{
 const {media,mixer,configure}=fixture(t);configure();await settle();await advance(t,62000);await settle();await advance(t,1500);assert.equal(media.wind.paused,false);
 configure({weather:'rainy'});await settle();await advance(t,4000);assert.equal(media.wind.paused,true);
 configure({volume:0});await settle();await advance(t,240000);await settle();assert.ok(Object.values(media).every(a=>a.paused&&a.volume===0));
 configure();await settle();configure({enabled:false});await advance(t,240000);await settle();assert.ok(Object.values(media).every(a=>a.paused&&a.volume===0));
 configure();await settle();mixer.destroy();await advance(t,240000);await settle();assert.ok(Object.values(media).every(a=>a.paused&&a.volume===0));
});
