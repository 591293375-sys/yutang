import test from 'node:test';
import assert from 'node:assert/strict';
import {shadeAnimalPixels,submergeAnimalPixels} from '../src/themes/coast/art-materials.js';
import {SPECIES} from '../src/themes/coast/catalog.js';
import {deformSpritePixels} from '../src/themes/coast/animal-renderer.js';

const alpha=pixels=>Uint8Array.from({length:pixels.length/4},(_,i)=>pixels[i*4+3]);
const fixture=()=>{
 const width=48,height=32,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,d=Math.hypot((x-24)/19,(y-16)/11);
  pixels[i]=160+(x%3)*8;pixels[i+1]=110+(y%3)*5;pixels[i+2]=65;
  pixels[i+3]=Math.round(Math.max(0,Math.min(1,(1-d)*7))*255);
 }
 // Hard eye and dark stripe must not dissolve into a brightness wash.
 pixels.set([8,10,15,255],(16*width+34)*4);
 return{pixels,width,height,pad:4,artWidth:40,artHeight:24};
};

test('coast material caches retain every alpha byte including fine semi-transparent edges',()=>{
 const {pixels,width,height,artWidth,artHeight,pad}=fixture(),original=pixels.slice();
 for(const species of SPECIES){
  const lit=shadeAnimalPixels(pixels,width,height,artWidth,artHeight,pad,species),wet=submergeAnimalPixels(lit);
  assert.equal(lit.length,pixels.length);assert.deepEqual(alpha(lit),alpha(original));assert.deepEqual(alpha(wet),alpha(original));
  for(let i=0;i<pixels.length;i+=4)if(!pixels[i+3])assert.deepEqual(lit.slice(i,i+4),pixels.slice(i,i+4),'transparent RGB is never brought into the silhouette');
  assert.ok(lit[(16*width+34)*4]<15,'eye remains a dark anatomical feature');
 }
 assert.deepEqual(pixels,original,'original asset pixels are not mutated');
});

test('original deformation produces identical animation hit masks after the RGB-only material pass',()=>{
 const {pixels,width,height,artWidth,artHeight,pad}=fixture();
 for(const species of SPECIES){
  const lit=shadeAnimalPixels(pixels,width,height,artWidth,artHeight,pad,species);
  for(const phase of [0,.125,.25,.5,.875]){
   const oldFrame=deformSpritePixels(pixels,width,height,artWidth,artHeight,pad,species,phase);
   const newFrame=deformSpritePixels(lit,width,height,artWidth,artHeight,pad,species,phase);
   assert.deepEqual(alpha(newFrame),alpha(oldFrame),species.id+' phase '+phase);
  }
 }
});

test('body lighting is spatial rather than a uniform colour filter; water preserves local contrast',()=>{
 const width=32,height=24,pixels=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<pixels.length;i+=4)pixels.set([140,140,140,255],i);
 const lit=shadeAnimalPixels(pixels,width,height,width,height,0,SPECIES.find(s=>s.id==='crab'));
 const upper=(6*width+16)*4,lower=(19*width+16)*4;
 assert.ok(lit[upper]>lit[lower]+3,'restrained upper-body light gives volume');
 const wet=submergeAnimalPixels(new Uint8ClampedArray([45,45,45,255,210,210,210,128]));
 assert.ok(wet[2]>wet[0]&&wet[6]>wet[4],'water has clear blue transmission');
 assert.ok(wet[4]>wet[0]+60,'local markings and highlights remain distinct');
 assert.deepEqual([wet[3],wet[7]],[255,128]);
});
