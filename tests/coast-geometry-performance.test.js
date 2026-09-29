import test from 'node:test';
import assert from 'node:assert/strict';
import {shoreLine,shoreDistance,waterBoundary,pointInPolygon,blockedAt,ROCKS} from '../src/themes/coast/geometry.js';
function referenceDistance(x,y,level){let best=Infinity;const line=shoreLine(level);for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.min(1,Math.max(0,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}return best;}
test('shore distance optimization preserves the original nearest-segment distance across tide levels',()=>{
 let seed=220229;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<2500;i++){const level=random(),x=-180+random()*1960,y=-150+random()*1230;assert.ok(Math.abs(shoreDistance(x,y,level)-referenceDistance(x,y,level))<1e-9);}
 for(const level of [0,.002,.23,.5,.998,1])for(const p of shoreLine(level)){assert.ok(shoreDistance(p.x,p.y,level)<1e-9);assert.ok(Math.abs(shoreDistance(p.x+8,p.y-8,level)-referenceDistance(p.x+8,p.y-8,level))<1e-9);}
});
test('cached water boundaries keep the same polygon as the shared shoreline without mixing tide levels',()=>{
 for(const level of [0,.1,.234,.7,1,0,.234]){const expected=[{x:-300,y:-300},...shoreLine(level),{x:-300,y:900}];assert.deepEqual(waterBoundary(level),expected);for(let x=0;x<=1600;x+=80)for(let y=0;y<=900;y+=60)assert.equal(pointInPolygon(x,y,waterBoundary(level)),pointInPolygon(x,y,expected));}
});

function referencePolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
test('indexed polygon rays and rock bounds preserve edge, vertex and random-point classifications',()=>{
 let seed=941;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(const level of [0,.002,.17,.398,.5,.816,.998,1]){const shape=waterBoundary(level);for(const p of shape)for(const offset of [-1e-8,0,1e-8])assert.equal(pointInPolygon(p.x+offset,p.y,shape),referencePolygon(p.x+offset,p.y,shape));for(let i=0;i<1500;i++){const x=-180+random()*1960,y=-150+random()*1230;assert.equal(pointInPolygon(x,y,shape),referencePolygon(x,y,shape));const expected=x<8||y<8||x>1592||y>892||ROCKS.some(poly=>referencePolygon(x,y,poly));assert.equal(blockedAt(x,y),expected);}}
 for(const poly of ROCKS)for(const p of poly)for(const offset of [-1e-8,0,1e-8]){const x=p.x+offset,y=p.y;assert.equal(blockedAt(x,y),x<8||y<8||x>1592||y>892||ROCKS.some(shape=>referencePolygon(x,y,shape)));}
});
