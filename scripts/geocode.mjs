// Уточняет координаты мест в index.html через HTTP-геокодер Яндекса.
// Запуск: node scripts/geocode.mjs [--dry]  (ключ берётся из <script src="...apikey=..."> в index.html)
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../index.html", import.meta.url);
const DRY = process.argv.includes("--dry");
// Геокодер иногда находит одноимённую улицу в другом городе — дальше этого не двигаем.
const MAX_SHIFT_KM = 15;
const GOOD = new Set(["exact", "number", "near"]);

let html = readFileSync(FILE, "utf8");
const key = html.match(/api-maps\.yandex\.ru\/2\.1\/\?apikey=([\w-]+)/)?.[1];
if (!key) throw new Error("API key not found in index.html");

const block = html.match(/const PLACES = (\[[\s\S]*?\n\]);/)[1];
const places = new Function(`return ${block}`)();

const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 62.9);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function geocode(q) {
  const url = new URL("https://geocode-maps.yandex.ru/1.x/");
  url.search = new URLSearchParams({
    apikey: key, geocode: q, format: "json", results: "1", lang: "ru_RU",
    bbox: "36.8,55.1~38.4,56.2", rspn: "1",
  });
  const res = await fetch(url, { headers: { Referer: "http://109.66.245.132/" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const obj = (await res.json()).response.GeoObjectCollection.featureMember[0]?.GeoObject;
  if (!obj) return null;
  const [lon, lat] = obj.Point.pos.split(" ").map(Number);
  const meta = obj.metaDataProperty.GeocoderMetaData;
  return { ll: [lat, lon], precision: meta.precision, text: meta.text };
}

let moved = 0, kept = 0;
for (const p of places) {
  if (!p.ll || p.geo === false) continue;
  const q = p.geo || "Москва, " + p.addr.replace(/\s*\(.*\)$/, "");
  let r;
  try {
    r = await geocode(q);
  } catch (e) {
    console.log(`ERR  #${p.n} ${p.name}: ${e.message}`);
    if (/HTTP 403/.test(e.message)) process.exit(1);
    continue;
  }
  await sleep(150);
  if (!r) { console.log(`MISS #${p.n} ${p.name} <- ${q}`); kept++; continue; }
  const d = km(r.ll, p.ll);
  const ok = GOOD.has(r.precision) && d < MAX_SHIFT_KM;
  console.log(`${ok ? "OK  " : "SKIP"} #${p.n} ${p.name} | ${r.precision} | ${d.toFixed(2)} km | ${r.text}`);
  if (!ok) { kept++; continue; }
  const ll = `[${r.ll[0].toFixed(6)}, ${r.ll[1].toFixed(6)}]`;
  html = html.replace(new RegExp(`(\\{ n: ${p.n},[^\\n]*?ll: )\\[[^\\]]*\\]`), `$1${ll}`);
  moved++;
}

console.log(`\nupdated: ${moved}, left as is: ${kept}`);
if (!DRY) writeFileSync(FILE, html);
