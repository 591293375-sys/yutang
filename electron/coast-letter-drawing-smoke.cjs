'use strict';
// node electron/coast-letter-drawing-smoke.cjs [--packaged]
// Isolated native application acceptance check; never uses the user's profile.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const work=path.resolve(root,'../../work/bottles-v2.4');fs.mkdirSync(work,{recursive:true});
const {_electron}=require(path.join(root,'node_modules/@playwright/test'));
const packaged=process.argv.includes('--packaged'),outputs=path.resolve(root,'..');
async function run(){
 const profile=fs.mkdtempSync(path.join(work,'letter-profile-'));
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL='http://127.0.0.1:5188/';
 const executablePath=packaged?path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池'):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],env});let page;
 try{
  page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,profile:app.getPath('userData')}));assert.equal(runtime.profile,profile);assert.equal(runtime.packaged,packaged);
  await page.evaluate(()=>{localStorage.setItem('mofish-theme',JSON.stringify('coast'));localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',sound:false,quality:'high'}));});
  await page.reload();await page.waitForSelector('.theme-coast');const cdp=await page.context().newCDPSession(page);
  const viewport=(mobile=false)=>cdp.send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:1000,deviceScaleFactor:1,mobile});
  await viewport();
  // Physical user pointer events must not cancel the isolated CDP drawing drag.
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.setIgnoreMouseEvents(true)});
  const close=()=>page.getByRole('button',{name:'关闭面板',exact:true}).click();
  const compose=async()=>{await page.getByRole('button',{name:'漂流瓶',exact:true}).click();await page.getByRole('tab',{name:'写一封信',exact:true}).click()};
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-bottles-v1')));
  const stroke=async(points)=>{
   const canvas=page.getByRole('img',{name:'漂流信画纸',exact:true});await canvas.scrollIntoViewIfNeeded();
   await canvas.evaluate(el=>{window.letterPointerTrace=[];window.letterPointerListener=e=>{const r=el.getBoundingClientRect();window.letterPointerTrace.push({type:e.type,time:performance.now(),x:e.clientX,y:e.clientY,id:e.pointerId,buttons:e.buttons,hidden:document.hidden,bounds:[r.x,r.y,r.width,r.height]})};for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])el.addEventListener(type,window.letterPointerListener);});
   const r=await canvas.boundingBox();await page.mouse.move(r.x+r.width*points[0][0],r.y+r.height*points[0][1]);await page.mouse.down();for(const [x,y]of points.slice(1))await page.mouse.move(r.x+r.width*x,r.y+r.height*y,{steps:3});await page.mouse.up();
   const trace=await canvas.evaluate(el=>{for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])el.removeEventListener(type,window.letterPointerListener);return window.letterPointerTrace;});
   const quotaBlocked=await page.evaluate(()=>!!window.letterOriginalSet),saved=(await state()).draft.drawing.strokes.at(-1);
   fs.appendFileSync(path.join(work,'letter-pointer-trace.jsonl'),JSON.stringify({points,bounds:r,trace,saved,quotaBlocked})+'\n');
   if(!quotaBlocked){assert.ok(saved);const expected=points.at(-1),actual=saved.points.at(-1);assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<.008,'Saved stroke must reach requested endpoint: '+JSON.stringify({expected,actual,trace:trace.filter(e=>e.type!=='pointermove')}));}
  };
  const ink=()=>page.locator('.bottle-letter-canvas').evaluate(async el=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const d=el.getContext('2d').getImageData(0,0,el.width,el.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>10)n++;return n});
  const coastCounts=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('mofish-coast-v1'));return{shells:s.shells,bucket:s.entities.filter(e=>e.state==='bucket').map(e=>e.id)}});
  const quota=on=>page.evaluate(on=>{if(on){window.letterOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='mofish-bottles-v1')throw new DOMException('Test quota','QuotaExceededError');return window.letterOriginalSet.call(this,k,v)}}else{Storage.prototype.setItem=window.letterOriginalSet;delete window.letterOriginalSet}},on);
  await compose();assert.equal((await state()).draft.drawing.strokes.length,0);await page.waitForFunction(()=>!!localStorage.getItem('mofish-coast-v1'));const counts=await coastCounts();
  await page.getByLabel('想对大海说些什么？').fill('把今天的一小片海，画给远方的你。');
  const paperAlignment=()=>page.evaluate(()=>{const text=document.querySelector('.bottle-paper-body').getBoundingClientRect(),ink=document.querySelector('.bottle-letter-canvas').getBoundingClientRect();return Math.abs(text.x-ink.x)<1&&Math.abs(text.y-ink.y)<1&&Math.abs(text.width-ink.width)<1&&Math.abs(text.height-ink.height)<1});assert.equal(await paperAlignment(),true,'text and ink occupy the exact same sheet');await page.getByRole('textbox',{name:'漂流信落款'}).fill('海边散步的人');
  // A tiny shoreline scene, made exclusively by the public pointer controls.
  await page.getByRole('button',{name:'海蓝画笔',exact:true}).click();
  for(let y of [.56,.64,.72])await stroke(Array.from({length:20},(_,i)=>[.14+i*.037,y+Math.sin(i*.7)*.025]));
  await page.getByRole('button',{name:'沙金画笔',exact:true}).click();await page.getByRole('button',{name:'粗笔',exact:true}).click();
  await stroke(Array.from({length:40},(_,i)=>[.72+Math.cos(i/39*Math.PI*2)*.085,.28+Math.sin(i/39*Math.PI*2)*.12]));
  await page.getByRole('button',{name:'珊瑚画笔',exact:true}).click();await stroke([[.32,.4],[.38,.24],[.38,.42],[.32,.4],[.46,.42],[.41,.47],[.35,.47],[.32,.4]]);
  let drawing=(await state()).draft.drawing;assert.equal(drawing.strokes.length,5);assert.ok(await ink()>500);assert.deepEqual(await coastCounts(),counts);
  await page.getByRole('button',{name:'橡皮',exact:true}).click();const originalInk=await ink();await stroke([[.1,.64],[.9,.64]]);assert.equal((await state()).draft.drawing.strokes.at(-1).tool,'eraser');assert.ok(await ink()<originalInk);
  await page.getByRole('button',{name:'撤销画笔',exact:true}).click();assert.deepEqual((await state()).draft.drawing,drawing);
  await page.getByRole('button',{name:'清空画纸',exact:true}).click();assert.equal((await state()).draft.drawing.strokes.length,0);assert.equal(await ink(),0);
  await page.getByRole('button',{name:'撤销画笔',exact:true}).click();assert.deepEqual((await state()).draft.drawing,drawing);
  await page.getByRole('button',{name:'打字',exact:true}).click();await page.getByLabel('想对大海说些什么？').fill('把今天的一小片海，画给远方的你。\n愿你的今天有一点点晴朗。');assert.deepEqual((await state()).draft.drawing,drawing);
  await close();await page.reload();await page.waitForSelector('.theme-coast');await compose();assert.deepEqual((await state()).draft.drawing,drawing);assert.ok(await ink()>500);
  await viewport(true);await page.getByRole('img',{name:'漂流信画纸',exact:true}).scrollIntoViewIfNeeded();assert.equal(await page.locator('.panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);assert.deepEqual((await state()).draft.drawing,drawing);assert.ok(await ink()>100);assert.equal(await paperAlignment(),true);await page.screenshot({path:path.join(work,'信纸绘画-窄窗口.png')});
  await viewport();await quota(true);await page.getByRole('button',{name:'松绿画笔',exact:true}).click();await stroke([[.14,.3],[.18,.27],[.22,.3],[.26,.27],[.3,.3]]);
  await page.getByRole('alert').first().waitFor();assert.deepEqual((await state()).draft.drawing,drawing);
  await close();await compose();assert.ok(await ink()>500);await page.getByRole('button',{name:'放回海里',exact:true}).click();await page.getByRole('alert').first().waitFor();assert.equal((await state()).sent.length,0);await quota(false);
  await page.getByRole('button',{name:'放回海里',exact:true}).dblclick();await page.getByRole('dialog').waitFor({state:'hidden'});let saved=await state();assert.equal(saved.sent.length,1);assert.equal(saved.sent[0].drawing.strokes.length,6);assert.equal(saved.draft.drawing.strokes.length,0);drawing=saved.sent[0].drawing;
  await page.reload();await page.waitForSelector('.theme-coast');await page.getByRole('button',{name:'漂流瓶',exact:true}).click();await page.getByRole('tab',{name:'放流记录',exact:true}).click();await page.locator('.bottle-letter-row').click();await page.getByRole('img',{name:'漂流信中的画',exact:true}).waitFor();assert.deepEqual((await state()).sent[0].drawing,drawing);assert.ok(await ink()>500);
  await page.locator('.letter-paper').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(packaged?outputs:work,'漂流瓶-画给海的一封信.png')});await close();
  await compose();await page.getByRole('button',{name:'海蓝画笔',exact:true}).click();await stroke([[.2,.5],[.4,.3],[.6,.5],[.8,.3]]);assert.equal(await page.getByLabel('想对大海说些什么？').inputValue(),'');assert.equal(await page.getByRole('button',{name:'放回海里',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'放回海里',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});saved=await state();assert.equal(saved.sent.length,2);assert.equal(saved.sent[0].body,'');assert.equal(saved.sent[0].drawing.strokes.length,1);assert.deepEqual(errors,[]);
  const report={result:'PASS',...runtime,profile:'isolated',samePaperTextAndInk:true,textEditsPreserveInk:true,pointerDrawing:true,pointerEndpoints:true,physicalMouseIsolated:true,colorsWidths:true,eraserUndoClear:true,noSceneClickLeak:true,draftReloadAndResize:true,failedSaveRetainedAcrossClose:true,sendQuotaRollback:true,doubleSendOnce:true,sentDrawingReload:true,pictureOnlySend:true,errors};fs.writeFileSync(path.join(work,`letter-drawing-${packaged?'packaged':'dev'}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(e){if(page)await page.screenshot({path:path.join(work,`letter-failure-${packaged?'packaged':'dev'}.png`)}).catch(()=>{});throw e}finally{await app.close();fs.rmSync(profile,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1});
