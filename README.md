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
- **Istorija** — iki 10 paskutinių uždarytų arba paliktų video:
  - Automatiškai išsaugoma kai tabas uždaromas
  - Automatiškai išsaugoma kai pasikeičia video (SPA navigacija arba naujas adresas)
  - Automatiškai išsaugoma kai išeinama iš YouTube į kitą puslapį
  - Galimybė pašalinti atskirą įrašą arba išvalyti visą istoriją
  - Paspaudus ant istorijos įrašo — video atidaromas naujame tabe

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

## Po kodo pakeitimų

- Paspausk refresh ikoną ant extension kortelės `chrome://extensions/`
- Uždaryk ir iš naujo atidaryk popup
- Po content script pakeitimų: perkrauk YouTube tabus

## Licencija

MIT
