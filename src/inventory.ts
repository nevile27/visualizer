import readXlsxFile from "read-excel-file/universal";
import { summarize, uid, uRange } from "./model";
import type {
  Aisle,
  CoolingType,
  CoolingUnit,
  DataCenter,
  Equipment,
  EquipmentStatus,
  EquipmentType,
  Rack,
  Side,
} from "./types";

export interface InventoryImport {
  dc: DataCenter;
  warnings: string[];
  /** True when the file has no Côté column, so every item is placed on the left. */
  assumedSide: boolean;
}

type SheetKind = "rack" | "cooling" | "equipment";

type Column =
  | "id"
  | "name"
  | "brand"
  | "serial"
  | "position"
  | "status"
  | "aisle"
  | "side"
  | "u"
  | "type"
  | "model"
  | "ip"
  | "psu"
  | "ports"
  | "notes"
  | "capacity"
  | "height";

interface SheetGrid {
  name: string;
  rows: unknown[][];
}

interface LocatedHeader {
  headerIndex: number;
  columns: Partial<Record<Column, number>>;
  score: number;
}

interface RackDraft {
  key: string;
  nameKey: string;
  rack: Rack;
  aisleName: string;
}

const DEFAULT_AISLE = "Allée A";
const DEFAULT_HEIGHT = 42;

export async function dataCenterFromSpreadsheet(buffer: ArrayBuffer, fileName: string): Promise<InventoryImport | string> {
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = await readXlsxFile(buffer);
  } catch {
    return "Ce classeur Excel n'a pas pu être lu. Enregistrez-le au format .xlsx.";
  }
  return parseInventorySheets(
    sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data })),
    fileName,
  );
}

export function parseInventorySheets(sheets: SheetGrid[], fileName: string): InventoryImport | string {
  const picked = pickSheets(sheets);
  if (!picked.rack) {
    return "Le classeur doit contenir une feuille Racks, avec au moins les colonnes Nom (ou ID) et Position. Les feuilles Cooling et Équipements sont lues si elles sont présentes.";
  }

  const warnings: string[] = [];
  const rackHeader = locateHeader(picked.rack.rows, "rack");
  const coolingHeader = picked.cooling ? locateHeader(picked.cooling.rows, "cooling") : null;
  const equipmentHeader = picked.equipment ? locateHeader(picked.equipment.rows, "equipment") : null;

  if (!rackHeader) {
    return `La feuille « ${picked.rack.name} » n'a pas d'en-tête reconnu (Nom ou ID, et Position).`;
  }

  const racks: RackDraft[] = [];
  const byId = new Map<string, RackDraft>();
  const byName = new Map<string, RackDraft>();
  const occupied = new Set<string>();
  let assumedSide = !rackHeader.columns.side;

  for (const { row, line } of dataRows(picked.rack.rows, rackHeader.headerIndex)) {
    const name = cellText(at(row, rackHeader.columns.name));
    const sourceId = cellText(at(row, rackHeader.columns.id));
    const position = cellInt(at(row, rackHeader.columns.position));
    if (!name && !sourceId && position === null) continue;
    if (position === null || position < 1) {
      warnings.push(`${picked.rack.name} ligne ${line} : position d'allée manquante ou invalide.`);
      continue;
    }
    const side = cellSide(at(row, rackHeader.columns.side));
    if (rackHeader.columns.side !== undefined && side === null && cellText(at(row, rackHeader.columns.side))) {
      warnings.push(`${picked.rack.name} ligne ${line} : côté « ${cellText(at(row, rackHeader.columns.side))} » ignoré, placé à gauche.`);
    }
    if (side) assumedSide = false;
    const aisleName = cellText(at(row, rackHeader.columns.aisle)) || DEFAULT_AISLE;
    const slot = slotKey(aisleName, side ?? "left", position);
    if (occupied.has(slot)) {
      warnings.push(`${picked.rack.name} ligne ${line} : la position ${position} est déjà occupée, « ${name || sourceId} » est ignoré.`);
      continue;
    }
    const height = cellInt(at(row, rackHeader.columns.height));
    const status = parseStatus(at(row, rackHeader.columns.status));
    const brand = cellText(at(row, rackHeader.columns.brand));
    const serial = cellText(at(row, rackHeader.columns.serial));
    const rack: Rack = {
      kind: "rack",
      id: uid("rack"),
      name: name || `Rack ${sourceId || position}`,
      side: side ?? "left",
      position,
      heightU: height && height >= 1 && height <= 70 ? height : DEFAULT_HEIGHT,
      notes: joinNotes([
        brand,
        serial ? `N° série ${serial}` : "",
        !status.known && status.raw ? `Statut : ${status.raw}` : "",
        status.known && status.status !== "ok" && status.raw ? `Statut : ${status.raw}` : "",
      ]),
      equipment: [],
    };
    const draft: RackDraft = { key: idKey(sourceId || name), nameKey: norm(rack.name), rack, aisleName };
    occupied.add(slot);
    racks.push(draft);
    if (sourceId) {
      const key = idKey(sourceId);
      if (byId.has(key)) warnings.push(`${picked.rack.name} ligne ${line} : l'identifiant « ${sourceId} » est en double. Les équipements iront sur la première baie.`);
      else byId.set(key, draft);
    }
    if (!byName.has(draft.nameKey)) byName.set(draft.nameKey, draft);
  }

  const cooling: { unit: CoolingUnit; aisleName: string }[] = [];
  if (picked.cooling && coolingHeader) {
    if (coolingHeader.columns.side) assumedSide = false;
    for (const { row, line } of dataRows(picked.cooling.rows, coolingHeader.headerIndex)) {
      const name = cellText(at(row, coolingHeader.columns.name));
      const sourceId = cellText(at(row, coolingHeader.columns.id));
      const position = cellInt(at(row, coolingHeader.columns.position));
      if (!name && !sourceId && position === null) continue;
      if (position === null || position < 1) {
        warnings.push(`${picked.cooling.name} ligne ${line} : position d'allée manquante ou invalide.`);
        continue;
      }
      const side = cellSide(at(row, coolingHeader.columns.side)) ?? "left";
      if (cellSide(at(row, coolingHeader.columns.side))) assumedSide = false;
      const aisleName = cellText(at(row, coolingHeader.columns.aisle)) || DEFAULT_AISLE;
      const slot = slotKey(aisleName, side, position);
      if (occupied.has(slot)) {
        warnings.push(`${picked.cooling.name} ligne ${line} : la position ${position} est déjà occupée, « ${name || sourceId} » est ignoré.`);
        continue;
      }
      const status = parseStatus(at(row, coolingHeader.columns.status));
      const brand = cellText(at(row, coolingHeader.columns.brand));
      const capacity = cellNumber(at(row, coolingHeader.columns.capacity));
      const unit: CoolingUnit = {
        kind: "cooling",
        id: uid("cool"),
        name: name || `Cooling ${sourceId || position}`,
        side,
        position,
        coolingType: parseCoolingType(at(row, coolingHeader.columns.type)),
        capacityKw: capacity !== null && capacity >= 0 ? capacity : 0,
        status: status.status,
        notes: joinNotes([
          brand,
          !status.known && status.raw ? `Statut : ${status.raw}` : "",
        ]),
      };
      occupied.add(slot);
      cooling.push({ unit, aisleName });
    }
  } else if (picked.cooling && !coolingHeader) {
    warnings.push(`La feuille « ${picked.cooling.name} » n'a pas d'en-tête reconnu et a été ignorée.`);
  }

  if (picked.equipment && equipmentHeader) {
    for (const { row, line } of dataRows(picked.equipment.rows, equipmentHeader.headerIndex)) {
      const rackRef = cellText(at(row, equipmentHeader.columns.id));
      const rawU = at(row, equipmentHeader.columns.u);
      const typeLabel = cellText(at(row, equipmentHeader.columns.type));
      const brand = cellText(at(row, equipmentHeader.columns.brand));
      const model = cellText(at(row, equipmentHeader.columns.model));
      if (!rackRef && cellText(rawU) === "" && !typeLabel && !brand && !model) continue;
      const draft = byId.get(idKey(rackRef)) ?? byName.get(norm(rackRef));
      if (!draft) {
        warnings.push(`${picked.equipment.name} ligne ${line} : baie « ${rackRef || "?"} » introuvable.`);
        continue;
      }
      const span = parseUSpan(rawU);
      if (typeof span === "string") {
        warnings.push(`${picked.equipment.name} ligne ${line} : ${span}.`);
        continue;
      }
      const top = span.positionU + span.heightU - 1;
      if (top > 70) {
        warnings.push(`${picked.equipment.name} ligne ${line} : U${top} dépasse la hauteur maximale (70 U).`);
        continue;
      }
      const status = parseStatus(at(row, equipmentHeader.columns.status));
      const ip = cellText(at(row, equipmentHeader.columns.ip));
      const psu = cellInt(at(row, equipmentHeader.columns.psu));
      const ports = cellInt(at(row, equipmentHeader.columns.ports));
      const observations = cellText(at(row, equipmentHeader.columns.notes));
      const serial = cellText(at(row, equipmentHeader.columns.serial));
      const equipment: Equipment = {
        id: uid("eq"),
        name: equipmentName(typeLabel, brand, model),
        type: parseEquipmentType(typeLabel),
        manufacturer: brand,
        model,
        serial,
        assetTag: "",
        positionU: span.positionU,
        heightU: span.heightU,
        powerW: 0,
        status: status.status,
        ip,
        observations,
        psuCount: psu !== null && psu > 0 ? psu : 0,
        networkPorts: ports !== null && ports > 0 ? ports : 0,
        notes: !status.known && status.raw ? `Statut : ${status.raw}` : "",
      };
      draft.rack.equipment.push(equipment);
      if (top > draft.rack.heightU) draft.rack.heightU = top;
    }
  } else if (picked.equipment && !equipmentHeader) {
    warnings.push(`La feuille « ${picked.equipment.name} » n'a pas d'en-tête reconnu (colonnes Rack et Position U).`);
  }

  if (racks.length === 0 && cooling.length === 0) {
    return "Aucune baie ni unité de froid n'a pu être lue.";
  }

  for (const draft of racks) {
    const clashing = overlapping(draft.rack.equipment);
    if (clashing.length > 1) {
      const sample = clashing.slice(0, 3).map((eq) => `${eq.name} (${uRange(eq)})`).join(", ");
      warnings.push(`${draft.rack.name} : ${clashing.length} équipements se superposent (${sample}${clashing.length > 3 ? "…" : ""}).`);
    }
  }

  const aisleNames: string[] = [];
  const rememberAisle = (name: string) => {
    if (!aisleNames.includes(name)) aisleNames.push(name);
  };
  for (const draft of racks) rememberAisle(draft.aisleName);
  for (const entry of cooling) rememberAisle(entry.aisleName);

  const aisles: Aisle[] = aisleNames.map((name) => ({
    id: uid("aisle"),
    name,
    items: [
      ...racks.filter((draft) => draft.aisleName === name).map((draft) => draft.rack),
      ...cooling.filter((entry) => entry.aisleName === name).map((entry) => entry.unit),
    ],
  }));

  const dc: DataCenter = {
    id: uid("dc"),
    name: titleFromFile(fileName),
    location: "",
    notes: `Importé depuis ${fileName}.`,
    positionDirection: "ltr",
    aisles,
  };
  return { dc, warnings, assumedSide };
}

export function describeImport(dc: DataCenter) {
  const stats = summarize(dc);
  const parts = [
    stats.aisles > 1 ? `${stats.aisles} allées` : "1 allée",
    `${stats.racks} rack${stats.racks > 1 ? "s" : ""}`,
  ];
  if (stats.cooling > 0) parts.push(`${stats.cooling} unité${stats.cooling > 1 ? "s" : ""} de froid`);
  parts.push(`${stats.equipment} équipement${stats.equipment > 1 ? "s" : ""}`);
  return parts.join(", ");
}

function pickSheets(sheets: SheetGrid[]) {
  const assigned: Partial<Record<SheetKind, SheetGrid>> = {};
  const used = new Set<SheetGrid>();
  for (const sheet of sheets) {
    const role = sheetRole(sheet.name);
    if (role && !assigned[role]) {
      assigned[role] = sheet;
      used.add(sheet);
    }
  }
  for (const sheet of sheets) {
    if (used.has(sheet)) continue;
    const role = inferRole(sheet.rows);
    if (role && !assigned[role]) assigned[role] = sheet;
  }
  return assigned;
}

function sheetRole(name: string): SheetKind | null {
  const text = norm(name);
  if (text.includes("equip")) return "equipment";
  if (text.includes("cool") || text.includes("froid") || text.includes("refroid")) return "cooling";
  if (text.includes("rack")) return "rack";
  return null;
}

function inferRole(rows: unknown[][]): SheetKind | null {
  const equipment = locateHeader(rows, "equipment");
  if (equipment && equipment.score >= 3) return "equipment";
  const rack = locateHeader(rows, "rack");
  const cooling = locateHeader(rows, "cooling");
  if (rack && (!cooling || rack.score >= cooling.score)) return "rack";
  if (cooling) return "cooling";
  return null;
}

function locateHeader(rows: unknown[][], kind: SheetKind): LocatedHeader | null {
  let best: LocatedHeader | null = null;
  const limit = Math.min(rows.length, 8);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;
    const columns: Partial<Record<Column, number>> = {};
    let score = 0;
    row.forEach((cell, cellIndex) => {
      const column = classifyHeader(cell, kind);
      if (!column || columns[column] !== undefined) return;
      columns[column] = cellIndex;
      score += 1;
    });
    const valid = kind === "equipment"
      ? columns.u !== undefined && columns.id !== undefined
      : columns.position !== undefined && (columns.name !== undefined || columns.id !== undefined);
    if (!valid || score < 2) continue;
    if (!best || score > best.score) best = { headerIndex: index, columns, score };
  }
  return best;
}

function classifyHeader(value: unknown, kind: SheetKind): Column | null {
  const text = norm(value);
  if (!text) return null;
  if (kind === "equipment") {
    if (text === "rack" || text.startsWith("rack ")) return "id";
    if (text.includes("postion") || (text.includes("position") && text.includes("u")) || text === "u") return "u";
    if (text.includes("type")) return "type";
    if (text.includes("constructeur") || text.includes("marque") || text.includes("fabricant")) return "brand";
    if (text.includes("modele") || text === "model") return "model";
    if (text.includes("serie") || text.includes("serial")) return "serial";
    if (text.includes("adresse") || text === "ip" || text.includes("adresse ip")) return "ip";
    if (text.includes("alimentation")) return "psu";
    if (text.includes("port")) return "ports";
    if (text.includes("statut") || text === "etat" || text.startsWith("etat ")) return "status";
    if (text.includes("observation") || text.includes("remarque") || text.includes("commentaire") || text === "notes") return "notes";
    if (text.includes("allee")) return "aisle";
    if (text === "cote" || text.startsWith("cote ")) return "side";
    return null;
  }
  if (text.includes("allee")) return "aisle";
  if (text === "cote" || text.startsWith("cote ")) return "side";
  if (text.includes("serie") || text.includes("serial")) return "serial";
  if (text.includes("marque") || text.includes("constructeur") || text.includes("fabricant")) return "brand";
  if (text.includes("statut") || text === "etat" || text.startsWith("etat ")) return "status";
  if (text.includes("position") || text.includes("postion")) return "position";
  if (text.includes("nom") || text === "name") return "name";
  if (text === "id" || text.startsWith("id ")) return "id";
  if (text.includes("puissance") || text.includes("capacite") || text === "kw") return "capacity";
  if (text.includes("hauteur")) return "height";
  if (text.includes("type")) return "type";
  return null;
}

function dataRows(rows: unknown[][], headerIndex: number) {
  const out: { row: unknown[]; line: number }[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;
    if (row.every((cell) => cellText(cell) === "")) continue;
    out.push({ row, line: index + 1 });
  }
  return out;
}

function parseUSpan(value: unknown): { positionU: number; heightU: number } | string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const u = Math.round(value);
    if (u < 1) return "position U invalide";
    return { positionU: u, heightU: 1 };
  }
  const text = cellText(value);
  if (!text) return "position U manquante";
  const nums = text.match(/\d+/g)?.map((part) => Number(part)) ?? [];
  if (nums.length === 0 || nums.some((n) => !Number.isInteger(n) || n < 1)) return `position U illisible (${text})`;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { positionU: min, heightU: max - min + 1 };
}

function parseEquipmentType(value: unknown): EquipmentType {
  const text = norm(value);
  if (text.includes("pare feu") || text.includes("firewall")) return "firewall";
  if (text.includes("switch") || text.includes("commut")) return "switch";
  if (text.includes("routeur") || text === "router") return "router";
  if (text.includes("pdu") || text.includes("onduleur")) return "pdu";
  if (text.includes("brassage") || text.includes("patch")) return "patch";
  if (text.includes("obturat") || text === "blank") return "blank";
  if (text.includes("nas") || text.includes("stock") || text.includes("baie") || text.includes("disque") || text.includes("san")) return "storage";
  if (text.includes("serveur") || text.includes("server") || text.includes("noeud") || text.includes("hyperviseur")) return "server";
  return "other";
}

function parseCoolingType(value: unknown): CoolingType {
  const text = norm(value);
  if (text.includes("crah")) return "crah";
  if (text.includes("crac")) return "crac";
  if (text.includes("rdhx") || text.includes("porte froide")) return "rdhx";
  return "in-row";
}

function parseStatus(value: unknown): { status: EquipmentStatus; known: boolean; raw: string } {
  const raw = cellText(value);
  const text = norm(raw);
  if (!text) return { status: "ok", known: true, raw };
  if (["actif", "active", "ok", "en service", "up", "on", "operationnel"].includes(text)) return { status: "ok", known: true, raw };
  if (text === "hs" || text.includes("hors service") || text.includes("hors ligne") || text === "offline" || text === "down" || text === "ko" || text.includes("arrete")) {
    return { status: "offline", known: true, raw };
  }
  if (text.includes("alerte") || text.includes("warning") || text.includes("degrade")) return { status: "warning", known: true, raw };
  if (text.includes("critique") || text.includes("critical") || text.includes("panne")) return { status: "critical", known: true, raw };
  if (text.includes("maintenance") || text.startsWith("maint")) return { status: "maintenance", known: true, raw };
  return { status: "ok", known: false, raw };
}

function equipmentName(typeLabel: string, brand: string, model: string) {
  const modelClean = model.replace(/\s+/g, " ").trim();
  const brandClean = brand.replace(/\s+/g, " ").trim();
  if (modelClean && brandClean && norm(modelClean) !== norm(brandClean) && !norm(modelClean).includes(norm(brandClean))) {
    return `${brandClean} ${modelClean}`;
  }
  if (modelClean) return modelClean;
  if (brandClean) return brandClean;
  if (typeLabel.trim()) return typeLabel.replace(/\s+/g, " ").trim();
  return "Équipement";
}

function overlapping(equipment: Equipment[]) {
  const sorted = [...equipment].sort((a, b) => a.positionU - b.positionU || b.heightU - a.heightU);
  const flagged = new Set<string>();
  for (let i = 0; i < sorted.length; i += 1) {
    const end = sorted[i].positionU + sorted[i].heightU - 1;
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j].positionU > end) break;
      flagged.add(sorted[i].id);
      flagged.add(sorted[j].id);
    }
  }
  return equipment.filter((eq) => flagged.has(eq.id));
}

function titleFromFile(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base || "Inventaire";
}

function slotKey(aisle: string, side: Side, position: number) {
  return `${norm(aisle)}|${side}|${position}`;
}

function at(row: unknown[], index: number | undefined) {
  if (index === undefined) return null;
  return row[index] ?? null;
}

function cellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toLocaleDateString("fr-FR");
  return String(value).replace(/\s+/g, " ").trim();
}

function cellInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const text = cellText(value).replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function cellNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value).replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cellSide(value: unknown): Side | null {
  const text = norm(value);
  if (!text) return null;
  if (text === "g" || text === "l" || text === "left" || text.startsWith("gauche")) return "left";
  if (text === "d" || text === "r" || text === "right" || text.startsWith("droite")) return "right";
  return null;
}

function idKey(value: unknown) {
  const text = cellText(value);
  if (/^\d+$/.test(text)) return String(Number(text));
  return norm(text);
}

function norm(value: unknown) {
  return cellText(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function joinNotes(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n");
}
