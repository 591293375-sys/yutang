import test from 'node:test';
import assert from 'node:assert/strict';
import {CaiyuanModel} from '../src/themes/caiyuan/model.js';
const now=new Date(2026,9,1,12).getTime();
const plaques=m=>m.state.items.filter(i=>i.kind==='plaque');
const content=(m,id)=>m.state.wishes.find(w=>w.id===m.state.items.find(i=>i.id===id)?.wishId)?.content||'';
function pair(){const m=new CaiyuanModel(null,now);assert.ok(m.command('add',{kind:'plaque',x:.72,y:.825},now).ok);return m}
function save(m,plaque,content){const item=m.state.items.find(i=>i.id===plaque);const result=m.command('wishSave',{plaqueId:plaque,id:item.wishId,content},now);assert.equal(result.ok,true,result.message);return result.id}

test('each plaque edits only its own wish and new plaques start blank',()=>{
 const m=pair(),[a,b]=plaques(m);save(m,a.id,'家人平安');assert.equal(content(m,b.id),'');
 save(m,b.id,'工作顺利');save(m,a.id,'家人健康');assert.equal(content(m,a.id),'家人健康');assert.equal(content(m,b.id),'工作顺利');
 assert.notEqual(a.wishId,b.wishId);assert.equal(m.state.wishes.length,2);
 m.command('add',{kind:'plaque',x:.14,y:.825},now);assert.equal(content(m,plaques(m)[2].id),'');
 const r=new CaiyuanModel(m.snapshot(),now+5000);assert.deepEqual(r.state.items,m.state.items);assert.equal(content(r,a.id),'家人健康');assert.equal(content(r,b.id),'工作顺利');
});
test('legacy shared wishes migrate once to independent records without moving the layout',()=>{
 const m=pair();save(m,plaques(m)[0].id,'慢慢发财');const legacy=m.snapshot();legacy.version=2;
 for(const i of legacy.items)delete i.wishId;
 const r=new CaiyuanModel(legacy,now),[a,b]=plaques(r);
 assert.equal(content(r,a.id),'慢慢发财');assert.equal(content(r,b.id),'慢慢发财');assert.notEqual(a.wishId,b.wishId);
 assert.deepEqual(r.state.items.map(({wishId,...i})=>i),legacy.items);
 assert.deepEqual(new CaiyuanModel(r.snapshot(),now).snapshot(),r.snapshot());
 save(r,a.id,'认真生活');assert.equal(content(r,b.id),'慢慢发财');
});
test('blank or invalid v3 plaque bindings never inherit the last active wish',()=>{
 const m=pair();save(m,plaques(m)[0].id,'平安');const s=m.snapshot();const b=s.items.filter(i=>i.kind==='plaque')[1];
 for(const value of [null,'missing',undefined]){b.wishId=value;if(value===undefined)delete b.wishId;const r=new CaiyuanModel(s,now);assert.equal(content(r,b.id),'');assert.equal(r.state.items.find(i=>i.id===b.id).wishId,null)}
});
test('choosing another plaques historical wish copies text, including for stored plaques',()=>{
 const m=pair(),[a,b]=plaques(m);const id=save(m,a.id,'原来的心愿');m.command('store',a.id,now);
 assert.ok(m.command('wishSave',{plaqueId:b.id,id,content:'第二块牌'},now).ok);assert.equal(content(m,a.id),'原来的心愿');assert.equal(content(m,b.id),'第二块牌');assert.notEqual(a.wishId,b.wishId);
 m.command('restore',a.id,now);save(m,a.id,'第一块牌');assert.equal(content(m,b.id),'第二块牌');
});
test('saving without a specific plaque cannot overwrite an arbitrary note on a multi-plaque table',()=>{
 const m=pair();m.command('cancel');const s=m.snapshot();assert.equal(m.command('wishSave',{content:'不该写上'},now).ok,false);assert.deepEqual(m.snapshot(),s);
 for(const plaqueId of ['missing',m.state.items.find(i=>i.kind==='lamp').id])assert.equal(m.command('wishSave',{plaqueId,content:'不该写上'},now).ok,false);
 m.command('store',plaques(m)[0].id,now);const stored=plaques(m)[0].id;assert.equal(m.command('wishSave',{plaqueId:stored,content:'不该写上'},now).ok,false);
});
test('moving, storing, removing and undo preserve independent contents, including later edits',()=>{
 const m=pair(),[a,b]=plaques(m);save(m,a.id,'第一块');save(m,b.id,'第二块');
 m.command('move',{id:a.id,x:.11,y:.833},now);save(m,a.id,'第一块更新');m.command('undo',null,now);assert.equal(content(m,a.id),'第一块更新');assert.equal(content(m,b.id),'第二块');
 m.command('remove',a.id,now);const old=m.state.wishes.find(w=>w.content==='第一块更新');
 m.command('wishSave',{plaqueId:b.id,id:old.id,content:'另存一份'},now);m.command('undo',null,now);
 assert.equal(content(m,a.id),'第一块更新');assert.equal(content(m,b.id),'另存一份');
 m.command('clearTable',null,now);const r=new CaiyuanModel(m.snapshot(),now);assert.equal(r.state.items.length,0);assert.ok(r.state.wishes.length>=2);
});
test('migration of a full legacy history preserves all plaque copies after repeated restarts',()=>{
 const m=pair(),s=m.snapshot();s.version=2;s.wishes=Array.from({length:300},(_,i)=>({id:'legacy-'+i,content:'心愿'+i,createdAt:now}));s.activeWishId='legacy-0';for(const i of s.items)delete i.wishId;
 const r=new CaiyuanModel(s,now);assert.equal(r.state.wishes.length,301);const next=new CaiyuanModel(r.snapshot(),now);assert.deepEqual(next.snapshot(),r.snapshot());save(next,plaques(next)[1].id,'只更新自己的');assert.equal(content(next,plaques(next)[0].id),'心愿0');
});
