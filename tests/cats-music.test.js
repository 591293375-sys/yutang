import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CatMusic,CAT_MUSIC_FILE} from '../src/themes/cats/music.js';
import {normalizeCats} from '../src/themes/cats/storage.js';
function fixture(){
 const pending=[];const track={paused:true,currentTime:10,duration:182,volume:0,plays:0,pauses:0,
  play(){this.plays++;this.paused=false;return new Promise((resolve,reject)=>pending.push({resolve,reject}))},
  pause(){this.pauses++;this.paused=true},removeAttribute(){this.src=''},load(){this.released=true}};
 const music=new CatMusic(src=>{track.src=src;return track});return {music,track,pending};
}
test('music waits for interaction, streams one local loop and stays quiet beneath cat responses',async()=>{
 const {music,track,pending}=fixture();music.configure(true,.6);assert.equal(track.plays,0);
 music.unlock();assert.equal(track.plays,1);assert.equal(track.loop,true);assert.equal(track.preload,'none');assert.match(track.src,/courtyard-music\.m4a$/);
 for(let i=0;i<80;i++){music.configure(true,.6);music.update(.1)}assert.equal(track.plays,1);assert.ok(track.volume>0&&track.volume<.16);
 pending[0].resolve();await Promise.resolve();const full=track.volume;
 for(let i=0;i<40;i++)music.update(.1,true);assert.ok(track.volume<full*.6);assert.ok(track.volume>full*.5);
 music.configure(true,.6,{music:false});assert.equal(track.paused,true);assert.equal(track.volume,0);music.destroy();
});
test('late play resolution after mute, pause or destruction never leaves music running',async()=>{
 for(const stop of [m=>m.configure(false,.4),m=>m.configure(true,0),m=>m.stop(),m=>m.destroy()]){
  const {music,track,pending}=fixture();music.configure(true,.4);music.unlock();stop(music);pending[0].resolve();await Promise.resolve();
  assert.equal(track.paused,true);assert.equal(track.volume,0);assert.equal(music.pending,null);music.destroy();assert.equal(track.src,'');assert.equal(track.released,true);
 }
});
test('autoplay denial is not retried every frame; a new gesture can resume with a fresh fade',async()=>{
 const {music,track,pending}=fixture();music.configure(true,.4);music.unlock();pending[0].reject(Object.assign(new Error('gesture required'),{name:'NotAllowedError'}));track.paused=true;await new Promise(r=>setImmediate(r));
 for(let i=0;i<60;i++)music.configure(true,.4);assert.equal(track.plays,1);assert.equal(music.status,'waiting');
 music.unlock();assert.equal(track.plays,2);pending[1].resolve();await Promise.resolve();music.update(.1);assert.ok(track.volume<.005);
 music.stop();music.configure(true,.4);assert.equal(track.plays,3);assert.equal(music.fade,0);music.destroy();
});
test('music preferences upgrade old courtyard saves without changing cats, props or existing effects',()=>{
 const old={version:1,cats:[],props:[],nextId:8,environment:{season:'winter',time:'night',particles:false,fireflies:false}};
 const a=normalizeCats(old);assert.deepEqual(a.environment,{...old.environment,music:true,musicVolume:.35});
 const b=normalizeCats({...a,environment:{...a.environment,music:false,musicVolume:.15}});
 assert.equal(b.environment.music,false);assert.equal(b.environment.musicVolume,.15);assert.deepEqual(b.cats,a.cats);assert.deepEqual(b.props,a.props);
 assert.equal(normalizeCats({...a,environment:{musicVolume:NaN}}).environment.musicVolume,.35);
 const data=readFileSync(new URL('../public/'+CAT_MUSIC_FILE,import.meta.url));assert.match(data.toString('ascii',4,12),/ftyp/);assert.ok(data.length<4_000_000);
});
