import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,RotateCcw} from 'lucide-react';
import {Panel} from './Panel.jsx';
import {CAT_PRESETS,CAT_PRESET_MAP,MISSING_PRESETS,getPreset} from '../themes/cats/catalog.js';
import {validateAppearance} from '../themes/cats/appearance.js';
import {renderCustomizedCat} from '../themes/cats/morphology.js';
import {CAT_PERSONALITIES,PERSONALITY_LABELS,CUSTOMIZATION_LIMITS,EAR_SHAPE_OPTIONS,EYE_COLOR_OPTIONS,normalizeCustomization,normalizePersonality,validateCustomization} from '../themes/cats/customization.js';
import '../themes/cats/studio.css';

// The former paint draft is deliberately separate. Confirmed old paint remains
// on each cat, but old screen/brush state cannot reopen the retired paint UI.
const DRAFT_KEY='mofish-cats-customization-draft-v1';
function readDraft(cat){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY));if(!d||d.version!==1||d.kind!=='parameters'||d.catId!==(cat?.id||null)||!CAT_PRESET_MAP[d.presetId]?.image)return null;return {...d,appearance:validateAppearance(d.appearance),customization:validateCustomization(d.customization),personality:normalizePersonality(d.personality)}}catch{return null}}
export function CatPortrait({cat,preset:explicit,size=256,className='',label,onError}){
 const ref=useRef(null),preset=explicit||getPreset(cat?.presetId);
 useEffect(()=>{let live=true;if(!preset?.image)return;if(ref.current)ref.current.dataset.ready='false';renderCustomizedCat(preset,cat?.appearance,cat?.customization,{size}).then(sprite=>{if(!live||!ref.current)return;const canvas=ref.current;canvas.width=sprite.width;canvas.height=sprite.height;canvas.getContext('2d').drawImage(sprite,0,0);canvas.dataset.ready='true';onError?.('')}).catch(()=>{if(live)onError?.('猫咪图片暂时没有载入，请稍后重新打开。')});return()=>{live=false}},[preset,cat?.appearance,cat?.customization,size,onError]);
 return <canvas ref={ref} width={size} height={size} className={`cat-portrait ${className}`} role="img" aria-label={label||cat?.name||preset?.name||'猫咪外观'}/>;
}
function Parameter({name,label,value,onChange,left,right}){const limits=CUSTOMIZATION_LIMITS[name];return <label className="cat-parameter"><span><strong>{label}</strong><output>{Math.round(value*100)}%</output></span><input aria-label={`猫咪${label}`} type="range" min={limits.min} max={limits.max} step={limits.step} value={value} onChange={e=>onChange(Number(e.target.value))}/><small><span>{left}</span><span>{right}</span></small></label>}

export default function CatStudio({cat=null,onSave,onClose,notify=()=>{}}){
 const [step,setStep]=useState(cat?'adjust':'preset'),[presetId,setPresetId]=useState(cat?.presetId||'ragdoll');
 const [appearance,setAppearance]=useState(()=>validateAppearance(cat?.appearance)),[customization,setCustomization]=useState(()=>normalizeCustomization(cat?.customization));
 const [previewCustomization,setPreviewCustomization]=useState(()=>normalizeCustomization(cat?.customization));
 const [name,setName]=useState(cat?.name||'小团子'),[personality,setPersonality]=useState(()=>normalizePersonality(cat?.personality));
 const [draft,setDraft]=useState(()=>readDraft(cat)),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[loadError,setLoadError]=useState('');
 const closeRef=useRef(null),handleClose=useCallback(()=>closeRef.current?.(),[]),preset=getPreset(presetId),available=CAT_PRESETS.filter(p=>p.image&&p.available!==false),missing=MISSING_PRESETS;
 const design={presetId,name:name.trim(),personality,appearance,customization};
 useEffect(()=>{const timer=setTimeout(()=>setPreviewCustomization(customization),80);return()=>clearTimeout(timer)},[customization]);
 const draftData=()=>({version:1,kind:'parameters',catId:cat?.id||null,presetId,name,personality,appearance,customization});
 useEffect(()=>{if(!dirty)return;const timer=setTimeout(()=>{try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draftData()))}catch{notify('草稿空间不足，请先保存猫咪设计。')}},500);return()=>clearTimeout(timer)},[presetId,name,personality,appearance,customization,dirty,cat?.id]);
 function choosePreset(id){
  // Confirmed legacy strokes stay independent of these new parameters, even
  // when changing the appearance preset. There is no paint/reset action here.
  if(id!==presetId)setCustomization(normalizeCustomization());
  setPresetId(id);setDirty(true);setStep('adjust');setLoadError('');
 }
 function change(key,value){setCustomization(current=>normalizeCustomization({...current,[key]:value}));setDirty(true)}
 function restoreDraft(){if(!draft)return;setPresetId(draft.presetId);setName(draft.name||'小团子');setPersonality(draft.personality);setAppearance(draft.appearance);setCustomization(draft.customization);setStep('adjust');setDirty(true);setDraft(null);notify('已恢复上次未确认的外观调整。')}
 function reset(){setCustomization(normalizeCustomization());setDirty(true)}
 async function save(){if(saving||!name.trim()||!preset?.image||loadError)return;setSaving(true);try{const result=await onSave({...design,appearance:validateAppearance(appearance),customization:validateCustomization(customization)});if(result!==false&&result?.ok!==false){try{localStorage.removeItem(DRAFT_KEY)}catch{}setDirty(false)}}catch(error){notify(error.message||'没有保存成功，请再试一次。')}finally{setSaving(false)}}
 closeRef.current=()=>{if(dirty)try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draftData()))}catch{}onClose()};
 const previewWidth=(preset?.scale||.068)*(.88+.64*.18)*customization.size*100;
 return <Panel wide title={cat?'让它，更像你喜欢的样子':'添一只，属于你的猫咪'} subtitle="挑选体型、耳朵和眼睛，再认识它的小性格。" onClose={handleClose}>
  <div className="cat-studio-steps" aria-label="添加猫咪步骤"><button className={step==='preset'?'selected':''} onClick={()=>setStep('preset')}>1 · 选猫咪</button><button className={step==='adjust'?'selected':''} onClick={()=>setStep('adjust')}>2 · 调整外观</button><button className={step==='preview'?'selected':''} onClick={()=>setStep('preview')}>3 · 看看它</button></div>
  {draft&&<div className="cat-draft-note"><span>有一份未确认的外观调整</span><button className="text-button" onClick={restoreDraft}>恢复草稿</button><button className="icon-button" aria-label="忽略外观草稿" onClick={()=>{setDraft(null);try{localStorage.removeItem(DRAFT_KEY)}catch{}}}>×</button></div>}
  {step==='preset'?<>
   <div className="cat-preset-grid">{available.map(p=><button className={`cat-preset ${p.id===presetId?'selected':''}`} key={p.id} onClick={()=>choosePreset(p.id)}><img src={p.thumbnail||p.image} alt="" loading="lazy"/><strong>{p.name}</strong><small>{p.fur==='long'?'长毛':p.fur==='short'?'短毛':p.breedName||''}</small></button>)}</div>
   {!!missing.length&&<p className="inline-note cat-missing">待补形象：{missing.map(p=>p.name).join('、')}。已有猫咪可以正常调整外观和入住。</p>}
  </>:step==='adjust'?<>
   <div className="cat-adjustment-heading"><strong>{preset?.name}</strong><button className="text-button" onClick={reset} aria-label="恢复猫咪默认外观参数"><RotateCcw size={14}/> 恢复默认</button></div>
   <div className="cat-customize-layout">
    <div className="cat-customize-preview"><div className="cat-customize-image" style={{transform:`scale(${customization.size*.74})`}}><CatPortrait cat={{...design,customization:previewCustomization}} size={512} label="猫咪外观预览" onError={setLoadError}/></div><span>体型与五官，慢慢调成喜欢的样子</span>{loadError&&<p className="cat-image-error">{loadError}</p>}</div>
    <div className="cat-parameter-list"><Parameter name="size" label="体型大小" value={customization.size} onChange={value=>change('size',value)} left="小巧" right="大只"/><Parameter name="build" label="胖瘦" value={customization.build} onChange={value=>change('build',value)} left="纤细" right="圆润"/><Parameter name="earSize" label="耳朵大小" value={customization.earSize} onChange={value=>change('earSize',value)} left="小耳朵" right="大耳朵"/>
     <fieldset className="cat-ear-options"><legend>耳朵形态</legend><div>{EAR_SHAPE_OPTIONS.map(option=><button key={option.id} className={customization.earShape===option.id?'selected':''} aria-pressed={customization.earShape===option.id} onClick={()=>change('earShape',option.id)}>{option.label}</button>)}</div></fieldset>
    </div>
   </div>
   <fieldset className="cat-eye-options"><legend>眼睛颜色</legend><div>{EYE_COLOR_OPTIONS.map(option=><button key={option.id} aria-label={`眼睛颜色 · ${option.label}`} aria-pressed={customization.eyeColor===option.id} className={customization.eyeColor===option.id?'selected':''} onClick={()=>change('eyeColor',option.id)}><i className={option.id==='original'?'original-eye':''} style={option.id==='original'?undefined:{background:option.id}}/><span>{option.label}</span></button>)}<label className="cat-custom-eye"><input type="color" aria-label="自选猫咪眼睛颜色" value={customization.eyeColor==='original'?'#65a5c8':customization.eyeColor} onChange={e=>change('eyeColor',e.target.value)}/><span>自选颜色</span></label></div></fieldset>
   {appearance.strokes.length>0&&<p className="cat-legacy-appearance">它原来画好的毛色，会继续陪着它。</p>}
   <div className="cat-name-fields"><label>给它一个名字<input aria-label="猫咪名字" maxLength={16} value={name} onChange={e=>{setName(e.target.value);setDirty(true)}}/></label><label>小性格<select aria-label="猫咪性格" value={personality} onChange={e=>{setPersonality(e.target.value);setDirty(true)}}>{CAT_PERSONALITIES.map(p=><option key={p.id} value={p.id}>{p.label} · {p.description}</option>)}</select></label></div>
   <footer className="cat-studio-footer"><button className="text-button" onClick={()=>setStep('preset')}><ArrowLeft size={16}/> 换一只猫咪</button><button className="primary-button" disabled={!name.trim()||!!loadError} onClick={()=>setStep('preview')}>在庭院里看看 <ArrowRight size={17}/></button></footer>
  </>:<>
   <div className="cat-size-preview"><img src="assets/cats/courtyard-1920.webp" alt="庭院实际大小预览"/><div className="cat-preview-position" style={{width:`${previewWidth}%`,transform:`translate(-${(preset.anchor?.x??.5)*100}%,-${(preset.anchor?.y??.93)*100}%)`}}><CatPortrait cat={design} size={512} onError={setLoadError}/></div></div>
   <div className="cat-preview-description"><h3>{name.trim()||'小团子'}</h3><p>{preset?.name} · {PERSONALITY_LABELS[personality]} · 体型 {Math.round(customization.size*100)}%<br/>以庭院中的实际陪伴比例预览，留下足够的活动空间。</p>{loadError&&<p>{loadError}</p>}</div>
   <footer className="cat-studio-footer"><button className="text-button" onClick={()=>setStep('adjust')}><ArrowLeft size={16}/> 继续调整</button><button className="primary-button" disabled={!name.trim()||saving||!!loadError} onClick={save}>{saving?'正在保存…':cat?'保存修改':'加入庭院'} <Check size={17}/></button></footer>
  </>}
 </Panel>;
}
