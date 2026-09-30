/** Stable, local-only cat design parameters. Legacy painted appearance stays separate. */
export const DEFAULT_CAT_CUSTOMIZATION=Object.freeze({version:1,size:1,build:1,earSize:1,earShape:'natural',eyeColor:'original'});
export const CUSTOMIZATION_LIMITS=Object.freeze({size:Object.freeze({min:.70,max:1.35,step:.01}),build:Object.freeze({min:.80,max:1.25,step:.01}),earSize:Object.freeze({min:.75,max:1.30,step:.01})});
export const EAR_SHAPE_OPTIONS=Object.freeze([{id:'natural',label:'原本的耳朵'},{id:'rounded',label:'圆润一点'},{id:'pointed',label:'尖俏一点'}]);
export const EYE_COLOR_OPTIONS=Object.freeze([{id:'original',label:'原本眼色'},{id:'#65a5c8',label:'晴空蓝'},{id:'#799b70',label:'橄榄绿'},{id:'#c99345',label:'琥珀金'},{id:'#8c694f',label:'榛果棕'},{id:'#acaed0',label:'浅紫灰'}]);
export const CAT_PERSONALITIES=Object.freeze([
 {id:'friendly',label:'亲人',description:'喜欢被轻抚，也乐意陪着你'},
 {id:'active',label:'活泼',description:'常常走走，留意庭院里的动静'},
 {id:'relaxed',label:'悠闲',description:'慢慢散步，喜欢晒太阳'},
 {id:'curious',label:'好奇',description:'遇见新道具，总想凑近看看'},
 {id:'shy',label:'慢热',description:'更爱安静的角落，也会温柔回应'},
 {id:'independent',label:'独立',description:'自在探索，享受自己的小天地'},
 {id:'playful',label:'贪玩',description:'毛线球和小玩具都很合心意'},
 {id:'sleepy',label:'爱睡',description:'总能找到舒服的位置打个盹'},
]);
export const PERSONALITY_IDS=Object.freeze(CAT_PERSONALITIES.map(p=>p.id));
export const PERSONALITY_LABELS=Object.freeze(Object.fromEntries(CAT_PERSONALITIES.map(p=>[p.id,p.label])));
export const normalizePersonality=value=>PERSONALITY_IDS.includes(value)?value:'friendly';
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const validColor=value=>value==='original'||typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function normalizeCustomization(value){
 if(!record(value)||value.version!==undefined&&value.version!==1)return {...DEFAULT_CAT_CUSTOMIZATION};
 const result={...DEFAULT_CAT_CUSTOMIZATION};
 for(const [key,{min,max}] of Object.entries(CUSTOMIZATION_LIMITS))if(Number.isFinite(value[key]))result[key]=Math.min(max,Math.max(min,value[key]));
 if(EAR_SHAPE_OPTIONS.some(shape=>shape.id===value.earShape))result.earShape=value.earShape;
 if(validColor(value.eyeColor))result.eyeColor=value.eyeColor.toLowerCase();
 return result;
}
export function validateCustomization(value){
 if(value==null)return {...DEFAULT_CAT_CUSTOMIZATION};
 if(!record(value)||value.version!==1)throw new Error('猫咪外观参数版本不受支持。');
 for(const [key,{min,max}] of Object.entries(CUSTOMIZATION_LIMITS))if(value[key]!==undefined&&(!Number.isFinite(value[key])||value[key]<min||value[key]>max))throw new Error('猫咪外观参数超出范围。');
 if(value.earShape!==undefined&&!EAR_SHAPE_OPTIONS.some(shape=>shape.id===value.earShape))throw new Error('猫咪耳朵形态不受支持。');
 if(value.eyeColor!==undefined&&!validColor(value.eyeColor))throw new Error('猫咪眼睛颜色不正确。');
 return normalizeCustomization(value);
}
