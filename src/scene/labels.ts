/** A part that could be labelled, at its position on screen in pixels. */
export interface LabelCandidate {
  id: string
  name: string
  x: number
  y: number
  /** The part's size. Larger parts are labelled first, and smaller ones appear as there is room for them. */
  radius: number
}

export interface PlacedLabel {
  id: string
  name: string
  x: number
  y: number
  /** Which side of its anchor point the text sits on. */
  side: 'left' | 'right'
}

const LABEL_HEIGHT = 20
const GAP_FROM_ANCHOR = 8
const CHARACTER_WIDTH = 6.6
const PADDING = 16

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/** Chooses which labels fit on screen without covering each other. It uses an estimated width, so that it never reads the page. */
export function pickLabels(candidates: LabelCandidate[], width: number, height: number): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const boxes: Box[] = []
  const inOrder = [...candidates].sort((a, b) => b.radius - a.radius || a.id.localeCompare(b.id))

  for (const { id, name, x, y } of inOrder) {
    if (x < 0 || x > width || y < 0 || y > height) continue
    const textWidth = name.length * CHARACTER_WIDTH + PADDING
    const top = y - LABEL_HEIGHT / 2
    const bottom = y + LABEL_HEIGHT / 2
    if (top < 0 || bottom > height) continue
    const right: Box = { left: x, right: x + GAP_FROM_ANCHOR + textWidth, top, bottom }
    const left: Box = { left: x - GAP_FROM_ANCHOR - textWidth, right: x, top, bottom }
    const fits = (box: Box) => box.left >= 0 && box.right <= width && !boxes.some((other) => overlaps(box, other))
    const box = fits(right) ? right : fits(left) ? left : null
    if (!box) continue
    boxes.push(box)
    placed.push({ id, name, x, y, side: box === right ? 'right' : 'left' })
  }
  return placed
}
