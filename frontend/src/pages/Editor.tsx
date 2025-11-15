import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Stage, Layer, Rect, Text } from "react-konva";
import { listThumbnails } from "../lib/api";

export default function Editor() {
  const { videoId = "", variantId = "" } = useParams();
  const nav = useNavigate();
  const [thumb, setThumb] = useState<any>(null);
  const [preset, setPreset] = useState<string>("SEO");
  const [overlayText, setOverlayText] = useState<string>("");
  const stageRef = useRef<any>(null);
  const size = useMemo(() => ({ w: 1280, h: 720 }), []);

  useEffect(() => {
    async function load() {
      const list = await listThumbnails(videoId);
      const found = (list.variants || []).find(
        (t: any) => t.variantId === variantId
      );
      setThumb(found || null);
    }
    load();
  }, [videoId, variantId]);

  useEffect(() => {
    if (preset === "SEO") setOverlayText("Top Tips Inside");
    else if (preset === "Hook") setOverlayText("Watch Now");
    else setOverlayText("In This Video");
  }, [preset]);

  function onSave() {
    const uri = stageRef.current.toDataURL({ pixelRatio: 1 });
    localStorage.setItem(`edited:${videoId}`, uri);
    nav(`/publish/${videoId}`);
  }

  return (
    <div className="panel">
      <div className="panel__section">
        <div className="row">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="SEO">SEO</option>
            <option value="Hook">Hook</option>
            <option value="Friendly">Friendly</option>
          </select>
          <input
            value={overlayText}
            onChange={(e) => setOverlayText(e.target.value)}
            placeholder="Overlay text"
          />
          <button className="btn" onClick={onSave}>
            Save and Continue
          </button>
        </div>
      </div>
      <div className="panel__section">
        <Stage width={size.w} height={size.h} ref={stageRef} className="stage">
          <Layer>
            <Rect x={0} y={0} width={size.w} height={size.h} fill="#222" />
            <Text text={overlayText} x={40} y={40} fontSize={64} fill="#fff" />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
