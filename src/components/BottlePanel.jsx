import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Mail,PenLine,ArrowLeft} from 'lucide-react';
import {Panel} from './Panel.jsx';
import BottleDrawing from './BottleDrawing.jsx';
import {emptyDrawing,hasDrawing} from '../themes/coast/letter-drawing.js';
import {CURATED_LETTERS,CURATED_LETTERS_BY_ID} from '../themes/coast/letter-catalog.js';
import {guardDismissedClick} from '../lib/dismissed-click-guard.js';

// Keep an unsuccessful autosave available if this panel/theme is closed. This
// recovery cache is deliberately in memory; a full app exit still needs storage.
const unsavedDrafts=new Map();
const blankDraft=()=>({id:'',body:'',signature:'',drawing:emptyDrawing()});
const draftStamp=draft=>JSON.stringify([draft?.id||'',draft?.body||'',draft?.signature||'',draft?.drawing||emptyDrawing()]);
const restoredDraft=view=>{
  const draft=view?.draft||blankDraft(),recovery=unsavedDrafts.get(draft.id);
  // A saved draft changed elsewhere takes precedence over an older failed edit.
  if(recovery&&recovery.base===draftStamp(draft))return recovery.draft;
  unsavedDrafts.delete(draft.id);return {...draft,drawing:draft.drawing||emptyDrawing()};
};

export function BottleIcon({size=25}){
  return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><g transform="rotate(22 14 14)"><path d="M11 3h6v4h-6zM11 7v4c-3 1-4 3-4 6v5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-5c0-3-1-5-4-6V7"/><path d="M11 15h7v7h-7zM13 18h3M10 12l-1 3"/></g></svg>;
}
const dateLabel=value=>Number.isFinite(value)?new Date(value).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'';
const curatedLetter=letter=>letter?.contentId&&Object.hasOwn(CURATED_LETTERS_BY_ID,letter.contentId)?CURATED_LETTERS_BY_ID[letter.contentId]:null;

export default function BottlePanel({view,onDraft,onSend,selectedId,onClose}){
  const [tab,setTab]=useState(()=>view?.sent?.some(item=>item.id===selectedId)?'sent':'received'),[selected,setSelected]=useState(selectedId||null);
  const [draft,setDraft]=useState(()=>restoredDraft(view)),[error,setError]=useState(()=>unsavedDrafts.has(view?.draft?.id)?'这份草稿尚未保存到本机，请重试保存。':''),[unsaved,setUnsaved]=useState(()=>unsavedDrafts.has(view?.draft?.id));
  const draftRef=useRef(draft),drawingRef=useRef(null),sendActivation=useRef(null);draftRef.current=draft;
  useEffect(()=>{if(selectedId){setTab(view?.sent?.some(item=>item.id===selectedId)?'sent':'received');setSelected(selectedId)}},[selectedId]);
  useEffect(()=>{
    if(view?.draft&&view.draft.id!==draftRef.current.id){const next=restoredDraft(view);draftRef.current=next;setDraft(next);setUnsaved(unsavedDrafts.has(next.id));setError(unsavedDrafts.has(next.id)?'这份草稿尚未保存到本机，请重试保存。':'')}
  },[view?.draft?.id]);
  const letters=tab==='sent'?(view?.sent||[]):(view?.collection||[]);
  const letter=letters.find(item=>item.id===selected),curated=curatedLetter(letter);
  const collectedIds=new Set(view?.collectedContentIds||view?.collection?.map(item=>item.contentId).filter(Boolean)||[]);
  const collectedCurated=CURATED_LETTERS.filter(item=>collectedIds.has(item.id)).length;
  const collectionComplete=CURATED_LETTERS.length>0&&collectedCurated>=CURATED_LETTERS.length;
  const saveDraft=next=>{
    const result=onDraft(next),saved=result?.ok===true;setUnsaved(!saved);
    if(saved){unsavedDrafts.delete(next.id);setError('')}
    else{unsavedDrafts.set(next.id,{draft:next,base:draftStamp(result?.draft||view?.draft)});while(unsavedDrafts.size>2)unsavedDrafts.delete(unsavedDrafts.keys().next().value);setError(result?.message||'草稿尚未保存到本机，请重试保存。')}
    return result;
  };
  const edit=(field,value)=>{
    const next={...draftRef.current,[field]:value};draftRef.current=next;setDraft(next);saveDraft(next);
  };
  const send=event=>{
    event.preventDefault();drawingRef.current?.finish();
    const activation=sendActivation.current;sendActivation.current=null;
    const current=draftRef.current,result=onSend({...current,requestId:current.id});
    if(!result?.ok)setError(result?.message||'这封信暂时没有放流，请稍后再试。');
    else{guardDismissedClick(activation);unsavedDrafts.delete(current.id);setUnsaved(false);onClose()}
  };
  const changeTab=value=>{drawingRef.current?.finish();setTab(value);setSelected(null);if(!unsaved)setError('')};
  const close=useCallback(()=>{drawingRef.current?.finish();onClose()},[onClose]);
  return <Panel wide title="把心事，交给一只漂流瓶" subtitle="涨潮捎来一封信，不必等候，也不必回复。" onClose={close}>
    <div className="studio-tabs bottle-tabs" role="tablist" aria-label="漂流瓶内容">
      <button role="tab" aria-selected={tab==='received'} className={tab==='received'?'active':''} onClick={()=>changeTab('received')}>拾到的信 <small>{view?.collection?.length||0}</small></button>
      <button role="tab" aria-selected={tab==='write'} className={tab==='write'?'active':''} onClick={()=>changeTab('write')}>写一封信</button>
      <button role="tab" aria-selected={tab==='sent'} className={tab==='sent'?'active':''} onClick={()=>changeTab('sent')}>放流记录</button>
    </div>
    {tab==='write'?<form className="bottle-compose" onSubmit={send}>
      <label htmlFor="bottle-body">想对大海说些什么？</label>
      <BottleDrawing key={draft.id} ref={drawingRef} value={draft.drawing} body={draft.body} onBodyChange={body=>edit('body',body)} onChange={drawing=>edit('drawing',drawing)}/>
      <div className="bottle-counter"><span>一句话，一幅画，都写在这张纸上。</span><span>{draft.body.length} / 600</span></div>
      <div className="bottle-compose-footer"><label>落款 <small>可不填</small><input aria-label="漂流信落款" maxLength={24} value={draft.signature} onChange={e=>edit('signature',e.target.value)} placeholder="一个路过海边的人"/></label><button className="primary-button" type="submit" onClick={event=>{sendActivation.current=event.detail>0?{x:event.clientX,y:event.clientY}:null}} disabled={!draft.body.trim()&&!hasDrawing(draft.drawing)}><BottleIcon size={21}/>放回海里<ArrowUpRight size={18}/></button></div>
      {error&&<div className="bottle-draft-retry"><p className="inline-note bottle-error" role="alert">{error}</p>{unsaved&&<button type="button" className="text-button" onClick={()=>{drawingRef.current?.finish();saveDraft(draftRef.current)}}>重试保存</button>}</div>}
      <p className="inline-note">{unsaved?'草稿还留在当前页面，完全退出程序前请先重试保存。':'文字和图画自动留在本机。放流后，可以在「放流记录」里再读。'}</p>
    </form>:letter?<article className="bottle-reading">
      <button className="text-button" onClick={()=>setSelected(null)}><ArrowLeft size={16}/>回到信笺</button>
      <div className={`letter-paper ${curated?'letter-paper-curated':'letter-paper-personal'}`}><span className="letter-eyebrow">{letter.source==='local'?'写给大海':'海边来信'} · {dateLabel(letter.receivedAt||letter.sentAt||letter.createdAt)}</span><h3>{curated?.title||letter.title||'一封漂流信'}</h3>{curated?<img className="bottle-curated-page" src={curated.asset} width={curated.width} height={curated.height} alt={curated.title} loading="lazy" decoding="async"/>:<BottleDrawing key={letter.id} value={letter.drawing||emptyDrawing()} body={letter.body||''} readOnly/>}<p className="letter-signature">—— {curated?.signature||letter.signature||'一个路过海边的人'}</p></div>
    </article>:letters.length?<div className="bottle-letter-list">{letters.map(item=>{const content=curatedLetter(item);return <button className="bottle-letter-row" key={item.id} onClick={()=>setSelected(item.id)}>{content?<img className="bottle-letter-thumbnail" src={content.asset} width={content.width} height={content.height} alt="" loading="lazy" decoding="async"/>:<Mail size={23}/>}<span><strong>{content?.title||item.title||'一封漂流信'}</strong><small>{content?'一张随海浪而来的手写信笺':item.body||'一张画给大海的小画'}{!content&&item.body&&hasDrawing(item.drawing)?' · 纸上还有一幅画':''}</small></span><time>{dateLabel(item.receivedAt||item.sentAt||item.createdAt)}</time><ArrowUpRight size={16}/></button>})}</div>:<div className="coast-empty bottle-empty"><BottleIcon size={54}/><h3>{tab==='sent'?'有些心事，可以交给海浪':collectionComplete?'海上的来信，都收藏好了':'下一封信，在来的路上'}</h3><p>{tab==='sent'?'在同一张纸上写写画画，装进小瓶，轻轻放回海里。':collectionComplete?'每封来信只遇见一次。随时回来，再读一遍。':'每次涨潮，会有一只小瓶随潮水漂来。轻点拾起，收藏一封不重复的来信。'}</p>{tab==='sent'&&<button className="text-button" onClick={()=>changeTab('write')}><PenLine size={16}/>写一封信</button>}</div>}
    {tab==='received'&&<p className="bottle-collection-progress">{collectionComplete?'海上的来信，都收藏好了。已拾到的信不会再次漂来。':`已收藏 ${collectedCurated} / ${CURATED_LETTERS.length} 封来信 · 每封只遇见一次`}</p>}
    <p className="bottle-local-note">这是这台电脑上的小海岸：来信来自随游戏收藏的信笺，你写的信也只保存在本机。</p>
  </Panel>;
}
