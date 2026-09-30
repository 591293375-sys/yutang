export const DEFAULT_CAT_ENVIRONMENT = Object.freeze({season:'auto',time:'auto',fireflies:true,particles:true});
export const CAT_SEASONS = ['spring','summer','autumn','winter'];
export const CAT_TIMES = ['day','night'];
export function normalizeEnvironment(value={}){
  const time=['dawn','dusk'].includes(value?.time)?'day':value?.time;
  return {season:['auto',...CAT_SEASONS].includes(value?.season)?value.season:'auto',time:['auto',...CAT_TIMES].includes(time)?time:'auto',
    fireflies:typeof value?.fireflies==='boolean'?value.fireflies:true,particles:typeof value?.particles==='boolean'?value.particles:true};
}
export function resolveEnvironment(config={},date=new Date()){
  const settings=normalizeEnvironment(config),month=date.getMonth()+1,hour=date.getHours()+date.getMinutes()/60;
  const season=settings.season==='auto'?(month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter'):settings.season;
  const time=settings.time==='auto'?(hour>=7&&hour<19?'day':'night'):settings.time;
  return {...settings,season,time,night:time==='night',fireflyCount:settings.fireflies&&time==='night'?(season==='winter'?0:season==='autumn'?4:9):0};
}
