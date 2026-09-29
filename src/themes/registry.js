import {readStore,writeStore} from '../lib/storage.js';

export const THEMES = Object.freeze([
  {id:'koi',name:'锦鲤池',subtitle:'一池清欢',description:'四时游鱼，落一把小小欢喜。',image:'assets/spring.png?v=1.5'},
  {id:'coast',name:'赶海',subtitle:'潮来潮往',description:'看潮汐，拾贝壳，遇见浅海的小住客。',image:'assets/coast/coast-low.png'},
]);
export function loadTheme(){const id=readStore('mofish-theme','koi');return THEMES.some(t=>t.id===id)?id:'koi'}
export function saveTheme(id){return THEMES.some(t=>t.id===id)&&writeStore('mofish-theme',id)}
