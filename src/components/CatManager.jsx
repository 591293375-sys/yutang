import {Archive,ArrowDownToLine,House,SlidersHorizontal,Plus,Sun,Trash2} from 'lucide-react';
import {Panel} from './Panel.jsx';
import {CatPortrait} from './CatStudio.jsx';
import {getPreset} from '../themes/cats/catalog.js';
import {exportDesign} from '../themes/cats/storage.js';
import {SLEEP_SLOT_MAP} from '../themes/cats/geometry.js';
import '../themes/cats/studio.css';

import {PERSONALITY_LABELS} from '../themes/cats/customization.js';
export default function CatManager({view,onAdd,onEdit,onToggle,onArchive,onRemove,onExport,onClose,notify=()=>{}}){
  const cats=view?.cats||[],visibleCount=view?.visibleCount??cats.filter(c=>c.active).length,sleepingCount=cats.filter(c=>c.active&&c.restIntent).length,maxActive=view?.maxActive||12;
  function download(cat){
    if(onExport){onExport(cat);return}
    try{const body=exportDesign(cat),blob=new Blob([body],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${cat.name.replace(/[\\/:*?"<>|]/g,'_')||'猫咪'}-猫咪设计.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);notify('猫咪设计已导出。')}catch{notify('暂时无法导出，请再试一次。')}
  }
  return <Panel wide title="庭院里，都有谁" subtitle="走到草垫上做个梦，或者在暖石上晒一会儿太阳。" onClose={onClose}>
    <div className="cat-manager-summary"><span><strong>{visibleCount}</strong> / {maxActive} 只在庭院 · 休息 {sleepingCount} 只 · 收藏 {cats.length} 只</span><div><button className="primary-button" onClick={onAdd}><Plus size={17}/> 添加猫咪</button></div></div>
    <div className="cat-collection">{cats.map(cat=>{const resting=!!cat.restIntent,action=!cat.active?'来到庭院':resting?'轻轻叫醒':'回窝休息',place=SLEEP_SLOT_MAP[cat.restIntent?.slotId]?.label||'休息处';return <article key={cat.id} className="cat-card"><CatPortrait cat={cat} size={256}/><div className="cat-card-description"><h3>{cat.name}</h3><p>{getPreset(cat.presetId)?.name} · {PERSONALITY_LABELS[cat.personality]||'亲人'}</p><small className={cat.active?'is-active':''}>{!cat.active?'珍藏在猫咪收藏中':resting?(cat.state==='sleep'||cat.state==='rest'?`在${place}安睡`:`正走向${place}`):'在庭院里陪伴'}</small></div><div className="cat-card-controls"><button className="text-button" onClick={()=>onToggle?.(cat.id,!cat.active||resting)} disabled={!cat.active&&visibleCount>=maxActive} aria-label={`让${cat.name}${action}`}>{cat.active&&!resting?<House size={15}/>:<Sun size={15}/>} {action}</button><div>{cat.active&&<button className="icon-button" aria-label={`将${cat.name}收回收藏`} title="收回收藏，保留外观并腾出庭院位置" onClick={()=>onArchive?.(cat.id)}><Archive size={16}/></button>}<button className="icon-button" aria-label={`编辑${cat.name}的外观和名字`} title="调整外观与名字" onClick={()=>onEdit?.(cat)}><SlidersHorizontal size={17}/></button><button className="icon-button" aria-label={`导出${cat.name}的设计`} title="导出设计" onClick={()=>download(cat)}><ArrowDownToLine size={17}/></button><button className="icon-button" aria-label={`移除${cat.name}`} title="移出收藏" onClick={()=>onRemove?.(cat.id)}><Trash2 size={16}/></button></div></div></article>})}</div>
    {visibleCount>=maxActive&&<p className="inline-note">庭院住满了，睡觉的猫咪也会留在画面中。使用「收回收藏」腾出位置，名字与毛色都会保留。</p>}
    {!cats.length&&<div className="empty-state"><p>阳光正好，等一位小邻居。</p><button className="primary-button" onClick={onAdd}>添加第一只猫咪</button></div>}
  </Panel>;
}
