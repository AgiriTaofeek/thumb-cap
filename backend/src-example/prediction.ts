const enabled = String(process.env.VERTEX_ENABLED || '').toLowerCase() === 'true'
const endpointUrl = process.env.VERTEX_PREDICTION_URL || null
const fetchRef: any = (globalThis as any).fetch
export { enabled }
export function heuristicCTR({ style, titleTokens = [], faces = 0, colors = [] }: { style: string; titleTokens?: string[]; faces?: number; colors?: string[] }) {
  const base = 0.5
  const styleBoost = style === 'preset-2' ? 0.12 : style === 'preset-1' ? 0.1 : style === 'preset-3' ? 0.08 : 0.06
  const kwBoost = Math.min(0.2, (titleTokens || []).length * 0.01)
  const faceBoost = Math.min(0.15, (faces || 0) * 0.05)
  const score = Math.min(1, base + styleBoost + kwBoost + faceBoost)
  return Math.round(score * 100)
}
export async function predictCTR(features: any): Promise<number> {
  if (!enabled || !endpointUrl || !fetchRef) return heuristicCTR(features)
  try {
    const resp = await fetchRef(endpointUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [features] }) })
    if (!resp.ok) return heuristicCTR(features)
    const json = await resp.json()
    const val = Number((((json.predictions && json.predictions[0]) || json[0] || 0) || 0))
    if (Number.isFinite(val)) return Math.max(0, Math.min(100, Math.round(val)))
    return heuristicCTR(features)
  } catch {
    return heuristicCTR(features)
  }
}

