'use strict';
// Real-renderer regression for exposed stone artwork, shared masks and resizing.
// Isolated profile: never changes the user's tide, creatures or collections.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {_electron}=require('@playwright/test');
const {readScene}=require('./coast-scene-2.3-smoke.cjs');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),label=packaged?'packaged':'dev';
const work=process.env.POND_TEST_WORK||path.join(root,'work/coast-rocks-2.4.1');
async function check(){
 fs.mkdirSync(work,{recursive:true});const profile=fs.mkdtempSync(path.join(work,'profile-'));
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL='http://127.0.0.1:5188/';
 const app=await _electron.launch({executablePath:packaged?path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池'):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env});
 try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.setIgnoreMouseEvents(true)));
 await page.waitForSelector('.pond-canvas');const cdp=await page.context().newCDPSession(page);
 await page.addInitScript(()=>{localStorage.setItem('mofish-theme',JSON.stringify('coast'));localStorage.setItem('fusheng-settings',JSON.stringify({season:'spring',weather:'sunny',day:'day',quality:'high',sound:false}));const level=Number(sessionStorage.getItem('rock-tide')||0),offset=level===0?1500000:level===1?600000:Math.acos(1-2*level)/Math.PI*600000;localStorage.setItem('mofish-coast-v1',JSON.stringify({version:1,epochMs:Date.now()-offset,nextId:1,entities:[],catalog:{},shells:0,rescues:0}));});
 const {habitatAt}=await import(pathToFileURL(path.join(root,'src/themes/coast/geometry.js')));
 const cases=[];
 for(const [level,width,height] of [[0,1332,887],[.25,1332,887],[.5,1332,887],[1,1332,887],[.5,1920,1080],[0,800,900]]){
 await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:false});
 await page.evaluate(value=>sessionStorage.setItem('rock-tide',String(value)),level);await page.reload();await page.waitForSelector('.theme-coast');
 for(let i=0;i<200;i++){const s=await page.evaluate(readScene);if(s.ready&&s.sandReady&&s.sprites===17&&s.stats.cssWidth===width)break;if(i===199)throw Error('Not ready');await page.waitForTimeout(30)}
 const samples=await page.evaluate(()=>{
 const c=document.querySelector('.coast-canvas'),key=Object.keys(c).find(k=>k.startsWith('__reactFiber$'));let r;
 for(let f=c[key];f&&!r;f=f.return)for(let h=f.memoizedState;h&&typeof h==='object';h=h.next){if(h.memoizedState?.current?.renderer){r=h.memoizedState.current.renderer;break}}
 const expected=document.createElement('canvas');expected.width=c.width;expected.height=c.height;const e=expected.getContext('2d');r.worldTransform(e);e.imageSmoothingEnabled=r.ctx.imageSmoothingEnabled;e.imageSmoothingQuality=r.ctx.imageSmoothingQuality;e.drawImage(r.sandCache,0,0,1600,900);
 const probe=document.createElement('canvas').getContext('2d');
 const points=[[620,510],[537,594],[299,602],[453,677],[836,654],[787,705],[638,718],[1134,451],[1225,511],[1047,361],[1388,424]];
 return points.flatMap(([px,py])=>{const x=px*1600/1672,y=py*900/941,sx=Math.round((x*r.cover+r.offsetX)*r.scale),sy=Math.round((y*r.cover+r.offsetY)*r.scale);if(sx<0||sy<0||sx>=c.width||sy>=c.height)return[];const a=r.ctx.getImageData(sx,sy,1,1).data,b=r.backgroundCtx.getImageData(sx,sy,1,1).data,d=e.getImageData(sx,sy,1,1).data,shown=Array.from(a).slice(0,3).map((v,i)=>Math.round(v*a[3]/255+b[i]*(1-a[3]/255)));return[{x,y,blocked:probe.isPointInPath(r.rocksPath,x,y),shown,expected:Array.from(d).slice(0,3),difference:Math.max(...shown.map((v,i)=>Math.abs(v-d[i])))}]});
 });
 assert.ok(samples.length>=5,'multiple visible stone faces must be checked');
 for(const s of samples){assert.equal(s.blocked,true);assert.ok(s.difference<=1,`Water tinted the exposed stone: ${JSON.stringify(s)}`)}
 const scene=await page.evaluate(readScene,{mask:true});
 assert.equal(scene.stats.width,width*2);assert.equal(scene.stats.height,height*2);
 for(const p of scene.points){const expected=habitatAt(p.x,p.y,scene.renderLevel);if(expected.distance<1)continue;assert.equal(p.blocked,expected.blocked);assert.equal(p.water,expected.water)}
 const screenshot=path.join(work,`${label}-${width}x${height}-level-${level}.png`);await page.screenshot({path:screenshot});
 cases.push({level,actualLevel:scene.tide.level,canvas:[scene.stats.width,scene.stats.height],samples,maskSamples:scene.points.length,screenshot});
 }
 assert.deepEqual(errors,[]);const report={result:'PASS',packaged,isolatedProfile:true,cases,errors};fs.writeFileSync(path.join(work,`${label}-rock-render.json`),JSON.stringify(report,null,2));console.log(JSON.stringify({result:'PASS',packaged,cases:cases.map(c=>({level:c.level,canvas:c.canvas,rocks:c.samples.length,maxRockPixelError:Math.max(...c.samples.map(s=>s.difference)),maskSamples:c.maskSamples}))},null,2));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
check().catch(e=>{console.error(e);process.exitCode=1});
