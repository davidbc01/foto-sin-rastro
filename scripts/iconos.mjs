// Genera web/iconos.svg con SOLO los iconos de Lucide que usa la web.
// Para usar uno nuevo: añade su nombre a la lista y ejecuta `npm run iconos`.
import { readFileSync, writeFileSync } from "node:fs";

const nombres = [
  "arrow-down",
  "arrow-up-right",
  "check",
  "clock",
  "eraser",
  "image-up",
  "map-pin",
  "moon",
  "plus",
  "rotate-ccw",
  "shield-check",
  "smartphone",
  "sun",
];

const simbolos = nombres.map((nombre) => {
  const svg = readFileSync(`node_modules/lucide-static/icons/${nombre}.svg`, "utf8");
  const interior = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
  return `  <symbol id="${nombre}" viewBox="0 0 24 24">${interior}</symbol>`;
});

const sprite = [
  '<svg xmlns="http://www.w3.org/2000/svg">',
  "  <!-- Iconos de Lucide (licencia ISC) · https://lucide.dev -->",
  ...simbolos,
  "</svg>",
  "",
].join("\n");

writeFileSync("web/iconos.svg", sprite);
console.log(`web/iconos.svg: ${nombres.length} iconos`);
