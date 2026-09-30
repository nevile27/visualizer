import { useState } from "react";
import { generateDataCenter } from "../model";
import { useStore } from "../store";
import type { GenerateInput } from "../types";
import { Field, NumberInput, SelectInput, TextInput } from "./fields";

export function Builder({ onClose }: { onClose: () => void }) {
  const { addGenerated } = useStore();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [aisleCount, setAisleCount] = useState("3");
  const [racksPerSide, setRacksPerSide] = useState("8");
  const [coolingEvery, setCoolingEvery] = useState("4");
  const [heightU, setHeightU] = useState("42");
  const [rows, setRows] = useState<GenerateInput["rows"]>("both");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-labelledby="builder-title" onMouseDown={(event) => event.stopPropagation()}>
        <div>
          <p className="kicker">Nouveau centre</p>
          <h2 id="builder-title">Générer une salle</h2>
        </div>
        <p>
          Indiquez le nombre d'allées, de racks et de refroidissements. Chaque allée a une rangée gauche et, si vous le souhaitez, une rangée droite. Les équipements se posent ensuite U par U.
        </p>
        <div className="form-grid">
          <Field label="Nom du centre">
            <TextInput value={name} onChange={setName} placeholder="PAR2" />
          </Field>
          <Field label="Site">
            <TextInput value={location} onChange={setLocation} placeholder="Paris" />
          </Field>
          <Field label="Nombre d'allées">
            <NumberInput value={aisleCount} min={1} max={40} onChange={setAisleCount} />
          </Field>
          <Field label="Racks par rangée">
            <NumberInput value={racksPerSide} min={1} max={40} onChange={setRacksPerSide} />
          </Field>
          <Field label="Refroidissement toutes les N racks" hint="0 = aucun. 4 place une unité après chaque groupe de 4 racks.">
            <NumberInput value={coolingEvery} min={0} max={40} onChange={setCoolingEvery} />
          </Field>
          <Field label="Hauteur des racks (U)">
            <NumberInput value={heightU} min={1} max={70} onChange={setHeightU} />
          </Field>
          <Field label="Rangées" className="span-2">
            <SelectInput value={rows} onChange={(event) => setRows(event.target.value as GenerateInput["rows"])}>
              <option value="both">Gauche et droite</option>
              <option value="left">Rangée gauche seule</option>
            </SelectInput>
          </Field>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="row-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              const aisles = Number(aisleCount);
              const racks = Number(racksPerSide);
              const every = Number(coolingEvery);
              const height = Number(heightU);
              if (!Number.isInteger(aisles) || aisles < 1 || aisles > 40) { setError("Le nombre d'allées doit être entre 1 et 40."); return; }
              if (!Number.isInteger(racks) || racks < 1 || racks > 40) { setError("Le nombre de racks par rangée doit être entre 1 et 40."); return; }
              if (!Number.isInteger(every) || every < 0 || every > 40) { setError("L'intervalle de refroidissement doit être entre 0 et 40."); return; }
              if (!Number.isInteger(height) || height < 1 || height > 70) { setError("La hauteur doit être entre 1 et 70 U."); return; }
              addGenerated(generateDataCenter({
                name: name.trim() || "Nouveau centre",
                location,
                aisleCount: aisles,
                racksPerSide: racks,
                coolingEvery: every,
                heightU: height,
                rows,
              }));
              onClose();
            }}
          >
            Créer le centre
          </button>
          <button type="button" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
