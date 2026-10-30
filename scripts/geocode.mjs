// Уточняет координаты мест в index.html по адресам.
// Сначала геокодер Яндекса (ключ из <script src="...apikey=..."> в index.html);
// если ключ не подходит для геокодера — Nominatim (OpenStreetMap).
// Запуск: node scripts/geocode.mjs [--dry]
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../index.html", import.meta.url);
const DRY = process.argv.includes("--dry");
// Геокодер иногда находит одноимённую улицу в другом городе — дальше этого не двигаем.
const MAX_SHIFT_KM = 15;

let html = readFileSync(FILE, "utf8");
const key = html.match(/api-maps\.yandex\.ru\/2\.1\/\?apikey=([\w-]+)/)?.[1];
const block = html.match(/const PLACES = (\[[\s\S]*?\n\]);/)[1];
const places = new Function(`return ${block}`)();

const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 62.9);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function yandex(q) {
  const url = new URL("https://geocode-maps.yandex.ru/1.x/");
  url.search = new URLSearchParams({
    apikey: key, geocode: q, format: "json", results: "1", lang: "ru_RU",
    bbox: "36.8,55.1~38.4,56.2", rspn: "1",
  });
  const res = await fetch(url, { headers: { Referer: "http://109.66.245.132/" } });
  if (res.status === 403) throw Object.assign(new Error(await res.text()), { forbidden: true });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const obj = (await res.json()).response.GeoObjectCollection.featureMember[0]?.GeoObject;
  if (!obj) return null;
  const [lon, lat] = obj.Point.pos.split(" ").map(Number);
  const meta = obj.metaDataProperty.GeocoderMetaData;
  return { ll: [lat, lon], exact: ["exact", "number", "near"].includes(meta.precision), text: `${meta.precision} | ${meta.text}` };
}

// Nominatim лучше понимает полные слова и номер строения через пробел: «14 с5».
function osmQuery(q) {
  const w = "(?<![а-яА-Яa-zA-Z])"; // \b в JS не работает с кириллицей
  const abbr = { "ул\\.": "улица", "пр-т": "проспект", "пер\\.": "переулок", "ш\\.": "шоссе",
    "пл\\.": "площадь", "наб\\.": "набережная", "пр\\.": "проезд" };
  for (const [a, full] of Object.entries(abbr)) q = q.replace(new RegExp(w + a, "g"), full);
  return q.replace(/, ТРЦ.*$/, "").replace(/(\d[\d/]*[а-яА-Я]?)([ск]\d+[а-яА-Я]?)(?![\dа-яА-Я])/g, "$1 $2");
}

async function nominatim(q) {
  const tries = [osmQuery(q)];
  // если строение не нашлось — хотя бы основной дом
  const main = tries[0].replace(/(\d[\d/]*[а-яА-Я]?) [ск][\dа-яА-Я]+/, "$1");
  if (main !== tries[0]) tries.push(main);
  for (const t of tries) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: t, format: "jsonv2", limit: "1", countrycodes: "ru", "accept-language": "ru",
      viewbox: "36.8,56.2,38.4,55.1", bounded: "1",
    });
    const res = await fetch(url, { headers: { "User-Agent": "halal-spots-map/1.0 (github.com/xtimko/halal.spots)" } });
    await sleep(1100); // политика Nominatim: не чаще 1 запроса в секунду
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = (await res.json())[0];
    if (!r) continue;
    // здание или заведение по точному адресу; улица/площадь целиком — не годится
    const exact = !["highway", "boundary", "landuse", "railway"].includes(r.category) && !(r.category === "place" && r.type !== "house");
    return { ll: [Number(r.lat), Number(r.lon)], exact, text: `${r.category}/${r.type}${t === tries[0] ? "" : " (осн. дом)"} | ${r.display_name}` };
  }
  return null;
}

let provider = key ? yandex : nominatim;
let moved = 0, kept = 0;
for (const p of places) {
  if (!p.ll || p.geo === false) continue;
  const q = p.geo || "Москва, " + p.addr.replace(/\s*\(.*\)$/, "");
  let r;
  try {
    r = await provider(q);
  } catch (e) {
    if (e.forbidden && provider === yandex) {
      console.log(`Yandex geocoder refused the key (${e.message.trim()}), switching to Nominatim\n`);
      provider = nominatim;
      r = await provider(q).catch(err => (console.log(`ERR  #${p.n} ${p.name}: ${err.message}`), undefined));
      if (r === undefined) continue;
    } else {
      console.log(`ERR  #${p.n} ${p.name}: ${e.message}`);
      continue;
    }
  }
  if (provider === yandex) await sleep(150);
  if (!r) { console.log(`MISS #${p.n} ${p.name} <- ${q}`); kept++; continue; }
  const d = km(r.ll, p.ll);
  const ok = r.exact && d < MAX_SHIFT_KM;
  console.log(`${ok ? "OK  " : "SKIP"} #${p.n} ${p.name} | ${d.toFixed(2)} km | ${r.text}`);
  if (!ok) { kept++; continue; }
  const ll = `[${r.ll[0].toFixed(6)}, ${r.ll[1].toFixed(6)}]`;
  html = html.replace(new RegExp(`(\\{ n: ${p.n},[^\\n]*?ll: )\\[[^\\]]*\\]`), `$1${ll}`);
  moved++;
}

console.log(`\nupdated: ${moved}, left as is: ${kept}`);
if (!DRY) writeFileSync(FILE, html);
