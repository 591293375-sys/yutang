'use strict';
// Run: node electron/coast-smoke.cjs [--packaged]
// Both modes exercise the shipped UI with isolated storage, without renderer internals.
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const packaged=process.argv.includes('--packaged');
const work=path.resolve(root,'../../work/coast-v2');
const outputs=path.resolve(root,'..');
const rng=(seed=19)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

async function makeFixture(){
 const {CoastGame}=await import(pathToFileURL(path.join(root,'src/themes/coast/game.js')).href);
 const {SPECIES}=await import(pathToFileURL(path.join(root,'src/themes/coast/catalog.js')).href);
 const {isHabitatValid}=await import(pathToFileURL(path.join(root,'src/themes/coast/geometry.js')).href);
 const now=Date.now(),game=new CoastGame(null,now,rng());
 const choose=(species,minX,maxX,minY,maxY)=>{
  for(let y=minY;y<=maxY;y+=10)for(let x=minX;x<=maxX;x+=10)if(isHabitatValid(species,x,y,0))return{x,y};
  throw Error(`No legal visible fixture point for ${species}`);
 };
 const shell=game.entities.find(e=>e.species==='shell');
 const starfish=game.entities.find(e=>e.species==='starfish');
 Object.assign(shell,choose('shell',1060,1460,350,720));
 Object.assign(starfish,choose('starfish',1320,1450,685,745));
 // These targets exercise direct pickup/capture; hidden discovery has separate tests.
 for(const target of [shell,starfish])Object.assign(target,{concealmentInitialized:true,concealment:null,revealSteps:0,revealNeeded:0,emergeProgress:1});
 // Keep the two test targets visually separate from other seeded creatures.
 game.entities=game.entities.filter(e=>e===shell||e===starfish||[shell,starfish].every(target=>Math.hypot(e.x-target.x,e.y-target.y)>75));
 const state=game.snapshot();state.epochMs=now-1500000;
 return{state,targets:{shell:{id:shell.id,x:shell.x,y:shell.y},starfish:{id:starfish.id,x:starfish.x,y:starfish.y}},species:SPECIES.map(s=>s.id)};
}

async function smoke(){
 fs.mkdirSync(work,{recursive:true});
 const profile=fs.mkdtempSync(path.join(work,packaged?'coast-packaged-profile-':'coast-dev-profile-'));
 const executablePath=packaged?(process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池')):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const launchEnv={...process.env};if(packaged)delete launchEnv.VITE_DEV_SERVER_URL;else launchEnv.VITE_DEV_SERVER_URL=process.env.VITE_DEV_SERVER_URL||'http://127.0.0.1:5188/';
 const app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),`--user-data-dir=${profile}`],env:launchEnv,timeout:30000});
 let page;
 try{
  page=await app.firstWindow();page.setDefaultTimeout(15000);
  // Ignore physical mouse interference in this isolated QA window; CDP pointer input remains active.
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.setIgnoreMouseEvents(true)});
  const errors=[],assetErrors=[],cancelledMediaRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',request=>{
   if(!request.url().includes('/assets/'))return;
   const reason=request.failure()?.errorText,description=`${request.url()}: ${reason}`;
   // Native pause() may cancel the muted wind prime's range request; media.error
   // below still distinguishes decode failures from an intentional cancellation.
   if(/\.wav(?:\?|$)/.test(request.url())&&reason==='net::ERR_ABORTED')cancelledMediaRequests.push(description);
   else assetErrors.push(description);
  });
  await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData'),preferences:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()}));
  assert.equal(runtime.packaged,packaged);assert.equal(runtime.profile,profile);assert.equal(runtime.preferences.contextIsolation,true);assert.equal(runtime.preferences.nodeIntegration,false);
  const fixture=await makeFixture();
  await page.evaluate(({state})=>{
   localStorage.setItem('mofish-theme',JSON.stringify('koi'));
   localStorage.setItem('mofish-coast-v1',JSON.stringify(state));
   localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',fishCount:3,turtleCount:0,quality:'high',reducedMotion:false,sound:false,volume:.24}));
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff1d9';ctx.fillRect(0,0,512,128);ctx.fillStyle='#dc6549';ctx.fillRect(160,15,90,95);
   localStorage.setItem('fusheng-fish',JSON.stringify([{id:'coast-smoke-kept-koi',name:'海岸测试保留锦鲤',texture:canvas.toDataURL(),size:1.2,appearance:'skin-v2'}]));
  },fixture);
  await page.reload();await page.waitForSelector('.theme-koi');
  const koiBefore=await page.evaluate(()=>localStorage.getItem('fusheng-fish'));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});
  const close=()=>page.getByRole('button',{name:'关闭面板',exact:true}).click();
  async function theme(id){await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.locator('.theme-card').filter({hasText:id==='coast'?'赶海':'锦鲤池'}).click();await page.waitForSelector('.theme-'+id)}
  await theme('coast');
  assert.equal(await page.getByRole('navigation',{name:'赶海工具栏'}).count(),1);
  assert.deepEqual(await page.locator('.dock button>span').allTextContents(),['观察','小桶','图鉴','潮汐','漂流瓶','设置']);
  assert.equal(await page.locator('.coast-canvas').evaluate(canvas=>getComputedStyle(canvas).cursor),'grab');
  assert.equal(await page.locator('.coast-weather-badge').evaluate(badge=>getComputedStyle(badge).cursor),'default');
  assert.equal(await page.getByRole('button',{name:'画锦鲤',exact:true}).count(),0);
  assert.equal(await page.locator('canvas.pond-canvas').count(),1);
  const assets=await page.evaluate(async ids=>Promise.all(ids.map(async id=>{
   const image=new Image();image.src=new URL(`./assets/coast/${id}.png`,location.href).href;await image.decode();
   return{id,width:image.naturalWidth,height:image.naturalHeight,offline:image.src.startsWith('file:')};
  })),fixture.species);
  assert.equal(assets.length,17);assert.ok(assets.every(a=>a.width>0&&a.height>0));if(packaged)assert.ok(assets.every(a=>a.offline));
  await page.waitForTimeout(500);
  async function clickTarget(target,expected){
   for(const offset of [{x:0,y:0},{x:8,y:0},{x:-8,y:0},{x:0,y:8},{x:0,y:-8}]){
    const point=await page.locator('.coast-canvas').evaluate((canvas,p)=>{
     const r=canvas.getBoundingClientRect(),scale=Math.max(r.width/1600,r.height/900);
     return{x:r.left+(r.width-1600*scale)/2+(p.x+p.dx)*scale,y:r.top+(r.height-900*scale)/2+(p.y+p.dy)*scale};
    },{...target,dx:offset.x,dy:offset.y});
    assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains('coast-canvas'),point),true,'Actual creature position must be reachable through the UI');
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(120);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-coast-v1')));
    if(expected(stored))return stored;
   }
   throw Error(`Canvas interaction did not commit for ${target.id}`);
  }
  await clickTarget(fixture.targets.shell,s=>s.shells===0&&s.entities.some(e=>e.id===fixture.targets.shell.id&&e.state==='scene'));
  await page.getByRole('button',{name:'观察模式，点击切换捕捉',exact:true}).click();
  const cursor=await page.locator('.coast-canvas').evaluate(async canvas=>{
   const value=getComputedStyle(canvas).cursor,url=value.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
   const image=new Image();image.src=url;await image.decode();return{value,width:image.naturalWidth,height:image.naturalHeight};
  });
  assert.match(cursor.value,/tongs-cursor\.svg/);assert.deepEqual([cursor.width,cursor.height],[40,40]);
  await clickTarget(fixture.targets.shell,s=>s.shells===1&&!s.entities.some(e=>e.id===fixture.targets.shell.id));
  const interacted=await clickTarget(fixture.targets.starfish,s=>s.entities.some(e=>e.id===fixture.targets.starfish.id&&e.state==='bucket'));
  assert.equal(interacted.catalog.shell.collected,1);assert.equal(interacted.catalog.starfish.caught,1);
  await page.getByRole('button',{name:/^小桶/}).click();assert.equal(await page.locator('.bucket-row').count(),1);await page.getByText('海星',{exact:true}).first().waitFor();await close();
  await page.getByRole('button',{name:'图鉴',exact:true}).click();assert.equal(await page.locator('.guide-card').count(),17);assert.equal(await page.locator('.guide-card.discovered').count(),2);await close();
  await page.getByRole('button',{name:'潮汐信息',exact:true}).click();assert.equal(await page.locator('.tide-debug').count(),packaged?0:1);await close();
  await page.reload();await page.waitForSelector('.theme-coast');
  const restored=await page.evaluate(()=>({coast:JSON.parse(localStorage.getItem('mofish-coast-v1')),koi:localStorage.getItem('fusheng-fish')}));
  assert.equal(restored.koi,koiBefore);assert.equal(restored.coast.epochMs,fixture.state.epochMs);assert.equal(restored.coast.shells,1);assert.equal(restored.coast.catalog.shell.collected,1);assert.equal(restored.coast.catalog.starfish.caught,1);assert.equal(restored.coast.entities.filter(e=>e.id===fixture.targets.starfish.id&&e.state==='bucket').length,1);
  // Exercise the production buttons through the same panel in dev and the package.
  await page.getByRole('button',{name:'潮汐',exact:true}).click();
  const tideChanges=[];
  const {TideClock}=await import(pathToFileURL(path.join(root,'src/themes/coast/tide.js')).href);
  for(const [direction,label]of[['rising','开始涨潮'],['falling','开始退潮']]){
   const before=await page.getByRole('meter',{name:'当前潮位'}).evaluate(meter=>meter.value);
   const beforeState=await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-coast-v1')));
   await page.getByRole('button',{name:label,exact:true}).click();
   const after=await page.getByRole('meter',{name:'当前潮位'}).evaluate(meter=>meter.value);
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-coast-v1')));
   assert.equal(saved.tideDirection,direction);assert.ok(Number.isFinite(saved.epochMs));assert.ok(saved.manualTide);
   // UI meters publish every 500 ms; fast manual water may move between reads.
   // Compare the new anchor against the previous clock at the exact click time.
   const clickTime=saved.manualTide.startMs;
   const expectedLevel=new TideClock(beforeState.epochMs,clickTime,beforeState.manualTide).productionSnapshot(clickTime).level;
   assert.ok(Math.abs(saved.manualTide.fromLevel-expectedLevel)<1e-9,'Direction changes must preserve water level at the click instant');
   tideChanges.push({direction,before,after,epochMs:saved.epochMs,fromLevel:saved.manualTide.fromLevel,expectedLevel});
  }
  await close();await page.reload();await page.waitForSelector('.theme-coast');
  const redirected=await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-coast-v1')));
  assert.equal(redirected.epochMs,tideChanges.at(-1).epochMs);assert.equal(redirected.tideDirection,'falling');
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByText('治愈海浪声',{exact:true}).click();
  await page.waitForFunction(()=>{const ocean=document.querySelector('[data-ambient="ocean"]'),stream=document.querySelector('[data-ambient="stream"]');return !ocean.paused&&ocean.currentTime>.2&&ocean.volume>0&&stream.paused&&stream.volume===0});
  const ocean=await page.locator('[data-ambient="ocean"]').evaluate(a=>({duration:a.duration,volume:a.volume,loop:a.loop,source:a.currentSrc}));assert.equal(ocean.duration,90);assert.equal(ocean.loop,true);if(packaged)assert.ok(ocean.source.startsWith('file:'));await close();
  await theme('koi');assert.deepEqual(await page.locator('.dock button>span').allTextContents(),['投食','四时','天气','日夜','画锦鲤','设置']);assert.equal(await page.locator('.pond-canvas').evaluate(canvas=>getComputedStyle(canvas).cursor),'default');await page.waitForFunction(()=>{const ocean=document.querySelector('[data-ambient="ocean"]'),stream=document.querySelector('[data-ambient="stream"]');return ocean.paused&&ocean.volume===0&&!stream.paused&&stream.currentTime>.2&&stream.volume>0});
  await theme('coast');await page.waitForFunction(()=>{const ocean=document.querySelector('[data-ambient="ocean"]'),stream=document.querySelector('[data-ambient="stream"]');return !ocean.paused&&ocean.volume>0&&stream.paused&&stream.volume===0});
  const tracks=await page.locator('audio').evaluateAll(items=>items.map(a=>({id:a.dataset.ambient,error:a.error?.code||null,paused:a.paused,volume:a.volume})));
  assert.equal(tracks.length,5);assert.equal(new Set(tracks.map(t=>t.id)).size,5);assert.ok(tracks.every(t=>t.error===null));assert.equal(await page.evaluate(()=>localStorage.getItem('fusheng-fish')),koiBefore);
  await page.waitForTimeout(400);
  const screenshot=packaged?path.join(outputs,'赶海主题-窗口预览.png'):path.join(work,'coast-smoke-dev.png');await page.screenshot({path:screenshot});
  let desktop=null;
  if(packaged){
   // Drop test viewport emulation so native desktop dimensions come from Electron.
   await cdp.send('Emulation.clearDeviceMetricsOverride');
   await page.getByRole('button',{name:'桌面模式',exact:true}).click();
   await page.waitForFunction(async()=>Boolean((await window.pondDesktop.getState()).desktopMode));
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.hud')).visibility==='hidden'&&Math.max(document.querySelector('.coast-canvas').width,document.querySelector('.coast-canvas').height)>=3840);
   desktop=await page.evaluate(async()=>{
    const canvas=document.querySelector('.coast-canvas'),background=document.querySelector('.coast-background');
    const sample=document.createElement('canvas');sample.width=320;sample.height=180;const ctx=sample.getContext('2d');
    const frame=()=>{ctx.clearRect(0,0,320,180);ctx.drawImage(canvas,0,0,320,180);return sample.toDataURL()};
    const before=frame();await new Promise(resolve=>setTimeout(resolve,850));
    return{pixels:[canvas.width,canvas.height],backgroundPixels:[background.width,background.height],visible:!document.hidden,animated:before!==frame(),state:await window.pondDesktop.getState()};
   });
   assert.equal(desktop.visible,true);assert.equal(desktop.animated,true);assert.equal(desktop.state.desktopMode,true);assert.deepEqual(desktop.backgroundPixels,desktop.pixels);
   await page.locator('.toast').waitFor({state:'hidden'});
   desktop.screenshot=path.join(outputs,'赶海主题-桌面预览.png');await page.screenshot({path:desktop.screenshot});
   await page.evaluate(()=>window.pondDesktop.showControls());
   await page.waitForFunction(async()=>!(await window.pondDesktop.getState()).desktopMode&&getComputedStyle(document.querySelector('.hud')).visibility==='visible'&&Number(getComputedStyle(document.querySelector('.hud')).opacity)>.99);
   await page.getByRole('button',{name:'切换主题',exact:true}).waitFor({state:'visible'});desktop.restored=true;
  }
  assert.deepEqual(errors,[]);assert.deepEqual(assetErrors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const report={result:'PASS',packaged,version:runtime.version,isolatedProfile:true,speciesAssets:assets.length,observeDoesNotCollect:true,canvasCollectInCatch:true,canvasCollect:true,canvasCapture:true,bucketAndGuide:true,reloadStable:true,koiUnchanged:true,coastToolsAndCursors:true,cursor,tideChanges,productionDebugAbsent:packaged,themeAudioSwitch:true,tracks,ocean,screenshot,desktop,errors,assetErrors,cancelledMediaRequests};
  fs.writeFileSync(path.join(work,`coast-smoke-${packaged?'packaged':'dev'}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){if(page)await page.screenshot({path:path.join(work,`coast-smoke-${packaged?'packaged':'dev'}-failure.png`)}).catch(()=>{});throw error}
 finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
smoke().catch(error=>{console.error(error);process.exitCode=1});
