import type {
  Aisle,
  AisleItem,
  CoolingType,
  CoolingUnit,
  DataCenter,
  Equipment,
  EquipmentStatus,
  EquipmentType,
  GenerateInput,
  PositionDirection,
  Rack,
  Side,
} from "./types";

export const EQUIPMENT_TYPES: { id: EquipmentType; label: string; color: string; ink: string }[] = [
  { id: "server", label: "Serveur", color: "#3ddea0", ink: "#062117" },
  { id: "storage", label: "Stockage", color: "#8b7cf7", ink: "#140c33" },
  { id: "switch", label: "Switch", color: "#f0c14b", ink: "#2a2106" },
  { id: "router", label: "Routeur", color: "#f39a4a", ink: "#2a1604" },
  { id: "firewall", label: "Pare-feu", color: "#f07178", ink: "#2a0c10" },
  { id: "pdu", label: "PDU", color: "#5ec8f0", ink: "#04202b" },
  { id: "patch", label: "Brassage", color: "#b7c3d0", ink: "#1a212b" },
  { id: "blank", label: "Obturateur", color: "#334155", ink: "#d5deea" },
  { id: "other", label: "Autre", color: "#d7dee8", ink: "#1a212b" },
];

export const STATUSES: { id: EquipmentStatus; label: string; color: string }[] = [
  { id: "ok", label: "En service", color: "#3ddea0" },
  { id: "warning", label: "Alerte", color: "#f0c14b" },
  { id: "critical", label: "Critique", color: "#f07178" },
  { id: "maintenance", label: "Maintenance", color: "#5ec8f0" },
  { id: "offline", label: "Hors ligne", color: "#8b97a6" },
];

export const COOLING_TYPES: { id: CoolingType; label: string }[] = [
  { id: "in-row", label: "In-row" },
  { id: "crac", label: "CRAC" },
  { id: "crah", label: "CRAH" },
  { id: "rdhx", label: "Porte froide (RDHx)" },
];

export const SIDES: { id: Side; label: string }[] = [
  { id: "left", label: "Gauche" },
  { id: "right", label: "Droite" },
];

const STATUS_RANK: EquipmentStatus[] = ["ok", "offline", "maintenance", "warning", "critical"];

export function uid(prefix: string) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

export function typeMeta(type: EquipmentType) {
  return EQUIPMENT_TYPES.find((t) => t.id === type) ?? EQUIPMENT_TYPES[EQUIPMENT_TYPES.length - 1];
}

export function statusMeta(status: EquipmentStatus) {
  return STATUSES.find((s) => s.id === status) ?? STATUSES[0];
}

export function sideLabel(side: Side) {
  return side === "left" ? "Gauche" : "Droite";
}

export function coolingLabel(type: CoolingType) {
  return COOLING_TYPES.find((t) => t.id === type)?.label ?? type;
}

export function sideItems(aisle: Aisle, side: Side) {
  return aisle.items.filter((item) => item.side === side).sort((a, b) => a.position - b.position);
}

export function maxPosition(dc: DataCenter) {
  let max = 0;
  for (const aisle of dc.aisles) {
    for (const item of aisle.items) max = Math.max(max, item.position);
  }
  return Math.max(max, 1);
}

export function positionDirection(dc: DataCenter): PositionDirection {
  return dc.positionDirection === "rtl" ? "rtl" : "ltr";
}

/** Zero-based column from the left edge of the plan. */
export function slotFromLeft(position: number, slots: number, direction: PositionDirection) {
  if (direction === "rtl") return Math.max(0, slots - position);
  return Math.max(0, position - 1);
}

export function usedU(rack: Rack) {
  return rack.equipment.reduce((sum, eq) => sum + eq.heightU, 0);
}

export function rackPowerW(rack: Rack) {
  return rack.equipment.reduce((sum, eq) => sum + (eq.powerW || 0), 0);
}

export function summarize(dc: DataCenter) {
  let racks = 0;
  let cooling = 0;
  let powerW = 0;
  let capacityKw = 0;
  let equipment = 0;
  for (const aisle of dc.aisles) {
    for (const item of aisle.items) {
      if (item.kind === "rack") {
        racks += 1;
        equipment += item.equipment.length;
        powerW += rackPowerW(item);
      } else {
        cooling += 1;
        capacityKw += item.capacityKw || 0;
      }
    }
  }
  return { aisles: dc.aisles.length, racks, cooling, powerW, capacityKw, equipment };
}

export function formatKwFromW(watts: number) {
  return `${(watts / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kW`;
}

export function splitLegacyEquipmentNotes(notes: string) {
  const observations: string[] = [];
  const leftovers: string[] = [];
  let ip = "";
  let psuCount = 0;
  let networkPorts = 0;
  for (const line of notes.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
    const labeled = line.match(/^(?:ip|adresse ip)\s*:?\s*(.+)$/i);
    if (labeled) {
      if (!ip) ip = labeled[1].trim();
      continue;
    }
    const psu = line.match(/^(\d+)\s+alimentations?$/i);
    if (psu) {
      psuCount = Number(psu[1]);
      continue;
    }
    const ports = line.match(/^(\d+)\s+ports?(?:\s+réseau)?$/i);
    if (ports) {
      networkPorts = Number(ports[1]);
      continue;
    }
    if (/^statut\s*:/i.test(line)) {
      leftovers.push(line);
      continue;
    }
    observations.push(line);
    if (!ip) {
      const address = line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      if (address) ip = address[0];
    }
  }
  return { ip, observations: observations.join("\n"), psuCount, networkPorts, notes: leftovers.join("\n") };
}

export function normalizeEquipment(equipment: Equipment): Equipment {
  const raw = equipment as Partial<Pick<Equipment, "ip" | "observations" | "psuCount" | "networkPorts" | "notes">>;
  const structured = raw.ip !== undefined || raw.observations !== undefined || raw.psuCount !== undefined || raw.networkPorts !== undefined;
  if (structured) {
    return {
      ...equipment,
      ip: raw.ip ?? "",
      observations: raw.observations ?? "",
      psuCount: raw.psuCount ?? 0,
      networkPorts: raw.networkPorts ?? 0,
      notes: raw.notes ?? "",
    };
  }
  return { ...equipment, ...splitLegacyEquipmentNotes(raw.notes ?? "") };
}

export function normalizeCenters(centers: DataCenter[]): DataCenter[] {
  return centers.map((dc) => ({
    ...dc,
    aisles: dc.aisles.map((aisle) => ({
      ...aisle,
      items: aisle.items.map((item) => (
        item.kind === "rack"
          ? { ...item, equipment: item.equipment.map((equipment) => normalizeEquipment(equipment)) }
          : item
      )),
    })),
  }));
}

export function uRange(eq: Pick<Equipment, "positionU" | "heightU">) {
  if (eq.heightU <= 1) return `U${eq.positionU}`;
  return `U${eq.positionU}–${eq.positionU + eq.heightU - 1}`;
}

export function worstStatus(statuses: EquipmentStatus[]): EquipmentStatus | null {
  let best = -1;
  let found: EquipmentStatus | null = null;
  for (const status of statuses) {
    const rank = STATUS_RANK.indexOf(status);
    if (rank > best) {
      best = rank;
      found = status;
    }
  }
  return found;
}

export function placementError(rack: Rack, positionU: number, heightU: number, ignoreId?: string) {
  if (!Number.isInteger(positionU) || positionU < 1) return "La position U doit être un entier supérieur ou égal à 1.";
  if (!Number.isInteger(heightU) || heightU < 1) return "La hauteur doit être un entier de U supérieur ou égal à 1.";
  if (positionU + heightU - 1 > rack.heightU) return `Cet équipement dépasse le haut de la baie (${rack.heightU} U).`;
  const end = positionU + heightU - 1;
  for (const eq of rack.equipment) {
    if (eq.id === ignoreId) continue;
    const otherEnd = eq.positionU + eq.heightU - 1;
    if (positionU <= otherEnd && eq.positionU <= end) {
      return `Chevauche ${eq.name} (${uRange(eq)}).`;
    }
  }
  return null;
}

export function slotError(aisle: Aisle, side: Side, position: number, ignoreId?: string) {
  if (!Number.isInteger(position) || position < 1) return "La position dans l'allée doit être un entier supérieur ou égal à 1.";
  const other = aisle.items.find((item) => item.side === side && item.position === position && item.id !== ignoreId);
  if (other) return `La position ${position} côté ${sideLabel(side).toLowerCase()} est déjà occupée par ${other.name}.`;
  return null;
}

export function nextPosition(aisle: Aisle, side: Side) {
  const used = new Set(aisle.items.filter((item) => item.side === side).map((item) => item.position));
  let position = 1;
  while (used.has(position)) position += 1;
  return position;
}

export function nextFreeU(rack: Rack, heightU: number, from = 1) {
  for (let u = Math.max(1, from); u <= rack.heightU; u += 1) {
    if (!placementError(rack, u, heightU)) return u;
  }
  return null;
}

export function suggestRackName(aisle: Aisle, side: Side) {
  const count = aisle.items.filter((item) => item.kind === "rack" && item.side === side).length + 1;
  const letter = aisle.name.replace(/^allée\s+/i, "").trim() || aisle.name;
  const code = side === "left" ? "G" : "D";
  return `${letter}-${code}${String(count).padStart(2, "0")}`;
}

export function suggestCoolingName(aisle: Aisle) {
  const count = aisle.items.filter((item) => item.kind === "cooling").length + 1;
  const letter = aisle.name.replace(/^allée\s+/i, "").trim() || aisle.name;
  return `${letter}-C${count}`;
}

export function defaultRackHeight(aisle: Aisle) {
  const racks = aisle.items.filter((item): item is Rack => item.kind === "rack");
  return racks.length ? racks[racks.length - 1].heightU : 42;
}

export function generateDataCenter(input: GenerateInput): DataCenter {
  const sides: Side[] = input.rows === "both" ? ["left", "right"] : ["left"];
  const aisles: Aisle[] = [];
  for (let a = 0; a < input.aisleCount; a += 1) {
    const letter = a < 26 ? String.fromCharCode(65 + a) : `${a + 1}`;
    const aisle: Aisle = { id: uid("aisle"), name: `Allée ${letter}`, items: [] };
    for (const side of sides) {
      let position = 1;
      let coolingCount = 0;
      for (let rackIndex = 0; rackIndex < input.racksPerSide; rackIndex += 1) {
        if (input.coolingEvery > 0 && rackIndex > 0 && rackIndex % input.coolingEvery === 0) {
          coolingCount += 1;
          const sideCode = side === "left" ? "G" : "D";
          aisle.items.push({
            kind: "cooling",
            id: uid("cool"),
            name: `${letter}-${sideCode}-C${coolingCount}`,
            side,
            position,
            coolingType: "in-row",
            capacityKw: 30,
            status: "ok",
            notes: "",
          });
          position += 1;
        }
        const code = side === "left" ? "G" : "D";
        aisle.items.push({
          kind: "rack",
          id: uid("rack"),
          name: `${letter}-${code}${String(rackIndex + 1).padStart(2, "0")}`,
          side,
          position,
          heightU: input.heightU,
          notes: "",
          equipment: [],
        });
        position += 1;
      }
    }
    aisles.push(aisle);
  }
  return {
    id: uid("dc"),
    name: input.name.trim() || "Nouveau centre",
    location: input.location.trim(),
    notes: "",
    positionDirection: "ltr",
    aisles,
  };
}

export function findAisle(dc: DataCenter, aisleId: string) {
  return dc.aisles.find((aisle) => aisle.id === aisleId) ?? null;
}

export function findItem(dc: DataCenter, aisleId: string, itemId: string) {
  const aisle = findAisle(dc, aisleId);
  const item = aisle?.items.find((entry) => entry.id === itemId) ?? null;
  return { aisle, item };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asInt(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const TYPE_IDS = new Set(EQUIPMENT_TYPES.map((type) => type.id));
const STATUS_IDS = new Set(STATUSES.map((status) => status.id));
const COOLING_IDS = new Set(COOLING_TYPES.map((type) => type.id));

function parseSide(value: unknown, ctx: string): Side | string {
  if (value === "left" || value === "gauche" || value === "G" || value === "g") return "left";
  if (value === "right" || value === "droite" || value === "D" || value === "d") return "right";
  return `${ctx} : le côté doit être "left"/"gauche" ou "right"/"droite".`;
}

function parsePosition(raw: Record<string, unknown>, ctx: string): number | string {
  if ("position" in raw) {
    const position = asInt(raw.position);
    if (position === null || position < 1) return `${ctx} : "position" doit être un entier ≥ 1 (1 = première place).`;
    return position;
  }
  if ("index" in raw) {
    const index = asInt(raw.index);
    if (index === null || index < 0) return `${ctx} : "index" doit être un entier ≥ 0.`;
    return index + 1;
  }
  return `${ctx} : indiquez "position" (à partir de 1) ou "index" (à partir de 0).`;
}

function parseEquipment(raw: unknown, ctx: string, rackId: string, ordinal: number): Equipment | string {
  if (!isRecord(raw)) return `${ctx} : équipement n°${ordinal} invalide.`;
  const name = asString(raw.name);
  if (!name) return `${ctx} : l'équipement n°${ordinal} n'a pas de nom.`;
  const positionU = asInt(raw.positionU);
  const heightU = asInt(raw.heightU ?? 1);
  if (positionU === null || positionU < 1) return `${ctx} / ${name} : "positionU" doit être un entier ≥ 1 (U1 en bas).`;
  if (heightU === null || heightU < 1) return `${ctx} / ${name} : "heightU" doit être un entier ≥ 1.`;
  const type = asString(raw.type, "other");
  const status = asString(raw.status, "ok");
  const draft: Equipment = {
    id: asString(raw.id) || `${rackId}-eq${ordinal}`,
    name,
    type: TYPE_IDS.has(type as EquipmentType) ? (type as EquipmentType) : "other",
    manufacturer: asString(raw.manufacturer),
    model: asString(raw.model),
    serial: asString(raw.serial),
    assetTag: asString(raw.assetTag),
    positionU,
    heightU,
    powerW: Math.max(0, Math.round(asNumber(raw.powerW))),
    status: STATUS_IDS.has(status as EquipmentStatus) ? (status as EquipmentStatus) : "ok",
    ip: "",
    observations: "",
    psuCount: 0,
    networkPorts: 0,
    notes: asString(raw.notes),
  };
  const structured = "ip" in raw || "observations" in raw || "psuCount" in raw || "networkPorts" in raw;
  if (!structured) return { ...draft, ...splitLegacyEquipmentNotes(draft.notes) };
  return {
    ...draft,
    ip: asString(raw.ip),
    observations: asString(raw.observations),
    psuCount: Math.max(0, Math.round(asNumber(raw.psuCount))),
    networkPorts: Math.max(0, Math.round(asNumber(raw.networkPorts))),
  };
}

function parseItem(raw: unknown, ctx: string, ordinal: number): AisleItem | string {
  if (!isRecord(raw)) return `${ctx} : élément n°${ordinal} invalide.`;
  const name = asString(raw.name);
  if (!name) return `${ctx} : l'élément n°${ordinal} n'a pas de nom.`;
  const side = parseSide(raw.side, `${ctx} / ${name}`);
  if (typeof side === "string") return side;
  const position = parsePosition(raw, `${ctx} / ${name}`);
  if (typeof position === "string") return position;
  const kindRaw = asString(raw.kind);
  const kind = kindRaw === "cooling" || kindRaw === "rack"
    ? kindRaw
    : raw.coolingType !== undefined || raw.capacityKw !== undefined
      ? "cooling"
      : "rack";
  const id = asString(raw.id) || uid(kind === "rack" ? "rack" : "cool");
  const status = asString(raw.status, "ok");
  if (kind === "cooling") {
    const coolingType = asString(raw.coolingType, "in-row");
    const unit: CoolingUnit = {
      kind: "cooling",
      id,
      name,
      side,
      position,
      coolingType: COOLING_IDS.has(coolingType as CoolingType) ? (coolingType as CoolingType) : "in-row",
      capacityKw: Math.max(0, asNumber(raw.capacityKw)),
      status: STATUS_IDS.has(status as EquipmentStatus) ? (status as EquipmentStatus) : "ok",
      notes: asString(raw.notes),
    };
    return unit;
  }
  const heightU = asInt(raw.heightU ?? 42);
  if (heightU === null || heightU < 1 || heightU > 70) return `${ctx} / ${name} : "heightU" doit être un entier entre 1 et 70.`;
  const equipmentRaw = raw.equipment ?? [];
  if (!Array.isArray(equipmentRaw)) return `${ctx} / ${name} : "equipment" doit être une liste.`;
  const equipment: Equipment[] = [];
  for (let i = 0; i < equipmentRaw.length; i += 1) {
    const parsed = parseEquipment(equipmentRaw[i], `${ctx} / ${name}`, id, i + 1);
    if (typeof parsed === "string") return parsed;
    equipment.push(parsed);
  }
  const rack: Rack = { kind: "rack", id, name, side, position, heightU, notes: asString(raw.notes), equipment };
  for (const eq of equipment) {
    const error = placementError(rack, eq.positionU, eq.heightU, eq.id);
    if (error) return `${ctx} / ${name} / ${eq.name} : ${error}`;
  }
  return rack;
}

function parseAisle(raw: unknown, dcName: string, ordinal: number): Aisle | string {
  if (!isRecord(raw)) return `${dcName} : allée n°${ordinal} invalide.`;
  const name = asString(raw.name) || `Allée ${ordinal}`;
  const ctx = `${dcName} / ${name}`;
  const itemsRaw = raw.items ?? [];
  if (!Array.isArray(itemsRaw)) return `${ctx} : "items" doit être une liste de racks et de refroidissements.`;
  const items: AisleItem[] = [];
  for (let i = 0; i < itemsRaw.length; i += 1) {
    const parsed = parseItem(itemsRaw[i], ctx, i + 1);
    if (typeof parsed === "string") return parsed;
    const clash = items.find((item) => item.side === parsed.side && item.position === parsed.position);
    if (clash) {
      return `${ctx} : ${parsed.name} et ${clash.name} occupent tous les deux la position ${parsed.position} côté ${sideLabel(parsed.side).toLowerCase()}.`;
    }
    items.push(parsed);
  }
  return { id: asString(raw.id) || uid("aisle"), name, items };
}

function parseDataCenter(raw: unknown, ordinal: number): DataCenter | string {
  if (!isRecord(raw)) return `Le centre n°${ordinal} est invalide.`;
  const name = asString(raw.name) || `Centre ${ordinal}`;
  const aislesRaw = raw.aisles ?? [];
  if (!Array.isArray(aislesRaw)) return `${name} : "aisles" doit être une liste d'allées.`;
  const aisles: Aisle[] = [];
  for (let i = 0; i < aislesRaw.length; i += 1) {
    const parsed = parseAisle(aislesRaw[i], name, i + 1);
    if (typeof parsed === "string") return parsed;
    aisles.push(parsed);
  }
  return {
    id: asString(raw.id) || uid("dc"),
    name,
    location: asString(raw.location),
    notes: asString(raw.notes),
    positionDirection: parsePositionDirection(raw.positionDirection),
    aisles,
  };
}

function parsePositionDirection(value: unknown): PositionDirection {
  const text = asString(value).toLowerCase();
  if (text === "rtl" || text === "droite" || text === "right" || text === "droite-gauche" || text === "right-to-left") return "rtl";
  return "ltr";
}

export function parseDocument(data: unknown): DataCenter[] | string {
  let list: unknown[] | null = null;
  if (Array.isArray(data)) list = data;
  else if (isRecord(data) && Array.isArray(data.dataCenters)) list = data.dataCenters;
  else if (isRecord(data) && (Array.isArray(data.aisles) || typeof data.name === "string")) list = [data];
  if (!list) return "Le fichier doit contenir un centre, une liste de centres, ou un objet { dataCenters: [...] }.";
  if (list.length === 0) return "Aucun centre dans le fichier.";
  const centers: DataCenter[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const parsed = parseDataCenter(list[i], i + 1);
    if (typeof parsed === "string") return parsed;
    centers.push(parsed);
  }
  return centers;
}

export function safeFileName(name: string) {
  const cleaned = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "salle";
}

export const JSON_EXAMPLE = `{
  "dataCenters": [
    {
      "name": "PAR1",
      "location": "Paris",
      "positionDirection": "ltr",
      "aisles": [
        {
          "name": "Allée A",
          "items": [
            {
              "kind": "rack",
              "name": "A-01",
              "side": "left",
              "position": 1,
              "heightU": 42,
              "equipment": [
                {
                  "name": "srv-01",
                  "type": "server",
                  "manufacturer": "Dell",
                  "model": "PowerEdge R760",
                  "positionU": 10,
                  "heightU": 2,
                  "powerW": 420,
                  "status": "ok",
                  "ip": "172.16.0.10",
                  "observations": "Hyperviseur de la baie"
                }
              ]
            },
            {
              "kind": "cooling",
              "name": "A-C1",
              "side": "left",
              "position": 3,
              "coolingType": "in-row",
              "capacityKw": 30
            }
          ]
        }
      ]
    }
  ]
}`;
