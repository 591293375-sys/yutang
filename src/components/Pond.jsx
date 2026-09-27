import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {PondEngine} from '../engine/pond.js';
const Pond=forwardRef(function Pond({options,fish,onFeed,desktop},ref){
 const canvas=useRef(null),landscape=useRef(null),engine=useRef(null);const initial=useRef({options,fish});
 useEffect(()=>{const instance=new PondEngine(canvas.current,initial.current.options,landscape.current);engine.current=instance;instance.setCustomFish(initial.current.fish);instance.start();return()=>{instance.destroy();engine.current=null}},[]);
 useEffect(()=>engine.current?.updateOptions(options),[options]);useEffect(()=>engine.current?.setCustomFish(fish),[fish]);
 useEffect(()=>engine.current?.updateOptions({displayPixelRatio:desktop?.display?.scaleFactor||0}),[desktop?.display?.scaleFactor]);
 useEffect(()=>{if(!window.pondDesktop)return;return window.pondDesktop.onPointer(event=>{if(event.type==='feed')engine.current?.feed(event.x,event.y);else engine.current?.pointer(event.x,event.y,true)})},[]);
 useImperativeHandle(ref,()=>({feed:(x,y)=>engine.current?.feed(x??canvas.current.clientWidth*.52,y??canvas.current.clientHeight*.5),stats:()=>engine.current?.getStats()}),[]);
 return <><canvas ref={landscape} className="living-background" aria-hidden="true"/><canvas ref={canvas} className="pond-canvas" aria-label="互动锦鲤池塘，轻点水面投食" onPointerMove={e=>engine.current?.pointer(e.clientX,e.clientY,true)} onPointerLeave={()=>engine.current?.pointer(0,0,false)} onPointerDown={e=>{if(e.button!==0)return;engine.current?.feed(e.clientX,e.clientY);onFeed?.()}}/></>;
});export default Pond;
