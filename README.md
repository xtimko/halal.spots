# Halal Spots — Москва

Интерактивная карта мест из личного списка: адрес, часы работы, оценка, «открыто сейчас», маршрут.
Одна страница `index.html` без сборки, интерфейс в стиле Apple Liquid Glass.

## Обновить на сервере

```bash
curl -fsSL https://raw.githubusercontent.com/xtimko/halal.spots/claude/moscow-restaurants-map-2277xc/index.html -o /var/www/html/index.html
```

## Как устроено

- Данные — массив `PLACES` в `index.html` (`tag: "sea"` — морепродукты, `"warn"` — не всё меню халяль,
  `approx` — адрес не подтверждён, `ll: null` — место не нашлось).
- Карта — Яндекс Карты (JS API 2.1, ключ в `<script>` внизу страницы).
- Координаты уточняет `scripts/geocode.mjs`: сначала геокодер Яндекса, если ключ к нему не подключён —
  Nominatim (OpenStreetMap). Запуск — workflow **Geocode places** во вкладке Actions, он сам коммитит
  результат.
- Стекло: размытие `backdrop-filter` везде; в Chrome/Edge/Android ещё и преломление по краям
  (SVG-карта смещения по мотивам [shuding/liquid-glass](https://github.com/shuding/liquid-glass), MIT).
- Часы и рейтинги взяты из 2ГИС / Яндекс Карт на октябрь 2026; «Открыто сейчас» считается по
  московскому времени только для мест с известными часами.
