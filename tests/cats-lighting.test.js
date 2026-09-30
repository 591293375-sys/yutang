import test from 'node:test';
import assert from 'node:assert/strict';
import {courtyardLight,contactShadow,groundedBodyShadow} from '../src/themes/cats/lighting.js';

test('tree shelter shades the cat and softens its cast shadow independently of night',()=>{
 const sun=courtyardLight({x:.65,y:.65}),tree=courtyardLight({x:.33,y:.28},0,.8);
 assert.ok(tree.brightness<sun.brightness-.08);
 assert.ok(tree.castOpacity<sun.castOpacity*.7);
 const night=courtyardLight({x:.65,y:.65},1);
 assert.ok(night.brightness<sun.brightness&&night.brightness>.5);
 assert.ok(night.shadowX<0&&sun.shadowX>0);
 assert.ok(courtyardLight({x:.33,y:.28},1,1).brightness>.45);
});
test('light changes continuously over small ground movements',()=>{
 for(let i=1;i<300;i++){
  const a=courtyardLight({x:.2+(i-1)/600,y:.34}),b=courtyardLight({x:.2+i/600,y:.34});
  assert.ok(Math.abs(a.brightness-b.brightness)<.005);
 }
});
test('lifted paws keep shadows on the ground and fade them while planted feet stay connected',()=>{
 const light=courtyardLight({x:.5,y:.5}),paw={x:12,y:-22,groundX:12,groundY:-15,planted:true,lift:0};
 const planted=contactShadow(paw,120,light),raised=contactShadow({...paw,y:-30,planted:false,lift:.08},120,light);
 assert.equal(raised.y,planted.y);assert.ok(raised.opacity<planted.opacity*.3);assert.ok(raised.rx>planted.rx);
 assert.ok(contactShadow(paw,120,light,40).opacity<planted.opacity*.3);
});
test('torso shadow follows the ground support polygon instead of floating at the sprite edge',()=>{
 const light=courtyardLight({x:.5,y:.5});
 const paws=[[-10,-8],[10,-14],[-18,-32],[4,-38]].map(([x,y])=>({groundX:x,groundY:y,x,y:y-4}));
 const shadow=groundedBodyShadow(paws,100,light),shifted=groundedBodyShadow(paws.map(p=>({...p,groundY:p.groundY-30})),100,light);
 assert.ok(Math.abs(shifted.y-shadow.y+30)<1e-9);assert.ok(shadow.y<-15);assert.ok(shadow.rx>=20&&shadow.ry>=5);
 assert.ok(groundedBodyShadow(paws,100,light,30).opacity<shadow.opacity);
 assert.equal(groundedBodyShadow([],100,light).opacity,0);
});
