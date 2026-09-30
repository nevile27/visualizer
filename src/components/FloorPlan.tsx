import { useEffect, useMemo, useRef, useState } from "react";
import { svgElementToPng } from "../download";
import { maxPosition, positionDirection, safeFileName, sideLabel, slotFromLeft, statusMeta, summarize, usedU, worstStatus, formatKwFromW } from "../model";
import { useCanEdit } from "../auth-context";
import { useStore } from "../store";
import type { AisleItem, DataCenter, PositionDirection, Side } from "../types";

const SLOT_W = 88;
const SLOT_GAP = 12;
const ROW_D = 60;
const COLD = 50;
const HOT = 36;
const GUTTER = 118;
const PAD = 40;

function slotX(position: number, slots: number, direction: PositionDirection) {
  return GUTTER + slotFromLeft(position, slots, direction) * (SLOT_W + SLOT_GAP);
}

function planSize(dc: DataCenter) {
  const slots = maxPosition(dc);
  const blockH = ROW_D + COLD + ROW_D;
  const width = GUTTER + slots * (SLOT_W + SLOT_GAP) + PAD;
  const height = PAD + Math.max(dc.aisles.length, 1) * blockH + Math.max(0, dc.aisles.length - 1) * HOT + PAD;
  return { slots, blockH, width, height };
}

function fit(viewW: number, viewH: number, width: number, height: number) {
  const k = Math.min(viewW / width, viewH / height) * 0.92;
  return {
    k: Math.max(0.2, k),
    x: (viewW - width * k) / 2,
    y: (viewH - height * k) / 2,
  };
}

export function FloorPlan() {
  const edit = useCanEdit();
  const { activeDc, selection, select, patchDc } = useStore();
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [frame, setFrame] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [cam, setCam] = useState({ x: 24, y: 24, k: 0.9 });
  const camRef = useRef(cam);
  camRef.current = cam;
  const drag = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);

  const layout = useMemo(() => (activeDc ? planSize(activeDc) : null), [activeDc]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !layout) return;
    setCam(fit(el.clientWidth, el.clientHeight, layout.width, layout.height));
  }, [layout, frame]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      setCam((current) => {
        const k = Math.min(3.2, Math.max(0.2, current.k * factor));
        const wx = (mx - current.x) / current.k;
        const wy = (my - current.y) / current.k;
        return { k, x: mx - wx * k, y: my - wy * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (!activeDc || !layout) return <div className="empty-view">Choisissez ou créez un centre.</div>;

  const stats = summarize(activeDc);
  const selectedId = selection && selection.kind !== "aisle" ? selection.itemId : null;

  return (
    <div className="stage-fill">
      <div
        className="plan-viewport"
        ref={viewportRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as Element;
          if (target.closest("[data-item]")) return;
          moved.current = false;
          drag.current = { px: event.clientX, py: event.clientY, cx: camRef.current.x, cy: camRef.current.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const dx = event.clientX - current.px;
          const dy = event.clientY - current.py;
          if (Math.hypot(dx, dy) > 3) moved.current = true;
          setCam({ k: camRef.current.k, x: current.cx + dx, y: current.cy + dy });
        }}
        onPointerUp={() => { drag.current = null; }}
        onClick={() => {
          if (!moved.current) select(null);
        }}
      >
        <div className="plan-shift" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, transformOrigin: "0 0" }}>
          <svg
            ref={svgRef}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Plan de ${activeDc.name}`}
          >
            <rect width={layout.width} height={layout.height} fill="var(--stage)" />
            {Array.from({ length: layout.slots }, (_, index) => {
              const direction = positionDirection(activeDc);
              const position = direction === "ltr" ? index + 1 : layout.slots - index;
              return (
                <text key={index} x={GUTTER + index * (SLOT_W + SLOT_GAP) + SLOT_W / 2} y={24} textAnchor="middle" fill="var(--plan-index)" fontSize={12} fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
                  {position}
                </text>
              );
            })}
            {activeDc.aisles.map((aisle, aisleIndex) => {
              const top = PAD + aisleIndex * (layout.blockH + HOT);
              return (
                <g key={aisle.id}>
                  <text x={16} y={top + layout.blockH / 2} fill="var(--plan-aisle)" fontSize={14} fontFamily="IBM Plex Sans, Segoe UI, sans-serif" dominantBaseline="middle">
                    {aisle.name}
                  </text>
                  <rect x={GUTTER} y={top + ROW_D} width={layout.width - GUTTER - 16} height={COLD} fill="var(--cold-bg)" />
                  <text x={GUTTER + 10} y={top + ROW_D + COLD / 2} fill="var(--cold-text)" fontSize={11} dominantBaseline="middle" fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
                    allée froide
                  </text>
                  {aisleIndex < activeDc.aisles.length - 1 ? (
                    <g>
                      <rect x={GUTTER} y={top + layout.blockH} width={layout.width - GUTTER - 16} height={HOT} fill="var(--hot-bg)" />
                      <text x={GUTTER + 10} y={top + layout.blockH + HOT / 2} fill="var(--hot-text)" fontSize={11} dominantBaseline="middle" fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
                        couloir chaud
                      </text>
                    </g>
                  ) : null}
                  {(["left", "right"] as Side[]).map((side) => {
                    const y = side === "left" ? top : top + ROW_D + COLD;
                    return (
                      <text key={side} x={GUTTER - 10} y={y + ROW_D / 2} textAnchor="end" fill="var(--plan-index)" fontSize={11} dominantBaseline="middle" fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
                        {sideLabel(side)}
                      </text>
                    );
                  })}
                  {aisle.items.map((item) => (
                    <PlanItem
                      key={item.id}
                      item={item}
                      slots={layout.slots}
                      direction={positionDirection(activeDc)}
                      y={item.side === "left" ? top : top + ROW_D + COLD}
                      selected={selectedId === item.id}
                      hovered={hoverId === item.id}
                      onHover={setHoverId}
                      onSelect={() => select({ kind: "item", aisleId: aisle.id, itemId: item.id })}
                    />
                  ))}
                </g>
              );
            })}
            {!activeDc.aisles.length ? (
              <text x={layout.width / 2} y={layout.height / 2} textAnchor="middle" fill="var(--plan-sub)" fontSize={16} fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
                Aucune allée
              </text>
            ) : null}
          </svg>
        </div>
      </div>
      <div className="stage-top">
        <div className="stats">
          <span>{stats.aisles} allées</span>
          <span>{stats.racks} racks</span>
          <span>{stats.cooling} refroidissements</span>
          <span>{stats.equipment} équipements</span>
          <span>{formatKwFromW(stats.powerW)} IT</span>
          <span>{stats.capacityKw.toLocaleString("fr-FR")} kW froid</span>
        </div>
      </div>
      <div className="stage-bottom">
        <p>Molette pour zoomer, glisser pour déplacer. Le vert est l’allée froide.</p>
        <div className="legend">
          <span><i style={{ background: "#8aa0b8" }} />Rack</span>
          <span><i style={{ background: "#7fd4ee" }} />Refroidissement</span>
        </div>
        {edit ? (
          <button
            type="button"
            onClick={() => patchDc({ positionDirection: positionDirection(activeDc) === "ltr" ? "rtl" : "ltr" })}
          >
            {positionDirection(activeDc) === "ltr" ? "Positions : gauche → droite" : "Positions : droite → gauche"}
          </button>
        ) : null}
        <button type="button" onClick={() => setFrame((value) => value + 1)}>Recadrer</button>
        <button
          type="button"
          onClick={() => {
            if (svgRef.current) void svgElementToPng(svgRef.current, `${safeFileName(activeDc.name)}-plan.png`);
          }}
        >
          Image
        </button>
      </div>
    </div>
  );
}

function PlanItem({
  item,
  slots,
  direction,
  y,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  item: AisleItem;
  slots: number;
  direction: PositionDirection;
  y: number;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
}) {
  const x = slotX(item.position, slots, direction);
  const cooling = item.kind === "cooling";
  const status = cooling ? item.status : worstStatus(item.equipment.map((eq) => eq.status));
  const ratio = item.kind === "rack" && item.heightU > 0 ? Math.min(1, usedU(item) / item.heightU) : 0;
  return (
    <g
      data-item="true"
      onPointerEnter={() => onHover(item.id)}
      onPointerLeave={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <rect x={x} y={y} width={SLOT_W} height={ROW_D} rx={5} fill={cooling ? "var(--cool-fill)" : "var(--rack-fill)"} stroke={selected ? "var(--accent)" : hovered ? "var(--rack-hover)" : "var(--rack-stroke)"} strokeWidth={selected ? 2.5 : 1} />
      <clipPath id={`clip-${item.id}`}>
        <rect x={x + 4} y={y + 4} width={SLOT_W - 8} height={ROW_D - 8} />
      </clipPath>
      {cooling ? Array.from({ length: 4 }, (_, index) => (
        <line key={index} x1={x + 8} x2={x + SLOT_W - 8} y1={y + 14 + index * 8} y2={y + 14 + index * 8} stroke="var(--cool)" strokeOpacity={0.28} />
      )) : null}
      <text x={x + SLOT_W / 2} y={y + 24} textAnchor="middle" fill="var(--plan-name)" fontSize={12} fontFamily="IBM Plex Sans, Segoe UI, sans-serif" clipPath={`url(#clip-${item.id})`}>
        {item.name}
      </text>
      <text x={x + SLOT_W / 2} y={y + 40} textAnchor="middle" fill="var(--plan-sub)" fontSize={10} fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
        {item.kind === "rack" ? `${usedU(item)}/${item.heightU} U` : `${item.capacityKw} kW`}
      </text>
      {item.kind === "rack" ? (
        <>
          <rect x={x + 8} y={y + ROW_D - 8} width={SLOT_W - 16} height={3} rx={1} fill="var(--meter-track)" />
          <rect x={x + 8} y={y + ROW_D - 8} width={(SLOT_W - 16) * ratio} height={3} rx={1} fill="var(--accent)" />
        </>
      ) : null}
      <line
        x1={x + 2}
        x2={x + SLOT_W - 2}
        y1={item.side === "left" ? y + ROW_D : y + 1}
        y2={item.side === "left" ? y + ROW_D : y + 1}
        stroke={cooling ? "var(--cool)" : "var(--rack-hover)"}
        strokeWidth={2}
      />
      {status ? <circle cx={x + SLOT_W - 9} cy={y + 9} r={3.5} fill={statusMeta(status).color} /> : null}
      <title>{item.name}</title>
    </g>
  );
}
