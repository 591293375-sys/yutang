'use strict';
// A disposable Electron profile exercises public UI/canvas input, never renderer game internals.
// Run: node electron/cat-courtyard-smoke.cjs [--packaged]
const {_electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const work=path.resolve(root,'../../work/cat-courtyard');
const packaged=process.argv.includes('--packaged');
const mode=packaged?'packaged':'dev';
const CAT_KEY='mofish-cats-v1';
const rng=(seed=31)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const names={koi:'锦鲤池',coast:'赶海',cats:'猫咪庭院'};
const toolNames={food:'食物',yarn:'毛线球',scratch:'猫抓板',wand:'逗猫棒',mouse:'玩具小鼠',pet:'轻抚'};

async function makeFixtures(){
 const {CatGame}=await import(pathToFileURL(path.join(root,'src/themes/cats/game.js')).href);
 const {CoastGame}=await import(pathToFileURL(path.join(root,'src/themes/coast/game.js')).href);
 const cat=new CatGame(null,{random:rng()}).snapshot();
 cat.environment={season:'summer',time:'day',particles:false,fireflies:true};
 cat.cats[0].x=.51;cat.cats[0].y=.51;
 cat.cats[1].x=.62;cat.cats[1].y=.60;
 cat.cats[2].x=.69;cat.cats[2].y=.76;
 const coast=new CoastGame(null,Date.now(),rng());
 coast.shells=7;coast.rescues=3;
 const bucket=coast.entities.find(e=>e.species==='starfish');
 bucket.state='bucket';bucket.stranded=false;
 coast.catalog.starfish={firstDiscovered:Date.now()-10000,observed:1,caught:1,collected:0,rescued:0};
 return {cat,coast:coast.snapshot(),bucketId:bucket.id};
}

async function smoke(){
 fs.mkdirSync(work,{recursive:true});
 const profile=fs.mkdtempSync(path.join(work,`${mode}-profile-`));
 const executablePath=packaged?(process.env.POND_TEST_EXECUTABLE||path.join(root,'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池')):path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
 const env={...process.env};if(packaged)delete env.VITE_DEV_SERVER_URL;else env.VITE_DEV_SERVER_URL=process.env.VITE_DEV_SERVER_URL||'http://127.0.0.1:5188/';
 const app=await _electron.launch({executablePath,args:[...(packaged?[]:[root]),`--user-data-dir=${profile}`],env,timeout:30000});
 const report={mode,result:'RUNNING',isolatedProfile:true,checks:[],screenshots:[],limitations:['本脚本验证真实 UI 操作、存档与画布结果，动作逐帧质量另有专项检查','萤火虫通过夜/季/开关状态和截图验证，未逐像素分类每一只光点']};
 let page;const errors=[],assetErrors=[];
 const checkpoint=(name,details={})=>{report.checks.push({name,...details});console.log('PASS',name,JSON.stringify(details));};
 try{
  page=await app.firstWindow();page.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.setIgnoreMouseEvents(true)});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{if(/\/assets\/cats\/.*\.(webp|png)/.test(r.url())&&r.failure()?.errorText!=='net::ERR_ABORTED')assetErrors.push(r.url()+': '+r.failure()?.errorText)});
  await page.waitForSelector('.pond-canvas');
  const runtime=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),profile:app.getPath('userData')}));
  assert.equal(runtime.profile,profile);assert.equal(runtime.packaged,packaged);assert.equal(runtime.version,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,'The executable must match the current project release');report.version=runtime.version;
  const fixture=await makeFixtures();
  await page.evaluate(({coast})=>{
   localStorage.setItem('mofish-theme',JSON.stringify('koi'));
   localStorage.setItem('mofish-coast-v1',JSON.stringify(coast));
   localStorage.setItem('fusheng-settings',JSON.stringify({season:'summer',weather:'sunny',day:'day',fishCount:3,fishSize:1,turtleCount:0,quality:'high',reducedMotion:false,sound:false,volume:.18}));
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#fff1dc';c.fillRect(0,0,512,128);c.fillStyle='#f05f46';c.fillRect(200,20,60,90);
   localStorage.setItem('fusheng-fish',JSON.stringify([{id:'cat-smoke-kept-koi',name:'猫主题测试保留锦鲤',texture:canvas.toDataURL(),size:1.1,appearance:'skin-v2'}]));
  },fixture);
  await page.reload();await page.waitForSelector('.theme-koi');
  const koiBefore=await page.evaluate(()=>localStorage.getItem('fusheng-fish'));
  const cdp=await page.context().newCDPSession(page);
  const resize=async(width,height,dpr=1)=>{await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});await page.waitForTimeout(300)};
  await resize(1600,900);
  const close=()=>page.getByRole('button',{name:'关闭面板',exact:true}).click();
  const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),CAT_KEY);
  const screenshot=async(name)=>{await page.locator('.toast').waitFor({state:'hidden',timeout:5000});const file=path.join(work,`cat-${mode}-${name}.png`);await page.screenshot({path:file});report.screenshots.push(file);return file;};
  async function theme(id){await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.locator('.theme-card').filter({hasText:names[id]}).click();await page.waitForSelector('.theme-'+id)}
  async function seedCats(value=fixture.cat){
   if(await page.locator('.theme-cats').count())await theme('koi');
   await page.evaluate(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));localStorage.setItem('mofish-theme',JSON.stringify('cats'))},{key:CAT_KEY,value});
   await page.reload();await page.waitForSelector('.theme-cats .cat-canvas');await page.waitForTimeout(550);
  }
  async function tool(id){await page.getByRole('button',{name:'道具',exact:true}).click();await page.locator('.cat-tools-grid button').filter({hasText:toolNames[id]}).click();await page.locator(`.cat-canvas[data-tool="${id}"]`).waitFor();}
  async function point(p){return page.locator('.cat-canvas').evaluate((canvas,p)=>{const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/7680,r.height/4320);return{x:r.left+(r.width-7680*scale)/2+p.x*7680*scale,y:r.top+(r.height-4320*scale)/2+p.y*4320*scale}},p)}
  async function clickWorld(p){const screen=await point(p);assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains('cat-canvas'),screen),true,'Canvas target must not be under the toolbar/panel');await page.mouse.click(screen.x,screen.y);return screen}
  const clickCat=(cat)=>clickWorld({x:cat.x,y:cat.y-.048});
  const waitInteraction=(id,min=1,timeout=30000)=>page.waitForFunction(({key,id,min})=>JSON.parse(localStorage.getItem(key))?.cats.find(c=>c.id===id)?.interactions>=min,{key:CAT_KEY,id,min},{timeout});
  await theme('cats');
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.cats.length===3,CAT_KEY);
  assert.deepEqual((await state()).cats.map(c=>c.presetId),['ragdoll','british-shorthair','domestic-orange-white']);
  assert.equal((await state()).cats.filter(c=>c.active).length,3);
  assert.deepEqual(await page.locator('.dock button>span').allTextContents(),['猫咪','道具','四时','光阴','庭院','设置']);
  checkpoint('first-visit-three-default-cats-and-shared-dock');
  await page.waitForFunction(()=>{const c=document.querySelector('.cat-background');if(!c||getComputedStyle(c).opacity!=='1')return false;const sample=document.createElement('canvas');sample.width=32;sample.height=18;const ctx=sample.getContext('2d');ctx.drawImage(c,0,0,32,18);const pixels=ctx.getImageData(0,0,32,18).data;return new Set(Array.from({length:576},(_,i)=>`${pixels[i*4]},${pixels[i*4+1]},${pixels[i*4+2]}`)).size>100});
  checkpoint('courtyard-background-visible-and-textured');
  await page.waitForTimeout(500);await screenshot('default-courtyard');

  // Each reset goes through theme cleanup, then restores a legitimate serialized fixture.
  // Direct cat clicks must only credit the explicitly selected cat.
  for(const id of ['pet','food','yarn','scratch','mouse']){
   await seedCats();await tool(id);await clickCat(fixture.cat.cats[0]);
   if(id==='scratch'){const saved=await state();assert.equal(saved.props.length,1);assert.equal(saved.props[0].tool,'scratch');}
   await page.waitForTimeout(1300);await screenshot(`tool-${id}`);
   await waitInteraction(fixture.cat.cats[0].id,1,35000);
   const saved=await state();assert.equal(saved.cats[0].interactions,1);assert.equal(saved.cats[1].interactions,0);assert.equal(saved.cats[2].interactions,0);
   checkpoint(`canvas-${id}-specified-cat-completes`,{interactions:saved.cats.map(c=>c.interactions)});
  }
  await seedCats();await tool('wand');const wandPoint=await clickCat(fixture.cat.cats[0]);
  for(let i=0;i<4;i++){await page.mouse.move(wandPoint.x+16+i*4,wandPoint.y+20+(i%2)*7,{steps:8});await page.waitForTimeout(450)}
  await screenshot('tool-wand');await page.keyboard.press('Escape');
  assert.equal(await page.locator('.cat-canvas').getAttribute('data-tool'),'');
  checkpoint('wand-pointer-feedback-and-escape-cancel');

  // A fresh ground food command reserves only the nearest two reachable cats.
  await seedCats();await tool('food');await clickWorld({x:.54,y:.59});
  await waitInteraction(fixture.cat.cats[0].id,1,35000);await waitInteraction(fixture.cat.cats[1].id,1,35000);
  assert.deepEqual((await state()).cats.map(c=>c.interactions),[1,1,0]);checkpoint('ground-food-nearest-two-cats');
  await seedCats();await tool('scratch');await clickWorld({x:.52,y:.63});
  let board=(await state()).props[0];assert.ok(board);const boardId=board.id;
  await page.reload();await page.waitForSelector('.theme-cats');board=(await state()).props[0];assert.equal(board.id,boardId);assert.ok(Math.abs(board.x-.52)<1e-6);assert.ok(Math.abs(board.y-.63)<1e-6);
  await page.getByRole('button',{name:'庭院',exact:true}).click();await page.getByRole('button',{name:'移动猫抓板 1',exact:true}).click();await clickWorld({x:.58,y:.66});
  board=(await state()).props[0];assert.equal(board.id,boardId);assert.ok(Math.abs(board.x-.58)<1e-6);assert.ok(Math.abs(board.y-.66)<1e-6);
  await page.getByRole('button',{name:'庭院',exact:true}).click();await page.getByRole('button',{name:'收起猫抓板 1',exact:true}).click();assert.equal((await state()).props.length,0);await close();checkpoint('scratch-board-persist-move-remove');

  await seedCats();await tool('pet');await clickCat(fixture.cat.cats[0]);
  await page.getByRole('button',{name:'道具',exact:true}).click();await page.locator('.cat-tools-grid button').filter({hasText:'毛线球'}).click();await clickCat(fixture.cat.cats[0]);
  await waitInteraction(fixture.cat.cats[0].id,1,35000);assert.equal((await state()).cats[0].interactions,1);checkpoint('new-command-replaces-pending-pet');
  await page.keyboard.press('Escape');await tool('food');await clickWorld({x:.12,y:.40});
  await page.getByText('这里是花丛或设施，试试空一点的石板地。',{exact:true}).waitFor();assert.equal((await state()).props.length,0);checkpoint('obstacle-click-rejected');await page.keyboard.press('Escape');

  // Environment changes use the public panels and inspect their persisted configuration.
  await page.getByRole('button',{name:'四时',exact:true}).click();await page.locator('.season-card').filter({hasText:'绿荫绣球开'}).click();await close();
  await page.getByRole('button',{name:'光阴',exact:true}).click();await page.getByRole('button',{name:/月下小院/}).click();await close();
  await page.waitForSelector('.cat-stage[data-time="night"][data-season="summer"]');
  await page.waitForTimeout(1300);await screenshot('summer-night-fireflies');
  assert.deepEqual((await state()).environment,{season:'summer',time:'night',particles:false,fireflies:true});
  await page.getByRole('button',{name:'庭院',exact:true}).click();await page.getByText('夜间萤火虫',{exact:true}).click();await close();assert.equal((await state()).environment.fireflies,false);
  await page.getByRole('button',{name:'庭院',exact:true}).click();await page.getByText('夜间萤火虫',{exact:true}).click();await close();
  await page.getByRole('button',{name:'四时',exact:true}).click();await page.locator('.season-card').filter({hasText:'枝头落薄雪'}).click();await close();
  await page.waitForSelector('.cat-stage[data-time="night"][data-season="winter"]');await screenshot('winter-night-no-fireflies');
  await page.getByRole('button',{name:'光阴',exact:true}).click();await page.getByRole('button',{name:/一院晴光/}).click();await close();await page.waitForSelector('.cat-stage[data-time="day"]');
  const environment=(await state()).environment;await page.reload();await page.waitForSelector('.theme-cats');assert.deepEqual((await state()).environment,environment);
  checkpoint('environment-panels-season-time-fireflies-and-reload',{environment});

  await theme('coast');await page.waitForSelector('.coast-canvas');
  const coastRestored=await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-coast-v1')));
  assert.equal(coastRestored.shells,7);assert.equal(coastRestored.rescues,3);assert.equal(coastRestored.entities.find(e=>e.id===fixture.bucketId)?.state,'bucket');assert.equal(coastRestored.catalog.starfish.caught,1);
  for(const id of ['koi','cats','coast','cats','koi','coast','cats']){await theme(id);assert.equal(await page.locator('canvas.pond-canvas').count(),1);assert.equal(await page.locator('.cat-stage').count(),id==='cats'?1:0)}
  assert.equal(await page.evaluate(()=>localStorage.getItem('fusheng-fish')),koiBefore);checkpoint('three-theme-switch-cleanup-and-old-collections-intact');

  if(packaged){
   await page.evaluate(()=>{window.catWindowSmoke={draws:0,states:[]};window.pondDesktop.onState(s=>catWindowSmoke.states.push({visible:s.visible,minimized:s.minimized}));const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('cat-canvas'))catWindowSmoke.draws++;return clear.apply(this,args)}});
   const frame=()=>page.locator('.cat-canvas').evaluate(canvas=>{const sample=document.createElement('canvas');sample.width=160;sample.height=90;sample.getContext('2d').drawImage(canvas,0,0,160,90);return sample.toDataURL()});
   await page.getByRole('button',{name:'隐藏窗口',exact:true}).click();
   await page.waitForFunction(async()=>!(await window.pondDesktop.getState()).visible);
   await page.waitForTimeout(250);const frozen=await frame(),hiddenDraws=await page.evaluate(()=>catWindowSmoke.draws);await page.waitForTimeout(1100);assert.equal(await frame(),frozen,'Hidden native window must stop the cat render loop');assert.equal(await page.evaluate(()=>catWindowSmoke.draws),hiddenDraws);
   await page.evaluate(()=>window.pondDesktop.showControls());await page.waitForFunction(async()=>(await window.pondDesktop.getState()).visible);await page.waitForTimeout(250);const resumeDraws=await page.evaluate(()=>catWindowSmoke.draws);await page.waitForTimeout(1000);const resumed=await page.evaluate(()=>catWindowSmoke);assert.ok(resumed.draws>resumeDraws,'Showing controls resumes the render loop');assert.ok(resumed.states.some(s=>s.visible===true),'Showing controls republishes visible state');
   checkpoint('native-hide-stops-render-and-show-resumes',{hiddenDraws,resumeDraws,afterDraws:resumed.draws,states:resumed.states});
  }
  await resize(1000,850);await seedCats();
  for(const facility of [{x:.739,y:.088},{x:.865,y:.179},{x:.949,y:.525}]){const pixel=await point(facility);assert.ok(pixel.x>=0&&pixel.x<=1000&&pixel.y>=0&&pixel.y<=850,'Entire facility stays visible in tall windows');}
  await clickWorld({x:.949,y:.525});
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).cats.some(c=>c.restIntent?.slotId==='climbing-lower'),CAT_KEY);
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).cats.some(c=>c.surfaceId==='lower-platform'&&c.restIntent?.slotId==='climbing-lower'),CAT_KEY,{timeout:75000});
  const platformCat=(await state()).cats.find(c=>c.surfaceId==='lower-platform');assert.ok(platformCat?.active);await screenshot('tall-1000-platform-visible');
  await page.reload();await page.waitForSelector('.theme-cats');assert.equal((await state()).cats.find(c=>c.id===platformCat.id)?.surfaceId,'lower-platform');
  checkpoint('tall-1000-visible-platform-direct-hit-climb-and-reload',{id:platformCat.id});
  await resize(390,844,2);await seedCats();await tool('pet');await clickCat(fixture.cat.cats[0]);await waitInteraction(fixture.cat.cats[0].id,1,20000);await page.keyboard.press('Escape');
  await screenshot('narrow-390');assert.equal(await page.locator('.cat-canvas').evaluate(c=>c.width),780);checkpoint('narrow-390-ui-and-canvas-hit-aligned');
  await resize(3840,2160,1);await page.getByRole('button',{name:'设置',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.render-status strong')?.textContent.includes('3840'));
  const pixels=await page.locator('.cat-canvas').evaluate(c=>[c.width,c.height]);assert.deepEqual(pixels,[3840,2160]);await close();await screenshot('4k');checkpoint('4k-render-pixels',{pixels});
  await page.reload();await page.waitForSelector('.theme-cats');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mofish-theme'))),'cats');
  const finalStored=await state();assert.equal(finalStored.cats[0].interactions,1);assert.equal(finalStored.props.length,0);
  assert.deepEqual(errors,[]);assert.deepEqual(assetErrors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  report.result='PASS';report.errors=errors;report.assetErrors=assetErrors;report.checkedAt=new Date().toISOString();
  if(packaged){for(const [source,target]of[['default-courtyard','猫咪庭院-白天.png'],['tool-food','猫咪庭院-食物互动.png'],['summer-night-fireflies','猫咪庭院-夜晚.png']])fs.copyFileSync(path.join(work,`cat-${mode}-${source}.png`),path.resolve(root,'..',target))}
  fs.writeFileSync(path.join(work,`cat-courtyard-${mode}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){report.result='FAIL';report.error=error.message;report.errors=errors;report.assetErrors=assetErrors;if(page)await page.screenshot({path:path.join(work,`cat-${mode}-failure.png`)}).catch(()=>{});fs.writeFileSync(path.join(work,`cat-courtyard-${mode}.json`),JSON.stringify(report,null,2));throw error}
 finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
}
smoke().catch(error=>{console.error(error);process.exitCode=1});
