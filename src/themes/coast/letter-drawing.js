// A small, portable ink format. Coordinates and width are fractions of the paper.
// No URLs, arbitrary CSS colors, raster payloads or executable markup are stored.
export const DRAWING_LIMITS=Object.freeze({strokes:160,points:6000,pointsPerStroke:1200,bytes:98304});
export const DRAWING_COLORS=Object.freeze([
 {name:'松绿',value:'#35584c'},{name:'海蓝',value:'#447f95'},
 {name:'珊瑚',value:'#bd6555'},{name:'沙金',value:'#bd9547'},
 {name:'暮紫',value:'#8a6b92'},{name:'苔绿',value:'#68865a'},
]);
export const DRAWING_WIDTHS=Object.freeze([{name:'细',value:.004},{name:'中',value:.008},{name:'粗',value:.014}]);
export const emptyDrawing=()=>({version:1,strokes:[]});
export const jsonBytes=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).length;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const colors=new Set(DRAWING_COLORS.map(c=>c.value));
const widths=new Set(DRAWING_WIDTHS.map(w=>w.value));
const number=v=>Number.isFinite(v)&&v>=0&&v<=1;
const round=v=>Math.round(v*10000)/10000;

// Null means invalid/over budget; callers must reject edits rather than silently
// truncate art. A missing field is the legacy text-only format, not an error.
export function normalizeDrawing(value){
 if(value==null)return emptyDrawing();
 if(!object(value)||value.version!==1||!Array.isArray(value.strokes)||value.strokes.length>DRAWING_LIMITS.strokes)return null;
 const strokes=[];let count=0;
 for(const stroke of value.strokes){
  if(!object(stroke)||!['pen','eraser'].includes(stroke.tool)||!colors.has(stroke.color)||!widths.has(stroke.width)||!Array.isArray(stroke.points)||!stroke.points.length||stroke.points.length>DRAWING_LIMITS.pointsPerStroke)return null;
  count+=stroke.points.length;if(count>DRAWING_LIMITS.points)return null;
  const points=[];
  for(const point of stroke.points){if(!Array.isArray(point)||point.length!==2||!point.every(number))return null;points.push(point.map(round))}
  strokes.push({tool:stroke.tool,color:stroke.color,width:stroke.width,points});
 }
 const drawing={version:1,strokes};return jsonBytes(drawing)<=DRAWING_LIMITS.bytes?drawing:null;
}
export const hasDrawing=drawing=>!!drawing?.strokes?.some(stroke=>stroke.tool==='pen'&&stroke.points?.length);
export const drawingPointCount=drawing=>(drawing?.strokes||[]).reduce((count,stroke)=>count+stroke.points.length,0);
export function appendDrawingStroke(drawing,stroke){
 const next=normalizeDrawing({version:1,strokes:[...(drawing?.strokes||[]),stroke]});
 return next?{ok:true,drawing:next}:{ok:false,message:'这张画纸已经画得很丰富了。可以撤销或清空画纸，再继续。'};
}

// Draw onto a transparent ink layer; erasing reveals the paper underneath.
export function drawLetterDrawing(ctx,drawing,width,height){
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(const stroke of drawing?.strokes||[]){
  ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';
  ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;
  ctx.lineWidth=stroke.width*width*(stroke.tool==='eraser'?4:1);
  const first=stroke.points[0];if(!first)continue;
  ctx.beginPath();
  if(stroke.points.length===1){ctx.arc(first[0]*width,first[1]*height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill()}
  else{ctx.moveTo(first[0]*width,first[1]*height);for(const [x,y]of stroke.points.slice(1))ctx.lineTo(x*width,y*height);ctx.stroke()}
 }
 ctx.restore();
}
