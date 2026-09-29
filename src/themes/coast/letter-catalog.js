// User-supplied handwritten letters. IDs are permanent save references; image data
// stays in static assets and is loaded only when a letter is opened.
const base = `${import.meta.env?.BASE_URL || '/'}assets/coast/letters/`;
const rows = [
  ["amai-01", "阿麦的来信 · 01", "阿麦", 1024, 1536],
  ["amai-02", "阿麦的来信 · 02", "阿麦", 1024, 1536],
  ["amai-03", "阿麦的来信 · 03", "阿麦", 1024, 1536],
  ["amai-04", "阿麦的来信 · 04", "阿麦", 1024, 1536],
  ["amai-05", "阿麦的来信 · 05", "阿麦", 1024, 1536],
  ["amai-06", "阿麦的来信 · 06", "阿麦", 1024, 1536],
  ["doudou-01", "豆豆的来信 · 01", "豆豆", 1024, 1536],
  ["doudou-02", "豆豆的来信 · 02", "豆豆", 1024, 1536],
  ["doudou-03", "豆豆的来信 · 03", "豆豆", 1024, 1536],
  ["doudou-04", "豆豆的来信 · 04", "豆豆", 1024, 1536],
  ["doudou-05", "豆豆的来信 · 05", "豆豆", 1024, 1536],
  ["doudou-06", "豆豆的来信 · 06", "豆豆", 1024, 1536],
  ["laozhou-01", "老周的来信 · 01", "老周", 1024, 1536],
  ["laozhou-02", "老周的来信 · 02", "老周", 1024, 1536],
  ["laozhou-03", "老周的来信 · 03", "老周", 1024, 1536],
  ["laozhou-04", "老周的来信 · 04", "老周", 1024, 1536],
  ["laozhou-05", "老周的来信 · 05", "老周", 1024, 1536],
  ["laozhou-06", "老周的来信 · 06", "老周", 1024, 1536],
  ["xiaomei-01", "小美的来信 · 01", "小美", 1024, 1536],
  ["xiaomei-02", "小美的来信 · 02", "小美", 1024, 1536],
  ["xiaomei-03", "小美的来信 · 03", "小美", 1024, 1536],
  ["xiaomei-04", "小美的来信 · 04", "小美", 1024, 1536],
  ["xiaomei-05", "小美的来信 · 05", "小美", 1024, 1536],
  ["xiaomei-06", "小美的来信 · 06", "小美", 1024, 1536],
  ["ajiao-01", "阿礁的来信 · 01", "阿礁", 1086, 1448],
  ["ajiao-02", "阿礁的来信 · 02", "阿礁", 1086, 1448],
  ["ajiao-03", "阿礁的来信 · 03", "阿礁", 1086, 1448],
  ["ajiao-04", "阿礁的来信 · 04", "阿礁", 1086, 1448],
  ["ajiao-05", "阿礁的来信 · 05", "阿礁", 1086, 1448],
];

export const CURATED_LETTERS = Object.freeze(rows.map(([id,title,signature,width,height]) => Object.freeze({
  id,title,signature,asset:`${base}${id}.webp`,width,height,
})));
export const CURATED_LETTERS_BY_ID = Object.freeze(Object.fromEntries(CURATED_LETTERS.map(letter=>[letter.id,letter])));
