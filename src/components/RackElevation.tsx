import { useEffect, useRef } from "react";
import { equipmentFaceUrl } from "../equipment-faces";
import { placementError } from "../model";
import type { Equipment, Rack } from "../types";

const ROW = 15;

export function RackElevation({
  rack,
  selectedId,
  draft,
  draftInvalid,
  onPickU,
  onPickEquipment,
}: {
  rack: Rack;
  selectedId: string | null;
  draft: { positionU: number; heightU: number } | null;
  draftInvalid: boolean;
  onPickU: (u: number) => void;
  onPickEquipment: (id: string) => void;
}) {
  const height = rack.heightU * ROW;
  return (
    <div className="elev" style={{ height: height + 12 }}>
      <div style={{ position: "relative", height }}>
        {Array.from({ length: rack.heightU }, (_, index) => {
          const u = rack.heightU - index;
          return (
            <button key={u} type="button" className="slot" style={{ top: index * ROW, height: ROW }} onClick={() => onPickU(u)}>
              <span>U{u}</span>
            </button>
          );
        })}
        {draft && draft.positionU >= 1 ? (
          <div
            className="ghost-block"
            style={{
              top: (rack.heightU - (draft.positionU + Math.max(draft.heightU, 1) - 1)) * ROW + 1,
              height: Math.max(ROW - 2, Math.max(draft.heightU, 1) * ROW - 2),
              background: draftInvalid ? "rgba(240, 113, 120, 0.35)" : "rgba(61, 222, 160, 0.28)",
            }}
          />
        ) : null}
        {rack.equipment.map((eq) => (
          <EquipmentBlock key={eq.id} rack={rack} eq={eq} active={selectedId === eq.id} onPick={onPickEquipment} />
        ))}
      </div>
    </div>
  );
}

function EquipmentBlock({
  rack,
  eq,
  active,
  onPick,
}: {
  rack: Rack;
  eq: Equipment;
  active: boolean;
  onPick: (id: string) => void;
}) {
  const topU = eq.positionU + eq.heightU - 1;
  const face = equipmentFaceUrl(eq);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      className={`eq-block ${active ? "active" : ""}`}
      style={{
        top: (rack.heightU - topU) * ROW + 1,
        height: eq.heightU * ROW - 2,
        backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.12) 46%, rgba(0,0,0,.2)), url("${face}")`,
        backgroundSize: "100% 100%",
        color: "#f4f7fb",
        boxShadow: `inset 3px 0 0 ${eq.status === "ok" ? "transparent" : eq.status === "warning" ? "#8a6a10" : eq.status === "critical" ? "#8d1d28" : "#245968"}`,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onPick(eq.id);
      }}
    >
      <span>{eq.name}</span>
    </button>
  );
}

export function draftLooksInvalid(rack: Rack, draft: { positionU: number; heightU: number } | null, ignoreId?: string) {
  if (!draft) return false;
  return placementError(rack, draft.positionU, draft.heightU, ignoreId) !== null;
}
