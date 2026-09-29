'use strict';
// node electron/coast-bottle-interaction-2.4-smoke.cjs [--packaged]
// Isolated save fixtures place an incoming bottle at its legitimate shore endpoint.
// Every game/UI action is real pointer input. The React adapter only reads stats;
// it never calls a game interaction, changes simulation time, or freezes RAF.
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),label=packaged?'packaged':'dev';
const work=path.resolve(process.env.POND_TEST_WORK||path.resolve(root,'../../work/bottles-v2.4')),out=path.resolve(process.env.POND_TEST_OUTPUT||path.join(work,'screenshots')); 
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;

async function makeFixture(){
 const {BottleDrift}=await import(pathToFileURL(path.join(root,'src/themes/coast/bottles.js')).href);
 const now=Date.now(),storage={value:null,getItem(){return this.value},setItem(key,value){this.value=value}};
 const {TideClock}=await import(pathToFileURL(path.join(root,'src/themes/coast/tide.js')).href);const clock=new TideClock(now-180000,now);
 const drift=new BottleDrift({storage,nowMs:now-180000,random:()=>.3,getTide:time=>clock.bottleArrival(time)});
 for(let time=now-170000;time<=now;time+=10000)drift.update(2,time,0);
 const state=drift.snapshot(),bottle=state.bottles.find(b=>b.kind==='incoming');assert.ok(bottle,'Fixture must use a real generated incoming bottle');
 Object.assign(bottle,bottle.route.at(-1),{routeIndex:bottle.route.length,opacity:1,arrivedAt:now,createdAt:now-30000,expiresAt:now+1200000});
 state.nextArrivalAt=now+3600000;state.lastSeenAt=now;
 return{state,bottle,coast:{version:1,epochMs:now-1500000,nextId:1,entities:[],catalog:{},shells:0,rescues:0}};
}
function readSceneStats(){
 const canvas=document.querySelector('.coast-canvas'),key=Object.keys(canvas||{}).find(k=>k.startsWith('__reactFiber$'));
 for(let fiber=canvas?.[key];fiber;fiber=fiber.return)for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){
  const value=hook.memoizedState?.current;if(value?.renderer&&typeof value.stats==='function')return value.stats();
 }
 return null;
}
function beginLaunchProbe(){
 const canvas=document.querySelector('.coast-canvas'),key=Object.keys(canvas||{}).find(k=>k.startsWith('__reactFiber$'));let runtime;
 for(let fiber=canvas?.[key];fiber&&!runtime;fiber=fiber.return)for(let hook=fiber.memoizedState;hook&&typeof hook==='object';hook=hook.next){
  const value=hook.memoizedState?.current;if(value?.renderer&&typeof value.stats==='function'){runtime=value;break;}
 }
 if(!runtime)throw Error('Read-only coast stats adapter unavailable');
 const probe={startedAt:null,endedAt:null,done:false,error:null,trace:[],captures:{},nativeRAF:/\[native code\]/.test(requestAnimationFrame.toString())};
 window.__bottleLaunchProbe=probe;const armedAt=performance.now();
 // Snapshot the actual two rendered scene layers on their native RAF frame.
 // This prevents screenshot IPC latency from missing the 0.9–1.3s splash.
 // The copy canvas is test-only; app canvases/state are never altered.
 const capture=(name,t,stats)=>{
  const background=document.querySelector('.coast-background'),copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  const ctx=copy.getContext('2d');if(background)ctx.drawImage(background,0,0,copy.width,copy.height);ctx.drawImage(canvas,0,0,copy.width,copy.height);
  probe.captures[name]={atMs:t-probe.startedAt,active:stats.bottleLaunches,width:copy.width,height:copy.height,png:copy.toDataURL('image/png')};
 };
 const tick=t=>{
  const stats=runtime.stats(),count=stats.bottleLaunches||0;if(count&&!probe.startedAt)probe.startedAt=t;
  if(probe.startedAt!==null){
   const elapsed=t-probe.startedAt;probe.trace.push({atMs:elapsed,count});
   if(count&&elapsed>=350&&!probe.captures.midair)capture('midair',t,stats);
   if(count&&elapsed>=1000&&!probe.captures.splash)capture('splash',t,stats);
   if(!count){probe.endedAt=t;probe.done=true;return;}
  }
  if(t-armedAt>12000){probe.error='Launch did not start and finish under real RAF';probe.done=true;return;}
  requestAnimationFrame(tick);
 };
 requestAnimationFrame(tick);return{armed:true,nativeRAF:probe.nativeRAF};
}
function assertNoTransient(state){
 const forbidden=new Set(['launchEffects','bottleLaunches','airborne','splash','startedAt','waterX','waterY']);
 const visit=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){assert.equal(forbidden.has(key),false,'Transient launch data leaked into save: '+key);visit(child)}};visit(state);
}
async function smoke(){
 fs.mkdirSync(work,{recursive:true});fs.mkdirSync(out,{recursive:true});
 const seed=await makeFixture(),profile=fs.mkdtempSync(path.join(work,'bottle-interaction-'+label+'-profile-'));
 const executablePath=packaged?(process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池')):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL=process.env.VITE_DEV_SERVER_URL||'http://127.0.0.1:5188/';
 let app,page;
 try{
  app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(20000);
  // Only the isolated QA window ignores physical mouse input; CDP still sends
  // real browser pointer events and ordinary user windows remain untouched.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.setIgnoreMouseEvents(true)));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData')}));assert.equal(runtime.packaged,packaged);assert.equal(runtime.profile,profile);assert.equal(runtime.version,version);
  await page.addInitScript(()=>{
   const raw=sessionStorage.getItem('bottle-interaction-fixture');
   if(raw){const f=JSON.parse(raw);localStorage.setItem('mofish-bottles-v1',JSON.stringify(f.bottles));localStorage.setItem('mofish-coast-v1',JSON.stringify(f.coast));}
   localStorage.setItem('mofish-theme',JSON.stringify('coast'));
   localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',quality:'high',sound:false,reducedMotion:false}));
   if(!localStorage.getItem('fusheng-fish'))localStorage.setItem('fusheng-fish',JSON.stringify([]));
  });
  const cdp=await page.context().newCDPSession(page),stats=()=>page.evaluate(readSceneStats),state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-bottles-v1')));
  const viewport=width=>cdp.send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:600,deviceScaleFactor:1,mobile:false});
  const install=async(bottles,width=800)=>{
   await viewport(width);await page.evaluate(value=>sessionStorage.setItem('bottle-interaction-fixture',JSON.stringify(value)),{bottles,coast:seed.coast});await page.reload();await page.waitForSelector('.theme-coast');
   await page.waitForFunction(readSceneStats);await page.waitForFunction(({width})=>{const canvas=document.querySelector('.coast-canvas');return canvas&&Math.round(canvas.getBoundingClientRect().width)===width},{width});
   for(let tries=0;tries<200;tries++){const s=await stats();if(s?.ready&&s.spriteCount===17)break;if(tries===199)throw Error('Coast assets did not become ready');await page.waitForTimeout(30);}
   await page.evaluate(()=>sessionStorage.removeItem('bottle-interaction-fixture'));
  };
  const close=async()=>{if(await page.getByRole('dialog').count())await page.getByRole('button',{name:'关闭面板',exact:true}).click()};
  const screenPoint=bottle=>page.locator('.coast-canvas').evaluate((canvas,b)=>{const rect=canvas.getBoundingClientRect(),cover=Math.max(rect.width/1600,rect.height/900);return{x:rect.left+(rect.width-1600*cover)/2+b.x*cover,y:rect.top+(rect.height-900*cover)/2+b.y*cover,cover}},bottle);
  const isExposed=p=>page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains('coast-canvas')===true,p);
  const jiggle=async(p,dx)=>{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+2,{steps:4});await page.mouse.up()};
  const compose=async()=>{await page.getByRole('button',{name:'漂流瓶',exact:true}).click();await page.getByRole('tab',{name:'写一封信',exact:true}).click()};

  // A new send uses the visible form and public button, never the scene method.
  const empty={...seed.state,bottles:[],collection:[],collectedContentIds:[],sent:[]};await install(empty);
  const koi=await page.evaluate(()=>localStorage.getItem('fusheng-fish'));
  await compose();const body='把今天画成一阵轻轻的海风。';await page.getByLabel('想对大海说些什么？',{exact:true}).fill(body);await page.getByRole('textbox',{name:'漂流信落款',exact:true}).fill('海边测试');
  const armed=await page.evaluate(beginLaunchProbe);assert.equal(armed.nativeRAF,true,'Animation evidence must use native RAF, not an accelerated test clock');
  await page.getByRole('button',{name:'放回海里',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.__bottleLaunchProbe?.startedAt!==null);assert.equal(await page.getByRole('dialog').count(),0,'A successful send closes the writing panel');
  const initialSent=await state();assert.equal(initialSent.sent.length,1);assert.equal(initialSent.sent[0].body,body);assert.equal(initialSent.collection.length,0);assert.equal(initialSent.bottles.filter(b=>b.kind==='outgoing').length,1);assertNoTransient(initialSent);
  await page.waitForFunction(()=>window.__bottleLaunchProbe?.done,{},{timeout:15000});
  const launch=await page.evaluate(()=>window.__bottleLaunchProbe);assert.equal(launch.error,null);assert.ok(launch.trace.some(s=>s.count===1));assert.equal(launch.trace.at(-1).count,0);assert.ok(launch.endedAt>launch.startedAt);assert.equal((await stats()).bottleLaunches,0);
  const launchImages={};
  for(const phase of ['midair','splash']){const capture=launch.captures[phase];assert.ok(capture,'Native RAF must capture '+phase);assert.equal(capture.active,1);const file=path.join(out,'漂流瓶-'+phase+'-'+label+'.png');fs.writeFileSync(file,Buffer.from(capture.png.split(',')[1],'base64'));launchImages[phase]={file,atMs:capture.atMs,width:capture.width,height:capture.height};}
  assertNoTransient(await state());
  // The saved send location remains within the 44 CSS pixel target after the
  // approximately 8–9 world px drift during the short throwing illustration.
  const outgoing=initialSent.bottles.find(b=>b.kind==='outgoing'),sentPoint=await screenPoint(outgoing);assert.equal(await isExposed(sentPoint),true);
  await page.mouse.click(sentPoint.x,sentPoint.y);await page.locator('.letter-paper-personal').waitFor();assert.equal(await page.getByLabel('漂流信正文',{exact:true}).inputValue(),body);
  assert.equal(await page.getByRole('tab',{name:'放流记录',exact:true}).getAttribute('aria-selected'),'true');
  const readSent=await state();assert.equal(readSent.collection.length,0);assert.equal(readSent.sent.length,1);assert.ok(readSent.bottles.some(b=>b.id===outgoing.id),'Reading a sent bottle must leave it drifting');await close();

  const cases=[];
  for(const width of [800,390])for(const mode of ['observe','catch']){
   await install(seed.state,width);if(mode==='catch')await page.getByRole('button',{name:'观察模式，点击切换捕捉',exact:true}).click();
   const before=await state(),point=await screenPoint(seed.bottle);assert.equal(await isExposed(point),true,'Bottle center must be in the visible canvas');
   const beforeStats=await stats();
   // Opening a panel covers exactly the same world-space bottle. Clicking that
   // coordinate must hit UI only, even when the native global pointer hook exists.
   await page.getByRole('button',{name:'漂流瓶',exact:true}).click();assert.equal(await isExposed(point),false,'Fixture bottle must really be occluded by this UI');
   await page.mouse.click(point.x,point.y);assert.equal((await state()).collection.length,before.collection.length);assert.ok((await state()).bottles.some(b=>b.id===seed.bottle.id));await close();
   assert.equal(await isExposed(point),true);const driftPx=mode==='observe'?8:12;await jiggle(point,driftPx);
   await page.locator('.bottle-reading').waitFor();const after=await state();assert.equal(after.collection.length,before.collection.length+1);assert.equal(after.collection[0].id,seed.bottle.id);assert.equal(after.bottles.some(b=>b.id===seed.bottle.id),false);
   assert.equal((await stats()).sandSegments,beforeStats.sandSegments,'A bottle tap may never become a sand stroke');
   assert.equal(after.sent.length,before.sent.length);assertNoTransient(after);
   // A second click on the now-open reader is still UI and cannot duplicate it.
   await page.mouse.click(point.x,point.y);assert.equal((await state()).collection.length,after.collection.length);
   const image=path.join(out,`漂流瓶-拾取-${width}-${mode}-${label}.png`);await page.screenshot({path:image});
   cases.push({width,mode,driftPx,cover:point.cover,uiOcclusion:true,collected:after.collection[0].id,screenshot:image});
   await close();await page.reload();await page.waitForSelector('.theme-coast');await page.waitForFunction(readSceneStats);assert.equal((await state()).collection.length,after.collection.length);assert.equal((await state()).bottles.some(b=>b.id===seed.bottle.id),false);
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('fusheng-fish')),koi);assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const report={result:'PASS',packaged,version:runtime.version,isolatedProfile:true,realPointerActions:true,readOnlyStatsAdapter:true,nativeRAF:true,successfulSendClosesPanel:true,
   launch:{startsOnce:launch.trace.filter((s,i)=>s.count===1&&(i===0||launch.trace[i-1].count===0)).length,elapsedMs:launch.endedAt-launch.startedAt,trace:launch.trace,images:launchImages},
   noTransientSaveFields:true,sentBottleReadWithoutCollection:true,incomingCases:cases,koiUnchanged:true,errors};assert.equal(report.launch.startsOnce,1);
  const reportPath=path.join(work,'bottle-interaction-2.4-'+label+'.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){if(page)await page.screenshot({path:path.join(work,'bottle-interaction-2.4-'+label+'-failure.png')}).catch(()=>{});throw error}
 finally{if(app)await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
module.exports={smoke,makeFixture,readSceneStats,beginLaunchProbe};if(require.main===module)smoke().catch(error=>{console.error(error);process.exitCode=1});
