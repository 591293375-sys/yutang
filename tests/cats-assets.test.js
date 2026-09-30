import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CAT_PRESETS,CAT_PRESET_MAP,CAT_BACKGROUNDS,MISSING_PRESETS} from '../src/themes/cats/catalog.js';
import {excludeCatSourceArtPlugin,isCatSourceArt} from '../scripts/exclude-cat-source-art.js';

const asset=path=>new URL('../public/'+path,import.meta.url);
function webpInfo(b){
 assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');
 for(let i=12;i+8<b.length;){
  const id=b.toString('ascii',i,i+4),length=b.readUInt32LE(i+4),d=i+8;
  if(id==='VP8X')return {width:1+b.readUIntLE(d+4,3),height:1+b.readUIntLE(d+7,3),alpha:!!(b[d]&16)};
  if(id==='VP8 ')return {width:b.readUInt16LE(d+6)&0x3fff,height:b.readUInt16LE(d+8)&0x3fff,alpha:false};
  if(id==='VP8L'){const flags=b.readUInt32LE(d+1);return {width:(flags&0x3fff)+1,height:((flags>>>14)&0x3fff)+1,alpha:!!(flags&(1<<28))}}
  i=d+length+(length%2);
 }
 throw Error('Missing WebP image header');
}

test('sixteen real portrait presets keep twelve breed appearances and four domestic coats distinct',async()=>{
 assert.equal(CAT_PRESETS.length,16);assert.equal(Object.keys(CAT_PRESET_MAP).length,16);assert.equal(MISSING_PRESETS.length,0);
 assert.equal(new Set(CAT_PRESETS.map(p=>p.image)).size,16,'no repeated picture renamed as another breed');
 assert.equal(CAT_PRESETS.filter(p=>p.breed!=='domestic').length,12);assert.equal(CAT_PRESETS.filter(p=>p.breed==='domestic').length,4);
 for(const p of CAT_PRESETS){
  assert.match(p.image,/\.webp$/);assert.match(p.thumbnail,/\.webp$/);
  assert.deepEqual(webpInfo(await readFile(asset(p.image))),{width:768,height:768,alpha:true},p.id);
  assert.deepEqual(webpInfo(await readFile(asset(p.thumbnail))),{width:256,height:256,alpha:true},p.id+' thumbnail');
 }
});

test('new portraits retain normalized painting coordinates and independent source identities',async()=>{
 const ids=['persian','exotic-shorthair','bengal','abyssinian'],hashes=[];
 for(const id of ids){
  const p=CAT_PRESET_MAP[id];assert.equal(p.assetVersion,2);assert.deepEqual(p.sourceTransform,{side:1286,dx:16,dy:16});
  for(const r of Object.values(p.regions)){assert.equal(r.length,4);assert.ok(r.every(n=>n>=0&&n<=1));assert.ok(r[0]+r[2]<=1);assert.ok(r[1]+r[3]<=1)}
  assert.equal(p.protectedAreas.length,3);
  for(const pnt of [...p.protectedAreas,...p.symmetryAxis,p.anchor])assert.ok(pnt.x>0&&pnt.x<1&&pnt.y>0&&pnt.y<1);
  const source=await readFile(new URL('../docs/cat-art-v2/sources/'+id+'-source.png',import.meta.url));
  assert.equal(source.toString('ascii',1,4),'PNG');assert.equal(source.readUInt32BE(16),1254);assert.equal(source.readUInt32BE(20),1254);assert.equal(source[25],6,'RGBA source');
  hashes.push(source.subarray(33,1000).toString('base64'));
 }
 assert.equal(new Set(hashes).size,4);
});

test('all seasons and night reference actual-size generated artwork without pretending upscaled art is native 4K',async()=>{
 for(const season of ['spring','autumn','winter']){
  const info=webpInfo(await readFile(asset(CAT_BACKGROUNDS.seasons[season])));
  assert.deepEqual([info.width,info.height],[1672,941]);
 }
 const night=webpInfo(await readFile(asset(CAT_BACKGROUNDS.night)));assert.deepEqual([night.width,night.height],[1672,941]);
 assert.deepEqual(CAT_BACKGROUNDS.generatedPlateSize,{width:1672,height:941});
 for(const p of CAT_BACKGROUNDS.variants){const info=webpInfo(await readFile(asset(p.image)));assert.deepEqual([info.width,info.height],[p.width,p.height])}
});

test('the compressed new portrait and background set stays below four MiB and matches its manifest',async()=>{
 const manifest=JSON.parse(await readFile(asset('assets/cats/art-v2/manifest.json'),'utf8'));
 const urls=manifest.backgrounds.map(p=>p.image);
 for(const p of manifest.portraits)urls.push(CAT_PRESET_MAP[p.id].image,CAT_PRESET_MAP[p.id].thumbnail);
 const total=(await Promise.all(urls.map(async url=>(await stat(asset(url))).size))).reduce((a,b)=>a+b,0);
 assert.equal(urls.length,12);assert.equal(total,manifest.totalRuntimeBytes);assert.ok(total<4*1024*1024);
 for(const p of manifest.backgrounds){assert.equal(p.upscaled,false);assert.equal(p.width,1672);assert.equal(p.height,941)}
});

test('the actual build plugin removes source PNGs only from output, retaining optimized and source assets',async t=>{
 const root=await mkdtemp(join(tmpdir(),'cats-build-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const out=join(root,'bundle'),source=join(root,'public/assets/cats/art-v2/persian-source.png');
 const fixtures=['assets/cats/art-v2/persian-source.png','assets/cats/actions-v2/ragdoll-source.png','assets/cats/art-v2/persian.webp','assets/cats/art-v2/persian-thumb.webp','assets/cats/runtime-mask.png','assets/coast/example-source.png'];
 await mkdir(join(root,'public/assets/cats/art-v2'),{recursive:true});await writeFile(source,'original');
 for(const file of fixtures){await mkdir(join(out,file,'..'),{recursive:true});await writeFile(join(out,file),'fixture')}
 const plugin=excludeCatSourceArtPlugin();assert.equal(plugin.apply,'build');plugin.configResolved({root,build:{outDir:'bundle'}});await plugin.closeBundle();
 for(const file of fixtures)if(isCatSourceArt(file))await assert.rejects(access(join(out,file)),{code:'ENOENT'});else await access(join(out,file));
 assert.equal(await readFile(source,'utf8'),'original');
 const config=await readFile(new URL('../vite.config.js',import.meta.url),'utf8');assert.match(config,/excludeCatSourceArtPlugin\(\)/);
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert.ok(pkg.build.files.includes('dist/**/*'));assert.ok(!pkg.build.files.some(p=>p.includes('public/')||p.includes('docs/')));
});
