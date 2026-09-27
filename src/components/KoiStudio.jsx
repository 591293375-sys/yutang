import {useEffect,useRef,useState} from 'react';
import {Undo2,RotateCcw,Eraser,Paintbrush,ArrowRight,Trash2,Plus,Minus,Turtle} from 'lucide-react';
import {Panel} from './Panel.jsx';
import {KoiRenderer} from '../engine/koi-renderer.js';
import {SKIN_WIDTH,SKIN_HEIGHT,prepareKoiSkin} from '../engine/koi-skin.js';
import {KoiPreview,TurtlePreview,paintKoiPreview,studioFish} from './CreaturePreview.jsx';
const COLORS=['#ec5e3c','#efad42','#fff6df','#203b38','#d4bcb0','#629b83','#e98a9d'];
export default function KoiStudio({onClose,onSave,fish,onRemove,onResize,turtleCount=0,onTurtles}){
 const canvas=useRef(null),paint=useRef(null),drawing=useRef(false),last=useRef(null),history=useRef([]),frame=useRef(0),sizeRef=useRef(1);
 const [color,setColor]=useState(COLORS[0]),[brush,setBrush]=useState(24),[eraser,setEraser]=useState(false),[name,setName]=useState('小欢喜'),[size,setSize]=useState(1),[revision,setRevision]=useState(0),[tab,setTab]=useState('draw');sizeRef.current=size;
 function preview(){if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;if(canvas.current&&paint.current){const skin=prepareKoiSkin(paint.current,'skin-v2');paintKoiPreview(canvas.current,skin,sizeRef.current)}})}
 function init(){
  if(!paint.current){paint.current=document.createElement('canvas');paint.current.width=SKIN_WIDTH;paint.current.height=SKIN_HEIGHT}
  const c=paint.current.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff6df';c.fillRect(0,0,SKIN_WIDTH,SKIN_HEIGHT);
  history.current=[];setRevision(v=>v+1);preview();
 }
 useEffect(()=>{if(tab==='draw'){if(!paint.current)init();else preview()}return()=>{drawing.current=false;last.current=null}},[tab]);
 useEffect(()=>{if(tab==='draw')preview()},[size,revision]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);frame.current=0},[]);
 function point(e){const r=canvas.current.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*640,y:(e.clientY-r.top)/r.height*320}}
 function uv(p){const fish=studioFish(sizeRef.current),u=((p.x-fish.x)/fish.length+.37)/.78;if(u<.01||u>.99)return null;const painter=new KoiRenderer(null),b=painter.bodyPoint(fish,u),v=(p.y-fish.y-b.y)/Math.max(1,b.width)/2+.5;if(v<-.08||v>1.08)return null;return{x:u*SKIN_WIDTH,y:Math.max(0,Math.min(1,v))*SKIN_HEIGHT,rx:brush/2*SKIN_WIDTH/(fish.length*.78),ry:brush/2*SKIN_HEIGHT/(b.width*2)}}
 function stamp(p){const m=uv(p);if(!m)return;const c=paint.current.getContext('2d');c.fillStyle=eraser?'#fff6df':color;c.beginPath();c.ellipse(m.x,m.y,m.rx,Math.min(100,m.ry),0,0,Math.PI*2);c.fill()}
 function begin(e){if(e.button!==0)return;const p=point(e);if(!uv(p))return;e.preventDefault();canvas.current.setPointerCapture(e.pointerId);history.current.push(paint.current.getContext('2d').getImageData(0,0,SKIN_WIDTH,SKIN_HEIGHT));if(history.current.length>25)history.current.shift();drawing.current=true;last.current=p;stamp(p);preview();setRevision(v=>v+1)}
 function draw(e){if(!drawing.current)return;const p=point(e),from=last.current,steps=Math.max(1,Math.ceil(Math.hypot(p.x-from.x,p.y-from.y)/(brush*.22)));for(let i=1;i<=steps;i++)stamp({x:from.x+(p.x-from.x)*i/steps,y:from.y+(p.y-from.y)*i/steps});last.current=p;preview()}
 function end(){drawing.current=false;last.current=null}
 function undo(){const previous=history.current.pop();if(previous)paint.current.getContext('2d').putImageData(previous,0,0);setRevision(v=>v+1);preview()}
 function changeTab(next){end();setTab(next)}
 return <Panel wide title="画一尾，属于你的锦鲤" subtitle="画下花纹，长出鱼鳞，让它自在游进池塘。" onClose={onClose}>
  <div className="studio-tabs"><button className={tab==='draw'?'selected':''} onClick={()=>changeTab('draw')}>绘制锦鲤</button><button className={tab==='collection'?'selected':''} onClick={()=>changeTab('collection')}>我的锦鲤 <span>{fish.length}/12</span></button><button className={tab==='turtles'?'selected':''} onClick={()=>changeTab('turtles')}>小乌龟 <span>{turtleCount}/4</span></button></div>
  {tab==='draw'?<>
   <div className="drawing-board anatomical-board"><div className="drawing-watermark">在鱼身上涂画，实时预览入水后的花纹</div><canvas aria-label="锦鲤绘画画布" ref={canvas} width="1280" height="640" onPointerDown={begin} onPointerMove={draw} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/><span className="drawing-caption">鱼尾 ←<span>→ 鱼头</span></span></div>
   <div className="drawing-tools"><div className="swatches">{COLORS.map(c=><button aria-label={`颜色 ${c}`} key={c} style={{background:c}} className={color===c&&!eraser?'active':''} onClick={()=>{setColor(c);setEraser(false)}}/>)}<label className="custom-color" title="自选颜色"><input aria-label="自选画笔颜色" type="color" value={color} onChange={e=>{setColor(e.target.value);setEraser(false)}}/></label></div><div className="tool-group"><button className={`icon-button ${eraser?'active':''}`} aria-label={eraser?'使用画笔':'使用橡皮'} onClick={()=>setEraser(!eraser)}>{eraser?<Eraser size={18}/>:<Paintbrush size={18}/>}</button><button className="icon-button" aria-label="撤销一笔" disabled={!history.current.length} onClick={undo}><Undo2 size={18}/></button><button className="icon-button" aria-label="重新绘制" onClick={init}><RotateCcw size={17}/></button></div></div>
   <div className="studio-sliders"><label className="brush-control">笔触大小<input aria-label="笔触大小" type="range" min="5" max="65" value={brush} onChange={e=>setBrush(Number(e.target.value))}/><span>{brush}</span></label><label className="brush-control">锦鲤大小<input aria-label="新锦鲤大小" type="range" min="0.55" max="1.8" step="0.05" value={size} onChange={e=>setSize(Number(e.target.value))}/><span>{Math.round(size*100)}%</span></label></div>
   <footer className="studio-footer"><label>给它一个名字<input aria-label="锦鲤名字" maxLength="12" value={name} onChange={e=>setName(e.target.value)} placeholder="为锦鲤命名"/></label><button className="primary-button" disabled={!name.trim()||fish.length>=12} onClick={()=>onSave({id:crypto.randomUUID(),name:name.trim(),texture:paint.current.toDataURL('image/png'),appearance:'skin-v2',size})}>放入池塘 <ArrowRight size={17}/></button></footer>{fish.length>=12&&<p className="inline-note">池塘里已有 12 尾自绘锦鲤，可先在「我的锦鲤」中移走一尾。</p>}
  </>:tab==='collection'?<div className="fish-collection">{fish.length===0?<div className="empty-state"><Paintbrush size={30}/><p>第一尾专属锦鲤，等你落笔。</p><button className="text-button" onClick={()=>changeTab('draw')}>开始绘制</button></div>:fish.map(f=><div className="fish-row sized-fish-row" key={f.id}><KoiPreview fish={f}/><div className="fish-row-details"><strong>{f.name}</strong><label>大小 <input aria-label={`${f.name}的大小`} type="range" min=".55" max="1.8" step=".05" value={f.size??1} onChange={e=>onResize(f.id,Number(e.target.value))}/><span>{Math.round((f.size??1)*100)}%</span></label></div><button aria-label={`移走${f.name}`} className="icon-button" onClick={()=>onRemove(f.id)}><Trash2 size={17}/></button></div>)}</div>:
   <div className="turtle-studio"><TurtlePreview/><h3>请一位慢慢游的小邻居</h3><p>缓缓划水，偶尔歇息。投下一点鱼食，它也会来看看。</p><div className="turtle-population"><button className="icon-button" aria-label="减少一只小乌龟" disabled={turtleCount===0} onClick={()=>onTurtles(turtleCount-1)}><Minus size={19}/></button><span>{turtleCount} <small>只在池塘里</small></span><button className="icon-button" aria-label="增加一只小乌龟" disabled={turtleCount>=4} onClick={()=>onTurtles(turtleCount+1)}><Plus size={19}/></button></div><button className="primary-button" disabled={turtleCount>=4} onClick={()=>onTurtles(turtleCount+1)}><Turtle size={19}/>{turtleCount>=4?'小邻居已经到齐':'请一只入池'}</button><p className="inline-note">最多 4 只 · 数量会保存在本机</p></div>}
 </Panel>
}
