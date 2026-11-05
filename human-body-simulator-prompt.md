# Prompt: Interactive 3D Human Body Simulator (build in phases)

Paste everything below into Claude Code (or another coding agent) in an empty folder.

---

## ROLE
You are a senior frontend + graphics engineer and a careful science communicator. Build an interactive, educational 3D human body simulator that runs in the browser. Work in the phases below. Finish and verify one phase before starting the next. After each phase, run the app, fix errors, and give me a short summary plus what to test.

## HARD RULES (accuracy)
1. This is an EDUCATIONAL tool, not a medical device. Show a visible disclaimer: "Educational simplification. Not for diagnosis or medical decisions."
2. Never invent physiological numbers. Every number (heart rate, blood volume, GFR, transit times, bone count, etc.) lives in `src/data/physiology.json` with fields: `value`, `unit`, `range`, `ageGroup`, `sex`, `source` (title + URL), `confidence` ("high" | "approximate" | "illustrative").
3. Prefer sources such as textbooks (OpenStax Anatomy & Physiology), WHO, NIH/NLM, CDC, and peer-reviewed reviews. List all sources on an in-app "Sources" page.


## TECH STACK
- Vite + React + TypeScript
- Three.js via @react-three/fiber and @react-three/drei
- Zustand for state, Tailwind for UI
- GLTF/GLB models, loaded lazily per system (Draco/meshopt compressed)
- GPU particles for blood cells, food bolus, nerve signals
- Web Workers for heavy simulation math
- Charts with Recharts or uPlot (live graphs)
- Must run at 60 fps on a mid-range laptop; provide Low/Medium/High quality setting. Mobile-friendly controls (touch orbit/pinch).

## CORE ARCHITECTURE
- `BodyModel`: layered anatomy with toggleable layers: Skin → Fat → Muscle → Skeleton → Organs → Vessels (arteries/veins) → Nerves → Lymph.
- Layer UI: per-layer visibility, opacity slider, X-ray mode, clipping plane/slice tool (axial, sagittal, coronal), isolate-organ mode.
- Click any part → info panel (name, function, connected systems, key facts with sources) + "simulate this" button.
- Search box for any organ/bone/muscle.
- Time controls: play/pause, speed (0.1x–1000x for slow processes like digestion), scrub timeline.
- Global `SimulationState` (age, sex, weight, height, body fat %, activity level, hydration, sleep, stress) that all systems read from.
- Each system is a plugin with: `model`, `update(dt, state)`, `ui`, `dataSources`, `limits`.

## PHASES

### Phase 1 — Foundation
- Project setup, scene, lighting, orbit camera, loading screen, quality settings.
- Placeholder/low-poly body with the layer system and click-to-select.
- Info panel, search, disclaimer, Sources page, `physiology.json` schema.
- Acceptance: layers toggle, parts are selectable, 60 fps.

### Phase 2 — Circulatory system
- Heart with animated 4-chamber cycle (systole/diastole), valves opening/closing, ECG trace synced to the beat.
- Blood flow through arteries/veins/capillaries as GPU particles (red = oxygenated, blue = deoxygenated), pulmonary + systemic loops.
- Sliders: heart rate, blood pressure, exercise level. Show live graphs.
- Optional "what if": narrowed vessel (plaque) changes flow; clearly mark as illustrative.

### Phase 3 — Respiratory system
- Lungs inflate/deflate with diaphragm and intercostals; airway tree; alveoli zoom with O2/CO2 exchange animation.
- Breathing rate tied to activity level; live tidal volume graph.

### Phase 4 — Digestive system
- Mouth → esophagus (peristalsis) → stomach (churning, acid) → small intestine (absorption, villi zoom) → liver, gallbladder, pancreas roles → large intestine → rectum.
- Meal selector (carbs/protein/fat) drives a timeline; show nutrient absorption and enzyme labels.
- Speed controls from real-time to 1000x. Transit times come from `physiology.json` with ranges.

### Phase 5 — Nervous system and brain
- Brain regions (cerebrum lobes, cerebellum, brainstem, hippocampus, etc.) clickable with functions.
- Neuron zoom: action potential animation (resting potential, depolarization, repolarization), synapse with neurotransmitter release.
- Reflex arc demo (e.g., knee-jerk) from receptor → spinal cord → muscle.
- Spinal cord and major nerve pathways overlay.

### Phase 6 — Musculoskeletal system
- Skeleton with joint types and range of motion; muscles attach origin/insertion.
- Pose/animation library (walk, run, lift, squat): show which muscles activate, with contraction visualization.
- Sarcomere zoom (sliding filament) animation.
- Bone detail: cortical/trabecular cross-section; fracture healing timeline (educational).

### Phase 7 — Urinary, endocrine, immune, lymphatic, integumentary
- Kidney: nephron zoom (filtration, reabsorption, secretion), urine formation, bladder fill/empty; hydration slider.
- Endocrine: glands, hormone feedback loops (e.g., insulin–glucagon with blood glucose graph).
- Immune: pathogen vs. white blood cell simplified demo; lymph flow.
- Skin: layers, sweat glands, thermoregulation.
- Excretion + hygiene module: sweat, urine, feces, what each removes; handwashing/dental/sleep/hydration effects shown as educational scenarios, each with cited guidance (WHO/CDC).

### Phase 8 — Life stages and body composition
- Age slider covering infant, child, adolescent, adult, older adult: changes proportions, bone density, heart rate ranges, muscle mass, metabolism, using sourced ranges only.
- Body fat / weight controls: fat layer thickness, BMI display (note BMI's limits), energy balance (calories in/out) with the formula and source shown.
- Sex-specific anatomy toggle where relevant (clinical, educational).

### Phase 9 — Whole-body integration and learning tools
- "A day in the body": timeline of meals, exercise, sleep affecting heart rate, glucose, hydration, temperature.
- Guided lessons and quizzes per system; progress tracking in localStorage.
- Compare mode (e.g., rest vs. exercise, young vs. old).
- Screenshot/record export; shareable URL state.
- Accessibility: keyboard navigation, captions for animations, color-blind-safe palette, reduced-motion option.

### Phase 10 — Polish
- Performance profiling, LOD, code-splitting, PWA/offline caching.
- Tests for simulation math (unit tests with Vitest), lint, type-check.
- README with setup, architecture, asset licenses, sources, and known limitations.

## DELIVERABLES PER PHASE
- Working code committed in small, logical commits.
- Updated `ASSETS.md`, `physiology.json`, and Sources page.
- A "Known limitations" list: be honest about what is simplified or illustrative.

## START NOW
Begin with Phase 1. Before coding, give me a short plan (stack confirmation, folder structure, how you will source 3D anatomy models and their licenses). Ask me only about decisions that block you; otherwise make sensible choices and tell me what you chose.
