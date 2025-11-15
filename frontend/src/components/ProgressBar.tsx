import React from "react"

export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress">
      <div className="progress__bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

