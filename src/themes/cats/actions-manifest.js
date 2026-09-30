import {CAT_SOURCE_RECTS} from './action-source-rects.js';
/** Real, individually generated pose atlases only. Never point several breeds at one portrait.
 * Atlas cells are 4 × 4, row-major: walk toward ×4, walk away ×4,
 * rest, sleep, eat, lick, groom face, groom paw, scratch, pounce.
 * Per-frame overrides use normalized cell coordinates:
 * {bounds:[x,y,w,h], anchor:{x,y}, parts:{head:[...],body:[...],tail:[...],legs:[...]},
 *  protectedAreas:[{x,y,rx,ry}]}. Bounds may be omitted for alpha extraction.
 * referenceWidth is the typical standing sprite's occupied fraction of one cell;
 * it keeps a lying pose from being enlarged to the standing cat's height.
 */
const atlasFiles = {
  ragdoll:{image:'assets/cats/actions-v2/ragdoll.webp',columns:4,rows:4,version:2},
  'british-shorthair':{image:'assets/cats/actions-v2/british-shorthair.webp',columns:4,rows:4,version:2},
  'domestic-orange-white':{image:'assets/cats/actions-v2/domestic-orange-white.webp',columns:4,rows:4,version:2},
  'chinchilla':{image:'assets/cats/actions-v2/chinchilla.webp',columns:4,rows:4,version:2},
  'american-shorthair':{image:'assets/cats/actions-v2/american-shorthair.webp',columns:4,rows:4,version:2},
  'siamese':{image:'assets/cats/actions-v2/siamese.webp',columns:4,rows:4,version:2},
  'maine-coon':{image:'assets/cats/actions-v2/maine-coon.webp',columns:4,rows:4,version:2},
  'domestic-tabby':{image:'assets/cats/actions-v2/domestic-tabby.webp',columns:4,rows:4,version:2},
  'russian-blue':{image:'assets/cats/actions-v2/russian-blue.webp',columns:4,rows:4,version:2},
  'norwegian-forest':{image:'assets/cats/actions-v2/norwegian-forest.webp',columns:4,rows:4,version:2},
  'domestic-tuxedo':{image:'assets/cats/actions-v2/domestic-tuxedo.webp',columns:4,rows:4,version:2},
  'domestic-calico':{image:'assets/cats/actions-v2/domestic-calico.webp',columns:4,rows:4,version:2},
  'persian':{image:'assets/cats/actions-v2/persian.webp',columns:4,rows:4,version:2},
  'exotic-shorthair':{image:'assets/cats/actions-v2/exotic-shorthair.webp',columns:4,rows:4,version:2},
  'bengal':{image:'assets/cats/actions-v2/bengal.webp',columns:4,rows:4,version:2},
  'abyssinian':{image:'assets/cats/actions-v2/abyssinian.webp',columns:4,rows:4,version:2},
};
export const CAT_ACTION_ATLASES=Object.freeze(Object.fromEntries(Object.entries(atlasFiles).map(([id,spec])=>[id,{...spec,...CAT_SOURCE_RECTS[id]}])));
