// Scene-only materials. Catalog images remain unchanged in the guide/bucket UI.
// The terrain contains no main-sea waterline, foam or collectible creatures.
const root = `${import.meta.env?.BASE_URL || '/'}assets/coast/art-reference-v2/`;
export const COAST_ART = Object.freeze({
  terrain: `${root}terrain-clean.webp`,
  seabed: `${root}terrain.webp`,
  surface: `${root}water.webp`,
});
