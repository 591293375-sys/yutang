import test from 'node:test';
import assert from 'node:assert/strict';
import { SandDrawing, SandDrawingInput } from '../src/themes/coast/sand-drawing.js';
import { habitatAt } from '../src/themes/coast/geometry.js';

test('sand strokes sample the full path and never bridge water or rocks',()=>{
 const drawing=new SandDrawing();
 drawing.begin({x:1100,y:850},0,0);drawing.add({x:1580,y:850},0,0);drawing.end();
 assert.ok(drawing.segments.length>0);
 for(const s of drawing.segments){for(let i=0;i<=4;i++){const h=habitatAt(s.x1+(s.x2-s.x1)*i/4,s.y1+(s.y2-s.y1)*i/4,0);assert.equal(h.water,false);assert.equal(h.blocked,false);}assert.ok(Math.hypot(s.x2-s.x1,s.y2-s.y1)<=6.01);}
 assert.equal(drawing.begin({x:800,y:400},0,0),false);assert.equal(drawing.begin({x:60,y:60},0,0),false);
});

test('a wave irreversibly erodes sand marks and a falling tide cannot restore them',()=>{
 let coverage=0;const drawing=new SandDrawing({coverageAt:()=>coverage});drawing.begin({x:1100,y:850},0,0);drawing.add({x:1140,y:850},0,0);drawing.end();
 const ids=drawing.segments.map(s=>s.id);assert.ok(ids.length>0);drawing.update(.1,0,1);assert.ok(drawing.segments.every(s=>s.alpha===1));coverage=1;drawing.update(.1,0,2);assert.ok(drawing.segments.every(s=>s.alpha>0&&s.alpha<1));coverage=0;for(let i=0;i<20;i++)drawing.update(.1,0,3+i*.1);assert.equal(drawing.segments.length,0);drawing.update(.1,0,8);assert.equal(drawing.segments.length,0);
});

test('tide inundation clears marks even without a surf crest and stroke memory is capped',()=>{
 const drawing=new SandDrawing({maxSegments:40,coverageAt:()=>0});for(let i=0;i<15;i++){drawing.begin({x:1100,y:850},0,i);drawing.add({x:1140,y:850},0,i);drawing.end();}
 assert.equal(drawing.segments.length,40);assert.equal(new Set(drawing.segments.map(s=>s.id)).size,40);for(let i=0;i<30;i++)drawing.update(.1,1,20+i*.1);assert.equal(drawing.segments.length,0);
});

function fixture(){
 const calls={taps:[],captures:[],releases:[]};let mode='observe',paused=false,inside=true,protectedTarget=false;const drawing=new SandDrawing({coverageAt:()=>0});
 const input=new SandDrawingInput({drawing,toWorld:(x,y)=>({x,y}),getLevel:()=>0,getTime:()=>0,getMode:()=>mode,isPaused:()=>paused,isInside:()=>inside,hasTarget:()=>protectedTarget,onTap:(x,y)=>calls.taps.push({x,y}),capture:id=>calls.captures.push(id),release:id=>calls.releases.push(id)});
 const event=(x=1100,y=850,time=0,id=1)=>({pointerId:id,button:0,buttons:1,clientX:x,clientY:y,timeStamp:time,isPrimary:true});
 return{input,drawing,calls,event,mode:value=>mode=value,paused:value=>paused=value,inside:value=>inside=value,protectedTarget:value=>protectedTarget=value};
}

test('quick taps interact once while long observe drags only draw after both thresholds',()=>{
 const f=fixture();f.input.down(f.event());f.input.up(f.event(1101,850,90));f.input.up(f.event(1101,850,100));assert.equal(f.calls.taps.length,1);assert.equal(f.drawing.segments.length,0);
 f.input.down(f.event(1100,850,200));f.input.move(f.event(1120,850,300));assert.equal(f.drawing.segments.length,0);f.input.move(f.event(1140,850,390));assert.ok(f.drawing.segments.length>0);f.input.up(f.event(1140,850,500));assert.equal(f.calls.taps.length,1);assert.equal(f.input.active,false);assert.deepEqual(f.calls.releases,[1,1]);
});

test('catch mode and animal clues retain short taps and never become drawing gestures',()=>{
 for(const kind of ['catch','animal']){const f=fixture();if(kind==='catch')f.mode('catch');else f.protectedTarget(true);f.input.down(f.event());f.input.up(f.event(1100,850,100));assert.equal(f.calls.taps.length,1);f.input.down(f.event(1100,850,200));f.input.move(f.event(1140,850,500));f.input.up(f.event(1140,850,600));assert.equal(f.calls.taps.length,1);assert.equal(f.drawing.segments.length,0);}
});

test('cancel, leaving canvas, pause and mode changes release capture without clicking',()=>{
 for(const reason of ['cancel','outside','pause','mode']){const f=fixture();f.input.down(f.event());if(reason==='cancel')f.input.cancel();if(reason==='outside')f.inside(false);if(reason==='pause')f.paused(true);if(reason==='mode')f.mode('catch');f.input.move(f.event(1130,850,250));f.input.up(f.event(1130,850,300));assert.equal(f.input.active,false);assert.equal(f.calls.taps.length,0);assert.equal(f.drawing.segments.length,0);assert.deepEqual(f.calls.releases,[1]);}
});

test('another pointer cannot finish a stroke and gestures are cancelled when the left button is lost',()=>{
 const f=fixture();f.input.down(f.event());f.input.up(f.event(1100,850,80,2));assert.equal(f.input.active,true);f.input.move({...f.event(1120,850,220),buttons:0});assert.equal(f.input.active,false);assert.equal(f.calls.taps.length,0);f.input.cancel();assert.equal(f.calls.releases.length,1);
});
