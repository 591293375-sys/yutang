import test from 'node:test';import assert from 'node:assert/strict';
import {compositeToadPoses} from '../src/themes/caiyuan/toad-pose.js';
// Minimal premultiplied compositor for the opacity invariant; real decoded PNG
// coverage and interrupted transitions are also checked in the Electron audit.
function context(){return {canvas:{width:1,height:1},pixel:[0,0,0,0],globalAlpha:1,globalCompositeOperation:'source-over',
 clearRect(){this.pixel=[0,0,0,0]},save(){this.saved=[this.globalAlpha,this.globalCompositeOperation]},restore(){[this.globalAlpha,this.globalCompositeOperation]=this.saved},
 drawImage(image){const source=image.map(v=>v*this.globalAlpha);this.pixel=this.pixel.map((v,i)=>Math.min(1,source[i]+v*(this.globalCompositeOperation==='lighter'?1:1-source[3])))}
}}
test('a shared opaque body remains opaque through every transition phase',()=>{
 const g=context();for(let n=0;n<=120;n++){const t=n/120;compositeToadPoses(g,[.7,.5,.2,1],[.6,.4,.1,1],t);assert.ok(Math.abs(g.pixel[3]-1)<1e-12);assert.ok(Math.abs(g.pixel[0]-(.7-.1*t))<1e-12)}
});
test('translucent edges interpolate once without dark halos or opacity overshoot',()=>{
 const g=context();for(let n=0;n<=100;n++){const t=n/100;compositeToadPoses(g,[.2,.1,.04,.3],[.4,.2,.08,.6],t);assert.ok(Math.abs(g.pixel[3]-(.3+.3*t))<1e-12);assert.ok(g.pixel.every(v=>v>=0&&v<=1));assert.equal(g.globalAlpha,1);assert.equal(g.globalCompositeOperation,'source-over')}
});
