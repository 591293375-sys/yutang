/** Offline resizing/encoding only: preserve source art and transparency, never repaint it.
 * Usage: NODE_PATH=/path/to/node_modules node scripts/prepare-cat-assets.cjs /path/to/猫咪庭院
 * Requires sharp (development asset tool, not shipped with the application).
 */
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const source = process.argv[2];
if (!source) throw new Error('Pass the source 猫咪庭院 directory. Originals are read-only.');
const output = path.resolve(__dirname, '../public/assets/cats');
const presets = ['ragdoll','british-shorthair','chinchilla','american-shorthair','siamese','domestic-orange-white','maine-coon','domestic-tabby','russian-blue','norwegian-forest','domestic-tuxedo','domestic-calico'];
(async () => {
  await fs.mkdir(output, {recursive:true});
  const files = (await fs.readdir(path.join(source,'猫咪元素'))).filter(f => f.endsWith('.png')).sort();
  if (files.length !== 12) throw new Error('Expected the twelve audited standing portraits; check the ID mapping before replacing images.');
  const report = {sourceBackground:'场景.png', sourceBackgroundSize:[7680,4320], cats:[]};
  for (let i=0;i<files.length;i++) {
    const input = path.join(source,'猫咪元素',files[i]);
    const {data,info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width, top=info.height, right=0, bottom=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>0) {
      left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
    }
    const width=right-left,height=bottom-top, side=Math.max(width,height)+16;
    const padLeft=Math.floor((side-width)/2),padTop=Math.floor((side-height)/2);
    const square=await sharp(input).extract({left,top,width,height}).extend({left:padLeft,right:side-width-padLeft,top:padTop,bottom:side-height-padTop,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    const base=sharp(square);
    await base.clone().resize(768,768).webp({quality:90,alphaQuality:100,effort:6}).toFile(path.join(output,presets[i]+'.webp'));
    await base.clone().resize(256,256).webp({quality:86,alphaQuality:100,effort:6}).toFile(path.join(output,presets[i]+'-thumb.webp'));
    report.cats.push({id:presets[i],source:files[i],original:[info.width,info.height],alphaBox:[left,top,right,bottom],squareSize:side,offset:[padLeft-left,padTop-top],runtime:[768,768],thumbnail:[256,256]});
  }
  for(const width of [1920,3840,6144]) {
    await sharp(path.join(source,'场景.png')).resize({width,withoutEnlargement:true}).webp({quality:width===1920?86:90,effort:6}).toFile(path.join(output,`courtyard-${width}.webp`));
  }
  await fs.writeFile(path.join(output,'asset-manifest.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
})();
