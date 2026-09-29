'use strict';
// node electron/coast-bottle-smoke.cjs [--packaged]
// Only the isolated test fixture moves a real rising-tide arrival near shore.
// Production timing is once per rising tide; no application clock override.
const {_electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),work=path.resolve(root,'../../work/bottles-v2.4'),outputs=path.resolve(root,'..');
async function fixture(){
 const {BottleDrift}=await import(pathToFileURL(path.join(root,'src/themes/coast/bottles.js')).href),now=Date.now(),storage={value:null,getItem(){return this.value},setItem(key,value){this.value=value}};
 const {TideClock}=await import(pathToFileURL(path.join(root,'src/themes/coast/tide.js')).href);const clock=new TideClock(now-180000,now);
 const drift=new BottleDrift({storage,nowMs:now-180000,random:()=>.3,getTide:time=>clock.bottleArrival(time)});
 for(let time=now-170000;time<=now;time+=10000)drift.update(2,time,0);
 const state=drift.snapshot(),bottle=state.bottles[0];assert.ok(bottle);
 Object.assign(bottle,bottle.route.at(-1),{routeIndex:bottle.route.length,opacity:1,arrivedAt:now});
 return{state,bottle};
}
async function smoke(){
 fs.mkdirSync(work,{recursive:true});const seed=await fixture(),profile=fs.mkdtempSync(path.join(work,'bottle-profile-'));
 const executablePath=packaged?(process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池')):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL=process.env.VITE_DEV_SERVER_URL||'http://127.0.0.1:5188/';
 const app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env});let page;
 try{
  page=await app.firstWindow();page.setDefaultTimeout(15000);
  // Ignore physical mouse interference in this isolated QA window; CDP pointer input remains active.
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.setIgnoreMouseEvents(true)});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData')}));assert.equal(runtime.packaged,packaged);assert.equal(runtime.profile,profile);
  await page.evaluate(state=>{
   localStorage.setItem('mofish-theme',JSON.stringify('coast'));localStorage.setItem('mofish-bottles-v1',JSON.stringify(state));localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',sound:false,quality:'high'}));
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#d96043';ctx.fillRect(30,30,400,60);
   localStorage.setItem('fusheng-fish',JSON.stringify([{id:'bottle-test-kept-fish',name:'漂流瓶保留锦鲤',texture:canvas.toDataURL(),size:1,appearance:'skin-v2'}]));
  },seed.state);
  await page.reload();await page.waitForSelector('.theme-coast');const koi=await page.evaluate(()=>localStorage.getItem('fusheng-fish')),cdp=await page.context().newCDPSession(page);
  const viewport=(mobile=false)=>cdp.send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1600,height:mobile?844:900,deviceScaleFactor:1,mobile});
  const close=()=>page.getByRole('button',{name:'关闭面板',exact:true}).click();
  const openCompose=async()=>{await page.getByRole('button',{name:'漂流瓶',exact:true}).click();await page.getByRole('tab',{name:'写一封信',exact:true}).click()};
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-bottles-v1')));
  const quota=enabled=>page.evaluate(enabled=>{if(enabled){window.bottleOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='mofish-bottles-v1')throw new DOMException('Test storage full','QuotaExceededError');return window.bottleOriginalSet.call(this,key,value)}}else{Storage.prototype.setItem=window.bottleOriginalSet;delete window.bottleOriginalSet}},enabled);
  await viewport(true);await openCompose();
  const prefix='<script>window.bottleXss=1</script>\n',body=prefix+'把今天的一点开心留给海。'.repeat(60).slice(0,600-prefix.length);
  await page.getByLabel('想对大海说些什么？').fill(body);await page.getByRole('textbox',{name:'漂流信落款'}).fill('一个路过海边的人');
  assert.equal((await state()).draft.body,body);assert.equal(body.length,600);assert.equal(await page.getByLabel('想对大海说些什么？').getAttribute('maxlength'),'600');
  assert.equal(await page.locator('.panel').evaluate(p=>p.scrollWidth<=p.clientWidth+1),true);await page.screenshot({path:path.join(work,'漂流瓶-手机长信.png')});await close();
  await page.reload();await page.waitForSelector('.theme-coast');await openCompose();assert.equal(await page.getByLabel('想对大海说些什么？').inputValue(),body);
  const before=await state();await quota(true);await page.getByRole('button',{name:'放回海里'}).click();await page.getByRole('alert').waitFor();assert.deepEqual(await state(),before);assert.equal(await page.getByRole('dialog').count(),1);await quota(false);
  await page.getByRole('button',{name:'放回海里'}).dblclick();await page.getByRole('dialog').waitFor({state:'hidden'});
  const sent=await state();assert.equal(sent.sent.length,1);assert.equal(sent.sent[0].body,body);assert.equal(sent.bottles.filter(b=>b.kind==='outgoing').length,1);assert.equal(sent.draft.body,'');
  await viewport();await page.reload();await page.waitForSelector('.theme-coast');await page.getByRole('button',{name:'漂流瓶',exact:true}).click();await page.getByRole('tab',{name:'放流记录',exact:true}).click();await page.locator('.bottle-letter-row').click();
  assert.equal(await page.locator('.bottle-paper-body').inputValue(),body);assert.equal(await page.evaluate(()=>window.bottleXss),undefined);assert.equal(await page.locator('.letter-paper script').count(),0);await close();
  const point=await page.locator('.coast-canvas').evaluate((canvas,p)=>{const r=canvas.getBoundingClientRect(),s=Math.max(r.width/1600,r.height/900);return{x:r.left+(r.width-1600*s)/2+p.x*s,y:r.top+(r.height-900*s)/2+p.y*s}},seed.bottle);
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains('coast-canvas'),point),true);
  await quota(true);const beforePickup=await state();await page.mouse.click(point.x,point.y);await page.getByText('没能保存到本机，漂流瓶还留在原处，请稍后再试。',{exact:true}).waitFor();assert.deepEqual(await state(),beforePickup);assert.equal(await page.getByRole('dialog').count(),0);await quota(false);
  await page.mouse.dblclick(point.x,point.y);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mofish-bottles-v1')).collection.length===1);assert.equal((await state()).collection.length,1);
  if(!await page.locator('.letter-paper').count()){if(await page.getByRole('dialog').count())await close();await page.getByRole('button',{name:'漂流瓶',exact:true}).click();await page.locator('.bottle-letter-row').click()}
  await page.locator('.bottle-curated-page').waitFor();await page.waitForFunction(()=>document.querySelector('.bottle-curated-page')?.naturalWidth>1000);assert.equal((await state()).collection[0].contentId,seed.bottle.letter.contentId);assert.equal((await state()).bottles.some(b=>b.id===seed.bottle.id),false);
  await page.locator('.toast').waitFor({state:'hidden'});await page.evaluate(()=>window.getSelection()?.removeAllRanges());const screenshot=packaged?path.join(outputs,'漂流瓶-读一封海边来信.png'):path.join(work,'漂流瓶-海边来信.png');await page.screenshot({path:screenshot});
  await viewport(true);assert.equal(await page.locator('.panel').evaluate(p=>p.scrollWidth<=p.clientWidth+1),true);await page.screenshot({path:path.join(work,'漂流瓶-手机来信.png')});await close();
  await page.reload();await page.waitForSelector('.theme-coast');assert.equal((await state()).collection.length,1);assert.equal((await state()).sent.length,1);assert.equal(await page.evaluate(()=>localStorage.getItem('fusheng-fish')),koi);
  assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const report={result:'PASS',packaged,version:runtime.version,isolatedProfile:true,fixtureOnlyArrivalAcceleration:true,draftSavedAcrossCloseAndReload:true,mobile600Characters:true,sendStartsBottle:true,doubleSendOnce:true,sendQuotaRollsBack:true,pickupQuotaRollsBack:true,rapidPickupOnce:true,reloadStored:true,htmlIsPlainText:true,canvasPickup:true,readOriginalLetter:true,koiUnchanged:true,screenshot,errors};fs.writeFileSync(path.join(work,`bottle-smoke-${packaged?'packaged':'dev'}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){if(page)await page.screenshot({path:path.join(work,`bottle-${packaged?'packaged':'dev'}-failure.png`)}).catch(()=>{});throw error}finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
smoke().catch(error=>{console.error(error);process.exitCode=1});
