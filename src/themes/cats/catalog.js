/** Audited individual standing portraits. These are appearance presets, not certified pedigrees.
 * All painting coordinates refer to the final square texture, never editor/screen pixels.
 * Every portrait has a unique asset; unavailable breeds are listed separately below.
 */
export const MAX_ACTIVE_CATS = 12
export const CAT_ASSET_VERSION = 1
export const CAT_BACKGROUNDS = Object.freeze({
  base: {width:7680,height:4320,season:'summer',time:'day'},
  variants: [
    {width:1920,height:1080,image:'assets/cats/courtyard-1920.webp'},
    {width:3840,height:2160,image:'assets/cats/courtyard-3840.webp'},
    {width:6144,height:3456,image:'assets/cats/courtyard-6144.webp'},
  ],
  // Generated seasonal paintings have a genuine 1672×941 source. The renderer
  // retains the native high-resolution paving/facilities underneath the foliage.
  seasons: {
    spring:'assets/cats/art-v2/courtyard-spring.webp',
    summer:'assets/cats/courtyard-3840.webp',
    autumn:'assets/cats/art-v2/courtyard-autumn.webp',
    winter:'assets/cats/art-v2/courtyard-winter.webp',
  },
  night:'assets/cats/art-v2/courtyard-night.webp',
  generatedPlateSize:{width:1672,height:941},
})

export const MISSING_PRESETS = Object.freeze([])

// Source-image alpha bounds. The offline preparation script trims only transparent space,
// centers the content in a square with 8px safety padding, and records the same mapping.
const alphaBoxes = [
  [25,19,1240,1254],[49,33,1240,1220],[61,9,1253,1226],[29,23,1236,1228],
  [0,23,1254,1230],[17,9,1240,1224],[0,17,1254,1254],[0,17,1253,1235],
  [57,47,1224,1209],[49,17,1254,1236],[0,31,1254,1226],[61,31,1236,1225],
]
const descriptions = [
  {id:'ragdoll',name:'布偶',breed:'ragdoll',coat:'海豹双色',fur:'long',body:'large-soft',face:'soft-wedge',ears:'medium-rounded',tail:'long-plumed',scale:.072,speed:.029,eyes:[[.240,.575],[.327,.617]],nose:[.259,.654]},
  {id:'british-shorthair',name:'英国短毛猫',breed:'british-shorthair',coat:'蓝灰纯色',fur:'short',body:'cobby',face:'round-cheeked',ears:'small-rounded',tail:'thick-rounded',scale:.067,speed:.026,eyes:[[.247,.592],[.345,.630]],nose:[.275,.661]},
  {id:'chinchilla',name:'金吉拉',breed:'chinchilla',coat:'银白渐层',fur:'long',body:'compact-fluffy',face:'round-short',ears:'small-furred',tail:'plumed',scale:.068,speed:.026,eyes:[[.250,.595],[.335,.635]],nose:[.275,.661]},
  {id:'american-shorthair',name:'美国短毛猫',breed:'american-shorthair',coat:'银虎斑',fur:'short',body:'muscular-medium',face:'broad-round',ears:'medium-rounded',tail:'ringed-tapering',scale:.066,speed:.033,eyes:[[.220,.565],[.320,.617]],nose:[.244,.649]},
  {id:'siamese',name:'暹罗',breed:'siamese',coat:'海豹重点色',fur:'short',body:'slender',face:'wedge',ears:'large-pointed',tail:'long-tapering',scale:.064,speed:.037,eyes:[[.224,.585],[.315,.630]],nose:[.244,.667]},
  {id:'domestic-orange-white',name:'田园 · 橘白',breed:'domestic',coat:'橘白',fur:'short',body:'medium',face:'soft-round',ears:'medium-pointed',tail:'ringed-tapering',scale:.065,speed:.033,eyes:[[.270,.620],[.360,.660]],nose:[.294,.692]},
  {id:'maine-coon',name:'缅因',breed:'maine-coon',coat:'棕虎斑',fur:'long',body:'large-muscular',face:'broad-square-muzzle',ears:'large-tufted',tail:'long-plumed',scale:.076,speed:.028,eyes:[[.260,.575],[.340,.620]],nose:[.283,.655]},
  {id:'domestic-tabby',name:'田园 · 狸花',breed:'domestic',coat:'棕狸花',fur:'short',body:'athletic-medium',face:'soft-wedge',ears:'medium-pointed',tail:'ringed-tapering',scale:.065,speed:.036,eyes:[[.260,.620],[.350,.660]],nose:[.289,.694]},
  {id:'russian-blue',name:'俄罗斯蓝猫',breed:'russian-blue',coat:'银蓝纯色',fur:'short',body:'slender',face:'angular-wedge',ears:'large-pointed',tail:'long-tapering',scale:.063,speed:.034,eyes:[[.275,.610],[.357,.655]],nose:[.283,.695]},
  {id:'norwegian-forest',name:'挪威森林猫',breed:'norwegian-forest',coat:'棕虎斑加白',fur:'long',body:'large-long',face:'triangular',ears:'medium-tufted',tail:'long-plumed',scale:.074,speed:.030,eyes:[[.247,.550],[.332,.590]],nose:[.270,.626]},
  {id:'domestic-tuxedo',name:'田园 · 黑白奶牛',breed:'domestic',coat:'黑白奶牛',fur:'short',body:'medium',face:'soft-round',ears:'medium-pointed',tail:'long-tapering',scale:.066,speed:.031,eyes:[[.245,.610],[.325,.650]],nose:[.268,.690]},
  {id:'domestic-calico',name:'田园 · 三花',breed:'domestic',coat:'黑橘白三花',fur:'short',body:'medium',face:'soft-round',ears:'medium-pointed',tail:'long-tapering',scale:.066,speed:.032,eyes:[[.217,.565],[.323,.620]],nose:[.244,.655]},
]

function normalizedPortrait(source, index) {
  const [left,top,right,bottom] = alphaBoxes[index]
  const side = Math.max(right-left,bottom-top)+16
  const dx = Math.floor((side-(right-left))/2)-left
  const dy = Math.floor((side-(bottom-top))/2)-top
  const point = (x,y) => ({x:(x*1254+dx)/side,y:(y*1254+dy)/side})
  const rect = ([x,y,w,h]) => {
    const p=point(x,y)
    const x0=Math.max(0,p.x),y0=Math.max(0,p.y)
    return [x0,y0,Math.min(1,p.x+w*1254/side)-x0,Math.min(1,p.y+h*1254/side)-y0]
  }
  const ellipse = (p,rx,ry) => ({...point(...p),rx:rx*1254/side,ry:ry*1254/side})
  const image = `assets/cats/${source.id}.webp`
  const {eyes,nose,...preset} = source
  return Object.freeze({
    ...preset,
    assetVersion:CAT_ASSET_VERSION,
    breedName:source.breed==='domestic'?'中华田园猫':source.name,
    image,thumbnail:`assets/cats/${source.id}-thumb.webp`,
    width:768,height:768,sourceSize:[1254,1254],pose:'standing',facing:'left',
    // Cropping is stable for the original image, thumbnails and painted textures.
    sourceTransform:{side,dx,dy},
    regions:{
      head:rect([.115,.395,.385,.380]),
      body:rect([.385,.275,.435,.465]),
      tail:rect([.690,.015,.305,.365]),
      legs:rect([.240,.735,.555,.245]),
    },
    protectedAreas:[...eyes.map(p=>ellipse(p,.032,.035)),ellipse(nose,.043,.032)],
    symmetryAxis:[point(.275,.645),point(.745,.350)],
    anchor:point(.45,.935),
    actions:{idle:image,atlas:`assets/cats/actions-v2/${source.id}.webp`},
    // Hooks explicitly empty until real direction/action frames are supplied.
    missingActions:[],
    artStatus:'directional-action-atlas',
  })
}
// Newly painted breeds keep their own canonical square and portrait identity.
// The 16px safety border is identical in texture, thumbnail and paint mapping.
const generatedDescriptions = [
  {id:'persian',name:'波斯猫',breed:'persian',coat:'象牙白',fur:'long',body:'compact-cobby',face:'flat-round',ears:'small-furred',tail:'short-plumed',scale:.068,speed:.025,eyes:[[.239,.557],[.337,.594]],nose:[.279,.617],head:[.09,.385,.43,.43]},
  {id:'exotic-shorthair',name:'异国短毛猫',breed:'exotic-shorthair',coat:'奶油浅虎斑',fur:'short',body:'compact-cobby',face:'flat-round',ears:'small-rounded',tail:'short-rounded',scale:.066,speed:.026,eyes:[[.241,.565],[.359,.614]],nose:[.292,.632],head:[.095,.38,.45,.415]},
  {id:'bengal',name:'孟加拉猫',breed:'bengal',coat:'金棕玫瑰斑',fur:'short',body:'athletic-long',face:'rounded-wedge',ears:'small-rounded',tail:'long-ringed',scale:.068,speed:.036,eyes:[[.222,.563],[.315,.616]],nose:[.238,.654],head:[.10,.37,.405,.425]},
  {id:'abyssinian',name:'阿比西尼亚猫',breed:'abyssinian',coat:'红棕细斑',fur:'short',body:'slender-long',face:'wedge',ears:'large-pointed',tail:'long-tapering',scale:.064,speed:.037,eyes:[[.247,.570],[.359,.615]],nose:[.270,.656],head:[.125,.335,.435,.440]},
]
function generatedPortrait(source){
  const {eyes,nose,head,...preset}=source
  const point=(x,y)=>({x:(x*1254+16)/1286,y:(y*1254+16)/1286})
  const rect=([x,y,w,h])=>{const p=point(x,y);return[p.x,p.y,w*1254/1286,h*1254/1286]}
  const ellipse=(p,rx,ry)=>({...point(...p),rx:rx*1254/1286,ry:ry*1254/1286})
  const image=`assets/cats/art-v2/${source.id}.webp`
  return Object.freeze({
    ...preset,assetVersion:2,breedName:source.name,
    image,thumbnail:`assets/cats/art-v2/${source.id}-thumb.webp`,
    width:768,height:768,sourceSize:[1254,1254],pose:'standing',facing:'left',
    sourceTransform:{side:1286,dx:16,dy:16},
    regions:{head:rect(head),body:rect([.36,.27,.49,.49]),tail:rect([.65,.005,.345,.36]),legs:rect([.25,.70,.65,.29])},
    protectedAreas:[...eyes.map(p=>ellipse(p,.035,.041)),ellipse(nose,.044,.048)],
    symmetryAxis:[point(.285,.65),point(.715,.41)],anchor:point(.415,.939),
    actions:{idle:image,atlas:`assets/cats/actions-v2/${source.id}.webp`},missingActions:[],
    artStatus:'directional-action-atlas',provenance:'built-in image_gen; model ID not exposed',
  })
}
export const CAT_PRESETS = Object.freeze([...descriptions.map(normalizedPortrait),...generatedDescriptions.map(generatedPortrait)])
export const CAT_PRESET_MAP = Object.freeze(Object.fromEntries(CAT_PRESETS.map(p=>[p.id,p])))
export function getPreset(id) { return CAT_PRESET_MAP[id] || CAT_PRESET_MAP.ragdoll }
