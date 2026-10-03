import test from 'node:test';
import assert from 'node:assert/strict';
import {traversalPresentation,supportedTraversalPoint} from '../src/themes/cats/traversal.js';
import {quadrupedCycle} from '../src/themes/cats/quadruped.js';
import {paintedLimbWeight} from '../src/themes/cats/painted-gait.js';

test('steps dissolve only at supported takeoff and landing points, never over the vertical face',()=>{
 const from={x:.55,y:.30},to={x:.56,y:.24},cat={x:.553,y:.277};
 for(const kind of ['surface','climb'])for(const direction of ['up','down']){
  const traverse={kind,direction,style:kind==='surface'?'jump':'climb',from,to};
  for(let i=0;i<=20;i++){
   const progress=i/20;
   const leave=traversalPresentation({...cat,traverse:{...traverse,phase:'crouch',progress}});
   const arrive=traversalPresentation({...cat,traverse:{...traverse,phase:'land',progress}});
   assert.deepEqual(leave.point,from);assert.deepEqual(arrive.point,to);
   assert.ok(Math.abs(leave.opacity+arrive.opacity-1)<1e-10);
   const flight=traversalPresentation({...cat,traverse:{...traverse,phase:'jump',progress,jumpProgress:progress}});
   assert.equal(flight.opacity,0);assert.deepEqual(flight.point,progress>=.5?to:from);
  }
  assert.equal(traversalPresentation({...cat,traverse:{...traverse,phase:'crouch',progress:0}}).opacity,1);
  assert.equal(traversalPresentation({...cat,traverse:{...traverse,phase:'land',progress:1}}).opacity,1);
 }
});
test('flat walking and low ledges never flash; persistence still saves supported endpoints',()=>{
 const cat={x:.52,y:.48};assert.equal(traversalPresentation(cat).opacity,1);
 for(const phase of ['crouch','jump','land'])assert.deepEqual(traversalPresentation({...cat,traverse:{style:'stride',phase}}),{point:{...cat,traverse:{style:'stride',phase}},opacity:1,transition:false});
 const c={...cat,traverse:{kind:'surface',style:'jump',phase:'jump',jumpProgress:.7,from:{x:.55,y:.30},to:{x:.56,y:.24}}};
 assert.deepEqual(supportedTraversalPoint(c),c.traverse.to);
});
test('supplementary far limbs do not bend the original torso and left/right paws alternate',()=>{
 const extra={hip:[.7,.65],paw:[.77,.92],extra:true};
 for(let y=.5;y<1;y+=.01)assert.equal(paintedLimbWeight({x:.73,y},extra),0);
 const swings=Array.from({length:4},()=>[]);
 for(let step=0;step<100;step++)for(let leg=0;leg<4;leg++)if(!quadrupedCycle(step/100,leg).planted)swings[leg].push(step);
 for(const swing of swings)assert.ok(swing.length>=27&&swing.length<=29);
 for(const [a,b]of[[0,1],[2,3]])assert.ok(swings[a].every(p=>!swings[b].includes(p)),'each left/right pair alternates support');
});
