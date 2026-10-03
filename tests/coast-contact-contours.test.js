import test from 'node:test';
import assert from 'node:assert/strict';
import {materialContactContours,contactWave} from '../src/themes/coast/contact-contours.js';

function fixture(){
  const width=180,height=120,pixels=new Uint8ClampedArray(width*height*4);
  // A concave reef with a narrow water inlet: the old 32-pixel rectangle
  // admission test dropped this whole inlet and left detached white patches.
  for(let y=15;y<105;y++)for(let x=15;x<165;x++){
    if(x>68&&x<112&&y<80)continue;
    const i=(y*width+x)*4;pixels[i]=62;pixels[i+1]=78;pixels[i+2]=89;pixels[i+3]=255;
  }
  return {width,height,pixels};
}

test('optical contact follows both sides and the bottom of a concave water inlet',()=>{
  const {pixels,width,height}=fixture();
  const contours=materialContactContours(pixels,width,height,{worldWidth:width,worldHeight:height,spacing:3,minArea:30});
  assert.equal(contours.length,1);
  const points=contours[0].points;
  assert.ok(points.some(p=>p.x>67&&p.x<73&&p.y>30&&p.y<65),'left wet face is retained');
  assert.ok(points.some(p=>p.x>107&&p.x<115&&p.y>30&&p.y<65),'right wet face is retained');
  assert.ok(points.some(p=>p.x>78&&p.x<103&&p.y>75&&p.y<83),'inner concave end is retained');
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length];
    assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<8,'a continuous shoreline has no rectangular-patch-sized gap');
    assert.ok(Math.abs(Math.hypot(p.nx,p.ny)-1)<1e-6);
  }
});

test('contact material generation does not mutate visible rock alpha or colour',()=>{
  const {pixels,width,height}=fixture(),original=pixels.slice();
  materialContactContours(pixels,width,height,{worldWidth:width,worldHeight:height,minArea:30});
  assert.deepEqual(pixels,original);
});

test('small isolated grains do not receive oversized foam outlines',()=>{
  const width=60,height=40,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=15;y<18;y++)for(let x=25;x<28;x++)pixels[(y*width+x)*4+3]=255;
  assert.equal(materialContactContours(pixels,width,height,{worldWidth:width,worldHeight:height,minArea:100}).length,0);
});

test('contact swell advances smoothly, varies around a reef and freezes for reduced motion',()=>{
  let min=Infinity,max=-Infinity;
  for(let time=0;time<30;time+=1/60){
    const a=contactWave(40,time,.9),b=contactWave(40,time+1/60,.9);
    min=Math.min(min,a.distance);max=Math.max(max,a.distance);
    assert.ok(Math.abs(a.distance-b.distance)<.05,'no wrap/reset flash');
    assert.ok(a.distance>=1.5&&a.distance<=6.1);
    assert.ok(a.opacity>0&&a.opacity<.35);
  }
  assert.ok(max-min>3,'the contact actually flows instead of only changing alpha');
  assert.notDeepEqual(contactWave(20,7),contactWave(180,7));
  assert.deepEqual(contactWave(70,2,.5,true),contactWave(70,200,.5,true));
});
