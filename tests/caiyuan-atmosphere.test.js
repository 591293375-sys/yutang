import test from 'node:test';
import assert from 'node:assert/strict';
import {smokeFlow} from '../src/themes/caiyuan/smoke.js';
import {CaiyuanModel} from '../src/themes/caiyuan/model.js';
import {windAt,flamePose,advanceMotion,curtainOffset,CURTAINS} from '../src/themes/caiyuan/atmosphere.js';

test('wind alternates direction continuously, with long rests between curtain gusts',()=>{
 let left=false,right=false,rest=0,last=windAt(0);
 for(let t=.02;t<100;t+=.02){const w=windAt(t);assert.ok(Math.abs(w.drift)<=1);assert.ok(Math.abs(w.drift-last.drift)<.02);assert.ok(Math.abs(w.gust-last.gust)<.02);left ||=w.drift<-.25;right ||=w.drift>.25;rest+=w.gust===0?1:0;last=w;}
 assert.ok(left&&right);assert.ok(rest>2000);
});
test('paused motion preserves its exact phase and low-motion keeps a slower continuous phase',()=>{
 assert.equal(advanceMotion(8,.1,{paused:true}),8);
 assert.equal(advanceMotion(8,.04,{reducedMotion:true}),8.008);
 assert.equal(advanceMotion(8,.04,{}),8.04);
});
test('flame base and smoke origin remain pinned while the upper tips respond to wind',()=>{
 for(let t=0;t<60;t+=.1){const f=flamePose(t,.3);assert.ok(f.height>.8&&f.height<1.2);assert.ok(Math.abs(f.lean)<.15);assert.ok(f.glow>.8&&f.glow<1.2);assert.equal(smokeFlow(0,t,1).x,0);}
 const tips=Array.from({length:60},(_,t)=>smokeFlow(1,t,1).x);assert.ok(Math.max(...tips)>12&&Math.min(...tips)<-12);
});
test('cloth mesh boundaries and architectural points stay fixed',()=>{
 for(const patch of CURTAINS){for(const [u,v] of [[0,.5],[1,.5],[.5,0],[.5,1]])assert.deepEqual(curtainOffset(patch,u,v,5),{x:0,y:0});}
 assert.deepEqual(curtainOffset(CURTAINS[0],.97,.88,5),{x:0,y:0});
});
test('extinguishing midway preserves the emission height until tail smoke fades',()=>{
 const now=1e9,m=new CaiyuanModel(null,now),b=m.state.items[0];m.command('ignite',{id:b.id,minutes:3},now);
 m.command('extinguish',b.id,now+90000);assert.equal(m.effects.at(-1).progress,.5);
 m.command('extinguish',b.id,now+90050);assert.equal(m.effects.length,1);
 m.command('ignite',{id:b.id},now+90100);assert.equal(m.effects.length,0);
});
test('music and effects settings persist without replacing older preferences or saves',()=>{
 const m=new CaiyuanModel();m.command('settings',{music:false,effects:false,musicVolume:.27});
 const restored=new CaiyuanModel(m.snapshot());assert.equal(restored.state.settings.music,false);assert.equal(restored.state.settings.effects,false);assert.equal(restored.state.settings.musicVolume,.27);
 const old=m.snapshot();delete old.settings.music;delete old.settings.effects;delete old.settings.musicVolume;old.settings.volume=.23;
 const upgraded=new CaiyuanModel(old);assert.equal(upgraded.state.settings.volume,.23);assert.equal(upgraded.state.settings.music,true);assert.deepEqual(upgraded.state.items,old.items);
});
test('tea produces one interaction cue, failed targets produce none',()=>{
 const m=new CaiyuanModel();m.command('tea','missing');assert.equal(m.events.length,0);m.command('tea',m.state.items.find(i=>i.kind==='cup').id);assert.deepEqual(m.events,['tea']);
});
