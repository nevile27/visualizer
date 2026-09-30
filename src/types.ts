export type Side = "left" | "right";

/** Where position 1 sits on the plan. `ltr` counts left to right. */
export type PositionDirection = "ltr" | "rtl";

export type EquipmentType =
  | "server"
  | "storage"
  | "switch"
  | "router"
  | "firewall"
  | "pdu"
  | "patch"
  | "blank"
  | "other";

export type EquipmentStatus = "ok" | "warning" | "critical" | "maintenance" | "offline";

export type CoolingType = "in-row" | "crac" | "crah" | "rdhx";

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  manufacturer: string;
  model: string;
  serial: string;
  assetTag: string;
  positionU: number;
  heightU: number;
  powerW: number;
  status: EquipmentStatus;
  notes: string;
}

export interface Rack {
  kind: "rack";
  id: string;
  name: string;
  side: Side;
  /** 1-based slot along the aisle, numbered separately on each side. */
  position: number;
  heightU: number;
  notes: string;
  equipment: Equipment[];
}

export interface CoolingUnit {
  kind: "cooling";
  id: string;
  name: string;
  side: Side;
  position: number;
  coolingType: CoolingType;
  capacityKw: number;
  status: EquipmentStatus;
  notes: string;
}

export type AisleItem = Rack | CoolingUnit;

export interface Aisle {
  id: string;
  name: string;
  items: AisleItem[];
}

export interface DataCenter {
  id: string;
  name: string;
  location: string;
  notes: string;
  /** Defaults to left-to-right when omitted. */
  positionDirection?: PositionDirection;
  aisles: Aisle[];
}

export type ViewMode = "2d" | "3d";

export type Selection =
  | { kind: "aisle"; aisleId: string }
  | { kind: "item"; aisleId: string; itemId: string }
  | { kind: "equipment"; aisleId: string; itemId: string; equipmentId: string };

export interface GenerateInput {
  name: string;
  location: string;
  aisleCount: number;
  racksPerSide: number;
  coolingEvery: number;
  heightU: number;
  rows: "both" | "left";
}
