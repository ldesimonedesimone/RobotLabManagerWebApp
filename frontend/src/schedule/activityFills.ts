function hexToRgb(hx: string): [number, number, number] {
  const s = hx.replace(/^#/, '').padStart(6, '0').slice(-6)
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ]
}

function colorDistance(a: string, b: string): number {
  const [ra, ga, ba] = hexToRgb(a)
  const [rb, gb, bb] = hexToRgb(b)
  return Math.sqrt((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2)
}

function perturbHex(hx: string, delta: number): string {
  const s = hx.replace(/^#/, '').padStart(6, '0').slice(-6)
  let n = parseInt(s, 16)
  n = (n + delta) & 0xffffff
  return `#${n.toString(16).padStart(6, '0')}`
}

const FALLBACK_SWATCHES = [
  '#4285F4',
  '#EA4335',
  '#FBBC04',
  '#34A853',
  '#8E24AA',
  '#FF6D01',
  '#00897B',
  '#5E35B1',
  '#FFA726',
  '#3949AB',
  '#D81B60',
  '#1B5E20',
  '#000000',
  '#546E7A',
]

export function ensureDistinctLabelFills(
  byLabel: Record<string, string>,
): Record<string, string> {
  const out = { ...byLabel }
  const inv = new Map<string, string[]>()
  for (const [lab, hx] of Object.entries(out)) {
    const list = inv.get(hx) ?? []
    list.push(lab)
    inv.set(hx, list)
  }
  for (const [, labs] of inv) {
    if (labs.length <= 1) continue
    const base = out[labs[0]]
    for (let j = 1; j < labs.length; j++) {
      const lab = labs[j]
      out[lab] = perturbHex(base, j * 0x152428)
    }
  }
  const keys = Object.keys(out)
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const la = keys[i]
      const lb = keys[j]
      if (colorDistance(out[la], out[lb]) < 40) {
        out[lb] = perturbHex(out[lb], 0x221f1a)
      }
    }
  }
  return out
}

export function buildActivityFillMap(labels: string[]): Record<string, string> {
  const byLabel: Record<string, string> = {}
  labels.forEach((lab, i) => {
    byLabel[lab] = FALLBACK_SWATCHES[i % FALLBACK_SWATCHES.length]
  })
  return ensureDistinctLabelFills(byLabel)
}

export function fillForLabel(
  label: string,
  m: Record<string, string>,
): string {
  if (label in m) return m[label]
  const ll = label.toLowerCase()
  for (const [k, v] of Object.entries(m)) {
    if (k.toLowerCase() === ll) return v
  }
  return '#FFFFFF'
}
