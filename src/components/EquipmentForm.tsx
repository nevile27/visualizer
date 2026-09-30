import { useEffect, useState } from "react";
import { EQUIPMENT_TYPES, STATUSES, placementError } from "../model";
import { useStore } from "../store";
import type { Equipment, EquipmentStatus, EquipmentType, Rack } from "../types";
import { Field, NumberInput, SelectInput, TextInput } from "./fields";

const MANUFACTURERS = ["Dell", "HPE", "Lenovo", "Cisco", "Arista", "NVIDIA", "NetApp", "Pure Storage", "APC", "Palo Alto", "Fortinet", "Schneider"];

export function EquipmentForm({
  aisleId,
  rack,
  equipment,
  seedU,
  readOnly = false,
  onAdvance,
  onClose,
}: {
  aisleId: string;
  rack: Rack;
  equipment: Equipment | null;
  seedU: number;
  readOnly?: boolean;
  onAdvance: (positionU: number, heightU: number) => void;
  onClose: () => void;
}) {
  const { addEquipment, patchEquipment, removeEquipment } = useStore();
  const editing = equipment !== null;
  const [name, setName] = useState(equipment?.name ?? "");
  const [type, setType] = useState<EquipmentType>(equipment?.type ?? "server");
  const [manufacturer, setManufacturer] = useState(equipment?.manufacturer ?? "");
  const [model, setModel] = useState(equipment?.model ?? "");
  const [serial, setSerial] = useState(equipment?.serial ?? "");
  const [assetTag, setAssetTag] = useState(equipment?.assetTag ?? "");
  const [positionU, setPositionU] = useState(String(equipment?.positionU ?? seedU));
  const [heightU, setHeightU] = useState(String(equipment?.heightU ?? 2));
  const [powerW, setPowerW] = useState(String(equipment?.powerW ?? 0));
  const [status, setStatus] = useState<EquipmentStatus>(equipment?.status ?? "ok");
  const [notes, setNotes] = useState(equipment?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setPositionU(String(seedU));
  }, [seedU, editing]);

  const position = Number(positionU);
  const height = Number(heightU);
  const liveError = Number.isInteger(position) && Number.isInteger(height)
    ? placementError(rack, position, height, equipment?.id)
    : "La position et la hauteur doivent être des entiers.";

  function build(): Omit<Equipment, "id"> | null {
    if (!name.trim()) {
      setError("Indiquez un nom.");
      return null;
    }
    if (liveError) {
      setError(liveError);
      return null;
    }
    const power = Number(powerW);
    if (!Number.isFinite(power) || power < 0) {
      setError("La puissance doit être un nombre de watts positif ou nul.");
      return null;
    }
    setError(null);
    return {
      name: name.trim(),
      type,
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      serial: serial.trim(),
      assetTag: assetTag.trim(),
      positionU: position,
      heightU: height,
      powerW: Math.round(power),
      status,
      notes: notes.trim(),
    };
  }

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        if (readOnly) return;
        const next = build();
        if (!next) return;
        if (editing && equipment) {
          patchEquipment(aisleId, rack.id, equipment.id, next);
          return;
        }
        addEquipment(aisleId, rack.id, next);
        setName("");
        onAdvance(next.positionU, next.heightU);
      }}
    >
      <Field label="Nom" className="span-2">
        <TextInput disabled={readOnly} value={name} onChange={setName} placeholder="srv-web-01" />
      </Field>
      <Field label="Type">
        <SelectInput disabled={readOnly} value={type} onChange={(event) => setType(event.target.value as EquipmentType)}>
          {EQUIPMENT_TYPES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </SelectInput>
      </Field>
      <Field label="État">
        <SelectInput disabled={readOnly} value={status} onChange={(event) => setStatus(event.target.value as EquipmentStatus)}>
          {STATUSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </SelectInput>
      </Field>
      <Field label="Fabricant">
        <TextInput disabled={readOnly} value={manufacturer} onChange={setManufacturer} list="mfr-list" />
        <datalist id="mfr-list">
          {MANUFACTURERS.map((entry) => <option key={entry} value={entry} />)}
        </datalist>
      </Field>
      <Field label="Modèle">
        <TextInput disabled={readOnly} value={model} onChange={setModel} placeholder="PowerEdge R760" />
      </Field>
      <Field label="N° de série">
        <TextInput disabled={readOnly} value={serial} onChange={setSerial} />
      </Field>
      <Field label="Tag inventaire">
        <TextInput disabled={readOnly} value={assetTag} onChange={setAssetTag} />
      </Field>
      <Field label="Position U (bas)" hint="U1 est en bas de la baie.">
        <NumberInput disabled={readOnly} value={positionU} min={1} max={rack.heightU} onChange={setPositionU} />
      </Field>
      <Field label="Hauteur (U)">
        <NumberInput disabled={readOnly} value={heightU} min={1} max={rack.heightU} onChange={setHeightU} />
      </Field>
      <Field label="Puissance (W)" className="span-2">
        <NumberInput disabled={readOnly} value={powerW} min={0} step={10} onChange={setPowerW} />
      </Field>
      <Field label="Notes" className="span-2">
        <textarea disabled={readOnly} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      {!readOnly && (error || liveError) ? <p className="error span-2">{error || liveError}</p> : null}
      <div className="row-actions span-2">
        {readOnly ? null : <button type="submit" className="primary">{editing ? "Enregistrer" : "Ajouter"}</button>}
        <button type="button" onClick={onClose}>Fermer</button>
        {!readOnly && editing && equipment ? (
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (window.confirm(`Retirer ${equipment.name} de la baie ?`)) {
                removeEquipment(aisleId, rack.id, equipment.id);
                onClose();
              }
            }}
          >
            Retirer
          </button>
        ) : null}
      </div>
    </form>
  );
}
