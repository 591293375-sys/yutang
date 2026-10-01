import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {CaiyuanModel} from './model.js';
import {CaiyuanRenderer} from './renderer.js';
import {CaiyuanLife,arrangement} from './toad.js';
import {hitToad,lanternHit} from './life-renderer.js';
import {CaiyuanAudio} from './audio.js';
import {validPlacement} from './geometry.js';
import {loadCaiyuan,saveCaiyuan} from './storage.js';
import {renderScale,watchDeviceScale} from '../../engine/rendering.js';
import './theme.css';
const HOLD_MS=240,DRAG_SLOP=5;
const Scene=forwardRef(function CaiyuanScene({options,desktop,immersive,editing=false,onChange,onOpen,notify},ref){
 const canvas=useRef(null),back=useRef(null),runtime=useRef(null),latest=useRef(null);latest.current={options,desktop,immersive,editing,onChange,onOpen,notify};
 useEffect(()=>{
  const model=new CaiyuanModel(loadCaiyuan()),audio=new CaiyuanAudio();let dead=false,frame=0,last=0,next=0,time=0,lastUi=0,fps=0,n=0,sample=0,saveTimer=0,pointerDown=null,restoreNotice=false,lastMotionSave=0;
  const life=new CaiyuanLife(model);
  const hidden=()=>document.hidden||latest.current.desktop?.visible===false||latest.current.desktop?.minimized===true;
  const persist=()=>{clearTimeout(saveTimer);saveTimer=0;const ok=saveCaiyuan(model.snapshot());if(ok)life.takeDirty();if(!ok&&!restoreNotice){restoreNotice=true;latest.current.notify('本机存储空间不足，本次更改尚未保存。')}return ok};
  const publish=()=>{if(!dead)latest.current.onChange({...model.view(),audioStatus:audio.status})};
  const renderer=new CaiyuanRenderer(canvas.current,back.current,message=>{if(dead)return;if(message)latest.current.notify(message);render()});
  renderer.life=life;
  const render=()=>{if(!dead&&!hidden())renderer.draw(model,latest.current.options,time,latest.current.immersive)};
  const configureSound=()=>audio.configure(latest.current.options.sound&&!latest.current.options.paused&&!hidden(),latest.current.options.volume*model.state.settings.volume,model.state.settings.ambient,model.state.settings);
  const sounds=()=>{configureSound();for(const e of [...model.events.splice(0),...life.cues.splice(0)])audio.cue(e)};
  const command=(action,payload)=>{const old=model.snapshot(),result=model.command(action,payload);if(result.ok){if(action!=='wishComplete'||model.state.wishes.find(w=>w.id===(payload?.id??payload))?.completedAt!==old.wishes.find(w=>w.id===(payload?.id??payload))?.completedAt)life.onAction(action);if(!['select','tool','cancel'].includes(action)){if(action==='scale'){clearTimeout(saveTimer);saveTimer=setTimeout(persist,350)}else if(!persist()){model.state=old;result.ok=false;result.message='未能保存，请留在这里重试。'}}sounds();publish();render();schedule()}if(result.message)latest.current.notify(result.message);return result};
  const previewSound=kind=>{configureSound();audio.unlock();if(!audio.cue(kind,{preview:true}))latest.current.notify('请先在设置中开启阁内声音与互动音效，并调高一点音量。')};
  const resize=()=>{if(dead)return;if(pointerDown)abortGesture();const box=canvas.current.getBoundingClientRect(),o=latest.current.options;renderer.resize(box.width,box.height,renderScale(box.width,box.height,devicePixelRatio||1,o.quality,o.desktopMode,latest.current.desktop?.display?.scaleFactor));render()};
  const usable=(x,y)=>!dead&&!hidden()&&!latest.current.options.paused&&document.elementFromPoint(x,y)===canvas.current;
  const open=async name=>{
   // Editing requires the existing focusable control window, not the pass-through desktop.
   if(latest.current.desktop?.desktopMode){try{await window.pondDesktop.showControls()}catch{if(!dead)latest.current.notify('请从菜单栏恢复控制窗口，再编辑供桌。');return}}
   if(!dead)latest.current.onOpen(name);
  };
  const click=(x,y)=>{if(!usable(x,y))return;const p=renderer.world(x,y),item=renderer.hit(p,model.state.items),tool=model.tool;
   if(latest.current.immersive&&!latest.current.desktop?.desktopMode)return;
   if(tool==='coin'){if(item){latest.current.notify('在摆件之间的空处放铜钱吧。');return}const result=life.drop(p);if(result.message)latest.current.notify(result.message);sounds();publish();return}
   if(!arrangement(tool)&&!latest.current.editing){if(hitToad(p,life)&&(!item||item.y<=life.position.y)){life.click();sounds();return}const lantern=lanternHit(p);if(model.state.settings.showLanterns&&lantern>=0){life.kickLantern(lantern);sounds();return}}
   if(tool?.startsWith('place:'))return command('add',{kind:tool.slice(6),...p});
   if(tool==='incense'){if(item?.kind==='burner'){command('select',item.id);if(model.incense().status==='burning')open('incense');else command('ignite',{id:item.id})}else latest.current.notify('轻点供桌中央的香炉。');return}
   if(tool==='lamp'){if(item?.kind==='lamp')command('lamp',item.id);else latest.current.notify('轻点一盏莲灯。');return}
   if(tool==='tea')return command('tea',item?.id);
   if(tool==='arrange'){if(item){command('select',item.id)}return}
   if(!item)return;command('select',item.id);
   if(item.kind==='burner')open('incense');else if(item.kind==='lamp')command('lamp',item.id);else if(item.kind==='plaque')open('wishes');else if(item.kind==='teapot'){command('tool','tea');latest.current.notify('已拿起茶壶，轻点一只茶杯添茶。')}else open('object');
  };
  const dragTarget=p=>{
   const item=renderer.hit(p,model.state.items);
   // Respect the same foreground ordering as an ordinary click.
   return !arrangement(model.tool)&&hitToad(p,life)&&(!item||item.y<=life.position.y)?null:item;
  };
  const clearGesture=()=>{
   const pointerId=pointerDown?.pointerId;pointerDown=null;renderer.drag=null;renderer.pointer=null;
   const c=canvas.current;if(c){c.style.cursor='';if(pointerId!==undefined&&c.hasPointerCapture(pointerId))c.releasePointerCapture(pointerId)}
  };
  const abortGesture=()=>{clearGesture();render()};
  const updateDrag=()=>{
   const p=pointerDown;if(!p?.dragging)return;
   const moved={...p.item,x:p.item.x+p.point.x-p.world.x,y:p.item.y+p.point.y-p.world.y};
   renderer.drag={id:p.item.id,x:moved.x,y:moved.y,invalid:!validPlacement(moved)};
   canvas.current.style.cursor=renderer.drag.invalid?'not-allowed':'grabbing';
  };
  const beginDrag=()=>{
   const p=pointerDown;if(!p?.item||p.dragging||latest.current.editing||latest.current.immersive||latest.current.options.paused)return;
   if(!model.state.items.some(i=>i.id===p.item.id&&!i.stored)){abortGesture();return}
   p.dragging=true;updateDrag();model.command('select',p.item.id);life.onAction('select');publish();render();
  };
  const down=e=>{
   if(e.button!==0||pointerDown||!usable(e.clientX,e.clientY)||latest.current.editing||latest.current.immersive)return;
   audio.unlock();const p=renderer.world(e.clientX,e.clientY),item=dragTarget(p);
   pointerDown={pointerId:e.pointerId,x:e.clientX,y:e.clientY,world:p,point:p,item:item?{...item}:null,startedAt:performance.now(),dragging:false};
   if(item){canvas.current.style.cursor='grab';canvas.current.setPointerCapture(e.pointerId)}
  };
  const move=e=>{
   if(pointerDown&&e.pointerId!==pointerDown.pointerId)return;
   if(pointerDown&&!(e.buttons&1))abortGesture();
   renderer.pointer=renderer.world(e.clientX,e.clientY);
   if(pointerDown){pointerDown.point=renderer.pointer;if(pointerDown.item&&(performance.now()-pointerDown.startedAt>=HOLD_MS||Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>DRAG_SLOP))beginDrag();updateDrag()}
   else if(!latest.current.immersive&&!latest.current.editing)canvas.current.style.cursor=dragTarget(renderer.pointer)?'grab':'';
   if(latest.current.options.paused)render();
  };
  const up=e=>{
   const p=pointerDown;if(!p||e.pointerId!==p.pointerId||e.button!==0)return;
   if(p.item&&!p.dragging&&performance.now()-p.startedAt>=HOLD_MS)beginDrag();
   p.point=renderer.world(e.clientX,e.clientY);updateDrag();const drag=renderer.drag;
   // Release capture before committing. A completed hold/drag never also clicks.
   clearGesture();
   if(drag&&(Math.abs(drag.x-p.item.x)+Math.abs(drag.y-p.item.y)>1e-7))command('move',drag);
   else if(!p.dragging&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<=DRAG_SLOP)click(e.clientX,e.clientY);
   render();
  };
  const leave=()=>{if(!pointerDown){renderer.pointer=null;canvas.current.style.cursor=''}};
  const cancel=()=>{clearGesture();command('cancel')};
  const draw=t=>{frame=0;if(dead||hidden())return;const o=latest.current.options,interval=o.quality==='low'||o.reducedMotion?1000/30:1000/60;if(next&&t<next-1){frame=requestAnimationFrame(draw);return}next=t+interval;const dt=last?Math.min(.06,(t-last)/1000):0;time+=dt;last=t;if(pointerDown?.item&&t-pointerDown.startedAt>=HOLD_MS)beginDrag();audio.update(dt);life.update(dt,{...o,editing:latest.current.editing||!!renderer.drag,pointer:renderer.pointer,interactive:!latest.current.immersive});if(life.cues.length)sounds();if(time-lastMotionSave>5&&life.takeDirty()){persist();lastMotionSave=time;}if(model.tick(Date.now())){persist();sounds()}render();if(t-lastUi>1000){publish();lastUi=t}n++;if(t-sample>1000){fps=Math.round(n*1000/(t-sample));sample=t;n=0}if(!o.paused)frame=requestAnimationFrame(draw)};
  const schedule=()=>{if(!dead&&!frame&&!hidden()){last=next=0;frame=requestAnimationFrame(draw)}};
  const visibility=()=>{abortGesture();cancelAnimationFrame(frame);frame=0;audio.stop();persist();if(!hidden()){model.events=[];for(const item of model.state.items)if(item.incense?.status==='burning'&&model.incense(Date.now(),item.id).status==='spent')item.incense.status='spent';configureSound();publish();schedule()}};
  const unlock=()=>{configureSound();audio.unlock()};
  const key=e=>{if(e.key==='Escape')cancel()};
  const observer=new ResizeObserver(resize);observer.observe(canvas.current);const unwatch=watchDeviceScale(resize);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',persist);window.addEventListener('pointerdown',unlock,true);window.addEventListener('keydown',key);window.addEventListener('blur',abortGesture);
  const off=window.pondDesktop?.onPointer(e=>{if(e.type==='feed')click(e.x,e.y);else renderer.pointer=renderer.world(e.x,e.y)});
  runtime.current={model,renderer,audio,life,previewSound,command,resize,schedule,configureSound,visibility,down,move,up,leave,cancel,abortGesture,stats:()=>({...renderer.stats(),fps:latest.current.options.paused?0:fps,desktopMode:!!latest.current.options.desktopMode}),clear:cancel};
  resize();publish();persist();configureSound();schedule();
  return()=>{dead=true;clearGesture();persist();cancelAnimationFrame(frame);clearTimeout(saveTimer);audio.destroy();life.destroy();renderer.destroy();observer.disconnect();unwatch?.();off?.();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',persist);window.removeEventListener('pointerdown',unlock,true);window.removeEventListener('keydown',key);window.removeEventListener('blur',abortGesture);runtime.current=null};
 },[]);
 useEffect(()=>{const r=runtime.current;r?.resize();r?.configureSound();r?.schedule()},[options,immersive]);
 useEffect(()=>runtime.current?.visibility(),[desktop?.visible,desktop?.minimized]);
 useEffect(()=>{if(immersive)runtime.current?.clear()},[immersive]);
 useEffect(()=>{if(editing)runtime.current?.abortGesture()},[editing]);
 useImperativeHandle(ref,()=>({command:(a,p)=>runtime.current?.command(a,p),clear:()=>runtime.current?.clear(),previewSound:kind=>runtime.current?.previewSound(kind),stats:()=>runtime.current?.stats(),feed:()=>latest.current.notify('先选上香、供灯或供品，再轻点供桌。')}),[]);
 return <div className="caiyuan-stage"><canvas ref={back} className="caiyuan-background" aria-hidden="true"/><canvas ref={canvas} className="pond-canvas caiyuan-canvas" aria-label="财源广进供桌，轻点互动，长按摆件自由拖动" onPointerDown={e=>runtime.current?.down(e)} onPointerMove={e=>runtime.current?.move(e)} onPointerUp={e=>runtime.current?.up(e)} onPointerCancel={()=>runtime.current?.cancel()} onLostPointerCapture={()=>runtime.current?.abortGesture()} onContextMenu={e=>{e.preventDefault();runtime.current?.cancel()}} onPointerLeave={()=>runtime.current?.leave()}/></div>
});export default Scene;
