import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { fetchCenters, saveCenters } from "./api";
import {
  defaultRackHeight,
  nextPosition,
  normalizeCenters,
  suggestCoolingName,
  suggestRackName,
  uid,
} from "./model";
import { sampleDataCenters } from "./sample";
import type {
  Aisle,
  CoolingType,
  CoolingUnit,
  DataCenter,
  Equipment,
  Rack,
  Selection,
  Side,
  ViewMode,
} from "./types";

const STORAGE_KEY = "hallplan-v1";

function equipmentNeedsFields(centers: DataCenter[]) {
  return centers.some((dc) => dc.aisles.some((aisle) => aisle.items.some((item) => (
    item.kind === "rack" && item.equipment.some((equipment) => {
      const raw = equipment as Partial<Pick<Equipment, "ip" | "observations" | "psuCount" | "networkPorts">>;
      return raw.ip === undefined || raw.observations === undefined || raw.psuCount === undefined || raw.networkPorts === undefined;
    })
  ))));
}

type RackPatch = Partial<Pick<Rack, "name" | "side" | "position" | "heightU" | "notes">>;
type CoolingPatch = Partial<Pick<CoolingUnit, "name" | "side" | "position" | "coolingType" | "capacityKw" | "status" | "notes">>;

interface State {
  dataCenters: DataCenter[];
  activeDcId: string | null;
  selection: Selection | null;
  view: ViewMode;
  query: string;
  notice: string | null;
}

type Action =
  | { type: "select"; selection: Selection | null; keepQuery?: boolean }
  | { type: "set-query"; query: string }
  | { type: "set-view"; view: ViewMode }
  | { type: "set-active"; id: string }
  | { type: "notice"; notice: string | null }
  | { type: "hydrate"; dataCenters: DataCenter[]; notice?: string | null }
  | { type: "replace"; dataCenters: DataCenter[] }
  | { type: "add-dc"; dc: DataCenter }
  | { type: "patch-dc"; dcId: string; patch: Partial<Pick<DataCenter, "name" | "location" | "notes" | "positionDirection">> }
  | { type: "remove-dc"; dcId: string }
  | { type: "add-aisle"; dcId: string; aisle: Aisle }
  | { type: "patch-aisle"; dcId: string; aisleId: string; name: string }
  | { type: "remove-aisle"; dcId: string; aisleId: string }
  | { type: "add-item"; dcId: string; aisleId: string; item: Rack | CoolingUnit }
  | { type: "patch-rack"; dcId: string; aisleId: string; itemId: string; patch: RackPatch }
  | { type: "patch-cooling"; dcId: string; aisleId: string; itemId: string; patch: CoolingPatch }
  | { type: "remove-item"; dcId: string; aisleId: string; itemId: string }
  | { type: "add-eq"; dcId: string; aisleId: string; itemId: string; equipment: Equipment }
  | { type: "patch-eq"; dcId: string; aisleId: string; itemId: string; equipmentId: string; patch: Partial<Equipment> }
  | { type: "remove-eq"; dcId: string; aisleId: string; itemId: string; equipmentId: string };

function readLocalCenters(): DataCenter[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dataCenters?: DataCenter[] };
    if (!parsed.dataCenters?.length) return null;
    return parsed.dataCenters;
  } catch {
    return null;
  }
}

function selectionInAisle(selection: Selection | null, aisleId: string) {
  return selection !== null && selection.aisleId === aisleId;
}

function selectionOnItem(selection: Selection | null, itemId: string) {
  return selection !== null && selection.kind !== "aisle" && selection.itemId === itemId;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "select":
      return { ...state, selection: action.selection, query: action.keepQuery ? state.query : "" };
    case "set-query":
      return { ...state, query: action.query };
    case "set-view":
      return { ...state, view: action.view };
    case "set-active":
      return { ...state, activeDcId: action.id, selection: null, query: "" };
    case "notice":
      return { ...state, notice: action.notice };
    case "hydrate": {
      const stillThere = action.dataCenters.some((dc) => dc.id === state.activeDcId);
      return {
        ...state,
        dataCenters: action.dataCenters,
        activeDcId: stillThere ? state.activeDcId : action.dataCenters[0]?.id ?? null,
        selection: stillThere ? state.selection : null,
        notice: action.notice === undefined ? state.notice : action.notice,
      };
    }
    case "replace":
      return {
        ...state,
        dataCenters: action.dataCenters,
        activeDcId: action.dataCenters[0]?.id ?? null,
        selection: null,
        notice: null,
      };
    case "add-dc":
      return {
        ...state,
        dataCenters: [...state.dataCenters, action.dc],
        activeDcId: action.dc.id,
        selection: null,
      };
    case "patch-dc":
      return {
        ...state,
        dataCenters: state.dataCenters.map((dc) => (dc.id === action.dcId ? { ...dc, ...action.patch } : dc)),
      };
    case "remove-dc": {
      const dataCenters = state.dataCenters.filter((dc) => dc.id !== action.dcId);
      const activeDcId = state.activeDcId === action.dcId ? dataCenters[0]?.id ?? null : state.activeDcId;
      return { ...state, dataCenters, activeDcId, selection: state.activeDcId === action.dcId ? null : state.selection };
    }
    case "add-aisle":
      return {
        ...state,
        dataCenters: state.dataCenters.map((dc) => (
          dc.id === action.dcId ? { ...dc, aisles: [...dc.aisles, action.aisle] } : dc
        )),
        selection: { kind: "aisle", aisleId: action.aisle.id },
      };
    case "patch-aisle":
      return {
        ...state,
        dataCenters: state.dataCenters.map((dc) => (
          dc.id === action.dcId
            ? { ...dc, aisles: dc.aisles.map((aisle) => (aisle.id === action.aisleId ? { ...aisle, name: action.name } : aisle)) }
            : dc
        )),
      };
    case "remove-aisle":
      return {
        ...state,
        selection: selectionInAisle(state.selection, action.aisleId) ? null : state.selection,
        dataCenters: state.dataCenters.map((dc) => (
          dc.id === action.dcId ? { ...dc, aisles: dc.aisles.filter((aisle) => aisle.id !== action.aisleId) } : dc
        )),
      };
    case "add-item":
      return {
        ...state,
        selection: { kind: "item", aisleId: action.aisleId, itemId: action.item.id },
        dataCenters: state.dataCenters.map((dc) => (
          dc.id === action.dcId
            ? {
                ...dc,
                aisles: dc.aisles.map((aisle) => (
                  aisle.id === action.aisleId ? { ...aisle, items: [...aisle.items, action.item] } : aisle
                )),
              }
            : dc
        )),
      };
    case "patch-rack":
    case "patch-cooling":
      return {
        ...state,
        dataCenters: state.dataCenters.map((dc) => (
          dc.id === action.dcId
            ? {
                ...dc,
                aisles: dc.aisles.map((aisle) => (
                  aisle.id === action.aisleId
                    ? {
                        ...aisle,
                        items: aisle.items.map((item) => {
                          if (item.id !== action.itemId) return item;
                          if (action.type === "patch-rack" && item.kind === "rack") return { ...item, ...action.patch };
                          if (action.type === "patch-cooling" && item.kind === "cooling") return { ...item, ...action.patch };
                          return item;
                        }),
                      }
                    : aisle
                )),
              }
            : dc
        )),
      };
    case "remove-item":
      return {
        ...state,
        selection: selectionOnItem(state.selection, action.itemId) ? { kind: "aisle", aisleId: action.aisleId } : state.selection,
        dataCenters: state.dataCenters.map((dc) => (
          dc.id === action.dcId
            ? {
                ...dc,
                aisles: dc.aisles.map((aisle) => (
                  aisle.id === action.aisleId ? { ...aisle, items: aisle.items.filter((item) => item.id !== action.itemId) } : aisle
                )),
              }
            : dc
        )),
      };
    case "add-eq":
      return {
        ...state,
        dataCenters: mapEquipment(state.dataCenters, action.dcId, action.aisleId, action.itemId, (equipment) => [
          ...equipment,
          action.equipment,
        ]),
      };
    case "patch-eq":
      return {
        ...state,
        dataCenters: mapEquipment(state.dataCenters, action.dcId, action.aisleId, action.itemId, (equipment) => (
          equipment.map((eq) => (eq.id === action.equipmentId ? { ...eq, ...action.patch } : eq))
        )),
      };
    case "remove-eq":
      return {
        ...state,
        selection: state.selection?.kind === "equipment" && state.selection.equipmentId === action.equipmentId
          ? { kind: "item", aisleId: action.aisleId, itemId: action.itemId }
          : state.selection,
        dataCenters: mapEquipment(state.dataCenters, action.dcId, action.aisleId, action.itemId, (equipment) => (
          equipment.filter((eq) => eq.id !== action.equipmentId)
        )),
      };
    default:
      return state;
  }
}

function mapEquipment(
  centers: DataCenter[],
  dcId: string,
  aisleId: string,
  itemId: string,
  update: (equipment: Equipment[]) => Equipment[],
) {
  return centers.map((dc) => (
    dc.id === dcId
      ? {
          ...dc,
          aisles: dc.aisles.map((aisle) => (
            aisle.id === aisleId
              ? {
                  ...aisle,
                  items: aisle.items.map((item) => (
                    item.kind === "rack" && item.id === itemId ? { ...item, equipment: update(item.equipment) } : item
                  )),
                }
              : aisle
          )),
        }
      : dc
  ));
}

function init(): State {
  return {
    dataCenters: [],
    activeDcId: null,
    selection: null,
    view: "3d",
    query: "",
    notice: null,
  };
}

const StoreContext = createContext<StoreValue | null>(null);

interface StoreValue extends State {
  activeDc: DataCenter | null;
  setView: (view: ViewMode) => void;
  setActive: (id: string) => void;
  select: (selection: Selection | null, options?: { keepQuery?: boolean }) => void;
  setQuery: (query: string) => void;
  notify: (notice: string | null) => void;
  replaceAll: (dataCenters: DataCenter[]) => void;
  addGenerated: (dc: DataCenter) => void;
  loadExample: () => void;
  patchDc: (patch: Partial<Pick<DataCenter, "name" | "location" | "notes" | "positionDirection">>) => void;
  removeDc: () => void;
  addAisle: (name: string) => void;
  renameAisle: (aisleId: string, name: string) => void;
  removeAisle: (aisleId: string) => void;
  addRack: (aisle: Aisle, side: Side, extra?: { name?: string; position?: number; heightU?: number }) => void;
  addCooling: (aisle: Aisle, side: Side, coolingType: CoolingType, capacityKw: number, extra?: { name?: string; position?: number }) => void;
  patchRack: (aisleId: string, itemId: string, patch: RackPatch) => void;
  patchCooling: (aisleId: string, itemId: string, patch: CoolingPatch) => void;
  removeItem: (aisleId: string, itemId: string) => void;
  addEquipment: (aisleId: string, itemId: string, equipment: Omit<Equipment, "id">) => void;
  patchEquipment: (aisleId: string, itemId: string, equipmentId: string, patch: Partial<Equipment>) => void;
  removeEquipment: (aisleId: string, itemId: string, equipmentId: string) => void;
}

export function StoreProvider({ children, canEdit }: { children: ReactNode; canEdit: boolean }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  const skipSave = useRef(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const remote = await fetchCenters();
        if (cancel) return;
        const centersNeedFields = equipmentNeedsFields(remote.dataCenters);
        let centers = normalizeCenters(remote.dataCenters);
        let nextRevision = remote.revision;
        if (canEdit && centersNeedFields) {
          const upgraded = await saveCenters(nextRevision, centers);
          if (cancel) return;
          if (!upgraded.conflict) {
            centers = upgraded.dataCenters;
            nextRevision = upgraded.revision;
          }
        }
        if (centers.length === 0 && canEdit) {
          const local = readLocalCenters();
          const count = local?.length ?? 0;
          if (local && count > 0 && window.confirm(`Ce navigateur contient ${count} centre${count > 1 ? "s" : ""} enregistré${count > 1 ? "s" : ""} seulement ici. Les copier sur le serveur pour les partager avec les autres machines ?`)) {
            const saved = await saveCenters(nextRevision, normalizeCenters(local));
            if (cancel) return;
            centers = saved.dataCenters;
            nextRevision = saved.revision;
            if (!saved.conflict) localStorage.removeItem(STORAGE_KEY);
          }
        }
        revision.current = nextRevision;
        skipSave.current = true;
        dispatch({ type: "hydrate", dataCenters: centers });
        setReady(true);
      } catch (error) {
        if (cancel) return;
        dispatch({ type: "notice", notice: error instanceof Error ? error.message : "Salles inaccessibles." });
        setReady(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [canEdit]);

  useEffect(() => {
    if (!ready || !canEdit) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const snapshot = state.dataCenters;
    const handle = window.setTimeout(() => {
      void saveCenters(revision.current, snapshot).then((saved) => {
        revision.current = saved.revision;
        if (saved.conflict) {
          skipSave.current = true;
          dispatch({
            type: "hydrate",
            dataCenters: saved.dataCenters,
            notice: saved.error ?? "Ces salles ont été modifiées sur une autre machine. La version du serveur est affichée.",
          });
        }
      }).catch((error: unknown) => {
        dispatch({ type: "notice", notice: error instanceof Error ? error.message : "Enregistrement impossible." });
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [state.dataCenters, ready, canEdit]);

  const activeDc = state.dataCenters.find((dc) => dc.id === state.activeDcId) ?? null;

  const api = useMemo<StoreValue>(() => {
    const dcId = state.activeDcId;
    return {
      ...state,
      activeDc,
      setView: (view) => dispatch({ type: "set-view", view }),
      setActive: (id) => dispatch({ type: "set-active", id }),
      select: (selection, options) => dispatch({ type: "select", selection, keepQuery: options?.keepQuery }),
      setQuery: (query) => dispatch({ type: "set-query", query }),
      notify: (notice) => dispatch({ type: "notice", notice }),
      replaceAll: (dataCenters) => {
        if (canEdit) dispatch({ type: "replace", dataCenters });
      },
      addGenerated: (dc) => {
        if (canEdit) dispatch({ type: "add-dc", dc });
      },
      loadExample: () => {
        if (canEdit) dispatch({ type: "replace", dataCenters: sampleDataCenters() });
      },
      patchDc: (patch) => {
        if (canEdit && dcId) dispatch({ type: "patch-dc", dcId, patch });
      },
      removeDc: () => {
        if (canEdit && dcId) dispatch({ type: "remove-dc", dcId });
      },
      addAisle: (name) => {
        if (!canEdit || !dcId) return;
        dispatch({
          type: "add-aisle",
          dcId,
          aisle: { id: uid("aisle"), name: name.trim() || "Allée", items: [] },
        });
      },
      renameAisle: (aisleId, name) => {
        if (canEdit && dcId) dispatch({ type: "patch-aisle", dcId, aisleId, name });
      },
      removeAisle: (aisleId) => {
        if (canEdit && dcId) dispatch({ type: "remove-aisle", dcId, aisleId });
      },
      addRack: (aisle, side, extra) => {
        if (!canEdit || !dcId) return;
        const item: Rack = {
          kind: "rack",
          id: uid("rack"),
          name: extra?.name?.trim() || suggestRackName(aisle, side),
          side,
          position: extra?.position ?? nextPosition(aisle, side),
          heightU: extra?.heightU ?? defaultRackHeight(aisle),
          notes: "",
          equipment: [],
        };
        dispatch({ type: "add-item", dcId, aisleId: aisle.id, item });
      },
      addCooling: (aisle, side, coolingType, capacityKw, extra) => {
        if (!canEdit || !dcId) return;
        const item: CoolingUnit = {
          kind: "cooling",
          id: uid("cool"),
          name: extra?.name?.trim() || suggestCoolingName(aisle),
          side,
          position: extra?.position ?? nextPosition(aisle, side),
          coolingType,
          capacityKw,
          status: "ok",
          notes: "",
        };
        dispatch({ type: "add-item", dcId, aisleId: aisle.id, item });
      },
      patchRack: (aisleId, itemId, patch) => {
        if (canEdit && dcId) dispatch({ type: "patch-rack", dcId, aisleId, itemId, patch });
      },
      patchCooling: (aisleId, itemId, patch) => {
        if (canEdit && dcId) dispatch({ type: "patch-cooling", dcId, aisleId, itemId, patch });
      },
      removeItem: (aisleId, itemId) => {
        if (canEdit && dcId) dispatch({ type: "remove-item", dcId, aisleId, itemId });
      },
      addEquipment: (aisleId, itemId, equipment) => {
        if (!canEdit || !dcId) return;
        dispatch({
          type: "add-eq",
          dcId,
          aisleId,
          itemId,
          equipment: { ...equipment, id: uid("eq") },
        });
      },
      patchEquipment: (aisleId, itemId, equipmentId, patch) => {
        if (canEdit && dcId) dispatch({ type: "patch-eq", dcId, aisleId, itemId, equipmentId, patch });
      },
      removeEquipment: (aisleId, itemId, equipmentId) => {
        if (canEdit && dcId) dispatch({ type: "remove-eq", dcId, aisleId, itemId, equipmentId });
      },
    };
  }, [state, activeDc, canEdit]);

  if (!ready) return <div className="empty-view">Chargement des salles…</div>;
  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore doit être utilisé dans StoreProvider");
  return value;
}
