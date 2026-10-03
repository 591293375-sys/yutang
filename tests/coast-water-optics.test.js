import test from 'node:test';
import assert from 'node:assert/strict';
import {fillCoastOpticalPixels} from '../src/themes/coast/water.js';

const smooth=(a,b,n)=>{const t=Math.min(1,Math.max(0,(n-a)/(b-a)));return t*t*(3-2*t);};
// Reference is the continuous material formula used before the lookup cache.
// It protects shore transparency and the current deep-water colour, including
// wet sand while receding, rather than asserting the cache's implementation.
function originalPixel(water,distance,wasWet,peakDistance){
  const depth=water?Math.max(0,(distance-.5)*4):0;
  const wa=water?smooth(0,16,depth)*(.44+.46*smooth(30,480,depth)):0;
  const wet=wasWet ? .12*smooth(0,34,peakDistance*4)*(1-smooth(0,52,depth)) : 0;
  const alpha=wa+wet*(1-wa),q=alpha?wa/alpha:0,optical=smooth(22,420,depth);
  return [Math.round(144*(1-q)+(37-optical*29)*q),Math.round(134*(1-q)+(166-optical*100)*q),Math.round(101*(1-q)+(179-optical*93)*q),Math.round(alpha*255),water?Math.round(smooth(0,32,depth)*(.3+.7*smooth(20,340,depth))*255):0];
}

test('optical cache stays within one RGBA byte of the approved continuous material',()=>{
  const n=60000,mask=new Uint8Array(n),inside=new Float32Array(n),peak=new Uint8Array(n),peakDistance=new Float32Array(n);
  for(let i=0;i<n;i++){mask[i]=i%5?1:0;inside[i]=.5+(i%30000)/137;peak[i]=i%3?1:0;peakDistance[i]=(i%4000)/37;}
  const inputCopies=[mask.slice(),inside.slice(),peak.slice(),peakDistance.slice()];
  for(const recession of [false,true]){
    const pixels=new Uint8ClampedArray(n*4),texture=new Uint8ClampedArray(n*4);
    fillCoastOpticalPixels(pixels,texture,mask,inside,recession?peak:null,recession?peakDistance:null);
    for(let i=0;i<n;i++){
      const ref=originalPixel(mask[i],inside[i],recession&&peak[i],peakDistance[i]);
      for(let c=0;c<4;c++)assert.ok(Math.abs(ref[c]-pixels[i*4+c])<=1,`pixel ${i}, channel ${c}`);
      assert.ok(Math.abs(ref[4]-texture[i*4+3])<=1,`texture ${i}`);
    }
  }
  [mask,inside,peak,peakDistance].forEach((a,i)=>assert.deepEqual(a,inputCopies[i]));
});

test('dry ground remains transparent and saturated deep water remains stable',()=>{
  const pixels=new Uint8ClampedArray(12),texture=new Uint8ClampedArray(12);
  fillCoastOpticalPixels(pixels,texture,new Uint8Array([0,1,1]),new Float32Array([700,120.5,700]),null,null);
  assert.equal(pixels[3],0);assert.equal(texture[3],0);
  assert.deepEqual([...pixels.slice(4,8)],[8,66,86,230]);
  assert.deepEqual([...pixels.slice(4,8)],[...pixels.slice(8,12)]);
  assert.equal(texture[7],255);assert.equal(texture[11],255);
});
