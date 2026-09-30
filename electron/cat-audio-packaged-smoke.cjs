'use strict';
// Official file:// build only. Uses public UI and native audio APIs, with a
// disposable profile. No renderer/game/source-module imports or private refs.
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../work/cats/audio-audit');
function instrument(){
 const q=window.packagedAudioQA={contexts:[],nextVoice:0},Native=window.AudioContext||window.webkitAudioContext;
 if(!Native)return;
 const Wrapped=class extends Native{constructor(...args){
  super(...args);const context={id:q.contexts.length,ref:this,voices:[],closed:0};q.contexts.push(context);
  const analyser=this.createAnalyser();analyser.fftSize=4096;analyser.connect(this.destination);
  const makeGain=this.createGain.bind(this);this.createGain=(...a)=>{const gain=makeGain(...a),connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>connect(target===this.destination?analyser:target,...rest);return gain};
  const makeSource=this.createBufferSource.bind(this);this.createBufferSource=(...a)=>{
   const node=makeSource(...a),voice={id:q.nextVoice++,started:false,ended:false,stopped:false,disconnected:false};context.voices.push(voice);let targetGain=null,timer=0;
   const connect=node.connect.bind(node),start=node.start.bind(node),stop=node.stop.bind(node),disconnect=node.disconnect.bind(node);
   node.connect=(target,...rest)=>{if(target.gain)targetGain=target.gain;return connect(target,...rest)};
   node.start=(...v)=>{
    Object.assign(voice,{started:true,at:performance.now(),duration:node.buffer?.duration,loop:node.loop});let power=0,count=0,peak=0;
    for(let ch=0;ch<(node.buffer?.numberOfChannels||0);ch++)for(const sample of node.buffer.getChannelData(ch)){power+=sample*sample;count++;peak=Math.max(peak,Math.abs(sample))}
    voice.pcmRms=Math.sqrt(power/Math.max(1,count));voice.pcmPeak=peak;
    timer=setInterval(()=>{const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);let sum=0;for(const sample of data)sum+=sample*sample;voice.analyserPeakWindowRms=Math.max(voice.analyserPeakWindowRms||0,Math.sqrt(sum/data.length));voice.gain=targetGain?.value;voice.outputRms=voice.pcmRms*(voice.gain||0)},20);
    return start(...v);
   };
   node.stop=(...v)=>{voice.stopped=true;clearInterval(timer);return stop(...v)};
   node.disconnect=(...v)=>{voice.disconnected=true;clearInterval(timer);return disconnect(...v)};
   node.addEventListener('ended',()=>{voice.ended=true;clearInterval(timer)});return node;
  };
  const close=this.close.bind(this);this.close=()=>{context.closed++;return close()};
 }};
 window.AudioContext=Wrapped;if(window.webkitAudioContext)window.webkitAudioContext=Wrapped;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const profile=fs.mkdtempSync(path.join(out,'packaged-profile-'));
 const executablePath=process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池');
 const env={...process.env};delete env.VITE_DEV_SERVER_URL;
 const app=await _electron.launch({executablePath,args:['--user-data-dir='+profile],env});let page;const errors=[],report={result:'IN_PROGRESS',expectedVersion:'2.7.1',mode:'official packaged file://',isolatedProfile:true,samples:[],checks:[],limitations:['Measures the live WebAudio graph, not physical speaker sound pressure.']};
 try{
  page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pond-canvas');
  report.runtime=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,profile:app.getPath('userData')}));
  assert.equal(report.runtime.version,'2.7.1');assert.equal(report.runtime.packaged,true);assert.equal(report.runtime.profile,profile);assert.ok(page.url().startsWith('file://'));report.url=page.url();report.title=await page.title();report.checks.push('official 2.7.1 packaged app, isolated profile, file:// URL');
  await page.addInitScript(instrument);
  await page.evaluate(()=>{localStorage.setItem('mofish-theme',JSON.stringify('cats'));localStorage.setItem('fusheng-settings',JSON.stringify({sound:false,volume:.18,quality:'high',reducedMotion:false}));});
  await page.reload();await page.waitForSelector('.cat-canvas');
  const voices=()=>page.evaluate(()=>packagedAudioQA.contexts.flatMap(c=>c.voices));
  const lastId=async()=>Math.max(-1,...(await voices()).map(v=>v.id));
  const waitVoice=async(id,duration)=>{await page.waitForFunction(({id,duration})=>packagedAudioQA.contexts.some(c=>c.voices.some(v=>v.id>id&&v.started&&Math.abs(v.duration-duration)<.001)),{id,duration});await page.waitForFunction(({id,duration})=>packagedAudioQA.contexts.some(c=>c.voices.some(v=>v.id>id&&v.started&&Math.abs(v.duration-duration)<.001&&v.analyserPeakWindowRms>.001)),{id,duration});return (await voices()).find(v=>v.id>id&&Math.abs(v.duration-duration)<.001)};
  const waitQuiet=()=>page.waitForFunction(()=>packagedAudioQA.contexts.every(c=>c.voices.every(v=>!v.started||v.ended||v.disconnected)));
  const close=()=>page.getByRole('button',{name:'关闭面板',exact:true}).click();
  await page.getByRole('button',{name:'设置',exact:true}).click();assert.ok((await page.locator('.attribution').innerText()).includes('2.7.1'));
  const previewButtons=page.getByRole('button',{name:/^试听/});assert.equal(await previewButtons.count(),7);for(const button of await previewButtons.all())assert.equal(await button.isDisabled(),true);assert.equal(await page.locator('.cat-audio-status').getAttribute('data-audio-status'),'off');await close();report.checks.push('muted initial preference and disabled previews');
  let id=await lastId();await page.getByRole('button',{name:'开启庭院声音',exact:true}).click();const enabledVoice=await waitVoice(id,.72);await waitQuiet();report.enabledVoice=(await voices()).find(v=>v.id===enabledVoice.id);report.checks.push('home sound button unlocks audio and plays a measurable meow');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  for(const [name,duration]of[['猫叫',.72],['呼噜',1.65],['食物',.66],['毛线球',.52],['抓挠',.82],['逗猫棒',.64],['小鼠',.48]]){
   await waitQuiet();id=await lastId();await page.getByRole('button',{name:'试听'+name,exact:true}).click();const voice=await waitVoice(id,duration);await waitQuiet();const measured=(await voices()).find(v=>v.id===voice.id);assert.equal(measured.loop,false);assert.ok(measured.analyserPeakWindowRms>.001);report.samples.push({name,...measured});
  }
  report.checks.push('all seven real UI previews produce nonzero audio, with expected separate cue durations');
  id=await lastId();await page.getByRole('button',{name:'试听呼噜',exact:true}).click();await waitVoice(id,1.65);
  const volume=page.getByRole('slider',{name:'环境音量',exact:true});await volume.focus();await volume.press('Home');assert.equal(Number(await volume.inputValue()),0);await page.waitForTimeout(80);await waitQuiet();assert.equal(await page.locator('.cat-audio-status').getAttribute('data-audio-status'),'off');report.checks.push('volume zero immediately stops the active purr');
  for(let n=0;n<9;n++)await volume.press('ArrowRight');assert.ok(Math.abs(Number(await volume.inputValue())-.18)<.0001);
  id=await lastId();await page.getByRole('button',{name:'试听猫叫',exact:true}).click();await waitVoice(id,.72);
  const sound=page.getByRole('checkbox',{name:/庭院声音/});await page.locator('label.toggle-row').filter({has:sound}).click();assert.equal(await sound.isChecked(),false);await waitQuiet();assert.equal(await page.locator('.cat-audio-status').getAttribute('data-audio-status'),'off');report.checks.push('sound switch immediately mutes and leaves no active source');
  report.beforeReload=await page.evaluate(()=>({settings:JSON.parse(localStorage.getItem('fusheng-settings')),contexts:packagedAudioQA.contexts.map(c=>({state:c.ref.state,active:c.voices.filter(v=>v.started&&!v.ended&&!v.disconnected).length}))}));
  await page.waitForTimeout(350);await page.screenshot({path:path.join(out,'packaged-2.7.1-audio-settings.png')});await page.reload();await page.waitForSelector('.cat-canvas');await page.waitForTimeout(300);
  report.afterReload=await page.evaluate(()=>({settings:JSON.parse(localStorage.getItem('fusheng-settings')),theme:JSON.parse(localStorage.getItem('mofish-theme')),sources:packagedAudioQA.contexts.flatMap(c=>c.voices).length}));assert.equal(report.afterReload.settings.sound,false);assert.equal(report.afterReload.settings.volume,.18);assert.equal(report.afterReload.theme,'cats');assert.equal(report.afterReload.sources,0);report.checks.push('reload restores muted preference, volume and cats theme without playing');
  id=await lastId();await page.getByRole('button',{name:'开启庭院声音',exact:true}).click();await waitVoice(id,.72);const ids=await page.evaluate(()=>packagedAudioQA.contexts.map(c=>c.id));
  await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.locator('.theme-card').filter({has:page.getByText('赶海',{exact:true})}).click();await page.waitForSelector('.coast-canvas');await page.waitForFunction(ids=>packagedAudioQA.contexts.filter(c=>ids.includes(c.id)).every(c=>c.ref.state==='closed'),ids);
  report.themeCleanup=await page.evaluate(ids=>packagedAudioQA.contexts.filter(c=>ids.includes(c.id)).map(c=>({state:c.ref.state,closed:c.closed,active:c.voices.filter(v=>v.started&&!v.ended&&!v.disconnected).length})),ids);assert.ok(report.themeCleanup.every(c=>c.state==='closed'&&c.active===0));report.checks.push('switching from cats to coast closes every cat audio context');
  assert.deepEqual(errors,[]);report.errors=errors;report.result='PASS';
  fs.writeFileSync(path.join(out,'packaged-2.7.1-audio.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){report.result='FAIL';report.error=error.stack;report.errors=errors;fs.writeFileSync(path.join(out,'packaged-2.7.1-audio.json'),JSON.stringify(report,null,2));if(page)await page.screenshot({path:path.join(out,'packaged-2.7.1-audio-failure.png')}).catch(()=>{});throw error}
 finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
