import {readdir,rm} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';

export function isCatSourceArt(file){
 const normalized=file.split(sep).join('/');
 return /^assets\/cats\/(?:[^/]+\/)*[^/]+-source\.png$/i.test(normalized);
}

// Vite copies public assets verbatim. Source painting PNGs must remain available
// to offline art tools, but only the optimized WebP assets belong in dist/app.asar.
export async function excludeCatSourceArt(outDir){
 const root=resolve(outDir),cats=resolve(root,'assets/cats'),removed=[];
 async function visit(dir){
  let items;try{items=await readdir(dir,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return;throw e}
  for(const item of items){
   const file=resolve(dir,item.name);
   if(item.isDirectory())await visit(file);
   else if(item.isFile()&&isCatSourceArt(relative(root,file))){await rm(file);removed.push(relative(root,file))}
  }
 }
 await visit(cats);return removed;
}

export function excludeCatSourceArtPlugin(){
 let outDir;
 return {name:'exclude-cat-source-art',apply:'build',
  configResolved(config){outDir=resolve(config.root,config.build.outDir)},
  async closeBundle(){await excludeCatSourceArt(outDir)},
 };
}
