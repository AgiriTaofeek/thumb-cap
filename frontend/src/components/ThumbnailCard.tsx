import React from "react"

export default function ThumbnailCard({ variant, selected, onSelect }: { variant: any; selected?: boolean; onSelect?: (v: any) => void }) {
  return (
    <div className={"card" + (selected ? " card--selected" : "")} onClick={() => onSelect && onSelect(variant)}>
      <div className="card__title">{variant.style || "custom"}</div>
      <div className="card__meta">CTR: {variant.ctrScore != null ? Number(variant.ctrScore).toFixed(2) : "N/A"}</div>
      <div className="card__meta">Variant: {variant.variantId}</div>
    </div>
  )
}

