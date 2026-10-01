export const MAX_ITEMS=24;
export const STORE_KEY='mofish-caiyuan-v1';
export const ASSET_ROOT='assets/caiyuan/';
export const ITEMS=Object.freeze({
 bowl:{name:'聚宝盆',file:'motion/treasure_bowl.webp',width:.066,ratio:965/688,foot:.978,min:.7,max:1.4,base:.78},
 burner:{name:'香炉',file:'incense_burner.webp',width:.156,ratio:1545/780,foot:.975,min:.7,max:1.4,base:.66},
 lamp:{name:'莲灯',file:'lotus_lamp.webp',width:.08,ratio:1259/1158,foot:.978,min:.65,max:1.4,base:.48,wick:{x:.498,y:.337}},
 fruit:{name:'水果盘',file:'fruit_offering.webp',width:.137,ratio:1454/933,foot:.973,min:.65,max:1.4,base:.70},
 pastry:{name:'糕点盘',file:'pastry_offering.webp',width:.123,ratio:1496/778,foot:.965,min:.65,max:1.4,base:.72},
 teapot:{name:'青花茶壶',file:'teapot.webp',width:.072,ratio:1284/1032,foot:.963,min:.65,max:1.4,base:.56},
 cup:{name:'茶杯',file:'teacup.webp',width:.033,ratio:1025/856,foot:.96,min:.7,max:1.45,base:.68},
 plaque:{name:'祈愿牌',file:'wish_plaque.webp',width:.048,ratio:714/1430,foot:.981,min:.7,max:1.35,base:.75},
});
export function defaultItems(){return [
 ['burner',.5,.868],['lamp',.335,.843],['lamp',.665,.843],['fruit',.177,.864],['pastry',.79,.866],['teapot',.909,.829],['cup',.891,.875],['cup',.941,.869],['plaque',.082,.833]
].map(([kind,x,y],i)=>({id:'cy-'+(i+1),kind,x,y,scale:1,stored:false,lit:kind==='lamp',incense:kind==='burner'?{status:'unlit',startedAt:0,duration:600000}:undefined,tea:0,...(kind==='plaque'?{wishId:null}:{})}));}
