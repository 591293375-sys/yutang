import test from 'node:test';
import assert from 'node:assert/strict';
import {hitTestBottle} from '../src/themes/coast/bottle-renderer.js';
import {bottlePose,BottleLaunchEffects,BottlePointerInput,BOTTLE_LAUNCH_SECONDS} from '../src/themes/coast/bottle-interaction.js';
const incoming={id:'incoming-test',kind:'incoming',x:850,y:400,opacity:1,createdAt:0};

test('both visible incoming and sent bottles respond at their visible position',()=>{
 for(const kind of ['incoming','outgoing'])assert.equal(hitTestBottle(850,400,{bottles:[{...incoming,kind}]}),'incoming-test');
});

test('bottle targets retain at least 44 CSS pixels when the scene is scaled down',()=>{
 for(const cover of [.4,.65,.9,1.5])for(const mode of ['observe','catch']){
  assert.equal(hitTestBottle(850+20/cover,400,{bottles:[incoming]},{cover,time:0,mode}),'incoming-test');
 }
 assert.equal(hitTestBottle(950,500,{bottles:[incoming]},{cover:.4}),null);
});


test('the visible tilted neck and bob share the same pickup pose at any cover scale',()=>{
 for(const cover of [.4,.8,1.5])for(const time of [0,1.2,10,94])for(const reducedMotion of [false,true]){
  const pose=bottlePose(incoming,time,{reducedMotion}),x=pose.x+Math.sin(pose.angle)*21,y=pose.y-Math.cos(pose.angle)*21;
  assert.equal(hitTestBottle(x,y,{bottles:[incoming]},{cover,time,reducedMotion}),incoming.id);
 }
 assert.equal(hitTestBottle(850,400,{bottles:[{...incoming,opacity:0}]}),null);
});

test('launch arc is visual only, cannot be picked at its hidden water origin, and joins the drift once',()=>{
 const bottle={...incoming,kind:'outgoing'},origin={x:1080,y:720},effects=new BottleLaunchEffects(),original=JSON.stringify(bottle);
 assert.equal(effects.start(bottle,origin,10),true);assert.equal(effects.start(bottle,origin,10.1),false);
 const first=effects.pose(bottle,10),mid=effects.pose(bottle,10.45),land=effects.pose(bottle,10.9);
 assert.equal(first.x,origin.x);assert.equal(first.y,origin.y);assert.equal(first.airborne,true);
 assert.ok(mid.y<(origin.y+bottlePose(bottle,10.45).y)/2,'bottle rises above its straight travel segment');
 assert.equal(hitTestBottle(bottle.x,bottle.y,{bottles:[bottle]},{time:10.45,launches:effects}),null);
 assert.ok(Math.abs(land.x-bottle.x)<1e-8);assert.ok(Math.abs(land.y-bottlePose(bottle,10.9).y)<1e-8);assert.ok(Math.abs(land.splash)<1e-8);
 assert.equal(JSON.stringify(bottle),original,'animation may not modify stored bottle positions or letter fields');
 effects.update(10+BOTTLE_LAUNCH_SECONDS,[bottle]);assert.equal(effects.items.size,0);assert.equal(hitTestBottle(bottle.x,bottle.y,{bottles:[bottle]},{time:11.3,launches:effects}),bottle.id);
});

test('reduced motion settles gently without an arc and transient launch cleanup never replays',()=>{
 const bottle={...incoming,kind:'outgoing'},effects=new BottleLaunchEffects();effects.start(bottle,{x:1000,y:700},0,{reducedMotion:true});
 const mid=effects.pose(bottle,.1);assert.equal(mid.x,bottle.x);assert.equal(mid.y,bottle.y);assert.equal(mid.angle,-.42);assert.ok(mid.alpha<1);
 effects.clear();assert.equal(effects.pose(bottle,.2),null);effects.update(.3,[bottle]);assert.equal(effects.items.size,0);
 effects.start(bottle,{x:1000,y:700},1);effects.update(1.1,[]);assert.equal(effects.items.size,0,'removed bottles cannot leave orphan launch particles');
});

function gestureFixture(){
 const calls=[];let inside=true,paused=false,target=incoming.id;
 const input=new BottlePointerInput({hitTest:()=>target,isInside:()=>inside,isPaused:()=>paused,onTap:id=>calls.push(id)});
 const event=(x=100,y=200,id=1)=>({clientX:x,clientY:y,pointerId:id,button:0,buttons:1,isPrimary:true});
 return{input,event,calls,inside:value=>inside=value,paused:value=>paused=value,target:value=>target=value};
}

test('a bottle tap tolerates finger drift without becoming sand drawing or a second pickup',()=>{
 const f=gestureFixture();assert.equal(f.input.down(f.event()),true);f.input.move(f.event(109,203));assert.equal(f.input.up(f.event(109,203)),true);
 assert.deepEqual(f.calls,[incoming.id]);f.input.up(f.event());assert.equal(f.calls.length,1);
 f.input.down(f.event());f.input.move(f.event(130,200));f.input.up(f.event());assert.equal(f.calls.length,1,'a deliberate drag is not a bottle tap');
});

test('UI occlusion, pause, capture loss, another pointer, or a departed bottle cannot trigger pickup',()=>{
 for(const reason of ['ui','pause','capture','departed']){
  const f=gestureFixture();f.input.down(f.event());if(reason==='ui')f.inside(false);if(reason==='pause')f.paused(true);if(reason==='capture')f.input.cancel(1);if(reason==='departed')f.target(null);
  f.input.up(f.event());assert.equal(f.calls.length,0);assert.equal(f.input.active,false);
 }
 const f=gestureFixture();f.inside(false);assert.equal(f.input.down(f.event()),false);f.inside(true);f.input.down(f.event());assert.equal(f.input.up(f.event(100,200,2)),false);assert.equal(f.input.active,true);f.input.cancel();
});
