'use strict';
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../work/audio-1.9');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const profile=fs.mkdtempSync(path.join(out,'audio-profile-'));
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[root,`--user-data-dir=${profile}`],env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5188/'}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
  await page.evaluate(()=>{localStorage.setItem('fusheng-settings',JSON.stringify({season:'autumn',weather:'sunny',day:'day',fishCount:12,turtleCount:0,quality:'high',sound:false,volume:.2}))});await page.reload();
  await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(r=>r.name).findLast(u=>u.includes('/src/audio/ambient.js'));const {AmbientMixer}=await import(url);const configure=AmbientMixer.prototype.configure;AmbientMixer.prototype.configure=function(...args){window.testMixer=this;return configure.apply(this,args)};window.thunderEvents=[];const a=document.querySelector('[data-ambient="thunder"]');for(const event of ['play','playing'])a.addEventListener(event,()=>window.thunderEvents.push({event,weather:document.querySelector('.app').className,volume:a.volume,paused:a.paused}));});
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByText('治愈流水声',{exact:true}).click();await page.waitForFunction(()=>window.testMixer&&!document.querySelector('[data-ambient="stream"]').paused&&document.querySelector('[data-ambient="stream"]').currentTime>.25);
  await page.waitForFunction(()=>document.querySelector('[data-ambient="stream"]').duration===120);
  const stream=await page.locator('[data-ambient="stream"]').evaluate(a=>({url:a.currentSrc,duration:a.duration,loop:a.loop,volume:a.volume}));assert.ok(stream.url.includes('v=1.9'));assert.equal(stream.loop,true);
  await page.getByRole('button',{name:'关闭面板',exact:true}).click();
  const events=await page.evaluate(()=>window.thunderEvents);assert.equal(events.length,0,'Sunny enable does not even prime thunder');
  async function weather(name,code){await page.getByRole('button',{name:'打开天气设置',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).click();await page.waitForFunction(code=>window.testMixer.weather===code,code)}
  async function silent(){await page.waitForFunction(()=>{const a=document.querySelector('[data-ambient="thunder"]');return a.paused&&a.volume===0&&a.currentTime===0});}
  // Exercise real Chromium media start/stop, while the unit suite controls deferred promises.
  for(const [name,code] of [['晴天','sunny'],['多云','cloudy'],['细雨','rainy'],['落雪','snowy']]){
   await weather(name,code);await page.evaluate(()=>window.testMixer.thunder({delay:0}));await page.waitForTimeout(150);await silent();
  }
  assert.equal((await page.evaluate(()=>window.thunderEvents)).length,0,'No non-storm request starts the thunder track');
  await weather('雷雨','stormy');await page.waitForFunction(()=>window.testMixer.primed&&window.testMixer.thunderRequest===null);
  await page.evaluate(()=>window.testMixer.thunder({delay:30}));await page.waitForFunction(()=>{const a=document.querySelector('[data-ambient="thunder"]');return !a.paused&&a.volume>0&&a.currentTime>.1});
  const thunder=await page.locator('[data-ambient="thunder"]').evaluate(a=>({volume:a.volume,currentTime:a.currentTime}));
  await weather('晴天','sunny');await silent();
  await weather('雷雨','stormy');await page.evaluate(()=>window.testMixer.thunder({delay:2000}));await weather('晴天','sunny');await page.waitForTimeout(2200);await silent();
  await weather('雷雨','stormy');await page.evaluate(()=>window.testMixer.thunder({delay:20}));await page.waitForFunction(()=>!document.querySelector('[data-ambient="thunder"]').paused&&document.querySelector('[data-ambient="thunder"]').volume>0);
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByText('治愈流水声',{exact:true}).click();await silent();await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(a=>a.paused&&a.volume===0));
  const log=await page.evaluate(()=>window.thunderEvents);assert.ok(log.every(e=>e.weather.includes('weather-stormy')),'Every thunder start occurs only while stormy');
  assert.deepEqual(errors,[]);assert.equal(await page.title(),'浮生 · 锦鲤池');assert.ok(page.url().startsWith('http://127.0.0.1:5188/'));assert.equal(await page.locator('vite-error-overlay').count(),0);
  console.log(JSON.stringify({result:'PASS',stream,onlyStormThunder:true,activeThunder:thunder,weatherExitStops:true,pendingThunderCancelled:true,muteStopsAll:true,thunderEvents:log,errors},null,2));
 }finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
