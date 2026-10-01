// 猫咪庭院通行压力测试：随机种子下多只猫往返草垫/暖石/石阶/水碗/爬架，统计“有路要走却原地不动”的最长秒数。
// 用法：node scripts/cat-traffic-stress.mjs [猫数=8] [种子组数=6] [每组分钟=3] [起始种子=1]
import {CatGame} from '../src/themes/cats/game.js';
import {distance} from '../src/themes/cats/geometry.js';
const presets=['ragdoll','british-shorthair','domestic-orange-white','siamese','domestic-tuxedo','maine-coon','persian','bengal','abyssinian','chinchilla','russian-blue','domestic-calico'];
const pers=['friendly','relaxed','active','playful','curious','shy','independent','sleepy'];
let worst=0,stuckRuns=0;
const N=+process.argv[2]||5,SEEDS=+process.argv[3]||12,MIN=+process.argv[4]||3,BASE=+process.argv[5]||1;
for(let seedBase=BASE;seedBase<BASE+SEEDS;seedBase++){
 let seed=seedBase*7919;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const save={version:1,cats:presets.slice(0,N).map((p,i)=>({id:'c'+i,presetId:p,name:'n'+i,personality:pers[i%8],x:.35+(i%4)*.12,y:.4+Math.floor(i/4)*.15,active:true,appearance:{version:1,strokes:[]}})),props:[],environment:{},nextId:50};
 const g=new CatGame(save,{random});const still=new Map();let runWorst=0;
 for(let t=0;t<MIN*60*30;t++){
  if(t%(20*30)===0){const c=g.cats[Math.floor(random()*g.cats.length)],f=["bed","rock","step","water","climbing","sun"][Math.floor(random()*6)];g.visitFacility(f,c.id);}
  g.update(1/30,{night:t>MIN*60*15});
  if(t%15)continue;
  for(const c of g.cats){if(!c.active)continue;const k=still.get(c.id);const busy=c.path.length>0&&!c.traverse;
   if(busy&&k&&distance(k.p,c)<.004){k.n+=.5;if(k.n>runWorst)runWorst=k.n;}
   else still.set(c.id,{p:{x:c.x,y:c.y},n:0});}
 }
 worst=Math.max(worst,runWorst);if(runWorst>=12)stuckRuns++;
}
console.log(`猫 ${N} 只 · 种子 ${SEEDS} 组（自 ${BASE}）· 最长原地等待 ${worst} 秒 · 等待≥12秒的组数 ${stuckRuns}`);
