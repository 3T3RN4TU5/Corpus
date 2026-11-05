import { getFact, type PhysiologyEntry, type Source } from './physiology'
import type { ReproStructure, SexProfile } from './sexProfiles'

export type LayerId = 'skin' | 'fat' | 'muscle' | 'skeleton' | 'organs' | 'vessels' | 'nerves' | 'lymph'

export type SystemId =
  | 'integumentary'
  | 'skeletal'
  | 'muscular'
  | 'nervous'
  | 'cardiovascular'
  | 'lymphatic'
  | 'respiratory'
  | 'digestive'
  | 'urinary'
  | 'reproductive'

export interface LayerInfo {
  id: LayerId
  name: string
  color: string
}

/** Ordered from the outside of the body inward. */
export const LAYERS: LayerInfo[] = [
  { id: 'skin', name: 'Skin', color: '#c9a184' },
  { id: 'fat', name: 'Fat', color: '#e3c370' },
  { id: 'muscle', name: 'Muscle', color: '#a8493f' },
  { id: 'skeleton', name: 'Skeleton', color: '#e8dfc9' },
  { id: 'organs', name: 'Organs', color: '#c9747c' },
  { id: 'vessels', name: 'Vessels', color: '#c8402f' },
  { id: 'nerves', name: 'Nerves', color: '#e2c64d' },
  { id: 'lymph', name: 'Lymph', color: '#7fb58c' },
]

export const SYSTEM_NAMES: Record<SystemId, string> = {
  integumentary: 'Integumentary',
  skeletal: 'Skeletal',
  muscular: 'Muscular',
  nervous: 'Nervous',
  cardiovascular: 'Cardiovascular',
  lymphatic: 'Lymphatic',
  respiratory: 'Respiratory',
  digestive: 'Digestive',
  urinary: 'Urinary',
  reproductive: 'Reproductive',
}

const openstax = (title: string, slug: string): Source => ({
  title: `OpenStax A&P 2e, ${title}`,
  url: `https://openstax.org/books/anatomy-and-physiology-2e/pages/${slug}`,
})

/** The reference behind the descriptive text for each system. */
export const SYSTEM_SOURCES: Record<SystemId, Source[]> = {
  integumentary: [openstax('5.1 Layers of the Skin', '5-1-layers-of-the-skin')],
  skeletal: [openstax('7.1 Divisions of the Skeletal System', '7-1-divisions-of-the-skeletal-system')],
  muscular: [openstax('10.1 Overview of Muscle Tissues', '10-1-overview-of-muscle-tissues')],
  nervous: [openstax('12.1 Basic Structure and Function of the Nervous System', '12-1-basic-structure-and-function-of-the-nervous-system')],
  cardiovascular: [
    openstax('19.1 Heart Anatomy', '19-1-heart-anatomy'),
    openstax('20.5 Circulatory Pathways', '20-5-circulatory-pathways'),
  ],
  lymphatic: [openstax('21.1 Anatomy of the Lymphatic and Immune Systems', '21-1-anatomy-of-the-lymphatic-and-immune-systems')],
  respiratory: [openstax('22.1 Organs and Structures of the Respiratory System', '22-1-organs-and-structures-of-the-respiratory-system')],
  digestive: [openstax('23.1 Overview of the Digestive System', '23-1-overview-of-the-digestive-system')],
  urinary: [openstax('25.3 Gross Anatomy of the Kidney', '25-3-gross-anatomy-of-the-kidney')],
  reproductive: [
    openstax('27.1 Anatomy and Physiology of the Testicular Reproductive System', '27-1-anatomy-and-physiology-of-the-testicular-reproductive-system'),
    openstax('27.2 Anatomy and Physiology of the Ovarian Reproductive System', '27-2-anatomy-and-physiology-of-the-ovarian-reproductive-system'),
  ],
}

/** Facts shown for every part in a system, on top of the part's own facts. */
const SYSTEM_FACTS: Partial<Record<SystemId, string[]>> = {
  skeletal: ['bones-adult-total'],
  cardiovascular: ['blood-volume-female', 'blood-volume-male', 'blood-share-body-weight', 'hematocrit-female', 'hematocrit-male'],
  respiratory: ['breathing-rate-adolescent-adult'],
}

export interface Part {
  id: string
  name: string
  layer: LayerId
  system: SystemId
  function: string
  connected: SystemId[]
  color: string
  aliases?: string[]
  factIds?: string[]
  requires?: ReproStructure
}

const BONE = '#e8dfc9'
const MUSCLE = '#a8493f'
const ARTERY = '#c8402f'
const VEIN = '#3f6fb5'
const NERVE = '#e2c64d'
const LYMPH = '#7fb58c'

type Spec = Omit<Part, 'layer' | 'system' | 'color'> & Partial<Pick<Part, 'color' | 'system'>>

const group = (layer: LayerId, system: SystemId, color: string, specs: Spec[]): Part[] =>
  specs.map((spec) => ({ layer, system, color, ...spec }))

export const PARTS: Part[] = [
  ...group('skin', 'integumentary', '#c9a184', [
    { id: 'skin', name: 'Skin', function: 'Protects the body, helps regulate temperature and senses touch. It has two main layers, the epidermis and the dermis.', connected: ['nervous', 'cardiovascular'], aliases: ['epidermis', 'dermis'] },
  ]),
  ...group('fat', 'integumentary', '#e3c370', [
    { id: 'subcutaneous-fat', name: 'Subcutaneous fat', function: 'Fat in the hypodermis, the layer beneath the dermis. It stores energy, insulates the body and cushions it.', connected: ['cardiovascular', 'muscular'], aliases: ['hypodermis', 'adipose'] },
  ]),
  ...group('muscle', 'muscular', MUSCLE, [
    { id: 'deltoid', name: 'Deltoid', function: 'Caps the shoulder and raises the arm away from the body.', connected: ['skeletal', 'nervous'], aliases: ['shoulder muscle'] },
    { id: 'pectoralis-major', name: 'Pectoralis major', function: 'Large chest muscle that draws the arm across the body and rotates it inward.', connected: ['skeletal', 'nervous'], aliases: ['pecs', 'chest muscle'] },
    { id: 'rectus-abdominis', name: 'Rectus abdominis', function: 'Flexes the trunk and supports the front of the abdominal wall.', connected: ['skeletal', 'digestive'], aliases: ['abs', 'abdominals'] },
    { id: 'external-oblique', name: 'External oblique', function: 'Rotates and bends the trunk, and compresses the abdomen.', connected: ['skeletal', 'respiratory'], aliases: ['obliques'] },
    { id: 'trapezius', name: 'Trapezius', function: 'Moves and steadies the shoulder blades and helps extend the neck.', connected: ['skeletal', 'nervous'], aliases: ['traps'] },
    { id: 'latissimus-dorsi', name: 'Latissimus dorsi', function: 'Broad back muscle that pulls the arm down and toward the body.', connected: ['skeletal', 'nervous'], aliases: ['lats', 'back muscle'] },
    { id: 'biceps-brachii', name: 'Biceps brachii', function: 'Bends the elbow and turns the palm upward.', connected: ['skeletal', 'nervous'], aliases: ['biceps'] },
    { id: 'triceps-brachii', name: 'Triceps brachii', function: 'Straightens the elbow.', connected: ['skeletal', 'nervous'], aliases: ['triceps'] },
    { id: 'forearm-muscles', name: 'Forearm muscles', function: 'Groups of muscles that move the wrist, hand and fingers.', connected: ['skeletal', 'nervous'], aliases: ['wrist flexors', 'wrist extensors'] },
    { id: 'shoulder-girdle-muscles', name: 'Shoulder girdle muscles', function: 'The rhomboids, levator scapulae, serratus anterior and teres major, which move and steady the shoulder blade and arm.', connected: ['skeletal', 'nervous'], aliases: ['rhomboid', 'serratus anterior', 'teres major'] },
    { id: 'rotator-cuff', name: 'Rotator cuff', function: 'Four muscles that hold the head of the humerus in the shoulder socket and rotate the arm.', connected: ['skeletal', 'nervous'], aliases: ['supraspinatus', 'infraspinatus', 'teres minor', 'subscapularis'] },
    { id: 'hand-muscles', name: 'Hand muscles', function: 'Small muscles within the hand that position the fingers and thumb for fine movement.', connected: ['skeletal', 'nervous'], aliases: ['thenar', 'lumbricals', 'interossei'] },
    { id: 'hip-muscles', name: 'Deep hip muscles', function: 'Muscles including the iliopsoas and gluteus medius that flex, abduct and rotate the hip and steady the pelvis when walking.', connected: ['skeletal', 'nervous'], aliases: ['iliopsoas', 'psoas', 'piriformis', 'gluteus medius', 'gluteus minimus'] },
    { id: 'thigh-adductors', name: 'Thigh adductors', function: 'Muscles of the inner thigh that draw the leg toward the midline.', connected: ['skeletal', 'nervous'], aliases: ['adductor', 'gracilis', 'groin muscle'] },
    { id: 'deep-calf-muscles', name: 'Deep calf muscles', function: 'Muscles beneath the calf that point the foot, flex the toes and support the arch.', connected: ['skeletal', 'nervous'], aliases: ['tibialis posterior', 'popliteus'] },
    { id: 'foot-muscles', name: 'Foot muscles', function: 'Small muscles within the foot that move the toes and support the arches.', connected: ['skeletal', 'nervous'], aliases: ['plantar muscles'] },
    { id: 'chest-wall-muscles', name: 'Chest wall muscles', function: 'Muscles including the intercostals that move the ribs during breathing.', connected: ['respiratory', 'skeletal'], aliases: ['intercostals', 'intercostal muscles'] },
    { id: 'diaphragm', name: 'Diaphragm', function: 'The main muscle of breathing. It separates the chest from the abdomen and flattens as it contracts, drawing air in.', connected: ['respiratory', 'digestive'], aliases: ['breathing muscle'] },
    { id: 'back-muscles', name: 'Deep back muscles', function: 'Muscles along the spine, including the erector spinae, that extend and rotate the back and support posture.', connected: ['skeletal', 'nervous'], aliases: ['erector spinae', 'spinal muscles'] },
    { id: 'neck-muscles', name: 'Neck muscles', function: 'Muscles including the sternocleidomastoid and scalenes that move and support the head and neck.', connected: ['skeletal', 'respiratory'], aliases: ['sternocleidomastoid', 'scalenes'] },
    { id: 'pelvic-floor', name: 'Pelvic floor', function: 'A sling of muscles that supports the pelvic organs and helps control urination and bowel movements.', connected: ['urinary', 'digestive', 'reproductive'], aliases: ['levator ani'] },
    { id: 'gluteus-maximus', name: 'Gluteus maximus', function: 'Extends the hip, as when climbing stairs or rising from a chair.', connected: ['skeletal', 'nervous'], aliases: ['glutes', 'buttock'] },
    { id: 'quadriceps', name: 'Quadriceps femoris', function: 'Group of four thigh muscles that straighten the knee.', connected: ['skeletal', 'nervous'], aliases: ['quads', 'thigh'] },
    { id: 'hamstrings', name: 'Hamstrings', function: 'Muscles at the back of the thigh that bend the knee and extend the hip.', connected: ['skeletal', 'nervous'] },
    { id: 'gastrocnemius', name: 'Gastrocnemius', function: 'Calf muscle that points the foot downward and helps bend the knee.', connected: ['skeletal', 'nervous'], aliases: ['calf'] },
    { id: 'tibialis-anterior', name: 'Tibialis anterior', function: 'Lifts the foot upward at the ankle.', connected: ['skeletal', 'nervous'], aliases: ['shin muscle'] },
  ]),
  ...group('skeleton', 'skeletal', BONE, [
    { id: 'skull', name: 'Skull', function: 'Protects the brain and forms the shape of the face.', connected: ['nervous'], aliases: ['cranium', 'head bone'], factIds: ['bones-axial'] },
    { id: 'mandible', name: 'Mandible', function: 'The lower jaw, and the main movable bone of the skull.', connected: ['digestive', 'muscular'], aliases: ['jaw'] },
    { id: 'vertebral-column', name: 'Vertebral column', function: 'Supports the head and trunk and encloses the spinal cord.', connected: ['nervous', 'muscular'], aliases: ['spine', 'backbone', 'vertebrae'], factIds: ['bones-axial'] },
    { id: 'rib-cage', name: 'Rib cage', function: 'Protects the heart and lungs, and moves during breathing.', connected: ['respiratory', 'cardiovascular'], aliases: ['ribs', 'thoracic cage'], factIds: ['bones-axial'] },
    { id: 'sternum', name: 'Sternum', function: 'The breastbone. It anchors ribs at the front of the chest.', connected: ['respiratory', 'cardiovascular'], aliases: ['breastbone'] },
    { id: 'clavicle', name: 'Clavicle', function: 'The collarbone. It braces the shoulder against the trunk.', connected: ['muscular'], aliases: ['collarbone'], factIds: ['bones-appendicular'] },
    { id: 'scapula', name: 'Scapula', function: 'The shoulder blade. It forms the socket of the shoulder joint.', connected: ['muscular'], aliases: ['shoulder blade'], factIds: ['bones-appendicular'] },
    { id: 'humerus', name: 'Humerus', function: 'The upper arm bone, running from the shoulder to the elbow.', connected: ['muscular'], aliases: ['upper arm bone'], factIds: ['bones-appendicular'] },
    { id: 'radius', name: 'Radius', function: 'Forearm bone on the thumb side. It rotates around the ulna to turn the palm.', connected: ['muscular'], factIds: ['bones-appendicular'] },
    { id: 'ulna', name: 'Ulna', function: 'Forearm bone on the little-finger side. It forms the hinge of the elbow.', connected: ['muscular'], factIds: ['bones-appendicular'] },
    { id: 'hand-bones', name: 'Hand bones', function: 'The carpals, metacarpals and phalanges, which give the wrist and fingers their range of movement.', connected: ['muscular', 'nervous'], aliases: ['carpals', 'metacarpals', 'phalanges', 'fingers'], factIds: ['bones-appendicular'] },
    { id: 'pelvis', name: 'Pelvis', function: 'Transfers body weight to the legs and supports the pelvic organs. Shown with the sacrum.', connected: ['reproductive', 'digestive', 'urinary'], aliases: ['hip bone', 'ilium', 'sacrum'], factIds: ['bones-appendicular'] },
    { id: 'femur', name: 'Femur', function: 'The thigh bone, running from the hip to the knee.', connected: ['muscular'], aliases: ['thigh bone'], factIds: ['bones-appendicular'] },
    { id: 'patella', name: 'Patella', function: 'The kneecap. It protects the knee and gives the quadriceps better leverage.', connected: ['muscular'], aliases: ['kneecap'], factIds: ['bones-appendicular'] },
    { id: 'tibia', name: 'Tibia', function: 'The shin bone, and the main weight-bearing bone of the lower leg.', connected: ['muscular'], aliases: ['shin bone'], factIds: ['bones-appendicular'] },
    { id: 'fibula', name: 'Fibula', function: 'The slender outer bone of the lower leg. It helps stabilise the ankle.', connected: ['muscular'], factIds: ['bones-appendicular'] },
    { id: 'foot-bones', name: 'Foot bones', function: 'The tarsals, metatarsals and phalanges, which support the body and absorb force when walking.', connected: ['muscular', 'nervous'], aliases: ['tarsals', 'metatarsals', 'toes'], factIds: ['bones-appendicular'] },
  ]),
  ...group('organs', 'digestive', '#c9747c', [
    { id: 'brain', name: 'Brain', system: 'nervous', color: '#d6a7a0', function: 'Processes sensory information, controls movement and produces thought, memory and emotion.', connected: ['cardiovascular', 'skeletal'], aliases: ['cerebrum'] },
    { id: 'heart', name: 'Heart', system: 'cardiovascular', color: '#b5342d', function: 'Muscular pump that moves blood through the lungs and the rest of the body.', connected: ['respiratory', 'nervous'], factIds: ['heart-chambers', 'heart-valves', 'heart-rate-rest-adult', 'stroke-volume-rest', 'cardiac-output-rest'] },
    { id: 'lung-left', name: 'Left lung', system: 'respiratory', color: '#d58f91', function: 'Exchanges oxygen and carbon dioxide between air and blood. It is shaped around the heart.', connected: ['cardiovascular', 'muscular'], aliases: ['lungs'] },
    { id: 'lung-right', name: 'Right lung', system: 'respiratory', color: '#d58f91', function: 'Exchanges oxygen and carbon dioxide between air and blood.', connected: ['cardiovascular', 'muscular'], aliases: ['lungs'] },
    { id: 'trachea', name: 'Trachea and bronchi', system: 'respiratory', color: '#d9c9b0', function: 'The airway that carries air between the throat and the lungs.', connected: ['digestive'], aliases: ['windpipe', 'airway'] },
    { id: 'esophagus', name: 'Esophagus', color: '#c28a78', function: 'Muscular tube that moves swallowed food from the throat to the stomach.', connected: ['respiratory', 'muscular'], aliases: ['oesophagus', 'food pipe', 'gullet'] },
    { id: 'stomach', name: 'Stomach', color: '#c98a7a', function: 'Stores food, mixes it with acid and enzymes, and begins protein digestion.', connected: ['cardiovascular', 'nervous'] },
    { id: 'liver', name: 'Liver', color: '#7d3328', function: 'Processes absorbed nutrients, makes bile and filters many substances from the blood.', connected: ['cardiovascular'] },
    { id: 'gallbladder', name: 'Gallbladder', color: '#5e8a4a', function: 'Stores and concentrates bile, then releases it into the small intestine.', connected: ['cardiovascular'] },
    { id: 'pancreas', name: 'Pancreas', color: '#dcb37a', function: 'Releases digestive enzymes into the small intestine, and hormones such as insulin into the blood.', connected: ['cardiovascular'] },
    { id: 'spleen', name: 'Spleen', system: 'lymphatic', color: '#6e2f3f', function: 'Filters the blood, removes old red blood cells and supports immune responses.', connected: ['cardiovascular'] },
    { id: 'small-intestine', name: 'Small intestine', color: '#d49a8a', function: 'Completes most digestion and absorbs most nutrients into the blood and lymph.', connected: ['cardiovascular', 'lymphatic'], aliases: ['duodenum', 'jejunum', 'ileum', 'gut'] },
    { id: 'large-intestine', name: 'Large intestine', color: '#b77c68', function: 'Absorbs water and salts, and forms and stores feces. Shown with the rectum.', connected: ['cardiovascular', 'lymphatic'], aliases: ['colon', 'rectum', 'bowel', 'gut'] },
    { id: 'kidneys', name: 'Kidneys', system: 'urinary', color: '#8a3a30', function: 'Filter the blood, form urine, and help regulate water, salts and blood pressure.', connected: ['cardiovascular'], aliases: ['kidney', 'renal'] },
    { id: 'ureters', name: 'Ureters', system: 'urinary', color: '#d9c07c', function: 'Muscular tubes that carry urine from the kidneys to the bladder.', connected: ['muscular'], aliases: ['ureter'] },
    { id: 'bladder', name: 'Urinary bladder', system: 'urinary', color: '#d3b36a', function: 'Stores urine until it is released.', connected: ['nervous', 'reproductive'], aliases: ['bladder'] },
    { id: 'vagina', name: 'Vagina', system: 'reproductive', color: '#c98a9a', requires: 'uterus', function: 'Muscular canal that connects the uterus to the outside of the body.', connected: ['muscular'], aliases: ['birth canal'] },
    { id: 'uterus', name: 'Uterus', system: 'reproductive', color: '#c76d86', requires: 'uterus', function: 'Muscular organ in which a fetus develops. Its lining is shed during menstruation.', connected: ['cardiovascular'], aliases: ['womb'] },
    { id: 'ovaries', name: 'Ovaries', system: 'reproductive', color: '#dba1ad', requires: 'ovaries', function: 'Produce egg cells and the hormones estrogen and progesterone.', connected: ['cardiovascular'], aliases: ['ovary'] },
    { id: 'testes', name: 'Testes', system: 'reproductive', color: '#d8b2a4', requires: 'testes', function: 'Produce sperm and testosterone.', connected: ['cardiovascular'], aliases: ['testicles', 'testis'] },
    { id: 'prostate', name: 'Prostate', system: 'reproductive', color: '#b98a72', requires: 'prostate', function: 'Gland below the bladder that adds fluid to semen.', connected: ['urinary'], aliases: ['prostate gland'] },
  ]),
  ...group('vessels', 'cardiovascular', ARTERY, [
    { id: 'aorta', name: 'Aorta and iliac arteries', function: 'The largest artery. It carries oxygen-rich blood from the left ventricle to the body.', connected: ['respiratory'], aliases: ['arteries'], factIds: ['cardiac-output-rest'] },
    { id: 'carotid-arteries', name: 'Carotid arteries', function: 'Supply oxygen-rich blood to the head and brain.', connected: ['nervous'], aliases: ['neck artery', 'arteries'] },
    { id: 'arm-arteries', name: 'Subclavian and brachial arteries', function: 'Supply oxygen-rich blood to the arms.', connected: ['muscular'], aliases: ['arm arteries', 'arteries'] },
    { id: 'leg-arteries', name: 'Femoral arteries', function: 'Supply oxygen-rich blood to the legs.', connected: ['muscular'], aliases: ['leg arteries', 'arteries'] },
    { id: 'pulmonary-vessels', name: 'Pulmonary vessels', color: '#7a5aa8', function: 'Carry oxygen-poor blood from the heart to the lungs, and oxygen-rich blood back to the heart.', connected: ['respiratory'], aliases: ['pulmonary artery', 'pulmonary vein', 'pulmonary trunk'] },
    { id: 'coronary-vessels', name: 'Coronary vessels', function: 'Supply the heart muscle itself with blood and drain it away.', connected: ['muscular'], aliases: ['coronary arteries', 'coronary sinus', 'arteries', 'veins'], factIds: ['heart-rate-rest-adult'] },
    { id: 'abdominal-vessels', name: 'Abdominal organ vessels', color: '#a0506a', function: 'Branches that serve the digestive organs, liver, spleen and kidneys, including the hepatic portal vein.', connected: ['digestive', 'urinary'], aliases: ['mesenteric', 'renal artery', 'renal vein', 'portal vein', 'splenic artery'] },
    { id: 'vena-cava', name: 'Venae cavae and iliac veins', color: VEIN, function: 'The largest veins. They return oxygen-poor blood to the right atrium.', connected: ['respiratory'], aliases: ['veins', 'superior vena cava', 'inferior vena cava'] },
    { id: 'jugular-veins', name: 'Jugular veins', color: VEIN, function: 'Drain blood from the head and neck.', connected: ['nervous'], aliases: ['neck vein', 'veins'] },
    { id: 'arm-veins', name: 'Arm veins', color: VEIN, function: 'Return blood from the arms toward the heart.', connected: ['muscular'], aliases: ['brachial veins', 'subclavian veins', 'veins'] },
    { id: 'leg-veins', name: 'Femoral veins', color: VEIN, function: 'Return blood from the legs toward the heart.', connected: ['muscular'], aliases: ['leg veins', 'veins'] },
  ]),
  ...group('nerves', 'nervous', NERVE, [
    { id: 'spinal-cord', name: 'Spinal cord', function: 'Carries signals between the brain and body, and coordinates reflexes.', connected: ['skeletal', 'muscular'], aliases: ['cord'] },
    { id: 'vagus-nerve', name: 'Vagus nerves', function: 'Carry signals between the brain and organs of the chest and abdomen, including the heart and gut.', connected: ['cardiovascular', 'digestive', 'respiratory'], aliases: ['vagus'] },
    { id: 'arm-nerves', name: 'Brachial plexus and arm nerves', function: 'Carry movement and sensory signals for the arms and hands.', connected: ['muscular', 'integumentary'], aliases: ['median nerve', 'brachial plexus'] },
    { id: 'sciatic-nerve', name: 'Sciatic nerves', function: 'The largest nerves in the body. They serve the back of the thigh, the lower leg and the foot.', connected: ['muscular', 'integumentary'], aliases: ['sciatica'] },
    { id: 'femoral-nerve', name: 'Femoral nerves', function: 'Serve the muscles at the front of the thigh, and skin on the thigh and inner leg.', connected: ['muscular', 'integumentary'] },
  ]),
  ...group('lymph', 'lymphatic', LYMPH, [
    { id: 'thoracic-duct', name: 'Thoracic duct', function: 'The largest lymphatic vessel. It returns lymph to the blood near the base of the neck.', connected: ['cardiovascular', 'digestive'], aliases: ['lymph vessel'] },
    { id: 'thymus', name: 'Thymus', function: 'Organ in the upper chest where T cells mature. It is most active early in life.', connected: ['cardiovascular'], aliases: ['t cells'] },
    { id: 'cervical-nodes', name: 'Cervical lymph nodes', function: 'Filter lymph from the head and neck and help start immune responses.', connected: ['cardiovascular'], aliases: ['neck glands', 'lymph nodes'] },
    { id: 'axillary-nodes', name: 'Axillary lymph nodes', function: 'Filter lymph from the arm and chest wall.', connected: ['cardiovascular'], aliases: ['armpit nodes', 'lymph nodes'] },
    { id: 'inguinal-nodes', name: 'Inguinal lymph nodes', function: 'Filter lymph from the leg and lower trunk.', connected: ['cardiovascular'], aliases: ['groin nodes', 'lymph nodes'] },
  ]),
]

const partById = new Map(PARTS.map((part) => [part.id, part]))

export function getPart(id: string): Part | undefined {
  return partById.get(id)
}

export function partsForProfile(profile: SexProfile): Part[] {
  return PARTS.filter((part) => !part.requires || profile.structures.includes(part.requires))
}

export function searchParts(query: string, parts: Part[], limit = 8): Part[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const score = (part: Part): number => {
    const name = part.name.toLowerCase()
    if (name === q) return 0
    if (name.startsWith(q)) return 1
    if (name.includes(q)) return 2
    if (part.aliases?.some((alias) => alias.toLowerCase().startsWith(q))) return 3
    if (part.aliases?.some((alias) => alias.toLowerCase().includes(q))) return 4
    if (SYSTEM_NAMES[part.system].toLowerCase().startsWith(q)) return 5
    return Infinity
  }
  return parts
    .map((part) => ({ part, rank: score(part) }))
    .filter(({ rank }) => rank !== Infinity)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ part }) => part)
}

export interface PartFacts {
  facts: PhysiologyEntry[]
  /** True when both female and male ranges appear because no range is reported for this profile. */
  showsBothSexes: boolean
}

export function factsForPart(part: Part, profile: SexProfile): PartFacts {
  const ids = [...new Set([...(part.factIds ?? []), ...(SYSTEM_FACTS[part.system] ?? [])])]
  const all = ids.map(getFact)
  const facts = all.filter((fact) => fact.sex === 'all' || profile.referenceSex === null || fact.sex === profile.referenceSex)
  return { facts, showsBothSexes: profile.referenceSex === null && facts.some((fact) => fact.sex !== 'all') }
}
