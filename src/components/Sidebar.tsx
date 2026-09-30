import { useMemo, useState } from "react";
import { sideItems, sideLabel } from "../model";
import { useStore } from "../store";
import type { AisleItem } from "../types";

function itemMatches(item: AisleItem, query: string) {
  if (!query) return true;
  const extra = item.kind === "rack"
    ? item.equipment.map((eq) => `${eq.name} ${eq.manufacturer} ${eq.model} ${eq.assetTag} ${eq.serial}`).join(" ")
    : item.coolingType;
  return `${item.name} ${extra}`.toLowerCase().includes(query);
}

export function Sidebar() {
  const { activeDc, selection, select } = useStore();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const needle = query.trim().toLowerCase();

  const aisles = useMemo(() => {
    if (!activeDc) return [];
    return activeDc.aisles
      .map((aisle) => ({ aisle, items: aisle.items.filter((item) => itemMatches(item, needle)) }))
      .filter((entry) => !needle || entry.items.length > 0 || entry.aisle.name.toLowerCase().includes(needle));
  }, [activeDc, needle]);

  if (!activeDc) {
    return (
      <aside className="sidebar">
        <div className="empty-note">Aucun centre chargé.</div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="side-head">
        <button type="button" className={`centre-btn ${selection ? "" : "active"}`} onClick={() => select(null)}>
          {activeDc.name}
          {activeDc.location ? <em className="muted">{activeDc.location}</em> : null}
        </button>
        <input
          className="search"
          value={query}
          placeholder="Rack, équipement, modèle…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="tree">
        {aisles.map(({ aisle, items }) => {
          const open = needle ? true : !collapsed[aisle.id];
          const aisleActive = selection?.kind === "aisle" && selection.aisleId === aisle.id;
          return (
            <section className="aisle" key={aisle.id}>
              <button
                type="button"
                className={`aisle-btn ${aisleActive ? "active" : ""}`}
                onClick={() => select({ kind: "aisle", aisleId: aisle.id })}
              >
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    setCollapsed((current) => ({ ...current, [aisle.id]: !current[aisle.id] }));
                  }}
                >
                  {open ? "▾" : "▸"}
                </span>
                {aisle.name}
              </button>
              {open ? (["left", "right"] as const).map((side) => {
                const row = sideItems({ ...aisle, items }, side);
                if (!row.length && needle) return null;
                return (
                  <div key={side}>
                    <div className="side-label">{sideLabel(side)}</div>
                    {row.map((item) => {
                      const active = selection?.kind !== "aisle" && selection?.itemId === item.id;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`item-btn ${active ? "active" : ""}`}
                          onClick={() => select({ kind: "item", aisleId: aisle.id, itemId: item.id })}
                        >
                          <i className={`swatch ${item.kind === "rack" ? "rack" : "cool"}`} />
                          <span>{item.name}</span>
                          <em>P{item.position}</em>
                        </button>
                      );
                    })}
                    {!row.length ? <div className="side-label">Vide</div> : null}
                  </div>
                );
              }) : null}
            </section>
          );
        })}
        {!aisles.length ? <p className="hint">Aucun résultat.</p> : null}
      </div>
    </aside>
  );
}
