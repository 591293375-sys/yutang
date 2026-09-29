'use strict';
// Isolated own-app verification. Real RAF and canvas rendering; Date-only tide fixtures.
// node electron/coast-scene-2.3-smoke.cjs [--packaged]
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),{_electron}=require('@playwright/test');
const {measureCoastAnimalAnimation}=require('./coast-animation-probe.cjs');
const packaged=process.argv.includes('--packaged'),label=packaged?'packaged':'dev';
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const work=process.env.POND_TEST_WORK||path.join(root,'work/coast-v2.3'),out=process.env.POND_TEST_OUTPUT||path.join(work,'screenshots');
const seeded=(seed=230)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
function readScene({mask=false}={}){
 const canvas=document.querySelector('.coast-canvas'),key=Object.keys(canvas||{}).find(k=>k.startsWith('__reactFiber$'));
 for(let fiber=canvas?.[key];fiber;fiber=fiber.return)for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){
  const runtime=hook.memoizedState?.current;if(!runtime?.game?.sandDrawing||!runtime.renderer)continue;
  const {renderer:r,game:g}=runtime,points=[],probe=document.createElement('canvas').getContext('2d');
  if(mask)for(let y=23;y<887;y+=31)for(let x=19;x<1585;x+=37){const blocked=probe.isPointInPath(r.rocksPath,x,y),water=!blocked&&(probe.isPointInPath(r.currentPath,x,y)||probe.isPointInPath(r.poolPath,x,y));points.push({x,y,water,blocked})}
  return{now:Date.now(),gameNow:g.nowMs,tide:{...g.tide},renderLevel:r.level,ready:r.ready,sandReady:!!r.sandCache,sprites:r.sprites.size,stats:runtime.stats(),points,entities:g.entities.map(e=>({id:e.id,species:e.species,state:e.state,x:e.x,y:e.y,stranded:e.stranded,concealment:e.concealment})),options:{reducedMotion:r.options?.reducedMotion,paused:r.options?.paused}};
 }
 throw Error('Mounted coast runtime not found');
}
function measureFrames(request=6000){
 const durationMs=typeof request==='number'?request:request.durationMs;
 const canvas=document.querySelector('.coast-canvas'),key=Object.keys(canvas||{}).find(k=>k.startsWith('__reactFiber$'));let runtime;
 for(let fiber=canvas?.[key];fiber&&!runtime;fiber=fiber.return)for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){const value=hook.memoizedState?.current;if(value?.renderer&&value?.game)runtime=value}
 if(!runtime)throw Error('No renderer for frame sample');
 const trace=[],longTasks=[],restore=[],traceStart=performance.now();let taskObserver;
 if(request?.trace&&PerformanceObserver.supportedEntryTypes.includes('longtask')){taskObserver=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(entry=>({atMs:entry.startTime-traceStart,durationMs:entry.duration,name:entry.name}))));taskObserver.observe({type:'longtask'});restore.push(()=>taskObserver.disconnect())}
 if(request?.trace)for(const [object,name,label]of[[runtime.game,'setTideDirection','game.setTideDirection'],[runtime.game,'update','game.update'],[runtime.game,'reconcile','game.reconcile'],[runtime.game,'admit','game.admit'],[runtime.renderer,'render','renderer.render'],[runtime.renderer.water,'update','water.update'],[runtime.renderer.water,'rebuildSea','water.rebuildSea']]){
  const original=object[name];object[name]=function(...args){const start=performance.now();try{return original.apply(this,args)}finally{const cpuMs=performance.now()-start;if(start-traceStart<1500||cpuMs>8)trace.push({label,atMs:start-traceStart,cpuMs,level:runtime.game.tide.level,arguments:args.slice(0,3).map(value=>typeof value==='object'?'object':value)})}};restore.push(()=>{object[name]=original});
 }
 const sample=new Promise(resolve=>{const r=runtime.renderer,frames=[],draw=[],outliers=[];let start=0,previous=0,lastRender=r.lastTime,renders=0;
  function frame(t){if(!start)start=t;if(previous){const interval=t-previous;frames.push(interval);if(interval>33.5)outliers.push({atMs:t-start,intervalMs:interval})}previous=t;if(r.lastTime!==lastRender){renders++;lastRender=r.lastTime;draw.push(r.frameTimes.at(-1))}
   if(t-start<durationMs)requestAnimationFrame(frame);else{for(const finish of restore)finish();const ordered=frames.toSorted((a,b)=>a-b),cpu=draw.toSorted((a,b)=>a-b),pick=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))];resolve({elapsedMs:t-start,frames:frames.length,rafFps:frames.length*1000/(t-start),renderFps:renders*1000/(t-start),p50Ms:pick(ordered,.5),p95Ms:pick(ordered,.95),maxMs:ordered.at(-1),over33Ms:outliers.length,outliers,drawMedianMs:pick(cpu,.5),drawP95Ms:pick(cpu,.95),stats:runtime.stats(),...(request?.trace?{trace,longTasks}:{} )})}}
  requestAnimationFrame(frame);
 });
 if(request?.deferred){window.__coastFrameSample=sample;return{started:true}}
 return sample;
}
async function check(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(work,{recursive:true});const profile=fs.mkdtempSync(path.join(work,'scene-'+label+'-profile-'));
 const executablePath=packaged?(process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池')):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL=process.env.VITE_DEV_SERVER_URL||'http://127.0.0.1:5188/';
 let app,page;
 try{
  app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(20000);
  // Ignore the user's physical mouse in this isolated QA window only. CDP
  // input still exercises visible buttons while their ordinary apps stay usable.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.setIgnoreMouseEvents(true)));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData'),gpu:app.getGPUFeatureStatus()}));assert.equal(runtime.packaged,packaged);assert.equal(runtime.profile,profile);assert.equal(runtime.version,version);
  const [{CoastGame},{habitatAt}]=await Promise.all(['game.js','geometry.js'].map(file=>import(pathToFileURL(path.join(root,'src/themes/coast',file)).href)));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});
  const now=Date.now(),seed=new CoastGame(null,now,seeded()).snapshot();seed.epochMs=now-600000;
  await page.addInitScript(()=>{
   const fixture=sessionStorage.getItem('coast-v23-fixture');if(fixture)localStorage.setItem('mofish-coast-v1',fixture);
   localStorage.setItem('mofish-theme',JSON.stringify('coast'));localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',quality:'high',sound:false,reducedMotion:false}));
  });
  await page.evaluate(state=>sessionStorage.setItem('coast-v23-fixture',JSON.stringify(state)),seed);await page.reload();await page.waitForSelector('.theme-coast');
  const scene=(mask=false)=>page.evaluate(readScene,{mask});
  const waitScene=async predicate=>{const end=Date.now()+30000;while(Date.now()<end){const s=await scene();if(predicate(s))return s;await page.waitForTimeout(80)}throw Error('Coast did not reach expected ready state')};
  await waitScene(s=>s.ready&&s.sandReady&&s.sprites===17&&s.tide.phase==='high');await page.evaluate(()=>sessionStorage.removeItem('coast-v23-fixture'));
  // This entire sample precedes ALL page.clock calls: Playwright's Date-only
  // fixture also replaces RAF with a 16ms scheduler, which is not display FPS.
  const nativeClock=await page.evaluate(()=>({rafNative:/\[native code\]/.test(requestAnimationFrame.toString()),performanceNative:/\[native code\]/.test(performance.now.toString()),dateNative:/\[native code\]/.test(Date.now.toString())}));
  assert.deepEqual(nativeClock,{rafNative:true,performanceNative:true,dateNative:true});
  const animation=await page.evaluate(measureCoastAnimalAnimation);assert.equal(animation.result,'PASS');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false});await waitScene(s=>s.stats.width===3840&&s.stats.height===2160);await page.waitForTimeout(1000);
  const monotonicStart=process.hrtime.bigint(),performance=await page.evaluate(measureFrames);performance.hostElapsedMs=Number(process.hrtime.bigint()-monotonicStart)/1e6;performance.nativeClock=nativeClock;
  assert.ok(performance.elapsedMs>=6000);assert.ok(Math.abs(performance.elapsedMs-performance.hostElapsedMs)<1000);assert.equal(performance.stats.width,3840);assert.equal(performance.stats.height,2160);assert.ok(performance.renderFps>20,'Unexpected severe render slowdown; inspect native performance result');
  const checkMask=async name=>{
   const s=await scene(true);assert.ok(s.points.length>1000);const mismatches=[];
   for(const p of s.points){const expected=habitatAt(p.x,p.y,s.renderLevel);if(expected.distance<1)continue;if(expected.water!==p.water||expected.blocked!==p.blocked)mismatches.push(p)}
   assert.deepEqual(mismatches,[],name+' visual water and habitat disagree');assert.ok(Math.abs(s.renderLevel-s.tide.level)<=.0011);
   return{name,level:s.tide.level,samples:s.points.length,water:s.points.filter(p=>p.water).length,land:s.points.filter(p=>!p.water&&!p.blocked).length,blocked:s.points.filter(p=>p.blocked).length};
  };
  const screenshot=async name=>{await page.evaluate(()=>window.getSelection()?.removeAllRanges());const file=path.join(out,name+'-'+label+'.png');await page.screenshot({path:file});return file};
  const uhdImage=await screenshot('高潮-4K');
  // Rising tide rebuilds the water mask and plans crab routes. Start sampling
  // before the real public button click so the first planning frame is counted.
  const manualSeed={...seed,epochMs:Date.now()-1500000};await page.evaluate(state=>sessionStorage.setItem('coast-v23-fixture',JSON.stringify(state)),manualSeed);await page.reload();await page.waitForSelector('.theme-coast');await waitScene(s=>s.ready&&s.sandReady&&s.sprites===17&&s.tide.phase==='low'&&s.stats.width===3840);await page.evaluate(()=>sessionStorage.removeItem('coast-v23-fixture'));await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>/\[native code\]/.test(requestAnimationFrame.toString())),true);
  await page.getByRole('button',{name:'潮汐',exact:true}).click();
  const beforeManual=await scene(),manualStart=process.hrtime.bigint(),manualDurationMs=Number(process.env.POND_TIDE_SAMPLE_MS)||8000;await page.evaluate(measureFrames,{durationMs:manualDurationMs,deferred:true,trace:!!process.env.POND_TRACE_TIDE});
  await page.getByRole('button',{name:'开始涨潮',exact:true}).click();if(!process.env.POND_KEEP_TIDE_PANEL)await page.getByRole('button',{name:'关闭面板',exact:true}).click();
  const manualRisingPerformance=await page.evaluate(()=>window.__coastFrameSample);await page.evaluate(()=>delete window.__coastFrameSample);manualRisingPerformance.hostElapsedMs=Number(process.hrtime.bigint()-manualStart)/1e6;manualRisingPerformance.nativeClock=nativeClock;manualRisingPerformance.fromLevel=beforeManual.tide.level;
  manualRisingPerformance.panelClosedDuringSample=!process.env.POND_KEEP_TIDE_PANEL;if(process.env.POND_KEEP_TIDE_PANEL)await page.getByRole('button',{name:'关闭面板',exact:true}).click();
  assert.ok(manualRisingPerformance.elapsedMs>=manualDurationMs);assert.ok(Math.abs(manualRisingPerformance.elapsedMs-manualRisingPerformance.hostElapsedMs)<1000);assert.equal(manualRisingPerformance.stats.width,3840);assert.equal(manualRisingPerformance.stats.height,2160);assert.equal(manualRisingPerformance.stats.tide.manual,true);assert.equal(manualRisingPerformance.stats.tide.phase,'rising');assert.ok(manualRisingPerformance.stats.tide.level>.3);assert.ok(manualRisingPerformance.renderFps>20,'Severe performance drop during manual rising tide');
  const risingMask=await checkMask('manual rising'),manualRisingImage=await screenshot('手动涨潮-4K');
  // Date fixtures only begin after the real clock animation/performance sample.
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});seed.epochMs=now-1500000;await page.clock.setFixedTime(now);await page.evaluate(state=>sessionStorage.setItem('coast-v23-fixture',JSON.stringify(state)),seed);await page.reload();await page.waitForSelector('.theme-coast');await waitScene(s=>s.ready&&s.sandReady&&s.sprites===17&&s.tide.phase==='low');await page.evaluate(()=>sessionStorage.removeItem('coast-v23-fixture'));
  await page.waitForTimeout(300);const low=await checkMask('low'),lowImage=await screenshot('低潮-更多湿沙与浅水');
  await page.clock.setFixedTime(seed.epochMs+2400000);await waitScene(s=>s.tide.level===1&&s.renderLevel===1);await page.waitForTimeout(300);
  const high=await checkMask('high'),highImage=await screenshot('高潮-海水漫过沙滩');assert.ok(high.water>low.water*1.8,'High tide must have substantially more water');assert.ok(low.land>high.land*2,'Low tide must expose substantially more beach');
  // Responsive world mapping still shares the same mask in a narrow crop.
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await waitScene(s=>s.stats.cssWidth===390&&s.stats.cssHeight===844);const narrow=await checkMask('narrow');const narrowImage=await screenshot('高潮-窄屏');
  assert.deepEqual(errors,[]);assert.deepEqual((await scene()).stats.missingAssets,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const report={result:'PASS',version:runtime.version,packaged,isolatedProfile:true,sourceResolution:(await scene()).stats.sourceSize,sandResolution:(await scene()).stats.sandSourceSize,low,high,narrow,risingMask,animation,performance,manualRisingPerformance,images:{lowImage,highImage,uhdImage,narrowImage,manualRisingImage},gpu:runtime.gpu,errors};
  fs.writeFileSync(path.join(work,'scene-'+label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){if(page)await page.screenshot({path:path.join(work,'scene-'+label+'-failure.png')}).catch(()=>{});throw error}
 finally{if(app)await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
module.exports={check,readScene,measureFrames};if(require.main===module)check().catch(e=>{console.error(e);process.exitCode=1});
