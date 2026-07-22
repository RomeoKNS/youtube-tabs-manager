# YouTube Tabs Manager

Chrome/Chromium plėtinys, kuris surenka visus atidarytus YouTube video tabus į vieną popup langą su video informacija, progresu ir greita navigacija.

## Funkcijos

- Visi YouTube tabai vienoje vietoje
- Video thumbnail su progreso juosta
- Upload data, trukmė, peržiūrų skaičius
- Rikiavimas: naujausi / seniausi / progresas / pavadinimas
- "Žiūrima nuo..." laikas
- Raudona indikacija kai video groja
- Greitas perėjimas / uždarymas

## Įdiegimas

1. Atidaryk `chrome://extensions/` arba `vivaldi://extensions/`
2. Įjunk **Developer mode**
3. Spausk **Load unpacked**
4. Pasirink šį katalogą

## Struktūra

```
├── manifest.json    # Manifest V3
├── background.js    # Service worker — tab tracking, storage
├── content.js       # Scrape duomenys iš YouTube puslapio
├── popup.html       # Popup UI
├── popup.js         # Popup logika
├── popup.css        # Stiliai
└── icons/           # Ikonėlės
```

## Licencija

MIT
