# Corpus

An interactive, educational 3D simulator of the human body, with female, male and intersex anatomy. It runs in the browser: **[corpus-blond.vercel.app](https://corpus-blond.vercel.app/)**.

> Educational simplification. Not for diagnosis or medical decisions.

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
| `npm test` | Runs the unit tests for data and simulation maths |
| `npm run lint` | Runs ESLint |
| `npm run typecheck` | Checks types |
| `npm run build` | Type-checks and builds for production |
| `npm run models:fetch` | Downloads the raw anatomy data, for rebuilding models |

## What it includes

**The body.** Real anatomy models for a female and a male body, with eight layers: skin, fat, muscle, skeleton, organs, vessels, nerves and lymph. You can change each layer's opacity, use X-ray mode, slice the body in three directions, isolate or hide a part, fade whatever is in front of it, show name labels, click or search for any of about 130 parts, and read sourced facts about each one.

**Every sex.** Female and male profiles, four named intersex variations, and a custom builder for any combination of structures. Where sources report only female and male reference ranges, other profiles show both and say so, rather than implying a value.

**Simulations**, under the **Simulate** menu:

| Simulation | Includes |
| --- | --- |
| Circulatory | Four-chamber heart cycle, valves, ECG, blood particles, heart rate, pressure and exercise controls, live graphs, a narrowed-vessel what-if |
| Respiratory | Lungs, diaphragm and rib movement, tidal volume graph, alveolus gas exchange |
| Digestive | Meal selector, timeline from mouth to large intestine at up to 1000× speed, enzymes, absorption, villi |
| Nervous system and brain | Clickable brain map, action potential, synapse, knee-jerk reflex |
| Musculoskeletal | Walk, run, lift and squat with working muscles, sliding filaments, joint types, bone and fracture healing |
| Urinary | Nephron, urine formation, bladder filling, hydration |
| Endocrine | Glands, insulin and glucagon feedback with a glucose graph |
| Immune and lymphatic | White blood cells against pathogens, lymph flow |
| Skin and temperature | Skin layers, sweat glands, thermoregulation |
| Excretion and hygiene | What sweat, urine and feces remove, and guidance from the CDC and WHO |
| Life stages and body composition | Age, height, weight, BMI, energy balance |
| A day in the body | Meals, exercise and sleep acting on heart rate, glucose, water and temperature |
| Compare | Rest and exercise, or younger and older adults |
| Lessons and quizzes | A lesson and quiz per system, with progress saved in the browser |

**Also:** screenshots, video recording, shareable links, zoom toward the cursor or pinch point, a Rotate or Move switch for dragging, keyboard access (arrow keys orbit the view, and every part can be reached from a list), captions on animations, a colour-blind-safe chart palette, a reduced motion option, a phone layout, Low, Medium and High quality, and offline use after a first visit.

## How it is organized

| Path | Purpose |
| --- | --- |
| `src/data/physiology.json` | Every physiological number, with its source and confidence |
| `src/data/anatomy.ts` | The catalog of body parts, plus search and fact lookup |
| `src/data/sexProfiles.ts` | Sex profiles and the structures each one has |
| `src/data/models.ts` | The manifest of built 3D models, and each part's origin |
| `src/scene/` | The 3D view, layers, slicing, picking and GPU particles |
| `src/sim/` | The simulation clock, effects on the 3D body, the day simulation and the Web Worker |
| `src/systems/<name>/` | One folder per simulation: `model.ts` (pure, tested maths), `Lab.tsx` (panel), `Scene.tsx` (3D effects) |
| `src/systems/index.ts` | The registry of system plugins |
| `src/store/` | Global state, including `SimulationState` and shared links |
| `tools/blender/` | The pipeline that builds the body models in Blender |

### Adding a number

Add an entry to `physiology.json` with `value`, `unit`, `range`, `ageGroup`, `sex`, `source` and `confidence`. Use `"value": null` when the source gives only a range. `npm test` fails if an entry breaks the schema. The Sources page lists every entry automatically.

### Adding a simulation

Add a folder under `src/systems/` and register it in `src/systems/index.ts`. Each plugin has `model`, `ui`, `update`, `dataSources` and `limits`.

## Known limitations

**Anatomy**

- BodyParts3D comes from one male body. Its skeleton and muscles are fitted to the female body by computer, so their shape is not female-specific. No open full-body female skeleton or muscle data was found.
- The fit is approximate. Each bone is seated on its neighbour using where the two touch in BodyParts3D, and hands and feet are posed by computer to fit each body's skin, so finger and toe bones may sit slightly off centre, and a small share of bone points were pulled inside the skin.
- The spine and hip bones come from the atlas and the rest of the skeleton from BodyParts3D, and their shapes differ. Some bones sink into their neighbours where the two datasets meet: the femoral head into the hip by up to about 14 mm, and discs, rib heads and costal cartilages into the vertebrae and sternum by up to about 14 mm. These overlaps are mostly hidden inside the joints. Run `tools/blender/audit_joints.py` for the current figures.
- BodyParts3D has 23 intervertebral discs and no disc for the atlas female body's sixth lumbar vertebra. Foot and hand proportions are stretched by computer, not measured from these bodies.
- BodyParts3D has the intercostal muscles and some small back muscles on the left side only, so the right side is a mirror image of the left.
- Rectus abdominis and latissimus dorsi are simple illustrative shapes, and masseter, temporalis and internal oblique are missing, because BodyParts3D does not include them.
- Peripheral nerves and lymph nodes come from Z-Anatomy, modelled on one male body, and follow each body's fitted bones. Nerves are drawn 1.4 times thicker than the source so that fine branches can be seen. Each lymph node is a small sphere at its position in that atlas, not one person's actual node, and some are enlarged to stay visible. No open data for lymph vessels was found, so the thoracic duct is the only lymph vessel shown, and it is hand-placed. The fat layer is the skin moved inward, and it does not show real fat distribution.
- Skin has no realistic texture.
- The body does not move, because it has no rig. Movements are shown with a stick figure, and working muscles glow on the 3D body.
- Neither dataset includes breast tissue, the thyroid, parathyroid or parotid glands, eyelids in a usable form, hair or the female urethra. The thyroid is a simple illustrative shape, and the others are left out, along with most ligaments.
- The BodyParts3D skull is sized to fit inside each body's scalp. The atlas eyes, with their muscles and nerves, are moved into that skull's sockets, so they may not line up exactly with the eye area of the skin. The clear cornea and lens are left out so that the iris can be seen, and the iris colour is one example.
- 3D heart chambers change size with the beat, but do not model wall thickening. Valve movement is shown in the 2D diagram.

**Sex profiles**

- The four intersex variations are examples, not a complete list.
- All profiles use the female or male body model with typical organs. No open models of these variations were found, so external differences are not shown. Each affected profile says so.
- Reduced organ sizes in Turner and Klinefelter profiles are illustrative. Undescended testes are placed by hand in the pelvis.
- The complete androgen insensitivity profile shows the female model's vagina as a placeholder, because its cited page does not describe it. In the custom builder, the vagina still appears only with the uterus.
- Hormones are not modelled by sex, and gender identity and gender-affirming care are not covered.

**Life stages**

- The model is always an adult body. Age changes the numbers and text, but not body proportions. Height only scales the whole model.
- Body fat changes only how wide the soft layers look, and changes no numbers. Sleep is compared with CDC guidance but affects nothing else. Stress is stored but not modelled, because the sources used give no usable figures.

**Simulations**

- Sourced values anchor each simulation, but many curves between them are illustrative. Each panel has a **What this simplifies** section, and `physiology.json` marks each value's confidence.
- Blood, lymph and reflex routes are illustrative paths, not traced vessels or nerves.
- The heart diagram leaves out the two moments when all four valves are shut, because the source gives no duration for them.
- Microscopic views are 2D diagrams, not 3D zooms.
- Some sourced pages disagree with themselves, such as 100 and 110 mg/dL as the upper limit of normal glucose. These are noted where they matter.
- Function descriptions and quizzes were written for this app from the cited sources. They have not been reviewed by a clinician.

**Technical**

- Slicing cuts surfaces open without capping them, so parts look hollow where cut.
- Changing to or from Low quality rebuilds the 3D canvas, which causes a short pause.
- Performance has been measured on one computer only.
- Video recording depends on browser support. It is hidden where unavailable.

## Sources and assets

Sources are listed in the app under **Sources**. See [ASSETS.md](ASSETS.md) for 3D models and licences, including an open licence question about BodyParts3D. The full original brief is in [human-body-simulator-prompt.md](human-body-simulator-prompt.md).
