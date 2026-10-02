# Legacy Data Audit — traingame

Audit zdroje `game.html`.

> **DŮLEŽITÉ:** `game.html` byl během auditu pouze čten. Nebyl upraven, přesunut ani přepsán.
>
> Blob SHA při auditu: `27e03aabdb7b82f84753c4a27e1c3fefa973da6c`

## 1. Soubor

- Velikost: 604,810 znaků
- Počet řádků: 9,465
- Zdroj: historický `game.html`
- Stav: **zachovat beze změny jako archivní zdroj dat**

## 2. Železniční tratě

- 240 unikátních názvů tratí
- 5,263 záznamů zastávek napříč tratěmi
- Žádná trať nemá 0 zastávek
- Žádná trať nemá 0 vlakových záznamů
- Kategorie:
  - A: 209 tratí
  - B: 19 tratí
  - C: 8 tratí
  - D: 4 tratě
- Duplicitní názvy tratí: 0

### Struktura staré tratě

Každá trať používá:

- `name`
- `color`
- `category`
- `trains[]`
- `stops[]`

Každá zastávka používá:

- `name`
- `location: [lat, lon]`

## 3. Stanice / zastávky

Z 5,263 zastávkových záznamů vychází:

- 3,237 unikátních názvů
- 3,226 unikátních souřadnic
- 0 chybějících souřadnic
- 855 názvů se opakuje
- 863 souřadnicových skupin se opakuje

To je **očekávané chování** starého modelu: jedna fyzická stanice je zapsaná znovu v každé trati, na které leží.

Nejčastěji opakované názvy:

| Stanice | Počet výskytů |
|---|---:|
| Praha hlavní nádraží | 18 |
| Česká Třebová | 11 |
| Kolín | 11 |
| Brno hlavní nádraží | 10 |
| Přerov | 10 |
| Olomouc hlavní nádraží | 10 |
| České Budějovice | 9 |
| Cheb | 9 |
| Děčín hlavní nádraží | 9 |
| Choceň | 9 |

### Důležitý závěr

Při migraci **nesmíme vytvořit jednu stanici pro každý výskyt v `stops[]`**.

Musíme z toho udělat samostatnou entitu:

`Station`

a jednotlivé tratě na ni pouze odkazovat.

To přesně odpovídá novému `ENGINE_SPEC.md`.

## 4. Stejný název ≠ automaticky stejná stanice

Audit našel několik názvů, které se v historických datech objevují na více souřadnicích, například:

- Vlárský průsmyk
- Wien Hauptbahnhof
- Šumperk
- Kolín
- Šanov
- Ústí nad Orlicí
- Zbuzany
- Chomutov
- Sedlec
- Coswig
- Dresden Hauptbahnhof

Proto při deduplikaci nepoužívat pouze název.

Primární identita stanice by měla být založena na:

1. souřadnicích,
2. názvu,
3. případně dalším geografickém kontextu.

## 5. Typy vlaků

Legacy `trainTypes[]` obsahuje:

- 73 typů
- 0 typů bez obrázku
- 1 duplicitní název: `151 001-5`

Pole:

- `name`
- `price`
- `speed`
- `image`
- `location`

### Kritická historická anomálie

Všech 73 typů vlaků má stejnou hodnotu:

`location: [6.1246406, 81.1212572]`

To není použitelné jako skutečná železniční poloha.

**Při migraci to nesmíme interpretovat jako aktuální polohu vlaků.**

Doporučení:

- pole `location` z legacy importu ignorovat,
- skutečné `VehicleInstance.currentStationId` řešit novým runtime modelem.

### Podezřelá rychlost

`T679`:

- cena: 6,800
- rychlost: 780,000

Hodnota je zjevně mimo rozsah ostatních dat.

**Neměnit v `game.html`.**

Při migraci ji označit jako `legacy anomaly` a vyřešit až při definici nového modelu vlaků.

Ostatní rychlosti v `trainTypes[]` jsou v legacy datech 400, takže ani ty zatím nebudeme automaticky považovat za skutečnou km/h hodnotu.

## 6. Vlaky přiřazené k tratím

Tratě obsahují celkem:

- 772 vlakových/service záznamů
- 239 unikátních názvů těchto záznamů

Struktura:

- `name`
- `startingIndex`
- `reverse`
- `image`
- `maxSpeed`

Kontroly:

- žádný záznam nemá chybějící povinné pole
- `startingIndex`: 0–200
- `reverse=true`: 165 záznamů
- `reverse=false`: 607 záznamů
- `maxSpeed`: 200–1000

### Důležitá interpretace

`lines[].trains[]` není totéž co `trainTypes[]`.

Je to spíše historický záznam konkrétního provozu / oběhu na trati:

- výchozí index zastávky,
- směr,
- obrázek,
- rychlost.

Nový engine proto tyto informace rozdělí mezi:

- `VehicleType`
- `VehicleInstance`
- `VehicleDuty`
- `MovementSegment`

## 7. Co audit potvrdil

Legacy data mají dostatečně silný základ pro migraci:

- 240 tratí
- 3,226 unikátních souřadnic
- 3,237 názvových identit
- 73 vlakových typů
- 772 historických provozních záznamů
- kompletní souřadnice zastávek
- obrázky u všech vlakových typů

Největší problém není ztráta dat, ale **normalizace**.

## 8. Co při migraci NESMÍME udělat

1. Nemažeme `game.html`.
2. Neopravujeme historické hodnoty přímo v `game.html`.
3. Nevytváříme stanici z každého výskytu v `stops[]`.
4. Nepoužíváme legacy `trainTypes.location` jako aktuální pozici vlaku.
5. Nepovažujeme `lines[].trains[]` automaticky za samostatné typy vlaků.
6. Nezahazujeme historická data jen proto, že jsou nekonzistentní.
7. Nepřepisujeme rychlosti/ceny naslepo.

## 9. Doporučený další krok

Další krok je vytvořit **jednorázový legacy importer**, který pouze přečte `game.html` a vyrobí normalizovaná data:

```
data/
├── stations.json
├── routes.json
├── track-sections.json
├── train-types.json
├── legacy-services.json
└── migration-report.json
```

Importer by měl být opakovatelný a idempotentní.

Princip:

`game.html` → importer → nové datové soubory → nový engine

Nikdy:

`game.html` → ruční přepis → ztráta historických dat

## 10. Stav auditu

**AUDIT COMPLETE**

`game.html` zůstává nedotčený a je považován za historický zdroj pravdy pro původní verzi hry.
