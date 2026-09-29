// Original illustrations are preserved. Four side-view fish use separate
// dorsal corrections so turning in the overhead sea never exposes a belly.
// Source rectangles exclude faint near-transparent export dust (alpha <= 24).
const rows = [
  ['crab','小红蟹','crab',[53,82,1374,854],47,'shore','挥一挥小钳子，再横着溜走。'],
  ['sandcrab','沙蟹','crab',[81,145,1381,756],43,'shore','沙色的背甲，让它几乎藏进沙滩里。'],
  ['hermit','寄居蟹','crab',[143,67,1119,1002],45,'shore','背着自己的小房子，在潮线边慢慢走。'],
  ['shrimp','小海虾','shrimp',[48,63,1382,935],34,'water','触须轻轻摆动，受惊时会灵巧地退开。'],
  ['fish_silver','银色小鱼','fish',[46,183,1761,494],41,'water','银光一闪，是浅海里最轻快的小身影。'],
  ['fish_clown','小丑鱼','fish',[297,166,921,758],43,'water','橙白相间的小鱼，喜欢在礁石旁探索。'],
  ['fish_turquoise','青绿小鱼','fish',[81,131,1609,635],42,'water','鳞片像海水一样透着温柔的青绿。'],
  ['fish_yellow','黄尾小鱼','fish',[12,172,1514,674],43,'water','一抹亮黄的尾巴，划过清澈的水面。'],
  ['fish_band','条纹小鱼','fish',[306,233,954,653],42,'water','黑黄条纹随着转身，在水里忽明忽暗。'],
  ['fish_puffer','小河豚','fish',[280,196,980,749],41,'water','圆圆的小肚子，慢悠悠地巡视浅滩。'],
  ['fish_blue','蓝鳞小鱼','fish',[30,175,1586,634],44,'water','蓝色鳞片和黄色尾巴，像一小片晴天。'],
  ['octopus','小章鱼','pool',[62,75,1374,940],46,'pool','藏在潮池里的小住客，偶尔舒展腕足。'],
  ['starfish','海星','pool',[43,49,1261,1084],37,'pool','五条小腕足安静地贴着潮池底。'],
  ['shell','扇贝壳','shell',[73,79,1194,1036],29,'beach','退潮后露出的贝壳，纹路像一把小扇子。'],
  ['conch','海螺壳','shell',[155,103,1076,993],31,'beach','捡起一枚螺壳，把这一刻的海声留住。'],
  ['crab_rock','花背蟹','crab',[20,103,1498,817],46,'shore','披着斑点背甲，爱沿着湿沙和礁石踱步。'],
  ['crab_pale','浅沙蟹','crab',[52,81,1377,857],41,'shore','浅浅的沙色，是它躲猫猫的小秘密。'],
];

// Playful bucket captions are separate from the field guide's habitat notes.
const bucketDescriptions = Object.freeze({
  crab:'横着走，也能走出自己的路。',
  sandcrab:'沙滩捉迷藏大赛常驻选手。',
  hermit:'房子随身带，搬家不用愁。',
  shrimp:'看起来很美味。',
  fish_silver:'银光一闪，差点以为捡到钱。',
  fish_clown:'名字叫小丑，颜值可不随便。',
  fish_turquoise:'穿着海水同款，主打一个隐身。',
  fish_yellow:'尾巴自带高亮，躲猫猫有点难。',
  fish_band:'条纹衫不换季，海底也讲穿搭。',
  fish_puffer:'吃下去可能会没命。',
  fish_blue:'把蓝天穿身上，晴天随身携带。',
  octopus:'八只手，也不想多加一份班。',
  starfish:'五角俱全，就是不想当主角。',
  shell:'自带小扇子，可惜不会自己扇。',
  conch:'房子空着，海声一直住在里面。',
  crab_rock:'花衬衫一穿，谁还不是岛主。',
  crab_pale:'差点和沙滩融为一体的摸鱼高手。',
});

// Head and tail anchors measured on each transparent source crop. Normalizing
// these once preserves each drawing's proportions while movement uses radians.
const headAxes={
  fish_silver:[1,.5,0,.5],fish_clown:[.15,.12,.86,.84],
  fish_turquoise:[1,.5,0,.5],fish_yellow:[1,.5,0,.5],
  fish_band:[.10,.14,.87,.79],fish_puffer:[.18,.13,.89,.81],
  fish_blue:[1,.5,0,.5],shrimp:[.42,.17,.89,.84],
  crab:[.5,.75,.5,.28],sandcrab:[.5,.77,.5,.25],
  crab_rock:[.5,.77,.5,.25],crab_pale:[.5,.76,.5,.26],
  hermit:[.66,.77,.38,.30],
};

const dorsalAssets = new Set(['fish_silver','fish_turquoise','fish_yellow','fish_blue']);

export const SPECIES = Object.freeze(rows.map(([id,name,kind,rect,size,habitat,description]) => Object.freeze({
  id,name,kind,rect,size,habitat,description,bucketDescription:bucketDescriptions[id],asset:`${import.meta.env?.BASE_URL || '/'}assets/coast/${id}${dorsalAssets.has(id)?'-dorsal':''}.png`,
  headAxis:Object.freeze(headAxes[id]||[1,.5,0,.5]),
  aquatic:kind==='fish'||kind==='shrimp',rescuable:kind==='fish'||kind==='shrimp',
  catchable:kind!=='shell',bucketable:kind!=='shell',
})));
export const SPECIES_BY_ID = Object.freeze(Object.fromEntries(SPECIES.map(species=>[species.id,species])));
export const COAST_SPECIES = SPECIES;
export const getSpecies = value => typeof value==='string' ? SPECIES_BY_ID[value] : value;

export const COAST_ASSETS = Object.freeze({
  original:`${import.meta.env?.BASE_URL || '/'}assets/coast/coast-original.webp`,
  base:`${import.meta.env?.BASE_URL || '/'}assets/coast/coast-low.png`,
});
export const COAST_BACKGROUND=COAST_ASSETS.base;
