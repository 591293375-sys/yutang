import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANOPY_BOUNDS,CANOPY_MASKS,alphaSampler,coverageSampler} from '../src/themes/cats/canopy.js';
function webpInfo(b){
 assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');
 for(let i=12;i+8<b.length;){const id=b.toString('ascii',i,i+4),length=b.readUInt32LE(i+4),d=i+8;if(id==='VP8X')return{width:1+b.readUIntLE(d+4,3),height:1+b.readUIntLE(d+7,3),alpha:!!(b[d]&16)};if(id==='VP8L'){const f=b.readUInt32LE(d+1);return{width:(f&0x3fff)+1,height:((f>>>14)&0x3fff)+1,alpha:!!(f&(1<<28))}}i=d+length+(length%2)}throw Error('Missing lossless WebP header');
}
test('each season has its own aligned transparent canopy mask, not a solid polygon',async()=>{
 const hashes=[];let bytes=0;for(const file of Object.values(CANOPY_MASKS)){const b=await readFile(new URL('../public/'+file,import.meta.url));assert.deepEqual(webpInfo(b),{width:1028,height:432,alpha:true});hashes.push(createHash('sha256').update(b).digest('hex'));bytes+=b.length}assert.equal(new Set(hashes).size,4);assert.ok(bytes<128*1024);assert.equal(CANOPY_BOUNDS.width,1028/1920);assert.equal(CANOPY_BOUNDS.height,432/1080);
});
test('precise hit alpha leaves a gap clickable while blocking only opaque leaves',()=>{
 const raw=new Uint8Array([0,255,255,0]),sample=alphaSampler(raw,2,2,{x:.2,y:.1,width:.4,height:.4});
 assert.ok(sample(.3,.2)<1e-10);assert.ok(sample(.5,.2)>.999);assert.ok(sample(.5,.4)<1e-10);assert.equal(sample(.7,.2),0);assert.equal(sample(.1,.1),0);assert.ok(Math.abs(sample(.4,.3)-.5)<1e-8);
});
test('the lighting coverage averages leaf pixels and changes continuously without affecting hit alpha',()=>{
 const width=96,height=48,raw=Uint8Array.from({length:width*height},(_,i)=>i%2?255:0),bounds={x:0,y:0,width:1,height:1};
 const smooth=coverageSampler(raw,width,height,bounds),exact=alphaSampler(raw,width,height,bounds);
 assert.ok(Math.abs(smooth(.4,.4)-.5)<.01);assert.ok(Math.abs(smooth(.4001,.4)-smooth(.4,.4))<.002);
 assert.equal(exact(38.5/96,20.5/48),0);assert.equal(exact(39.5/96,20.5/48),1);
 assert.equal(smooth(1.2,.4),0);assert.equal(smooth(.4,1),0);assert.ok(smooth(.4,.999)<.01,'cropped bottom cannot create a hard light boundary');
});
