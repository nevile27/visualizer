import type { Equipment, EquipmentType } from "./types";

/** Identifiant de façade. Ajouter une entrée dans RULES pour un nouveau modèle. */
type FaceId =
  | "dell-2u"
  | "dell-1u"
  | "hpe-2u"
  | "hpe-1u"
  | "ibm-2u"
  | "ibm-power"
  | "lenovo"
  | "nutanix"
  | "catalyst-24"
  | "catalyst-48"
  | "catalyst-chassis"
  | "nexus"
  | "arista"
  | "fortinet"
  | "palo"
  | "checkpoint"
  | "asa"
  | "netapp"
  | "pure"
  | "synology"
  | "ibm-shelf"
  | "tape"
  | "pdu"
  | "patch"
  | "router"
  | "server"
  | "switch"
  | "firewall"
  | "storage"
  | "blank"
  | "other";

interface FaceMatch {
  face: FaceId;
  caption: string;
}

const RULES: { includes: string; face: FaceId; caption: string }[] = [
  { includes: "poweredger76", face: "dell-2u", caption: "R760" },
  { includes: "poweredger75", face: "dell-2u", caption: "R750" },
  { includes: "poweredger74", face: "dell-2u", caption: "R740" },
  { includes: "poweredger515", face: "dell-1u", caption: "R515" },
  { includes: "poweredger23", face: "dell-1u", caption: "R230" },
  { includes: "dl380", face: "hpe-2u", caption: "DL380" },
  { includes: "dl390", face: "hpe-2u", caption: "DL390" },
  { includes: "380g7", face: "hpe-2u", caption: "DL380" },
  { includes: "dl320", face: "hpe-1u", caption: "DL320" },
  { includes: "ml310", face: "hpe-1u", caption: "ML310" },
  { includes: "ml30", face: "hpe-1u", caption: "ML30" },
  { includes: "microserver", face: "hpe-1u", caption: "Micro" },
  { includes: "x3650", face: "ibm-2u", caption: "x3650" },
  { includes: "x350", face: "ibm-2u", caption: "x350" },
  { includes: "powers1022", face: "ibm-power", caption: "S1022" },
  { includes: "power740", face: "ibm-power", caption: "P740" },
  { includes: "powerhmc", face: "ibm-power", caption: "HMC" },
  { includes: "sr650", face: "lenovo", caption: "SR650" },
  { includes: "thinksystem", face: "lenovo", caption: "SR650" },
  { includes: "nutanix", face: "nutanix", caption: "NX" },
  { includes: "noeud", face: "nutanix", caption: "NX" },
  { includes: "9400", face: "catalyst-chassis", caption: "9400" },
  { includes: "930024", face: "catalyst-24", caption: "9300" },
  { includes: "930048", face: "catalyst-48", caption: "9300" },
  { includes: "c930048", face: "catalyst-48", caption: "9300" },
  { includes: "9300", face: "catalyst-48", caption: "9300" },
  { includes: "9200", face: "catalyst-24", caption: "9200" },
  { includes: "2960", face: "catalyst-24", caption: "2960" },
  { includes: "business350", face: "catalyst-24", caption: "CBS350" },
  { includes: "nexus", face: "nexus", caption: "Nexus" },
  { includes: "9336", face: "nexus", caption: "9336" },
  { includes: "9364", face: "nexus", caption: "9364" },
  { includes: "7050", face: "arista", caption: "7050" },
  { includes: "arista", face: "arista", caption: "7050" },
  { includes: "sam755", face: "switch", caption: "IBM" },
  { includes: "fortigate", face: "fortinet", caption: "FG" },
  { includes: "fortianaly", face: "fortinet", caption: "FAZ" },
  { includes: "forti", face: "fortinet", caption: "FG" },
  { includes: "pa5410", face: "palo", caption: "5410" },
  { includes: "palo", face: "palo", caption: "PA" },
  { includes: "checkpoint", face: "checkpoint", caption: "CP" },
  { includes: "asa", face: "asa", caption: "ASA" },
  { includes: "affa250", face: "netapp", caption: "A250" },
  { includes: "ns224", face: "netapp", caption: "NS224" },
  { includes: "netapp", face: "netapp", caption: "A250" },
  { includes: "flasharray", face: "pure", caption: "X20" },
  { includes: "purestorage", face: "pure", caption: "X20" },
  { includes: "synology", face: "synology", caption: "SYNO" },
  { includes: "rs122", face: "synology", caption: "RS" },
  { includes: "ds1522", face: "synology", caption: "DS" },
  { includes: "storewize", face: "ibm-shelf", caption: "FS" },
  { includes: "7300", face: "ibm-shelf", caption: "7300" },
  { includes: "dat72", face: "tape", caption: "DAT" },
  { includes: "storageworks", face: "tape", caption: "DAT" },
  { includes: "ap8853", face: "pdu", caption: "PDU" },
  { includes: "commscope", face: "patch", caption: "LC" },
  { includes: "panel48", face: "patch", caption: "LC" },
  { includes: "8201", face: "router", caption: "8201" },
];

const BY_TYPE: Record<EquipmentType, FaceId> = {
  server: "server",
  storage: "storage",
  switch: "switch",
  router: "router",
  firewall: "firewall",
  pdu: "pdu",
  patch: "patch",
  blank: "blank",
  other: "other",
};

function compact(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function matchEquipmentFace(equipment: Pick<Equipment, "manufacturer" | "model" | "type">): FaceMatch {
  const key = compact(`${equipment.manufacturer} ${equipment.model}`);
  const rule = RULES.find((entry) => key.includes(entry.includes));
  if (rule) return { face: rule.face, caption: rule.caption };
  return { face: BY_TYPE[equipment.type] ?? "other", caption: "" };
}

function drives(count: number, x: number, y: number, w: number, h: number, led: string) {
  let out = "";
  for (let index = 0; index < count; index += 1) {
    const px = x + index * (w + 4);
    out += `<rect x="${px}" y="${y}" width="${w}" height="${h}" rx="2" fill="#0c0e12" stroke="#465062" stroke-width="1"/>`;
    out += `<rect x="${px + 3}" y="${y + 3}" width="${w - 6}" height="${Math.max(4, h * 0.28)}" fill="#2c3442"/>`;
    out += `<circle cx="${px + w - 6}" cy="${y + h - 6}" r="2" fill="${led}"/>`;
  }
  return out;
}

function rj45(count: number, x: number, y: number, color: string) {
  let out = "";
  for (let index = 0; index < count; index += 1) {
    out += `<rect x="${x + index * 12}" y="${y}" width="9" height="11" rx="1" fill="${color}" stroke="#07090c" stroke-width="0.6"/>`;
  }
  return out;
}

function qsfp(count: number, x: number, y: number, color: string) {
  let out = "";
  for (let index = 0; index < count; index += 1) {
    out += `<rect x="${x + index * 16}" y="${y}" width="12" height="12" rx="1" fill="${color}" stroke="#d7e2ef" stroke-width="0.6"/>`;
  }
  return out;
}

function disks(count: number, x: number, y: number, led: string) {
  let out = "";
  for (let index = 0; index < count; index += 1) {
    const px = x + index * 16;
    out += `<circle cx="${px}" cy="${y}" r="6" fill="#10141a" stroke="#8ea0b5" stroke-width="1"/>`;
    out += `<circle cx="${px + 4}" cy="${y + 4}" r="1.4" fill="${led}"/>`;
  }
  return out;
}

function panel(bg: string, accent: string, body: string, caption: string) {
  const label = caption
    ? `<text x="612" y="30" text-anchor="end" fill="#e7eef6" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700">${caption}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="96" viewBox="0 0 640 48" preserveAspectRatio="none">
    <rect width="640" height="48" fill="${bg}"/>
    <rect width="16" height="48" fill="${accent}"/>
    <rect x="16" width="624" height="4" fill="${accent}"/>
    <circle cx="28" cy="14" r="2.2" fill="#1a1f27"/><circle cx="28" cy="36" r="2.2" fill="#1a1f27"/>
    ${body}${label}
  </svg>`;
}

function renderFace(match: FaceMatch) {
  const { face, caption } = match;
  switch (face) {
    case "dell-2u":
      return panel("#5c6776", "#3ddea0", drives(8, 36, 10, 22, 28, "#3ddea0") + `<rect x="250" y="10" width="250" height="28" fill="#3e4856"/><path d="M260 18h230M260 26h230M260 34h230" stroke="#7d8b9e" stroke-width="2"/>`, caption);
    case "dell-1u":
      return panel("#5c6776", "#3ddea0", drives(4, 36, 12, 32, 24, "#3ddea0") + rj45(8, 200, 18, "#d5dee8"), caption);
    case "hpe-2u":
      return panel("#66707e", "#3aa0ff", drives(8, 36, 10, 22, 28, "#3aa0ff"), caption);
    case "hpe-1u":
      return panel("#66707e", "#3aa0ff", drives(4, 36, 12, 36, 24, "#3aa0ff"), caption);
    case "ibm-2u":
      return panel("#5a6270", "#e2a23a", drives(6, 36, 10, 28, 28, "#e2a23a"), caption);
    case "ibm-power":
      return panel("#5a6270", "#e2a23a", drives(4, 36, 12, 40, 24, "#e2a23a") + `<rect x="230" y="12" width="170" height="24" rx="2" fill="#3e4856" stroke="#e2a23a"/>`, caption);
    case "lenovo":
      return panel("#5c6168", "#e10600", drives(8, 36, 10, 22, 28, "#e10600"), caption);
    case "nutanix":
      return panel("#4d6278", "#49d6c5", drives(6, 36, 10, 30, 28, "#49d6c5"), caption);
    case "catalyst-24":
      return panel("#596270", "#e2b34a", rj45(12, 36, 10, "#f2f5f8") + rj45(12, 36, 26, "#d5dde6") + qsfp(4, 200, 18, "#2a3848"), caption);
    case "catalyst-48":
      return panel("#596270", "#e2b34a", rj45(18, 36, 8, "#f2f5f8") + rj45(18, 36, 26, "#d5dde6") + qsfp(4, 270, 18, "#2a3848"), caption);
    case "catalyst-chassis":
      return panel("#596270", "#e2b34a", [0, 1, 2, 3].map((index) => `<rect x="${36 + index * 110}" y="10" width="96" height="28" rx="2" fill="#3e4856" stroke="#d5dde6"/>`).join(""), caption);
    case "nexus":
      return panel("#4e5c6c", "#7fd4ee", qsfp(16, 36, 8, "#d7e6f2") + qsfp(16, 36, 26, "#b7c9da"), caption);
    case "arista":
      return panel("#4e635c", "#3ddea0", qsfp(14, 36, 8, "#d7eee4") + qsfp(14, 36, 26, "#b7d4c8"), caption);
    case "fortinet":
      return panel("#5a6574", "#e85d4c", rj45(10, 36, 10, "#f4f7fb") + rj45(10, 36, 26, "#d5dee8") + qsfp(4, 180, 18, "#2c3a48"), caption);
    case "palo":
      return panel("#6a5e50", "#f08a24", rj45(12, 36, 18, "#f6efe4") + qsfp(4, 200, 17, "#4a3c2c"), caption);
    case "checkpoint":
      return panel("#6a5558", "#e23b3b", rj45(10, 36, 18, "#f6e4e6") + qsfp(2, 180, 17, "#4a3034"), caption);
    case "asa":
      return panel("#566070", "#f0c14b", rj45(8, 36, 18, "#f4f7fb") + qsfp(4, 160, 17, "#2c3a48"), caption);
    case "netapp":
      return panel("#4e6270", "#3aa0ff", disks(18, 44, 26, "#3aa0ff"), caption);
    case "pure":
      return panel("#6a5c48", "#f08a24", disks(16, 44, 26, "#f08a24"), caption);
    case "synology":
      return panel("#5c6168", "#3ddea0", drives(4, 36, 10, 44, 28, "#3ddea0"), caption);
    case "ibm-shelf":
      return panel("#566070", "#e2a23a", disks(20, 40, 26, "#e2a23a"), caption);
    case "tape":
      return panel("#5c6572", "#d0d7e0", `<rect x="36" y="10" width="70" height="28" rx="3" fill="#3e4856" stroke="#f4f7fb"/><circle cx="71" cy="24" r="8" fill="none" stroke="#f4f7fb"/>`, caption);
    case "pdu":
      return panel("#4e555e", "#f0c14b", Array.from({ length: 10 }, (_, index) => `<circle cx="${48 + index * 28}" cy="26" r="8" fill="#2a313a" stroke="#f4f7fb" stroke-width="2"/>`).join(""), caption);
    case "patch":
      return panel("#526070", "#7fd4ee", Array.from({ length: 16 }, (_, index) => `<rect x="${36 + index * 22}" y="14" width="8" height="20" rx="1" fill="#3aa0ff"/><rect x="${46 + index * 22}" y="14" width="8" height="20" rx="1" fill="#3ddea0"/>`).join(""), caption);
    case "router":
      return panel("#5a6572", "#f39a4a", qsfp(6, 36, 18, "#d7e2ee") + rj45(4, 150, 18, "#f4f7fb"), caption);
    case "server":
      return panel("#5c6776", "#3ddea0", drives(6, 36, 10, 30, 28, "#3ddea0"), "");
    case "switch":
      return panel("#596270", "#f0c14b", rj45(16, 36, 8, "#f2f5f8") + rj45(16, 36, 26, "#d5dde6"), "");
    case "firewall":
      return panel("#6a5a5e", "#f07178", rj45(8, 36, 18, "#f6e4e6") + qsfp(2, 160, 17, "#4a3034"), "");
    case "storage":
      return panel("#56507a", "#b3a6ff", disks(16, 44, 26, "#d5ccff"), "");
    case "blank":
      return panel("#6a7380", "#8b97a6", `<rect x="36" y="16" width="500" height="16" fill="#55606e"/>`, "");
    default:
      return panel("#6a7380", "#c5d0dc", `<rect x="36" y="16" width="360" height="16" rx="2" fill="#55606e"/>`, "");
  }
}

const urls = new Map<string, string>();

export function equipmentFaceUrl(equipment: Pick<Equipment, "manufacturer" | "model" | "type">) {
  const match = matchEquipmentFace(equipment);
  const key = `${match.face}:${match.caption}`;
  const cached = urls.get(key);
  if (cached) return cached;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderFace(match))}`;
  urls.set(key, url);
  return url;
}
