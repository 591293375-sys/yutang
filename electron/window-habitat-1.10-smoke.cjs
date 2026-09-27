'use strict';
// Browser plugin not available. Isolated Electron/Playwright profile; no user data.
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),work=path.resolve(root,'../../work/1.10');
async function run(){
 const profile=fs.mkdtempSync(path.join(work,'window-profile-'));
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,`--user-data-dir=${profile}`],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});
 let closed=false;
 try {
  const page=await app.firstWindow();page.setDefaultTimeout(15000);console.log('loaded');const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.scene-actions .desktop-button');
  const runtime=await app.evaluate(({BrowserWindow,app})=>{const w=BrowserWindow.getAllWindows()[0];return {profile:app.getPath('userData'),movable:w.isMovable(),resizable:w.isResizable(),fullscreenable:w.isFullScreenable(),closable:w.isClosable()}});
  assert.equal(runtime.profile,profile);for(const key of ['movable','resizable','fullscreenable','closable'])assert.equal(runtime[key],true);
  assert.equal(await page.locator('.dock button').count(),6);
  assert.deepEqual(await page.locator('.scene-actions button span').allTextContents(),['桌面','沉浸']);
  assert.equal(await page.locator('.pond-canvas').evaluate(c=>getComputedStyle(c).cursor),'default');
  assert.equal(await page.locator('.window-drag').evaluate(c=>getComputedStyle(c).getPropertyValue('-webkit-app-region')),'drag');
  const layout=[];
  const cdp=await page.context().newCDPSession(page);
  for(const width of [390,560,680,1082,1357,1920]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:897,deviceScaleFactor:1,mobile:false});
   await page.waitForFunction(w=>innerWidth===w,width);
   const metrics=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};return {dock:box('.dock'),actions:box('.scene-actions'),status:box('.scene-status'),cursor:getComputedStyle(document.querySelector('.pond-canvas')).cursor}});
   const overlaps=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
   assert.ok(!overlaps(metrics.actions,metrics.dock));assert.ok(!overlaps(metrics.actions,metrics.status));
   assert.ok(metrics.actions.x>=0&&metrics.actions.right<=width&&metrics.dock.x>=0&&metrics.dock.right<=width);
   layout.push({width,...metrics});
   if(width===390||width===1082)await page.screenshot({path:path.join(work,`home-${width}.png`)});
  }
  console.log('layout passed');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1082,897));
  await page.waitForFunction(()=>innerWidth===1082);
  await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(e=>/\/src\/engine\/pond\.js/.test(e.name)).name;const {PondEngine}=await import(url);const original=PondEngine.prototype.render;PondEngine.prototype.render=function(...a){window.testEngine=this;return original.apply(this,a)}});
  await page.waitForFunction(()=>!!window.testEngine);
  await page.evaluate(()=>{window.testEngine.updateOptions({paused:true});window.testEngine.sim.food=[]});
  // The visible lower-right bank is still land after cover cropping.
  await page.locator('.pond-canvas').click({position:{x:1050,y:620}});
  assert.equal(await page.evaluate(()=>window.testEngine.sim.food.length),0);
  await page.locator('.pond-canvas').click({position:{x:550,y:460}});
  assert.ok(await page.evaluate(()=>window.testEngine.sim.food.length>0));
  const simulation=await page.evaluate(()=>{const sim=window.testEngine.sim;sim.updateOptions({paused:false,fishCount:24,turtleCount:4});let escaped=0;for(let i=0;i<1800;i++){sim.update(1/60);for(const animal of [...sim.fish,...sim.turtles])if(!sim.habitat.contains(animal.x,animal.y,sim.bodyRadius(animal)-.05))escaped++}return {escaped,fish:sim.fish.length,turtles:sim.turtles.length}});
  assert.equal(simulation.escaped,0);console.log('habitat passed');
  await page.getByRole('button',{name:'窗口全屏',exact:true}).click();
  await page.waitForFunction(async()=> (await window.pondDesktop.getState()).fullScreen);
  await page.getByRole('button',{name:'退出全屏',exact:true}).waitFor();
  await page.getByRole('button',{name:'退出全屏',exact:true}).click();
  await page.waitForFunction(async()=> !(await window.pondDesktop.getState()).fullScreen);
  await page.getByRole('button',{name:'窗口全屏',exact:true}).click();
  await page.waitForFunction(async()=> (await window.pondDesktop.getState()).fullScreen);
  console.log('fullscreen passed');
  await page.getByRole('button',{name:'桌面模式',exact:true}).click();
  await page.waitForFunction(async()=>{const s=await window.pondDesktop.getState();return s.desktopMode&&!s.fullScreen});
  await page.locator('.window-bar').waitFor({state:'detached'});
  console.log('restoring window');
  await page.evaluate(()=>window.pondDesktop.showControls());
  await page.getByRole('button',{name:'隐藏窗口',exact:true}).waitFor();
  await page.getByRole('button',{name:'沉浸',exact:true}).click();
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],b=w.getBounds();w.setPosition(b.x+10,b.y+10)});
  await page.waitForTimeout(150);
  assert.equal(await page.locator('main').evaluate(c=>c.classList.contains('immersive')),true,'Moving the window must not reset immersion');
  await page.getByRole('button',{name:'退出沉浸模式',exact:true}).click();
  await page.getByRole('button',{name:'隐藏窗口',exact:true}).click();
  await page.waitForFunction(async()=>!(await window.pondDesktop.getState()).visible,null,{polling:100});
  console.log('restoring window');
  await page.evaluate(()=>window.pondDesktop.showControls());
  await page.waitForFunction(async()=>(await window.pondDesktop.getState()).visible);
  await page.getByRole('button',{name:'最小化窗口',exact:true}).click();
  await page.waitForFunction(async()=>(await window.pondDesktop.getState()).minimized,null,{polling:100});
  console.log('restoring window');
  await page.evaluate(()=>window.pondDesktop.showControls());
  await page.waitForFunction(async()=>!(await window.pondDesktop.getState()).minimized);
  const restored=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {movable:w.isMovable(),resizable:w.isResizable(),fullScreenable:w.isFullScreenable(),bounds:w.getBounds()}});
  assert.ok(restored.movable&&restored.resizable&&restored.fullScreenable);
  await page.screenshot({path:path.join(work,'window-controls.png')});
  assert.deepEqual(errors,[]);
  const exited=app.waitForEvent('close');await page.getByRole('button',{name:'关闭程序',exact:true}).click();await exited;closed=true;
  console.log(JSON.stringify({result:'PASS',runtime,layout,simulation,fullscreen:true,fullscreenToDesktop:true,hideRestore:true,minimizeRestore:true,closeExits:true,restored,errors},null,2));
 } finally {if(!closed)await app.close();fs.rmSync(profile,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1});
