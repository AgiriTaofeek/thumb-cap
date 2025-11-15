import { words } from "./strings.js"

export function scoreCaption(text: string, keywords?: string[]) {
  const w = words(text)
  const k = (keywords || []).map((x) => String(x).toLowerCase())
  const count = w.length || 1
  const kd = k.length ? w.filter((x) => k.includes(x)).length / count : 0
  const readability = Math.min(1, Math.max(0, 1 - Math.abs(14 - count) / 20))
  const engagement = Math.min(
    1,
    w.filter((x) =>
      [
        "best",
        "pro",
        "ultimate",
        "free",
        "secret",
        "how",
        "wow",
        "amazing",
      ].includes(x)
    ).length / 5
  )
  return {
    seoScore: Math.round(kd * 100),
    engagementScore: Math.round(((readability + engagement) / 2) * 100),
  }
}

export function scoreThumbnail(style: string, title: string, keywords: string[]) {
  const base = 0.5
  const kw = (keywords || []).map((x) => String(x).toLowerCase())
  const t = words(title)
  const match = kw.length ? t.filter((x) => kw.includes(x)).length : 0
  const styleBoost =
    style === "preset-1"
      ? 0.1
      : style === "preset-2"
      ? 0.12
      : style === "preset-3"
      ? 0.08
      : 0.06
  const score = Math.min(1, base + styleBoost + Math.min(0.2, match * 0.03))
  return Math.round(score * 100)
}

