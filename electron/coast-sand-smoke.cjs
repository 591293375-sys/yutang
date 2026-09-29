'use strict';
// Run: node electron/coast-sand-smoke.cjs [--packaged]
// Uses real mouse gestures and natural RAF/surf time in an isolated profile.
// A fixed wall-clock fixture changes tide phases; no production debug API,
// accelerated animation timers, drawing injection or application edits are used.
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const packaged=process.argv.includes('--packaged');
const work=path.resolve(root,'../../work/coast-v2.2');
const outputs=path.resolve(root,'..');

async function makeFixture(now=Date.now()){
 const {habitatAt,isHabitatValid,shoreLine}=await import(pathToFileURL(path.join(root,'src/themes/coast/geometry.js')).href);
 const {surfCoverageAt,SURF_PERIOD}=await import(pathToFileURL(path.join(root,'src/themes/coast/surf.js')).href);
 const sand=p=>{const h=habitatAt(p.x,p.y,0);return !h.blocked&&!h.water&&!h.pool&&(h.tidal||h.distance<240)};
 const validPath=points=>points.every((p,i)=>{
  if(!sand(p))return false;if(!i)return true;
  const a=points[i-1],steps=Math.ceil(Math.hypot(p.x-a.x,p.y-a.y));
  for(let j=1;j<steps;j++)if(!sand({x:a.x+(p.x-a.x)*j/steps,y:a.y+(p.y-a.y)*j/steps}))return false;
  return true;
 });
 let heart=null;
 for(let y=460;y<=650&&!heart;y+=20)for(let x=1420;x>=1080&&!heart;x-=20){
  const points=Array.from({length:73},(_,i)=>{const t=i/72*Math.PI*2;return{x:x+Math.sin(t)**3*56,y:y-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*3.4}});
  if(validPath(points)&&points.every(p=>habitatAt(p.x,p.y,0).distance>20&&habitatAt(p.x,p.y,1).water))heart=points;
 }
 assert.ok(heart,'Fixture needs a dry, unobstructed heart that high tide fully covers');
 const line=shoreLine(0);let wave=null;
 for(let i=20;i<line.length-5&&!wave;i++){
  const points=line.slice(i,i+4).map((p,j)=>{const a=line[i+j-1],b=line[i+j+1],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);return{x:p.x+dy/length*1.2,y:p.y-dx/length*1.2}});
  if(points.every(p=>p.x>660&&p.x<1400&&p.y>300&&p.y<750)&&validPath(points)&&points.every(p=>Array.from({length:84},(_,j)=>surfCoverageAt(p.x,p.y,0,j/10)).some(c=>c>.2)))wave=points;
 }
 assert.ok(wave,'Fixture needs dry sand reached by one natural 8.4-second wash');
 const choose=(species,minX,maxX,minY,maxY)=>{
  for(let y=minY;y<=maxY;y+=10)for(let x=minX;x<=maxX;x+=10)if(isHabitatValid(species,x,y,0)&&[...heart,...wave].every(p=>Math.hypot(p.x-x,p.y-y)>80))return{x,y};
  throw Error('No legal separate '+species+' fixture position');
 };
 const shell={id:'sand-test-shell',species:'shell',...choose('shell',1310,1510,250,400),heading:0,phase:0,state:'scene',concealmentInitialized:true,concealment:'sand',revealNeeded:3,revealSteps:0};
 const starfish={id:'sand-test-starfish',species:'starfish',...choose('starfish',1320,1450,690,740),heading:0,phase:0,state:'scene',concealmentInitialized:true,concealment:null,revealNeeded:0,revealSteps:0};
 const phonePaths=[];
 for(let y=570;y<790;y+=10)for(let x=650;x<940;x+=20){const points=[{x,y},{x:x+30,y}];if(validPath(points)&&points.every(p=>habitatAt(p.x,p.y,0).distance>8))phonePaths.push(points)}
 assert.ok(phonePaths.length);
 return{state:{version:1,epochMs:now-1500000,nextId:10,entities:[shell,starfish],catalog:{},shells:0,rescues:0},heart,wave,shell,starfish,phonePaths,period:SURF_PERIOD};
}

// Production has no public drawing debugger. Read the already-mounted scene ref
// only to assert segments/capture; gestures and tide changes use browser input/time.
function readSceneInPage(){
 const canvas=document.querySelector('.coast-canvas');
 const key=Object.keys(canvas||{}).find(k=>k.startsWith('__reactFiber$'));
 for(let fiber=canvas?.[key];fiber;fiber=fiber.return){
  for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){
   const scene=hook.memoizedState?.current;
   if(scene?.game?.sandDrawing&&scene.renderer){
    const drawing=scene.game.sandDrawing,id=window.__sandSmokePointerId;
    return{...scene.stats(),time:scene.renderer.lastTime,segments:drawing.segments.map(s=>({...s})),
     capture:id===undefined?false:canvas.hasPointerCapture(id),state:scene.game.snapshot()};
   }
  }
 }
 throw Error('Mounted coast runtime was not found; update this test adapter after React changes');
}

async function smoke(){
 fs.mkdirSync(work,{recursive:true});
 const profile=fs.mkdtempSync(path.join(work,'sand-'+(packaged?'packaged':'dev')+'-profile-'));
 const executablePath=packaged?(process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池')):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL=process.env.VITE_DEV_SERVER_URL||'http://127.0.0.1:5188/';
 let app,page;
 try{
  app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env,timeout:30000});
  page=await app.firstWindow();page.setDefaultTimeout(15000);
  // Ignore physical mouse interference in this isolated QA window; CDP pointer input remains active.
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.setIgnoreMouseEvents(true)});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData')}));assert.equal(runtime.packaged,packaged);assert.equal(runtime.profile,profile);
  const now=Date.now(),fixture=await makeFixture(now);await page.clock.setFixedTime(now);
  const cdp=await page.context().newCDPSession(page);
  const viewport=(mobile=false)=>cdp.send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1600,height:mobile?844:900,deviceScaleFactor:1,mobile});
  const state=()=>page.evaluate(readSceneInPage);let fixtureInstalled=false;
  const reloadFixture=async()=>{
   await page.clock.setFixedTime(now);
   if(!fixtureInstalled){await page.addInitScript(({saved,now})=>{
    localStorage.setItem('mofish-theme',JSON.stringify('coast'));
    localStorage.setItem('mofish-coast-v1',JSON.stringify(saved));
    localStorage.setItem('mofish-bottles-v1',JSON.stringify({version:1,nextId:2,nextArrivalAt:now+86400000,lastSeenAt:now,letterIndex:0,draft:{id:'draft-1',body:'',signature:''},collection:[],sent:[],bottles:[]}));
    localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',quality:'high',reducedMotion:false,paused:false,sound:false}));
   },{saved:fixture.state,now});fixtureInstalled=true;}
   await page.reload();await page.waitForSelector('.theme-coast');
   await page.locator('.coast-canvas').evaluate(canvas=>canvas.addEventListener('pointerdown',event=>{window.__sandSmokePointerId=event.pointerId}));
   await page.waitForFunction(()=>document.querySelector('.coast-canvas')?.width>0);
   assert.equal((await state()).tide.level,0);
  };
  const screenPoints=points=>page.locator('.coast-canvas').evaluate((canvas,points)=>{
   const r=canvas.getBoundingClientRect(),scale=Math.max(r.width/1600,r.height/900);
   return points.map(p=>({x:r.left+(r.width-1600*scale)/2+p.x*scale,y:r.top+(r.height-900*scale)/2+p.y*scale}));
  },points);
  const reachable=points=>page.evaluate(points=>points.every(p=>document.elementFromPoint(p.x,p.y)?.classList.contains('coast-canvas')),points);
  const drag=async(points,{release=true,hold=230}={})=>{
   const screen=await screenPoints(points);assert.ok(await reachable(screen),'Gesture must stay on visible canvas rather than controls');
   await page.mouse.move(screen[0].x,screen[0].y);await page.mouse.down();await page.waitForTimeout(hold);
   for(const p of screen.slice(1))await page.mouse.move(p.x,p.y);
   if(release)await page.mouse.up();return screen;
  };
  const noCapture=async()=>{const s=await state();assert.equal(s.sandDrawingActive,false);assert.equal(s.capture,false)};
  const waitForScene=async(predicate,label,timeout=15000)=>{
   const deadline=Date.now()+timeout;while(Date.now()<deadline){const s=await state();if(predicate(s))return s;await page.waitForTimeout(80)}throw Error('Timed out: '+label);
  };

  await viewport();await reloadFixture();
  const blankPoint=(await screenPoints([fixture.heart[0]]))[0];
  await page.mouse.click(blankPoint.x,blankPoint.y);assert.equal((await state()).sandSegments,0);await noCapture();
  // Observe taps reveal a hidden shell but never collect it, even after emergence.
  const shellPoint=(await screenPoints([fixture.shell]))[0];assert.ok(await reachable([shellPoint]));
  const reveals=[];
  for(let i=1;i<=3;i++){
   // Advance only the Date fixture past the production 90ms reveal debounce.
   await page.clock.setFixedTime(now+i*200);
   await page.mouse.click(shellPoint.x,shellPoint.y);const s=await state(),shell=s.state.entities.find(e=>e.id===fixture.shell.id);
   assert.equal(shell.revealSteps,i);assert.equal(s.state.shells,0);assert.equal(s.sandSegments,0);reveals.push(i);
  }
  await page.clock.setFixedTime(now+1400);await page.waitForTimeout(80);await page.mouse.click(shellPoint.x,shellPoint.y);assert.equal((await state()).state.shells,0);assert.equal((await state()).sandSegments,0);
  await page.getByRole('button',{name:'观察模式，点击切换捕捉',exact:true}).click();
  await page.mouse.click(shellPoint.x,shellPoint.y);assert.equal((await state()).state.shells,1);assert.equal((await state()).sandSegments,0);
  await drag(fixture.heart);assert.equal((await state()).sandSegments,0);await noCapture();
  const starPoint=(await screenPoints([fixture.starfish]))[0];assert.ok(await reachable([starPoint]));await page.mouse.click(starPoint.x,starPoint.y);
  assert.equal((await state()).state.entities.find(e=>e.id===fixture.starfish.id).state,'bucket');assert.equal((await state()).sandSegments,0);
  await page.getByRole('button',{name:'捕捉模式，点击切回观察',exact:true}).click();
  await drag(fixture.heart);const heart=await state();assert.ok(heart.sandSegments>=60,'Real pointer heart should leave many visible segments');await noCapture();
  const heartScreenshot=packaged?path.join(outputs,'赶海主题-沙滩画心.png'):path.join(work,'sand-heart-dev.png');await page.screenshot({path:heartScreenshot});

  // Keep this drawing mounted while wall-clock fixtures move through high/low.
  // RAF and surf animation remain real-time, so the water must erase the marks.
  await page.clock.setFixedTime(fixture.state.epochMs+1800000+700000);
  const covered=await waitForScene(s=>s.tide.phase==='high'&&s.sandSegments===0,'high tide erases the original heart');
  await page.screenshot({path:path.join(work,'sand-high-cleared-'+(packaged?'packaged':'dev')+'.png')});
  await page.clock.setFixedTime(fixture.state.epochMs+1800000+1500000);
  const uncovered=await waitForScene(s=>s.tide.phase==='low','low tide returns');await page.waitForTimeout(900);
  assert.equal((await state()).sandSegments,0,'Washed marks must never return with low water');
  await page.screenshot({path:path.join(work,'sand-low-not-restored-'+(packaged?'packaged':'dev')+'.png')});

  // Natural 8.4s wash at constant low tide; only Date is fixed, never RAF time.
  await reloadFixture();const {surfCoverageAt}=await import(pathToFileURL(path.join(root,'src/themes/coast/surf.js')).href);
  let calm=false;
  for(let i=0;i<100;i++){
   const s=await state();
   calm=fixture.wave.every(p=>[0,.2,.4,.6,.8].every(dt=>surfCoverageAt(p.x,p.y,0,s.time+dt)<.01));
   if(calm)break;await page.waitForTimeout(100);
  }
  assert.ok(calm,'Find a naturally calm start without setting animation time');await drag(fixture.wave);
  const swashBefore=await state();assert.ok(swashBefore.sandSegments>0);assert.equal(swashBefore.tide.level,0);
  const swashAfter=await waitForScene(s=>s.time-swashBefore.time>=fixture.period+.8&&s.sandSegments===0,'one natural surf period and fade clears near-shore marks',16000);
  assert.equal(swashAfter.tide.level,0);assert.ok(swashAfter.time>swashBefore.time+8.4);

  // Resizing while held must cancel capture, preserve world-space marks, and
  // allow a new gesture under the phone cover transform without joining strokes.
  await drag(fixture.heart,{release:false});const beforeResize=await state();assert.ok(beforeResize.sandDrawingActive);assert.ok(beforeResize.capture);
  await viewport(true);await page.waitForTimeout(150);await page.mouse.up();await noCapture();const afterResize=await state();
  assert.deepEqual(afterResize.segments.map(s=>[s.x1,s.y1,s.x2,s.y2]),beforeResize.segments.map(s=>[s.x1,s.y1,s.x2,s.y2]));
  let phonePath=null;for(const candidate of fixture.phonePaths)if(await reachable(await screenPoints(candidate))){phonePath=candidate;break}
  assert.ok(phonePath,'Phone needs an unobstructed sand gesture');const phoneBefore=(await state()).sandSegments;await drag(phonePath);const phoneAfter=await state();assert.ok(phoneAfter.sandSegments>phoneBefore);await noCapture();
  for(const s of phoneAfter.segments.slice(phoneBefore))assert.ok(Math.hypot(s.x2-s.x1,s.y2-s.y1)<=4.01,'Resize must not connect old and new gestures');
  await page.screenshot({path:path.join(work,'sand-phone-'+(packaged?'packaged':'dev')+'.png')});
  assert.ok(phoneAfter.sandSegments<=1200);assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const report={result:'PASS',packaged,version:runtime.version,isolatedProfile:true,realMouseGestures:true,wallClockFixtureOnly:true,noProductionDebug:true,
   quickTapDoesNotDraw:true,revealOnlyTaps:reveals,observeDoesNotCollect:true,catchCollectsShell:true,catchDragDoesNotDraw:true,canvasCapture:true,heartSegments:heart.sandSegments,
   highWaterSegments:covered.sandSegments,lowWaterSegments:uncovered.sandSegments,naturalSurfPeriod:fixture.period,swashBefore:swashBefore.sandSegments,swashAfter:swashAfter.sandSegments,naturalAnimationSeconds:swashAfter.time-swashBefore.time,
   resizeCancelsCapture:true,worldMarksSurviveResize:true,phoneNewSegments:phoneAfter.sandSegments-phoneBefore,heartScreenshot,errors};
  fs.writeFileSync(path.join(work,'sand-smoke-'+(packaged?'packaged':'dev')+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){if(page)await page.screenshot({path:path.join(work,'sand-'+(packaged?'packaged':'dev')+'-failure.png')}).catch(()=>{});throw error}
 finally{if(app)await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
module.exports={makeFixture,readSceneInPage,smoke};
if(require.main===module)smoke().catch(error=>{console.error(error);process.exitCode=1});
