import {useState} from 'react';
import {Check,Fish,Waves,Shell,ArrowUpRight,ArrowDownRight,RotateCcw} from 'lucide-react';
import {Panel,Toggle} from './Panel.jsx';
import {THEMES} from '../themes/registry.js';
import {SPECIES,SPECIES_BY_ID} from '../themes/coast/catalog.js';

export const PHASE_NAMES={rising:'涨潮中',high:'高潮停留',falling:'退潮中',low:'低潮停留'};
export function tideTime(seconds=0){const t=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`}
export function tideCountdownLabel(tide){return tide?.manual?(tide.phase==='rising'?'距高潮':'距低潮'):'距下一阶段'}
export function TideIcon({size=25}){
  return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon="tide"><path d="M8 12a6 6 0 0 1 12 0M14 2v2M5 6l2 2M23 6l-2 2M3 13h22M3 18c3-3 5 3 8 0s5 3 8 0 4 1 6 0M3 23c3-3 5 3 8 0s5 3 8 0 4 1 6 0"/></svg>;
}
export function TongsIcon(){
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 3-4 4 2 7 8 6 6 9M22 3l4 4-2 7-8 6-6 9M6 7l5 2M26 7l-5 2"/><circle cx="16" cy="20" r="2.4"/><path d="m9 25-2 4M23 25l2 4"/></svg>;
}
export function ThemePanel({theme,onSelect,onClose}){
  return <Panel title="换一处风景，慢慢摸鱼" subtitle="同一张桌面，也可以住进不同的小世界。" onClose={onClose}><div className="season-grid theme-grid">{THEMES.map(t=><button key={t.id} className={`season-card theme-card ${theme===t.id?'selected':''}`} onClick={()=>onSelect(t.id)} aria-pressed={theme===t.id}><img src={`${import.meta.env.BASE_URL}${t.image}`} alt=""/><span className="season-symbol">{t.id==='koi'?<Fish/>:<Waves/>}{theme===t.id&&<Check size={18}/>}</span><strong>{t.name}</strong><small>{t.description}</small></button>)}</div><p className="inline-note">锦鲤、赶海小桶与图鉴分别保存。切换风景，收藏也会等你回来。</p></Panel>;
}
function AnimalImage({species}){
  return <img className="coast-animal-image" src={species.asset} alt={species.name} loading="lazy"/>;
}
export function BucketPanel({view,onRelease,onClose}){
  const bucket=view?.bucket||[];
  const groups=[...new Set(bucket.map(e=>e.species))];
  return <Panel wide title="小桶里的海边相遇" subtitle={`${bucket.length} / 12 只 · 放生后，发现与捕捉记录都会保留。`} onClose={onClose}>
    {bucket.length>0?<><div className="bucket-actions"><button className="text-button" onClick={()=>onRelease('all')}><Waves size={17}/>全部放生</button><span>让它们回到合适的水域与岸边</span></div>{groups.map(id=>{const s=SPECIES_BY_ID[id],items=bucket.filter(e=>e.species===id);return <section className="bucket-group" key={id}><header><span>{s.name} · {items.length} 只</span><button className="text-button" onClick={()=>onRelease(`species:${id}`)}>同种放生<ArrowUpRight size={15}/></button></header>{items.map(e=><div className="fish-row bucket-row" key={e.id}><AnimalImage species={s}/><div className="bucket-animal-details"><strong>{s.name}</strong><small className="bucket-description">{s.bucketDescription}</small></div><button className="text-button" aria-label={`放生${s.name} ${e.id}`} onClick={()=>onRelease(e.id)}>放生<ArrowUpRight size={15}/></button></div>)}</section>})}</>:<div className="coast-empty"><Shell size={38}/><h3>先去潮线边走走</h3><p>切换到「捕捉」，拾贝壳、抓小动物。<br/>游动小鱼先躲闪两次，第三次可捕到；搁浅鱼虾一次即可。<br/>贝壳计入收藏，不占小桶的位置。</p></div>}
  </Panel>;
}
export function GuidePanel({view,onClose}){
  const records=view?.catalog||{},count=Object.keys(records).length;
  return <Panel wide title="把海边的相遇，慢慢收藏" subtitle={`发现 ${count} / ${SPECIES.length} 种 · 贝壳 ${view?.shells||0} 枚 · 救助 ${view?.rescues||0} 次`} onClose={onClose}><div className="coast-guide">{SPECIES.map(s=>{
    const r=records[s.id];return <article key={s.id} className={`guide-card ${r?'discovered':'undiscovered'}`}><AnimalImage species={s}/><h3>{r?s.name:'等待相遇'}</h3>{r?<><p>{s.description}</p><small>初见 · {new Date(r.firstDiscovered).toLocaleDateString('zh-CN')}</small><div className="guide-counts"><span>{s.kind==='shell'?`拾取 ${r.collected||0}`:`捕捉 ${r.caught||0}`}</span>{s.rescuable&&<span>救助 {r.rescued||0}</span>}</div></>:<p>{s.kind==='pool'?'去保水的潮池看一看':s.kind==='shell'?'退潮后，留意湿沙上的小小光泽':s.aquatic?'在清澈的海水里等你':'沿着潮线，轻轻走近'}</p>}</article>;
  })}</div></Panel>;
}
function TideDebug({tide,onDebug}){
  const [habitat,setHabitat]=useState(false);
  return <details className="tide-debug"><summary>开发调试 · 仅开发环境可见</summary><div className="weather-choices tide-jumps">{Object.entries(PHASE_NAMES).map(([key,name])=><button key={key} onClick={()=>onDebug('phase',key)}>{name}</button>)}</div><label className="range-row"><span>手动潮位 <b>{Math.round((tide?.level||0)*100)}%</b></span><input aria-label="手动潮位" type="range" min="0" max="1" step=".01" value={tide?.level||0} onChange={e=>onDebug('level',Number(e.target.value))}/></label><Toggle label="暂停潮汐" checked={!!tide?.paused} onChange={v=>onDebug('pause',v)}/><Toggle label="60 倍时间加速" description="30 秒走完一个完整周期" checked={tide?.speed===60} onChange={v=>onDebug('speed',v?60:1)}/><Toggle label="显示水域、生境和阻挡区域" checked={habitat} onChange={v=>{setHabitat(v);onDebug('habitat',v)}}/><button className="text-button" onClick={()=>{setHabitat(false);onDebug('habitat',false);onDebug('reset')}}><RotateCcw size={15}/>回到真实经过时间</button></details>;
}
export function TidePanel({view,onDirection,onDebug,onClose}){
  const tide=view?.tide;
  return <Panel title="潮来潮往，不必赶时间" subtitle="自动潮汐每 30 分钟一轮；手动调节立即生效。" onClose={onClose}><div className="tide-panel-status"><TideIcon size={30}/><strong>{PHASE_NAMES[tide?.phase]||'涨潮中'}</strong><span>{tideCountdownLabel(tide)} {tideTime(tide?.remainingSeconds)}</span></div><meter min="0" max="1" value={tide?.level||0} aria-label="当前潮位"/><div className="tide-direction-controls" aria-label="潮汐方向"><button onClick={()=>onDirection('rising')} aria-pressed={tide?.phase==='rising'}><ArrowUpRight size={21}/><span>开始涨潮</span></button><button onClick={()=>onDirection('falling')} aria-pressed={tide?.phase==='falling'}><ArrowDownRight size={21}/><span>开始退潮</span></button></div><p className="inline-note tide-direction-note">点击后海水立即变化，完整涨退过程约 30 秒；可随时反向，到位后继续自动潮汐。</p><div className="tide-schedule">{[['涨潮','10 分钟'],['高潮','5 分钟'],['退潮','10 分钟'],['低潮','5 分钟']].map(([name,time])=><div key={name}><strong>{name}</strong><small>{time}</small></div>)}</div><p className="inline-note">观察时长按左键在沙滩划动，可以画下心情；海浪冲过，笔迹会慢慢消失。沙痕轻点 2–3 次露出小动物，石缝小鱼轻点 1 次游出。</p><p className="inline-note">拾贝和抓鱼都要切换「捕捉」；水中小鱼会躲闪，搁浅鱼虾可直接捡起。观察时轻点搁浅鱼虾，就能送它们回水里。下一次涨潮也会接它们回家。切换主题或关闭窗口后，潮汐仍会随经过的时间继续。</p>{import.meta.env.DEV&&<TideDebug tide={tide} onDebug={onDebug}/>}</Panel>;
}
