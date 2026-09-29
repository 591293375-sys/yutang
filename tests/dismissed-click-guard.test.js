import test from 'node:test';
import assert from 'node:assert/strict';
import {guardDismissedClick} from '../src/lib/dismissed-click-guard.js';

function browser(){
 const listeners=new Map(),timers=new Map();let next=1;
 return{
  listeners,timers,
  target:{addEventListener(type,fn,capture){assert.equal(capture,true);listeners.set(type,fn)},removeEventListener(type,fn,capture){assert.equal(capture,true);if(listeners.get(type)===fn)listeners.delete(type)}},
  setTimer(fn){const id=next++;timers.set(id,fn);return id},clearTimer(id){timers.delete(id)},
  fire(type,props={}){const event={type,button:0,detail:1,clientX:180,clientY:730,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...props};listeners.get(type)?.(event);return event},
  expire(){for(const fn of [...timers.values()])fn()},
 };
}

test('a dismissed send button consumes the second press before lower UI or scene handlers',()=>{
 const page=browser();guardDismissedClick({x:180,y:730},page);
 for(const type of ['pointerdown','mousedown','pointerup','mouseup','click','dblclick']){
  const event=page.fire(type,{clientX:182,clientY:729,detail:2});
  assert.equal(event.prevented,true,type+' default should be blocked');assert.equal(event.stopped,true,type+' must not reach underlying controls');
 }
 page.expire();assert.equal(page.listeners.size,0);assert.equal(page.timers.size,0);
 assert.equal(page.fire('click',{detail:1}).stopped,false,'normal scene clicks resume after the short guard');
});

test('keyboard sends and deliberate interactions elsewhere remain available',()=>{
 const page=browser();guardDismissedClick(null,page);assert.equal(page.listeners.size,0);
 const cancel=guardDismissedClick({x:180,y:730},page);
 assert.equal(page.fire('click',{detail:0}).stopped,false,'keyboard click must remain usable');
 assert.equal(page.fire('pointerdown',{clientX:400}).stopped,false,'another control can be clicked immediately');
 assert.equal(page.fire('click',{button:2}).stopped,false,'right-click is unrelated');
 cancel();assert.equal(page.listeners.size,0);assert.equal(page.timers.size,0);
});

test('a replacement guard removes all previous listeners and timers',()=>{
 const first=browser(),second=browser();guardDismissedClick({x:180,y:730},first);guardDismissedClick({x:20,y:30},second);
 assert.equal(first.listeners.size,0);assert.equal(first.timers.size,0);assert.equal(second.listeners.size,6);
 second.expire();assert.equal(second.listeners.size,0);
});
