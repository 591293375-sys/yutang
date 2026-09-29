'use strict';
// Run: node electron/coast-capture-smoke.cjs [--packaged]
// Isolated save fixtures and fixed Date values select low tide and 500ms click
// intervals, plus rising tide for the narrow viewport. RAF and fish movement
// stay real-time. All interactions use mouse;
// the mounted scene adapter only reads state and resolves the visible silhouette.
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
const work=path.resolve(root,'../../work/coast-v2.2.1'),outputs=path.resolve(root,'..');

async function makeFixture(now=Date.now()){
 const {habitatAt,isHabitatValid}=await import(pathToFileURL(path.join(root,'src/themes/coast/geometry.js')).href);
 const chosen=[];
 const choose=(check,{minX=1080,maxX=1450,minY=330,maxY=680}={})=>{
  for(let y=minY;y<=maxY;y+=15)for(let x=minX;x<=maxX;x+=15)if(check(x,y)&&chosen.every(p=>Math.hypot(p.x-x,p.y-y)>85)){const p={x,y};chosen.push(p);return p}
  throw Error('No legal, separated capture fixture position');
 };
 const exposed=(id,species,point,extra={})=>({id,species,...point,heading:0,phase:0,state:'scene',stranded:false,migrant:false,concealmentInitialized:true,concealment:null,revealNeeded:0,revealSteps:0,emergeProgress:1,...extra});
 const swimmer=exposed('capture-swimmer','fish_clown',choose((x,y)=>isHabitatValid('fish_clown',x,y,0,95),{minX:790,maxX:850,minY:410,maxY:480}));
 const shell=exposed('capture-shell','shell',choose((x,y)=>isHabitatValid('shell',x,y,0),{minX:1310,maxX:1450,minY:300,maxY:520}));
 const stranded=(id,species)=>exposed(id,species,choose((x,y)=>{const h=habitatAt(x,y,0);return !h.water&&h.wet&&!h.blocked&&isHabitatValid(species,x,y,1)}),{stranded:true,lastStrandedCycle:0});
 const fish=stranded('capture-stranded-fish','fish_silver'),shrimp=stranded('capture-stranded-shrimp','shrimp'),rescue=stranded('capture-observe-rescue','fish_turquoise');
 const base={version:1,epochMs:now-1500000,nextId:100,entities:[swimmer,shell,fish,shrimp,rescue],catalog:{},shells:0,rescues:0,fallingCycle:0,strandedThisCycle:3};
 const full={...base,entities:[{...swimmer},...Array.from({length:12},(_,i)=>exposed('full-bucket-'+i,'starfish',{x:1360,y:710},{state:'bucket'}))]};
 return{state:base,phone:{...base,epochMs:now-300000,entities:[{...swimmer}],catalog:{},shells:0,rescues:0},full,ids:{swimmer:swimmer.id,shell:shell.id,fish:fish.id,shrimp:shrimp.id,rescue:rescue.id}};
}

function readSceneInPage(targetId){
 const canvas=document.querySelector('.coast-canvas'),key=Object.keys(canvas||{}).find(k=>k.startsWith('__reactFiber$'));
 for(let fiber=canvas?.[key];fiber;fiber=fiber.return)for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){
  const runtime=hook.memoizedState?.current;if(!runtime?.game?.sandDrawing||!runtime.renderer)continue;
  const game=runtime.game,renderer=runtime.renderer,entity=game.entities.find(e=>e.id===targetId);let hit=null;
  if(entity?.state==='scene'){
   const rect=canvas.getBoundingClientRect();
   for(const [dx,dy]of[[0,0],[4,0],[-4,0],[0,4],[0,-4],[8,0],[-8,0],[0,8],[0,-8]]){
    const p=renderer.worldToScreen(entity.x+dx,entity.y+dy),point={x:p.x+rect.left,y:p.y+rect.top};
    if(document.elementFromPoint(point.x,point.y)===canvas&&renderer.hitTest(point.x,point.y,game)?.id===entity.id){hit=point;break}
   }
  }
  return{ready:renderer.ready,hit,tide:{...game.tide},time:renderer.lastTime,state:game.snapshot(),bucketCount:game.bucketCount(),
   entities:game.entities.map(e=>({id:e.id,species:e.species,x:e.x,y:e.y,heading:e.heading,state:e.state,stranded:e.stranded,catchAttempts:e.catchAttempts||0,lastCatchAt:e.lastCatchAt??null,escapeTarget:e.escapeTarget?{...e.escapeTarget}:null,escapeUntil:e.escapeUntil??null,speed:e.speed||0,moveTarget:e.moveTarget?{...e.moveTarget}:null,migration:e.migration??null}))};
 }
 throw Error('Mounted coast runtime unavailable; update the read-only test adapter after React changes');
}

async function smoke(){
 fs.mkdirSync(work,{recursive:true});const profile=fs.mkdtempSync(path.join(work,'capture-'+(packaged?'packaged':'dev')+'-profile-'));
 const executablePath=packaged?(process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池')):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL=process.env.VITE_DEV_SERVER_URL||'http://127.0.0.1:5188/';
 let app,page;
 try{
  app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);
  // Ignore physical mouse interference in this isolated QA window; CDP pointer input remains active.
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.setIgnoreMouseEvents(true)});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData')}));assert.equal(runtime.packaged,packaged);assert.equal(runtime.profile,profile);
  const now=Date.now(),fixture=await makeFixture(now),{isHabitatValid,pathIsHabitatValid}=await import(pathToFileURL(path.join(root,'src/themes/coast/geometry.js')).href);
  const {tideAt}=await import(pathToFileURL(path.join(root,'src/themes/coast/tide.js')).href);
  await page.clock.setFixedTime(now);
  // Test-only session data is read before React mounts. pagehide may save the old
  // scene safely; the next fixture is installed only in the following document.
  await page.addInitScript(()=>{
   const raw=sessionStorage.getItem('capture-smoke-fixture');if(raw)localStorage.setItem('mofish-coast-v1',raw);
   localStorage.setItem('mofish-theme',JSON.stringify('coast'));
   localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',quality:'high',reducedMotion:false,sound:false}));
   if(!localStorage.getItem('fusheng-fish')){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#e59053';ctx.fillRect(25,20,350,80);localStorage.setItem('fusheng-fish',JSON.stringify([{id:'capture-kept-koi',name:'捕捉测试保留锦鲤',texture:canvas.toDataURL(),size:1,appearance:'skin-v2'}]))}
  });
  const cdp=await page.context().newCDPSession(page),viewport=mobile=>cdp.send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1600,height:mobile?844:900,deviceScaleFactor:1,mobile:!!mobile});
  const scene=id=>page.evaluate(readSceneInPage,id),entity=(s,id)=>s.entities.find(e=>e.id===id),caught=(s,species)=>s.state.catalog[species]?.caught||0;
  const waitScene=async(predicate,label,timeout=10000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const s=await scene();if(predicate(s))return s;await page.waitForTimeout(50)}throw Error('Timed out: '+label)};
  const install=async(state,mobile=false)=>{await page.clock.setFixedTime(now);await page.evaluate(value=>sessionStorage.setItem('capture-smoke-fixture',JSON.stringify(value)),state);await viewport(mobile);await page.reload();await page.waitForSelector('.theme-coast');await waitScene(s=>s.ready,'assets ready');const expected=tideAt(state.epochMs,now),actual=(await scene()).tide;assert.equal(actual.phase,expected.phase);assert.ok(Math.abs(actual.level-expected.level)<1e-10)};
  const clickEntity=async id=>{const s=await scene(id);assert.ok(s.hit,'Creature '+id+' must have a visible, reachable painted target');await page.mouse.click(s.hit.x,s.hit.y);return{point:s.hit,before:entity(s,id),after:await scene()}};
  const catchMode=()=>page.getByRole('button',{name:'观察模式，点击切换捕捉',exact:true}).click();
  const observeMode=()=>page.getByRole('button',{name:'捕捉模式，点击切回观察',exact:true}).click();
  const traceEscape=async(id,before)=>{
   const samples=[before],deadline=Date.now()+850;while(Date.now()<deadline){await page.waitForTimeout(65);const s=await scene(),e=entity(s,id);assert.equal(e.state,'scene');assert.ok(isHabitatValid(e.species,e.x,e.y,s.tide.level));const previous=samples.at(-1);assert.ok(pathIsHabitatValid(e.species,previous.x,previous.y,e.x,e.y,s.tide.level),'Escape must use a legal complete segment');samples.push(e)}
   const displacement=Math.hypot(samples.at(-1).x-before.x,samples.at(-1).y-before.y);assert.ok(displacement>5,'An escape click must produce visible real-time movement');return{displacement,samples:samples.length};
  };
  const catchThree=async(id,baseTime)=>{
   const moves=[];let lastPoint;
   for(let attempt=1;attempt<=3;attempt++){
    await page.clock.setFixedTime(baseTime+(attempt-1)*700);const click=await clickEntity(id);lastPoint=click.point;const e=entity(click.after,id);
    if(attempt<3){assert.equal(e.state,'scene');assert.equal(e.catchAttempts,attempt);assert.ok(e.escapeTarget);assert.ok(pathIsHabitatValid(e.species,e.x,e.y,e.escapeTarget.x,e.escapeTarget.y,click.after.tide.level));
     // A second real click at +100ms must not consume another attempt.
     await page.clock.setFixedTime(baseTime+(attempt-1)*700+100);const duplicate=await clickEntity(id);assert.equal(entity(duplicate.after,id).catchAttempts,attempt);assert.equal(duplicate.after.bucketCount,0);moves.push(await traceEscape(id,e));
    }else{assert.equal(e.state,'bucket');assert.equal(caught(click.after,e.species),1)}
   }
   await page.mouse.dblclick(lastPoint.x,lastPoint.y);const after=await scene();assert.equal(entity(after,id).state,'bucket');assert.equal(caught(after,entity(after,id).species),1);return{moves,point:lastPoint};
  };

  await install(fixture.state);const koi=await page.evaluate(()=>localStorage.getItem('fusheng-fish'));
  const observed=await clickEntity(fixture.ids.swimmer);assert.equal(entity(observed.after,fixture.ids.swimmer).state,'scene');assert.equal(observed.after.bucketCount,0);assert.equal(caught(observed.after,'fish_clown'),0);
  const observedShell=await clickEntity(fixture.ids.shell);assert.equal(observedShell.after.state.shells,0);assert.equal(entity(observedShell.after,fixture.ids.shell).state,'scene');
  await catchMode();const shell=await clickEntity(fixture.ids.shell);assert.equal(shell.after.state.shells,1);await page.mouse.dblclick(shell.point.x,shell.point.y);assert.equal((await scene()).state.shells,1);
  const swimming=await catchThree(fixture.ids.swimmer,now+1000);
  const stranded=[];
  for(const id of [fixture.ids.fish,fixture.ids.shrimp]){const before=await scene(id);assert.equal(entity(before,id).stranded,true);const clicked=await clickEntity(id);assert.equal(entity(clicked.after,id).state,'bucket');assert.equal(caught(clicked.after,entity(clicked.after,id).species),1);stranded.push(id);await page.mouse.dblclick(clicked.point.x,clicked.point.y);assert.equal(caught(await scene(),entity(clicked.after,id).species),1)}
  assert.equal((await scene()).bucketCount,3);await observeMode();const rescued=await clickEntity(fixture.ids.rescue);assert.equal(rescued.after.state.rescues,1);assert.equal(rescued.after.bucketCount,3);assert.equal(caught(rescued.after,'fish_turquoise'),0);await page.mouse.dblclick(rescued.point.x,rescued.point.y);assert.equal((await scene()).state.rescues,1);
  // Let real presentation transitions finish under the fixed-Date fixture before the evidence screenshot.
  await page.clock.setFixedTime(now+5000);await page.waitForTimeout(100);
  await catchMode();await page.getByRole('button',{name:/^小桶/}).click();assert.equal(await page.locator('.bucket-row').count(),3);await page.locator('.toast').waitFor({state:'hidden'});await page.evaluate(()=>window.getSelection()?.removeAllRanges());
  const screenshot=packaged?path.join(outputs,'赶海主题-捕捉互动.png'):path.join(work,'capture-interaction-dev.png');await page.screenshot({path:screenshot});await page.getByRole('button',{name:'关闭面板',exact:true}).click();
  await page.evaluate(()=>sessionStorage.removeItem('capture-smoke-fixture'));await page.reload();await page.waitForSelector('.theme-coast');const restored=await waitScene(s=>s.ready,'reload assets');assert.equal(restored.bucketCount,3);assert.equal(restored.state.shells,1);assert.equal(restored.state.rescues,1);assert.equal(caught(restored,'fish_clown'),1);

  await install(fixture.full);await catchMode();const full=await clickEntity(fixture.ids.swimmer),fullFish=entity(full.after,fixture.ids.swimmer);assert.equal(full.after.bucketCount,12);assert.equal(fullFish.state,'scene');assert.equal(fullFish.catchAttempts,0);assert.equal(fullFish.lastCatchAt,null);assert.equal(fullFish.escapeTarget,null);assert.equal(caught(full.after,'fish_clown'),0);
  await install(fixture.phone,true);const phoneTide={...(await scene()).tide};assert.equal(phoneTide.phase,'rising');await catchMode();const phone=await catchThree(fixture.ids.swimmer,now+1000);assert.equal((await scene()).bucketCount,1);await page.screenshot({path:path.join(work,'capture-phone-'+(packaged?'packaged':'dev')+'.png')});
  assert.equal(await page.evaluate(()=>localStorage.getItem('fusheng-fish')),koi);assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const report={result:'PASS',packaged,version:runtime.version,isolatedProfile:true,readOnlySceneAdapter:true,realMouse:true,dateFixtureOnly:true,observeDoesNotCapture:true,observeDoesNotCollect:true,catchCollectsShell:true,threeEffectiveFishClicks:true,swimming,cooldownRejectsSecondClick:true,strandedSingleCatch:stranded,observeRescue:true,fullBucketLeavesCaptureStateUntouched:true,duplicateCountsStable:true,reloadStable:true,phoneTide,phoneRisingCapture:true,phoneReachableCapture:phone,koiUnchanged:true,screenshot,errors};
  fs.writeFileSync(path.join(work,'capture-smoke-'+(packaged?'packaged':'dev')+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){if(page)await page.screenshot({path:path.join(work,'capture-'+(packaged?'packaged':'dev')+'-failure.png')}).catch(()=>{});throw error}
 finally{if(app)await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
module.exports={makeFixture,readSceneInPage,smoke};
if(require.main===module)smoke().catch(error=>{console.error(error);process.exitCode=1});
