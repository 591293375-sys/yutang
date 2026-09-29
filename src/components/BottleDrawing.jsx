import {forwardRef,useCallback,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {Eraser,PenLine,Type,Undo2,Trash2} from 'lucide-react';
import {DRAWING_COLORS,DRAWING_WIDTHS,DRAWING_LIMITS,emptyDrawing,drawingPointCount,appendDrawingStroke,drawLetterDrawing} from '../themes/coast/letter-drawing.js';
import './BottleDrawing.css';

// The text and ink share one logical sheet. Scaling the entire text layer rather
// than reflowing responsive text keeps marks next to the same words on resize.
const PAPER_WIDTH=720,PAPER_HEIGHT=480;
const BottleDrawing=forwardRef(function BottleDrawing({value,onChange,body='',onBodyChange,readOnly=false},ref){
 const canvas=useRef(null),paper=useRef(null),text=useRef(null),valueRef=useRef(value||emptyDrawing()),changeRef=useRef(onChange),active=useRef(null),frame=useRef(0),history=useRef([]);
 const [tool,setTool]=useState('text'),[color,setColor]=useState(DRAWING_COLORS[0].value),[width,setWidth]=useState(DRAWING_WIDTHS[1].value),[notice,setNotice]=useState(''),[historySize,setHistorySize]=useState(0),[paperScale,setPaperScale]=useState(1);
 valueRef.current=value||emptyDrawing();changeRef.current=onChange;
 const paint=useCallback(()=>{
  const el=canvas.current;if(!el)return;const bounds=el.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.round(bounds.width*dpr),h=Math.round(bounds.height*dpr);
  if(el.width!==w||el.height!==h){el.width=w;el.height=h}
  const ctx=el.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.setTransform(dpr,0,0,dpr,0,0);
  const drawing=active.current?{version:1,strokes:[...valueRef.current.strokes,active.current.stroke]}:valueRef.current;
  drawLetterDrawing(ctx,drawing,bounds.width,bounds.height);
 },[]);
 const repaint=useCallback(()=>{if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;paint()})},[paint]);
 const replace=useCallback(next=>{
  history.current=[...history.current.slice(-19),valueRef.current];setHistorySize(history.current.length);
  valueRef.current=next;changeRef.current?.(next);repaint();
 },[repaint]);
 const finish=useCallback(()=>{
  const pending=active.current;if(!pending)return valueRef.current;
  active.current=null;
  if(canvas.current?.hasPointerCapture(pending.pointerId))canvas.current.releasePointerCapture(pending.pointerId);
  const result=pending.full?{ok:false,message:'这一笔过长，没有保存。请分成几笔，或撤销后继续绘制。'}:appendDrawingStroke(valueRef.current,pending.stroke);
  if(result.ok)replace(result.drawing);else setNotice(result.message);
  repaint();return valueRef.current;
 },[replace,repaint]);
 useImperativeHandle(ref,()=>({finish}),[finish]);
 useEffect(()=>{
  const resize=()=>{if(paper.current)setPaperScale(paper.current.clientWidth/PAPER_WIDTH);repaint()};
  const observer=new ResizeObserver(resize);if(paper.current)observer.observe(paper.current);
  const hidden=()=>{if(document.hidden)finish()};document.addEventListener('visibilitychange',hidden);window.addEventListener('resize',resize);resize();
  return()=>{finish();observer.disconnect();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('resize',resize);cancelAnimationFrame(frame.current);frame.current=0};
 },[finish,repaint]);
 useEffect(repaint,[value,repaint]);
 useLayoutEffect(()=>{
  const el=text.current;if(!el)return;
  // 600 ordinary Chinese characters fit at the default size. Unusually many
  // explicit line breaks use smaller type, never a scrolling text-only layer.
  let size=16;el.style.fontSize=`${size}px`;el.style.lineHeight='1.4';
  for(let i=0;i<12&&el.scrollHeight>el.clientHeight+1;i++){
   size=Math.max(.4,size*(el.clientHeight/el.scrollHeight)*.97);el.style.fontSize=`${size}px`;
  }
  el.scrollTop=0;
 },[body,readOnly]);
 const point=event=>{const r=canvas.current.getBoundingClientRect();return[Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))]};
 const start=event=>{
  if(readOnly||tool==='text'||active.current||event.button!==0||event.isPrimary===false)return;
  if(valueRef.current.strokes.length>=DRAWING_LIMITS.strokes||drawingPointCount(valueRef.current)>=DRAWING_LIMITS.points){setNotice('画纸已满，可以撤销或清空笔迹后继续。');return}
  event.preventDefault();setNotice('');active.current={pointerId:event.pointerId,pointsBefore:drawingPointCount(valueRef.current),stroke:{tool,color,width,points:[point(event)]}};
  event.currentTarget.setPointerCapture(event.pointerId);repaint();
 };
 const move=event=>{
  const pending=active.current;if(!pending||pending.pointerId!==event.pointerId)return;event.preventDefault();
  const samples=event.nativeEvent.getCoalescedEvents?.()||[event.nativeEvent];
  for(const sample of samples.length?samples:[event.nativeEvent]){
   const p=point(sample),last=pending.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<.0015)continue;
   if(pending.stroke.points.length>=DRAWING_LIMITS.pointsPerStroke||pending.pointsBefore+pending.stroke.points.length>=DRAWING_LIMITS.points){if(!pending.full){pending.full=true;setNotice('这一笔已到上限，请抬笔；可撤销或清空笔迹后继续。')}break}
   pending.stroke.points.push(p);
  }
  repaint();
 };
 const undo=()=>{
  finish();const previous=history.current.pop()??(valueRef.current.strokes.length?{version:1,strokes:valueRef.current.strokes.slice(0,-1)}:null);
  if(previous){valueRef.current=previous;changeRef.current?.(previous);setNotice('');setHistorySize(history.current.length);repaint()}
 };
 const clear=()=>{finish();if(valueRef.current.strokes.length){replace(emptyDrawing());setNotice('已清空笔迹，文字仍在；可以撤销恢复。')}};
 const chooseTool=next=>{finish();setTool(next);if(next!=='text')text.current?.blur()};
 return <div className={`bottle-drawing ${readOnly?'bottle-drawing-readonly':''}`}>
  {!readOnly&&<div className="bottle-drawing-toolbar" aria-label="信纸工具">
    <div className="bottle-ink-tools"><button type="button" aria-label="打字" aria-pressed={tool==='text'} onClick={()=>chooseTool('text')}><Type size={17}/><span>打字</span></button><button type="button" aria-label="画笔" aria-pressed={tool==='pen'} onClick={()=>chooseTool('pen')}><PenLine size={17}/><span>画笔</span></button><button type="button" aria-label="橡皮" aria-pressed={tool==='eraser'} onClick={()=>chooseTool('eraser')}><Eraser size={17}/><span>橡皮</span></button></div>
    <div className="bottle-ink-colors" aria-label="画笔颜色">{DRAWING_COLORS.map(ink=><button type="button" key={ink.value} aria-label={`${ink.name}画笔`} aria-pressed={color===ink.value&&tool==='pen'} style={{'--bottle-ink':ink.value}} onClick={()=>{chooseTool('pen');setColor(ink.value)}}/>)}</div>
    <div className="bottle-ink-widths" aria-label="画笔粗细">{DRAWING_WIDTHS.map(brush=><button type="button" key={brush.value} aria-label={`${brush.name}笔`} aria-pressed={width===brush.value} onClick={()=>{finish();setWidth(brush.value)}}><i style={{width:brush.value*700+2,height:brush.value*700+2}}/></button>)}</div>
    <div className="bottle-ink-actions"><button type="button" aria-label="撤销画笔" title="撤销笔迹" disabled={!value?.strokes?.length&&!historySize} onClick={undo}><Undo2 size={17}/></button><button type="button" aria-label="清空画纸" title="清空笔迹，保留文字" disabled={!value?.strokes?.length} onClick={clear}><Trash2 size={17}/></button></div>
   </div>}
  <div ref={paper} className={`bottle-drawing-paper ${!readOnly?`is-${tool}`:''}`} data-paper-width={PAPER_WIDTH} data-paper-height={PAPER_HEIGHT}>
   <div className="bottle-paper-text-layer" style={{width:PAPER_WIDTH,height:PAPER_HEIGHT,transform:`scale(${paperScale})`}}>
    <textarea ref={text} id={readOnly?undefined:'bottle-body'} className="bottle-paper-body" aria-label={readOnly?'漂流信正文':'想对大海说些什么？'} value={body} readOnly={readOnly||tool!=='text'} tabIndex={!readOnly&&tool==='text'?0:-1} onChange={e=>onBodyChange?.(e.target.value)} maxLength={600} spellCheck={false} placeholder={readOnly||tool!=='text'?'':'今天的小小开心，或是想暂时放下的心事……\n\n点一下画笔，也可以在这张纸上画画。'}/>
   </div>
   <canvas ref={canvas} className="bottle-letter-canvas" role="img" aria-label={readOnly?'漂流信中的画':'漂流信画纸'} onPointerDown={start} onPointerMove={move} onPointerUp={event=>{if(active.current?.pointerId===event.pointerId)finish()}} onPointerCancel={finish} onLostPointerCapture={finish}/>
  </div>
  {!readOnly&&<p className="bottle-drawing-caption" role="status">{notice||(tool==='text'?'在这张纸上打字 · 点画笔，就能在同一张纸上画画':'抬笔自动保存 · 橡皮只擦笔迹，文字仍会保留')}</p>}
 </div>;
});
export default BottleDrawing;
