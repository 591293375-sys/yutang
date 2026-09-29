import test from 'node:test';
import assert from 'node:assert/strict';
import {DRAWING_LIMITS,DRAWING_COLORS,DRAWING_WIDTHS,emptyDrawing,normalizeDrawing,hasDrawing,appendDrawingStroke,drawLetterDrawing,jsonBytes} from '../src/themes/coast/letter-drawing.js';

const stroke=(extra={})=>({tool:'pen',color:DRAWING_COLORS[0].value,width:DRAWING_WIDTHS[0].value,points:[[.1,.2],[.3,.4]],...extra});
test('legacy empty paper and normalized vector strokes are bounded and independent copies',()=>{
 assert.deepEqual(normalizeDrawing(undefined),emptyDrawing());assert.equal(hasDrawing(emptyDrawing()),false);
 const input={version:1,strokes:[stroke({points:[[.123456,.2],[1,0]]})]},clean=normalizeDrawing(input);
 assert.deepEqual(clean.strokes[0].points[0],[.1235,.2]);assert.equal(hasDrawing(clean),true);
 input.strokes[0].points[0][0]=.9;assert.equal(clean.strokes[0].points[0][0],.1235);
 assert.ok(jsonBytes(clean)<DRAWING_LIMITS.bytes);
});
test('untrusted paint cannot supply CSS, invalid tools, coordinates, sizes or unbounded points',()=>{
 for(const bad of [stroke({color:'url(javascript:alert(1))'}),stroke({tool:'image'}),stroke({width:9}),stroke({points:[[NaN,.1]]}),stroke({points:[[1.01,.1]]}),stroke({points:[['.2',.1]]}),stroke({points:Array.from({length:DRAWING_LIMITS.pointsPerStroke+1},()=>[.1,.2])})])assert.equal(normalizeDrawing({version:1,strokes:[bad]}),null);
 assert.equal(normalizeDrawing({version:2,strokes:[]}),null);
 assert.equal(normalizeDrawing({version:1,strokes:Array.from({length:DRAWING_LIMITS.strokes+1},()=>stroke())}),null);
 const tooMany=Array.from({length:Math.floor(DRAWING_LIMITS.points/DRAWING_LIMITS.pointsPerStroke)+1},()=>stroke({points:Array.from({length:DRAWING_LIMITS.pointsPerStroke},()=>[.1,.2])}));
 assert.equal(normalizeDrawing({version:1,strokes:tooMany}),null);
});
test('adding a stroke rejects the complete overflow operation without trimming existing art',()=>{
 const full={version:1,strokes:Array.from({length:DRAWING_LIMITS.strokes},()=>stroke())},before=JSON.stringify(full);
 const result=appendDrawingStroke(full,stroke());assert.equal(result.ok,false);assert.equal(JSON.stringify(full),before);
 const added=appendDrawingStroke(emptyDrawing(),stroke());assert.equal(added.ok,true);assert.equal(added.drawing.strokes.length,1);
 assert.equal(hasDrawing({version:1,strokes:[stroke({tool:'eraser'})]}),false);
});
test('drawing uses normalized coordinates and erases transparent ink instead of painting paper color',()=>{
 const calls=[],ctx={globalCompositeOperation:'source-over',save(){calls.push('save')},restore(){calls.push('restore')},beginPath(){},moveTo(x,y){calls.push(['move',x,y])},lineTo(x,y){calls.push(['line',x,y])},stroke(){calls.push(['stroke',this.globalCompositeOperation,this.lineWidth])},arc(){},fill(){}};
 drawLetterDrawing(ctx,{version:1,strokes:[stroke(),stroke({tool:'eraser'})]},600,400);
 assert.deepEqual(calls.find(c=>c[0]==='move'),['move',60,80]);
 const strokes=calls.filter(c=>c[0]==='stroke');assert.equal(strokes[0][1],'source-over');assert.equal(strokes[1][1],'destination-out');assert.equal(strokes[0][2],600*DRAWING_WIDTHS[0].value);
});
