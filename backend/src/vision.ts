const enabled = String(process.env.VISION_ENABLED || '').toLowerCase() === 'true'
let client: any = null
try {
  if (enabled) {
    const vision = require('@google-cloud/vision')
    client = new vision.ImageAnnotatorClient()
  }
} catch {}
export { enabled }
export async function analyzeUri(uri: string): Promise<any> {
  if (!enabled || !client || !uri || !/^gs:\/\//.test(uri)) {
    return { faces: 0, dominantColors: ['#cccccc', '#666666'], safeSearch: { adult: 'UNLIKELY', violence: 'UNLIKELY', racy: 'UNLIKELY' } }
  }
  const [res] = await client.annotateImage({ image: { source: { imageUri: uri } }, features: [{ type: 'FACE_DETECTION' }, { type: 'IMAGE_PROPERTIES' }, { type: 'SAFE_SEARCH_DETECTION' }] })
  const faces = (res.faceAnnotations || []).length || 0
  const colors = ((res.imagePropertiesAnnotation && res.imagePropertiesAnnotation.dominantColors && res.imagePropertiesAnnotation.dominantColors.colors) || [])
    .slice(0, 3)
    .map((c: any) => {
      const rgb = c.color || {}
      const r = Math.max(0, Math.min(255, rgb.red || 0))
      const g = Math.max(0, Math.min(255, rgb.green || 0))
      const b = Math.max(0, Math.min(255, rgb.blue || 0))
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    })
  const ss = res.safeSearchAnnotation || {}
  const safeSearch = { adult: String(ss.adult || 'UNKNOWN'), violence: String(ss.violence || 'UNKNOWN'), racy: String(ss.racy || 'UNKNOWN') }
  return { faces, dominantColors: colors, safeSearch }
}

