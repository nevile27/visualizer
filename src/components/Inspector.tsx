import { useEffect, useState } from "react";
import {
  COOLING_TYPES,
  SIDES,
  STATUSES,
  coolingLabel,
  formatKwFromW,
  nextFreeU,
  rackPowerW,
  positionDirection,
  sideLabel,
  slotError,
  statusMeta,
  suggestCoolingName,
  suggestRackName,
  summarize,
  uRange,
  usedU,
  typeMeta,
} from "../model";
import { useCanEdit } from "../auth-context";
import { useStore } from "../store";
import type { Aisle, CoolingType, CoolingUnit, EquipmentStatus, PositionDirection, Rack, Side } from "../types";
import { EquipmentForm } from "./EquipmentForm";
import { ConfirmButton, Field, NumberInput, SelectInput, TextInput } from "./fields";
import { RackElevation, draftLooksInvalid } from "./RackElevation";

export function Inspector() {
  const { activeDc, selection } = useStore();
  if (!activeDc) return <aside className="inspector"><div className="empty-note">Aucun centre.</div></aside>;
  if (!selection) return <aside className="inspector"><div className="inspector-scroll"><DcPanel /></div></aside>;
  if (selection.kind === "aisle") {
    const aisle = activeDc.aisles.find((entry) => entry.id === selection.aisleId);
    if (!aisle) return <aside className="inspector"><div className="inspector-scroll"><DcPanel /></div></aside>;
    return <aside className="inspector"><div className="inspector-scroll"><AislePanel key={aisle.id} aisle={aisle} /></div></aside>;
  }
  const aisle = activeDc.aisles.find((entry) => entry.id === selection.aisleId);
  const item = aisle?.items.find((entry) => entry.id === selection.itemId);
  if (!aisle || !item) return <aside className="inspector"><div className="inspector-scroll"><DcPanel /></div></aside>;
  if (item.kind === "cooling") {
    return <aside className="inspector"><div className="inspector-scroll"><CoolingPanel key={item.id} aisle={aisle} item={item} /></div></aside>;
  }
  return (
    <aside className="inspector">
      <RackPanel key={item.id} aisle={aisle} rack={item} />
    </aside>
  );
}

function DcPanel() {
  const edit = useCanEdit();
  const { activeDc, patchDc, removeDc, addAisle } = useStore();
  const [name, setName] = useState("");
  if (!activeDc) return null;
  const stats = summarize(activeDc);
  const letter = activeDc.aisles.length < 26 ? String.fromCharCode(65 + activeDc.aisles.length) : String(activeDc.aisles.length + 1);
  return (
    <>
      <div>
        <p className="kicker">Centre de données</p>
        <div className="panel-title"><h2>{activeDc.name}</h2></div>
      </div>
      <div className="metrics">
        <div className="metric"><b>{stats.aisles}</b><span>Allées</span></div>
        <div className="metric"><b>{stats.racks}</b><span>Racks</span></div>
        <div className="metric"><b>{stats.cooling}</b><span>Froid</span></div>
        <div className="metric"><b>{stats.equipment}</b><span>Équipements</span></div>
        <div className="metric"><b>{formatKwFromW(stats.powerW)}</b><span>Charge IT</span></div>
        <div className="metric"><b>{stats.capacityKw.toLocaleString("fr-FR")} kW</b><span>Froid installé</span></div>
      </div>
      <div className="form-grid">
        <Field label="Nom" className="span-2">
          <TextInput disabled={!edit} value={activeDc.name} onChange={(value) => patchDc({ name: value })} />
        </Field>
        <Field label="Site" className="span-2">
          <TextInput disabled={!edit} value={activeDc.location} onChange={(value) => patchDc({ location: value })} />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea disabled={!edit} value={activeDc.notes} onChange={(event) => patchDc({ notes: event.target.value })} />
        </Field>
        <Field label="Sens des positions" hint="La position 1 est à gauche, ou à droite du plan." className="span-2">
          <SelectInput
            disabled={!edit}
            value={positionDirection(activeDc)}
            onChange={(event) => patchDc({ positionDirection: event.target.value as PositionDirection })}
          >
            <option value="ltr">Gauche → droite</option>
            <option value="rtl">Droite → gauche</option>
          </SelectInput>
        </Field>
      </div>
      {edit ? <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          addAisle(name || `Allée ${letter}`);
          setName("");
        }}
      >
        <Field label="Nouvelle allée" className="span-2">
          <TextInput value={name} onChange={setName} placeholder={`Allée ${letter}`} />
        </Field>
        <div className="row-actions span-2">
          <button type="submit" className="primary">Ajouter l'allée</button>
        </div>
      </form> : null}
      {edit ? <ConfirmButton label={`Supprimer le centre ${activeDc.name}`} confirmLabel="Supprimer le centre" onConfirm={removeDc} /> : null}
    </>
  );
}

function AislePanel({ aisle }: { aisle: Aisle }) {
  const edit = useCanEdit();
  const { renameAisle, removeAisle } = useStore();
  const [mode, setMode] = useState<"rack" | "cooling" | null>(null);
  const racks = aisle.items.filter((item) => item.kind === "rack").length;
  const cooling = aisle.items.filter((item) => item.kind === "cooling").length;
  return (
    <>
      <div>
        <p className="kicker">Allée</p>
        <div className="panel-title"><h2>{aisle.name}</h2></div>
      </div>
      <div className="metrics">
        <div className="metric"><b>{racks}</b><span>Racks</span></div>
        <div className="metric"><b>{cooling}</b><span>Froid</span></div>
        <div className="metric"><b>{aisle.items.length}</b><span>Emplacements</span></div>
      </div>
      <Field label="Nom">
        <TextInput disabled={!edit} value={aisle.name} onChange={(value) => renameAisle(aisle.id, value)} />
      </Field>
      {edit ? (
        <div className="row-actions">
          <button type="button" className="primary" onClick={() => setMode("rack")}>Ajouter un rack</button>
          <button type="button" onClick={() => setMode("cooling")}>Ajouter un refroidissement</button>
        </div>
      ) : null}
      {edit && mode === "rack" ? <AddRackForm aisle={aisle} onDone={() => setMode(null)} /> : null}
      {edit && mode === "cooling" ? <AddCoolingForm aisle={aisle} onDone={() => setMode(null)} /> : null}
      {edit ? <ConfirmButton label={`Supprimer ${aisle.name} et son contenu`} confirmLabel="Supprimer l'allée" onConfirm={() => removeAisle(aisle.id)} /> : null}
    </>
  );
}

function AddRackForm({ aisle, onDone }: { aisle: Aisle; onDone: () => void }) {
  const { addRack } = useStore();
  const [side, setSide] = useState<Side>("left");
  const [name, setName] = useState(suggestRackName(aisle, "left"));
  const [position, setPosition] = useState(String(nextFreePosition(aisle, "left")));
  const [heightU, setHeightU] = useState(String(defaultHeight(aisle)));
  const [error, setError] = useState<string | null>(null);

  function changeSide(next: Side) {
    setSide(next);
    setName(suggestRackName(aisle, next));
    setPosition(String(nextFreePosition(aisle, next)));
  }

  return (
    <div className="form-grid">
      <Field label="Nom" className="span-2">
        <TextInput value={name} onChange={setName} />
      </Field>
      <Field label="Côté">
        <SelectInput value={side} onChange={(event) => changeSide(event.target.value as Side)}>
          {SIDES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </SelectInput>
      </Field>
      <Field label="Position" hint="1 = première place de ce côté.">
        <NumberInput value={position} min={1} onChange={setPosition} />
      </Field>
      <Field label="Hauteur (U)" className="span-2">
        <NumberInput value={heightU} min={1} max={70} onChange={setHeightU} />
      </Field>
      {error ? <p className="error span-2">{error}</p> : null}
      <div className="row-actions span-2">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const pos = Number(position);
            const height = Number(heightU);
            const slot = slotError(aisle, side, pos);
            if (slot) { setError(slot); return; }
            if (!Number.isInteger(height) || height < 1 || height > 70) { setError("Hauteur entre 1 et 70 U."); return; }
            addRack(aisle, side, { name, position: pos, heightU: height });
            onDone();
          }}
        >
          Créer
        </button>
        <button type="button" onClick={onDone}>Annuler</button>
      </div>
    </div>
  );
}

function AddCoolingForm({ aisle, onDone }: { aisle: Aisle; onDone: () => void }) {
  const { addCooling } = useStore();
  const [side, setSide] = useState<Side>("left");
  const [name, setName] = useState(suggestCoolingName(aisle));
  const [position, setPosition] = useState(String(nextFreePosition(aisle, "left")));
  const [coolingType, setCoolingType] = useState<CoolingType>("in-row");
  const [capacity, setCapacity] = useState("30");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="form-grid">
      <Field label="Nom" className="span-2">
        <TextInput value={name} onChange={setName} />
      </Field>
      <Field label="Côté">
        <SelectInput value={side} onChange={(event) => {
          const next = event.target.value as Side;
          setSide(next);
          setPosition(String(nextFreePosition(aisle, next)));
        }}>
          {SIDES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </SelectInput>
      </Field>
      <Field label="Position">
        <NumberInput value={position} min={1} onChange={setPosition} />
      </Field>
      <Field label="Type">
        <SelectInput value={coolingType} onChange={(event) => setCoolingType(event.target.value as CoolingType)}>
          {COOLING_TYPES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </SelectInput>
      </Field>
      <Field label="Puissance froid (kW)">
        <NumberInput value={capacity} min={0} step={1} onChange={setCapacity} />
      </Field>
      {error ? <p className="error span-2">{error}</p> : null}
      <div className="row-actions span-2">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const pos = Number(position);
            const value = Number(capacity);
            const slot = slotError(aisle, side, pos);
            if (slot) { setError(slot); return; }
            if (!Number.isFinite(value) || value < 0) { setError("Indiquez une capacité en kW."); return; }
            addCooling(aisle, side, coolingType, value, { name, position: pos });
            onDone();
          }}
        >
          Créer
        </button>
        <button type="button" onClick={onDone}>Annuler</button>
      </div>
    </div>
  );
}

function nextFreePosition(aisle: Aisle, side: Side) {
  const used = new Set(aisle.items.filter((item) => item.side === side).map((item) => item.position));
  let position = 1;
  while (used.has(position)) position += 1;
  return position;
}

function defaultHeight(aisle: Aisle) {
  const racks = aisle.items.filter((item): item is Rack => item.kind === "rack");
  return racks.at(-1)?.heightU ?? 42;
}

function MoveButtons({ aisle, item }: { aisle: Aisle; item: Rack | CoolingUnit }) {
  const edit = useCanEdit();
  const store = useStore();
  if (!edit) return null;
  const patch = (position: number) => {
    if (item.kind === "rack") store.patchRack(aisle.id, item.id, { position });
    else store.patchCooling(aisle.id, item.id, { position });
  };
  return (
    <div className="row-actions">
      <button type="button" disabled={item.position <= 1 || !!slotError(aisle, item.side, item.position - 1, item.id)} onClick={() => patch(item.position - 1)}>Position −</button>
      <button type="button" disabled={!!slotError(aisle, item.side, item.position + 1, item.id)} onClick={() => patch(item.position + 1)}>Position +</button>
    </div>
  );
}

function CoolingPanel({ aisle, item }: { aisle: Aisle; item: CoolingUnit }) {
  const edit = useCanEdit();
  const { patchCooling, removeItem } = useStore();
  const [position, setPosition] = useState(String(item.position));
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setPosition(String(item.position)), [item.id, item.position]);
  return (
    <>
      <div>
        <p className="kicker">Refroidissement · {aisle.name}</p>
        <div className="panel-title"><h2>{item.name}</h2></div>
      </div>
      <div className="cooling-hero">
        <strong>{item.capacityKw.toLocaleString("fr-FR")} kW</strong>
        <span>{coolingLabel(item.coolingType)} · {statusMeta(item.status).label}</span>
      </div>
      <MoveButtons aisle={aisle} item={item} />
      <div className="form-grid">
        <Field label="Nom" className="span-2">
          <TextInput disabled={!edit} value={item.name} onChange={(value) => patchCooling(aisle.id, item.id, { name: value })} />
        </Field>
        <Field label="Côté">
          <SelectInput
            disabled={!edit}
            value={item.side}
            onChange={(event) => {
              const side = event.target.value as Side;
              const error = slotError(aisle, side, item.position, item.id);
              setMessage(error);
              if (!error) patchCooling(aisle.id, item.id, { side });
            }}
          >
            {SIDES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </SelectInput>
        </Field>
        <Field label="Position dans l'allée">
          <NumberInput
            disabled={!edit}
            value={position}
            min={1}
            onChange={(value) => {
              setPosition(value);
              const next = Number(value);
              if (!Number.isInteger(next)) return;
              const error = slotError(aisle, item.side, next, item.id);
              setMessage(error);
              if (!error) patchCooling(aisle.id, item.id, { position: next });
            }}
          />
        </Field>
        <Field label="Type">
          <SelectInput disabled={!edit} value={item.coolingType} onChange={(event) => patchCooling(aisle.id, item.id, { coolingType: event.target.value as CoolingType })}>
            {COOLING_TYPES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </SelectInput>
        </Field>
        <Field label="État">
          <SelectInput disabled={!edit} value={item.status} onChange={(event) => patchCooling(aisle.id, item.id, { status: event.target.value as EquipmentStatus })}>
            {STATUSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </SelectInput>
        </Field>
        <Field label="Puissance froid (kW)" className="span-2">
          <NumberInput disabled={!edit} value={item.capacityKw} min={0} step={1} onChange={(value) => {
            const next = Number(value);
            if (Number.isFinite(next) && next >= 0) patchCooling(aisle.id, item.id, { capacityKw: next });
          }} />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea disabled={!edit} value={item.notes} onChange={(event) => patchCooling(aisle.id, item.id, { notes: event.target.value })} />
        </Field>
      </div>
      {message ? <p className="error">{message}</p> : null}
      {edit ? <ConfirmButton label={`Supprimer ${item.name}`} onConfirm={() => removeItem(aisle.id, item.id)} /> : null}
    </>
  );
}

function RackPanel({ aisle, rack }: { aisle: Aisle; rack: Rack }) {
  const edit = useCanEdit();
  const { selection, select, patchRack, removeItem, notify } = useStore();
  const [creating, setCreating] = useState(false);
  const [seedU, setSeedU] = useState(1);
  const [position, setPosition] = useState(String(rack.position));
  const [heightText, setHeightText] = useState(String(rack.heightU));
  const [message, setMessage] = useState<string | null>(null);
  const selectedId = selection?.kind === "equipment" && selection.itemId === rack.id ? selection.equipmentId : null;
  const selected = rack.equipment.find((eq) => eq.id === selectedId) ?? null;

  useEffect(() => {
    setPosition(String(rack.position));
    setHeightText(String(rack.heightU));
    setMessage(null);
  }, [rack.id, rack.position, rack.heightU]);

  useEffect(() => {
    setCreating(false);
  }, [rack.id]);

  const draft = creating && !selected
    ? { positionU: seedU, heightU: 2 }
    : selected
      ? { positionU: selected.positionU, heightU: selected.heightU }
      : null;

  const equipment = [...rack.equipment].sort((a, b) => b.positionU - a.positionU);

  return (
    <>
      <div className="inspector-scroll">
        <div>
          <p className="kicker">Rack · {aisle.name} · {sideLabel(rack.side)}</p>
          <div className="panel-title"><h2>{rack.name}</h2></div>
        </div>
        <div className="metrics">
          <div className="metric"><b>{usedU(rack)}/{rack.heightU}</b><span>U occupés</span></div>
          <div className="metric"><b>{rack.equipment.length}</b><span>Équipements</span></div>
          <div className="metric"><b>{formatKwFromW(rackPowerW(rack))}</b><span>Puissance</span></div>
        </div>
        <MoveButtons aisle={aisle} item={rack} />
        <div className="form-grid">
          <Field label="Nom" className="span-2">
            <TextInput disabled={!edit} value={rack.name} onChange={(value) => patchRack(aisle.id, rack.id, { name: value })} />
          </Field>
          <Field label="Côté">
            <SelectInput
              disabled={!edit}
              value={rack.side}
              onChange={(event) => {
                const side = event.target.value as Side;
                const error = slotError(aisle, side, rack.position, rack.id);
                setMessage(error);
                if (!error) patchRack(aisle.id, rack.id, { side });
              }}
            >
              {SIDES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="Position dans l'allée">
            <NumberInput
              disabled={!edit}
              value={position}
              min={1}
              onChange={(value) => {
                setPosition(value);
                const next = Number(value);
                if (!Number.isInteger(next)) return;
                const error = slotError(aisle, rack.side, next, rack.id);
                setMessage(error);
                if (!error) patchRack(aisle.id, rack.id, { position: next });
              }}
            />
          </Field>
          <Field label="Hauteur de baie (U)" className="span-2">
            <NumberInput
              disabled={!edit}
              value={heightText}
              min={1}
              max={70}
              onChange={(value) => {
                setHeightText(value);
                const next = Number(value);
                if (!Number.isInteger(next) || next < 1 || next > 70) {
                  setMessage("La hauteur doit être un entier entre 1 et 70.");
                  return;
                }
                const top = rack.equipment.reduce((max, eq) => Math.max(max, eq.positionU + eq.heightU - 1), 0);
                if (next < top) {
                  setMessage(`Des équipements occupent la baie jusqu'à U${top}.`);
                  return;
                }
                setMessage(null);
                patchRack(aisle.id, rack.id, { heightU: next });
              }}
            />
          </Field>
          <Field label="Notes" className="span-2">
            <textarea disabled={!edit} value={rack.notes} onChange={(event) => patchRack(aisle.id, rack.id, { notes: event.target.value })} />
          </Field>
        </div>
        {message ? <p className="error">{message}</p> : null}
        <RackElevation
          rack={rack}
          selectedId={selectedId}
          draft={draft}
          draftInvalid={draftLooksInvalid(rack, creating && !selected ? { positionU: seedU, heightU: 2 } : null)}
          onPickU={(u) => {
            if (!edit) return;
            select({ kind: "item", aisleId: aisle.id, itemId: rack.id });
            setSeedU(u);
            setCreating(true);
          }}
          onPickEquipment={(id) => {
            setCreating(false);
            select({ kind: "equipment", aisleId: aisle.id, itemId: rack.id, equipmentId: id });
          }}
        />
        <p className="hint">{edit ? "U1 est en bas. Cliquez un emplacement libre pour y poser un équipement." : "U1 est en bas. Consultation seule."}</p>
        {rack.equipment.length === 0 ? <p className="hint">Cette baie est vide.</p> : null}
        <ul className="eq-list">
          {equipment.map((eq) => {
            const meta = typeMeta(eq.type);
            return (
              <li key={eq.id}>
                <button
                  type="button"
                  className={`eq-row ${selectedId === eq.id ? "active" : ""}`}
                  onClick={() => {
                    setCreating(false);
                    select({ kind: "equipment", aisleId: aisle.id, itemId: rack.id, equipmentId: eq.id });
                  }}
                >
                  <i style={{ background: meta.color }} />
                  <b>{eq.name}</b>
                  <span className="meta">{uRange(eq)}</span>
                  <span className="sub">{[eq.manufacturer, eq.model].filter(Boolean).join(" · ") || meta.label}{eq.powerW ? ` · ${eq.powerW} W` : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {edit ? <ConfirmButton label={`Supprimer le rack ${rack.name}`} onConfirm={() => removeItem(aisle.id, rack.id)} /> : null}
      </div>
      <div className="inspector-dock">
        {selected ? (
          <EquipmentForm
            key={selected.id}
            aisleId={aisle.id}
            rack={rack}
            equipment={selected}
            seedU={selected.positionU}
            readOnly={!edit}
            onAdvance={() => undefined}
            onClose={() => select({ kind: "item", aisleId: aisle.id, itemId: rack.id })}
          />
        ) : edit && creating ? (
          <EquipmentForm
            key="create"
            aisleId={aisle.id}
            rack={rack}
            equipment={null}
            seedU={seedU}
            onAdvance={(positionU, heightU) => {
              const virtual: Rack = {
                ...rack,
                equipment: [...rack.equipment, { id: "pending", name: "", type: "server", manufacturer: "", model: "", serial: "", assetTag: "", positionU, heightU, powerW: 0, status: "ok", notes: "" }],
              };
              const next = nextFreeU(virtual, heightU, positionU + heightU);
              if (next) setSeedU(next);
              else {
                setCreating(false);
                notify("Plus de place libre pour cette hauteur.");
              }
            }}
            onClose={() => setCreating(false)}
          />
        ) : edit ? (
          <button
            type="button"
            className="primary"
            onClick={() => {
              const next = nextFreeU(rack, 2) ?? nextFreeU(rack, 1);
              if (!next) {
                notify("Cette baie n'a plus de U libre.");
                return;
              }
              setSeedU(next);
              setCreating(true);
            }}
          >
            Ajouter un équipement
          </button>
        ) : (
          <p className="hint">Les ajouts et modifications sont réservés au rôle correspondant.</p>
        )}
      </div>
    </>
  );
}
