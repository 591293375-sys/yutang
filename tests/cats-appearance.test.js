import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAppearance,pointInCatCanvas,mirrorCatPoint} from '../src/themes/cats/appearance.js';
const stroke={color:'#aabbcc',size:.025,erase:false,region:'body',symmetric:true,points:[{x:.4,y:.5},{x:.6,y:.55}]};
test('cat appearance persists normalized source coordinates, with a detached validated snapshot',()=>{
  const source={version:1,strokes:[structuredClone(stroke)]};
  const restored=validateAppearance(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(restored,source);source.strokes[0].points[0].x=.1;assert.equal(restored.strokes[0].points[0].x,.4);
});
test('cat paint import rejects incompatible versions, unsupported colors and unbounded input',()=>{
  for(const bad of [{version:2,strokes:[]},{version:1,strokes:[{...stroke,color:'url(https://example.com)'}]},{version:1,strokes:[{...stroke,size:10}]},{version:1,strokes:[{...stroke,region:'unknown'}]},{version:1,strokes:[{...stroke,points:[{x:Infinity,y:.5}]}]},{version:1,strokes:[{...stroke,points:[{x:1.2,y:.5}]}]},{version:1,strokes:Array.from({length:301},()=>stroke)}])assert.throws(()=>validateAppearance(bad));
  assert.deepEqual(validateAppearance(null),{version:1,strokes:[]});
});
test('source-coordinate painting remains stable through canvas zoom and pan',()=>{
  assert.deepEqual(pointInCatCanvas(250,180,{left:100,top:80,width:300,height:200}),{x:.5,y:.5});
  assert.deepEqual(pointInCatCanvas(460,370,{left:10,top:70,width:900,height:600}),{x:.5,y:.5});
  assert.equal(pointInCatCanvas(0,0,{left:100,top:80,width:300,height:200}),null);
});
test('symmetry reflects around the cat body axis rather than the screen vertical',()=>{
  const axis=[{x:.2,y:.7},{x:.8,y:.3}],point={x:.5,y:.6};
  const mirror=mirrorCatPoint(point,axis),again=mirrorCatPoint(mirror,axis);
  assert.ok(Math.abs(again.x-point.x)<1e-12&&Math.abs(again.y-point.y)<1e-12);
  assert.notEqual(mirror.x,1-point.x);
  assert.deepEqual(mirrorCatPoint({x:.25,y:.4}),{x:.75,y:.4});
});
