import React from "react"

export default function CaptionCard({ variant, selected, onSelect }: { variant: any; selected?: boolean; onSelect?: (v: any) => void }) {
  return (
    <div className={"card" + (selected ? " card--selected" : "")} onClick={() => onSelect && onSelect(variant)}>
      <div className="card__title">{variant.type}</div>
      <div className="card__meta">SEO: {variant.seoScore != null ? Number(variant.seoScore).toFixed(2) : "N/A"}</div>
      <div className="card__meta">Engagement: {variant.engagementScore != null ? Number(variant.engagementScore).toFixed(2) : "N/A"}</div>
      <div className="card__text">{variant.text}</div>
    </div>
  )
}

