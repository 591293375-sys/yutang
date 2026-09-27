'use strict';
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../work');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const profile=fs.mkdtempSync(path.join(out,'studio-1.8-profile-'));
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,`--user-data-dir=${profile}`],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
  await page.evaluate(()=>{localStorage.setItem('fusheng-fish','[]');localStorage.setItem('fusheng-settings',JSON.stringify({season:'autumn',weather:'sunny',day:'day',fishCount:12,fishSize:1,turtleCount:0,quality:'high',sound:false,reducedMotion:false,volume:.18}))});await page.reload();
  await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(r=>r.name).findLast(u=>u.includes('/src/engine/pond.js'));const {PondEngine}=await import(url);const render=PondEngine.prototype.render;PondEngine.prototype.render=function(...args){window.testEngine=this;return render.apply(this,args)}});await page.waitForFunction(()=>window.testEngine);
  await page.getByRole('button',{name:'画锦鲤',exact:true}).click();const board=page.getByLabel('锦鲤绘画画布');
  await page.waitForFunction(()=>document.querySelector('[aria-label="锦鲤绘画画布"]').getContext('2d').getImageData(740,320,1,1).data[3]>0);
  const redPixels=()=>board.evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>150&&d[i]>d[i+1]*1.3&&d[i]>d[i+2]*1.3)n++;return n});
  assert.equal(await redPixels(),0,'New koi has no preset orange markings');
  await page.screenshot({path:path.join(out,'blank-koi-1.8.png')});
  const box=await board.boundingBox();await page.mouse.move(box.x+box.width*.61,box.y+box.height*.46);await page.mouse.down();await page.mouse.move(box.x+box.width*.66,box.y+box.height*.52,{steps:8});await page.mouse.up();await page.waitForTimeout(100);
  assert.ok(await redPixels()>100,'Paint is applied to anatomical fish');const paintedRed=await redPixels();
  await page.getByRole('button',{name:/小乌龟/}).click();await page.getByRole('button',{name:'绘制锦鲤',exact:true}).click();await page.waitForTimeout(100);const restoredRed=await redPixels();assert.ok(Math.abs(restoredRed-paintedRed)<paintedRed*.02+10,'Switching tabs preserves painted pattern');
  await page.getByRole('button',{name:'撤销一笔',exact:true}).click();await page.waitForTimeout(100);assert.equal(await redPixels(),0,'Undo returns to plain white fish');
  await page.mouse.click(box.x+box.width*.62,box.y+box.height*.5);await page.waitForTimeout(100);assert.ok(await redPixels()>100);
  await page.getByRole('button',{name:'重新绘制',exact:true}).click();await page.waitForTimeout(100);assert.equal(await redPixels(),0,'Reset returns to plain white fish');assert.ok(await page.getByRole('button',{name:'撤销一笔',exact:true}).isDisabled());
  await page.getByRole('textbox',{name:'锦鲤名字'}).fill('白玉测试');await page.getByRole('button',{name:'放入池塘',exact:true}).click();await page.waitForFunction(()=>window.testEngine.sim.fish.some(f=>f.custom?.name==='白玉测试'));
  const skin=await page.evaluate(async()=>{const f=JSON.parse(localStorage.getItem('fusheng-fish'))[0],img=new Image();img.src=f.texture;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let marked=0;for(let i=0;i<d.length;i+=4)if(d[i]!==255||d[i+1]!==246||d[i+2]!==223||d[i+3]!==255)marked++;return {marked,width:c.width,height:c.height,appearance:f.appearance}});assert.equal(skin.marked,0);assert.equal(skin.appearance,'skin-v2');
  await page.getByRole('button',{name:'画锦鲤',exact:true}).click();await page.waitForTimeout(100);assert.equal(await redPixels(),0,'Reopening starts blank');await page.getByRole('button',{name:/小乌龟/}).click();
  await page.getByRole('button',{name:'请一只入池',exact:true}).click();await page.waitForFunction(()=>window.testEngine.sim.turtles.length===1);await page.getByRole('status').waitFor({state:'hidden'});await page.screenshot({path:path.join(out,'turtle-studio-1.8.png')});
  const turtleBefore=await page.getByRole('img',{name:'缓缓划水的小乌龟'}).evaluate(c=>c.toDataURL());await page.waitForTimeout(500);assert.notEqual(await page.getByRole('img',{name:'缓缓划水的小乌龟'}).evaluate(c=>c.toDataURL()),turtleBefore,'Turtle preview paddles');
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'增加一只小乌龟',exact:true}).click();assert.ok(await page.getByRole('button',{name:'增加一只小乌龟',exact:true}).isDisabled());
  await page.getByRole('button',{name:'关闭面板',exact:true}).click();await page.getByRole('button',{name:'桌面模式',exact:true}).click();await page.waitForFunction(async()=> (await window.pondDesktop.getState()).desktopMode);
  await page.waitForFunction(()=>Math.max(document.querySelector('.pond-canvas').width,document.querySelector('.pond-canvas').height)>=3840);
  const desktop=await page.evaluate(async()=>({state:await window.pondDesktop.getState(),stats:window.testEngine.getStats()}));assert.equal(desktop.state.globalInteraction,false);assert.deepEqual(desktop.stats.backgroundSize,[desktop.stats.width,desktop.stats.height]);
  await page.evaluate(()=>window.pondDesktop.showControls());await page.getByRole('button',{name:'桌面模式',exact:true}).waitFor({state:'visible'});
  // Test the actual browser-only branch, with no preload bridge, in this isolated profile.
  const browserWindow=app.waitForEvent('window');await app.evaluate(({BrowserWindow})=>{const browser=new BrowserWindow({show:false,width:1082,height:897,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});browser.loadURL('http://127.0.0.1:5188/')});const web=await browserWindow;web.on('pageerror',e=>errors.push(e.message));await web.waitForSelector('.pond-canvas');
  await web.getByRole('button',{name:'桌面模式',exact:true}).click();await web.getByText('请打开「浮生锦鲤池」桌面应用',{exact:true}).waitFor();assert.equal(await web.evaluate(()=>typeof window.pondDesktop),'undefined');await web.getByRole('button',{name:'先体验沉浸模式',exact:true}).click();await web.getByRole('button',{name:'退出沉浸模式',exact:true}).click();
  const cdp=await web.context().newCDPSession(web);const layout=[];
  for(const [width,height] of [[1357,897],[1101,897],[1082,897],[1000,897],[950,760],[580,844],[390,844]]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:width<560});await web.getByRole('button',{name:'桌面模式',exact:true}).waitFor({state:'visible'});
   const controls=await web.locator('.dock button,.scene-actions button').evaluateAll(elements=>elements.map(el=>{const b=el.getBoundingClientRect();return {name:el.getAttribute('aria-label')||el.textContent,x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}}));
   for(const c of controls){assert.ok(c.x>=0&&c.right<=width&&c.y>=0&&c.bottom<=height,`${width}: ${c.name} within viewport`);assert.ok(c.width>=40&&c.height>=40,'Touch target is usable')}
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,`${width}: controls must not overlap`)}
   const status=await web.locator('.scene-status').boundingBox();for(const b of controls){assert.ok(status.x+status.width<=b.x||b.right<=status.x||status.y+status.height<=b.y||b.bottom<=status.y,`${width}: status and controls do not overlap`)}
   layout.push({width,height,buttons:controls.length});await web.screenshot({path:path.join(out,`home-${width}-1.8.png`)});
  }
  await web.getByRole('button',{name:'画锦鲤',exact:true}).click();await web.screenshot({path:path.join(out,'studio-mobile-1.8.png')});assert.ok(await web.getByRole('button',{name:'放入池塘',exact:true}).isVisible());
  await web.close();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',plainWhiteSkin:skin,undo:true,reset:true,draftPreserved:true,turtleAnimation:true,turtleLimit:4,homeDesktopEntry:true,desktop:{width:desktop.stats.width,height:desktop.stats.height,background:desktop.stats.backgroundSize},browserFallback:true,layout,errors},null,2));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
