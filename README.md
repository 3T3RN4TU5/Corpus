# Corpus

An interactive, educational 3D simulator of the human body, covering female, male and intersex anatomy. It runs in the browser.

> Educational simplification. Not for diagnosis or medical decisions.

The project is built in phases. See [human-body-simulator-prompt.md](human-body-simulator-prompt.md) for the full brief. **Phase 1 (Foundation) is complete.**

## Run it

Tested on Node 24.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit tests |
| `npm run typecheck` | Checks types |
| `npm run build` | Type-checks and builds for production |

## What works in Phase 1

- A procedural low-poly body with eight toggleable layers: skin, fat, muscle, skeleton, organs, vessels, nerves and lymph
- Opacity per layer, X-ray mode, axial, sagittal and coronal slicing, and isolating a single part
- Click-to-select and search, with an information panel showing sourced facts
- Sex profiles: female, male, four named intersex variations, and a custom builder for any combination of structures
- Low, Medium and High quality, and a phone layout
- A Sources page listing every number and its reference

## How it is organized

| Path | Purpose |
| --- | --- |
| `src/data/physiology.json` | Every physiological number, with its source and confidence |
| `src/data/physiology.ts` | The schema, validator and formatting for those numbers |
| `src/data/anatomy.ts` | The catalog of body parts, plus search and fact lookup |
| `src/data/sexProfiles.ts` | Sex profiles and the structures each one has |
| `src/scene/bodyGeometry.ts` | One procedural geometry builder per body part |
| `src/scene/appearance.ts` | How layer, X-ray and isolate settings decide what is visible and clickable |
| `src/store/useBodyStore.ts` | Global state, including `SimulationState` |
| `src/systems/types.ts` | The plugin contract that body systems implement from Phase 2 |
| `src/ui/` | Panels, search, toolbar and the Sources page |

### Adding a number

Add an entry to `physiology.json` with `value`, `unit`, `range`, `ageGroup`, `sex`, `source` and `confidence`. Use `"value": null` when the source gives only a range, rather than inventing a midpoint. `npm test` fails if an entry breaks the schema.

### Adding a body part

Add it to `PARTS` in `anatomy.ts` and add a builder with the same id to `BUILDERS` in `bodyGeometry.ts`. `npm test` fails if the two lists differ.

## Known limitations

**Anatomy**

- The body is a placeholder made of simple shapes. Its shapes, positions and sizes are illustrative and were not measured.
- Only a selection of muscles, vessels, nerves and lymph structures is included. Individual small bones are merged into groups, so the model does not show 206 separate bones.
- External sex characteristics, including genitalia and breasts, are not modelled. Sex profiles change only internal reproductive structures and shoulder and hip proportions.

**Sex profiles**

- The four named intersex variations are examples, not a complete list. The custom profile is there to explore other combinations, but not every combination describes a documented condition.
- Sources report separate reference ranges for females and males only. Intersex and custom profiles show both ranges and say so, rather than implying a specific range.
- Some internal structures are typical-anatomy placeholders that the cited page does not describe, such as the uterus in Turner syndrome. The app says so on each affected profile.
- The reduced organ sizes in Turner and Klinefelter profiles are illustrative. The sources describe reduced function or small size, with no multiplier.
- The profiles do not model hormones yet, and gender identity and gender-affirming care are not covered.

**Features not active yet**

- `SimulationState` holds age, weight, height and other settings, but only sex affects the app so far. Their controls will arrive with the systems that use them.
- Time controls and the "Simulate this" button are waiting on the first simulation in Phase 2.
- Age-specific heart and breathing rates are stored and listed on the Sources page, but the information panel shows adult values only.

**Viewer**

- Slicing cuts surfaces open without capping them, so organs look hollow where they are cut.
- Changing to or from Low quality rebuilds the 3D canvas, which causes a pause of about a second.
- Performance has been measured on one machine only, and it may be faster than a typical mid-range laptop.
- The function descriptions are short summaries written for this app and have not been reviewed by a clinician.

## Sources and assets

Sources are listed in the app under **Sources**. See [ASSETS.md](ASSETS.md) for 3D asset licences.
