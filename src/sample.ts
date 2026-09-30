import type { CoolingUnit, DataCenter, Equipment, EquipmentStatus, Rack, Side } from "./types";

function equipment(partial: Omit<Equipment, "manufacturer" | "model" | "serial" | "assetTag" | "powerW" | "status" | "notes"> & Partial<Equipment>): Equipment {
  return {
    manufacturer: "",
    model: "",
    serial: "",
    assetTag: "",
    powerW: 0,
    status: "ok",
    notes: "",
    ...partial,
  };
}

function servers(rackId: string, prefix: string, from: number, to: number): Equipment[] {
  const list: Equipment[] = [];
  let n = 1;
  for (let u = from; u + 1 <= to; u += 2) {
    list.push(equipment({
      id: `${rackId}-${prefix}-${n}`,
      name: `${prefix}-${String(n).padStart(2, "0")}`,
      type: "server",
      manufacturer: "Dell",
      model: "PowerEdge R760",
      serial: `DLL-${rackId}-${n}`,
      assetTag: `${prefix}-${n}`,
      positionU: u,
      heightU: 2,
      powerW: 430,
      status: "ok",
    }));
    n += 1;
  }
  return list;
}

function rack(id: string, name: string, side: Side, position: number, equipmentList: Equipment[] = [], notes = ""): Rack {
  return { kind: "rack", id, name, side, position, heightU: 42, notes, equipment: equipmentList };
}

function cooling(
  id: string,
  name: string,
  side: Side,
  position: number,
  capacityKw: number,
  status: EquipmentStatus = "ok",
): CoolingUnit {
  return { kind: "cooling", id, name, side, position, coolingType: "in-row", capacityKw, status, notes: "" };
}

function productionRack(id: string, name: string, side: Side, position: number): Rack {
  const hosts = servers(id, name.toLowerCase(), 5, 36);
  if (hosts[2]) hosts[2] = { ...hosts[2], status: "warning", notes: "Température d'entrée au-dessus du seuil." };
  if (hosts[7]) hosts[7] = { ...hosts[7], status: "critical", notes: "Alimentation redondante perdue." };
  return rack(id, name, side, position, [
    equipment({
      id: `${id}-pdu-a`,
      name: "PDU-A",
      type: "pdu",
      manufacturer: "APC",
      model: "AP8853",
      positionU: 1,
      heightU: 1,
      powerW: 20,
      assetTag: `${name}-PDU-A`,
    }),
    equipment({
      id: `${id}-pdu-b`,
      name: "PDU-B",
      type: "pdu",
      manufacturer: "APC",
      model: "AP8853",
      positionU: 2,
      heightU: 1,
      powerW: 20,
      assetTag: `${name}-PDU-B`,
    }),
    ...hosts,
    equipment({
      id: `${id}-tor`,
      name: "TOR",
      type: "switch",
      manufacturer: "Cisco",
      model: "Nexus 9336C-FX2",
      positionU: 39,
      heightU: 2,
      powerW: 350,
      assetTag: `${name}-TOR`,
    }),
    equipment({
      id: `${id}-patch`,
      name: "Brassage",
      type: "patch",
      manufacturer: "Commscope",
      model: "Panel 48 LC",
      positionU: 41,
      heightU: 2,
      powerW: 0,
    }),
  ]);
}

export function sampleDataCenters(): DataCenter[] {
  const aG01 = productionRack("par1-a-g01", "A-G01", "left", 1);
  const aG02Hosts = servers("par1-a-g02", "a-g02", 10, 21);
  if (aG02Hosts[1]) aG02Hosts[1] = { ...aG02Hosts[1], status: "maintenance", notes: "Fenêtre de maintenance ce soir." };

  return [
    {
      id: "par1",
      name: "PAR1",
      location: "Paris 13",
      notes: "Salle de démonstration. Importez votre JSON ou créez un centre pour remplacer ces données.",
      aisles: [
        {
          id: "par1-a",
          name: "Allée A",
          items: [
            aG01,
            rack("par1-a-g02", "A-G02", "left", 2, [
              ...aG02Hosts,
              equipment({
                id: "par1-a-g02-tor",
                name: "TOR",
                type: "switch",
                manufacturer: "Arista",
                model: "7050X3",
                positionU: 40,
                heightU: 1,
                powerW: 280,
              }),
            ]),
            cooling("par1-a-c1", "A-C1", "left", 3, 35),
            rack("par1-a-g03", "A-G03", "left", 4, servers("par1-a-g03", "a-g03", 8, 19)),
            rack("par1-a-g04", "A-G04", "left", 5),
            rack("par1-a-g05", "A-G05", "left", 6, [], "Réservée pour extension."),
            rack("par1-a-d01", "A-D01", "right", 1, [
              equipment({
                id: "par1-a-d01-fw1",
                name: "FW-EXT-1",
                type: "firewall",
                manufacturer: "Palo Alto",
                model: "PA-5410",
                positionU: 20,
                heightU: 2,
                powerW: 490,
                assetTag: "FW-01",
              }),
              equipment({
                id: "par1-a-d01-fw2",
                name: "FW-EXT-2",
                type: "firewall",
                manufacturer: "Palo Alto",
                model: "PA-5410",
                positionU: 22,
                heightU: 2,
                powerW: 490,
                assetTag: "FW-02",
              }),
              equipment({
                id: "par1-a-d01-rtr",
                name: "EDGE-RTR",
                type: "router",
                manufacturer: "Cisco",
                model: "8201",
                positionU: 26,
                heightU: 2,
                powerW: 520,
              }),
              equipment({
                id: "par1-a-d01-sw",
                name: "CORE-SW",
                type: "switch",
                manufacturer: "Cisco",
                model: "Nexus 9364",
                positionU: 30,
                heightU: 2,
                powerW: 640,
                status: "warning",
                notes: "Ventilateur 2 en alerte.",
              }),
            ]),
            rack("par1-a-d02", "A-D02", "right", 2, servers("par1-a-d02", "a-d02", 12, 23)),
            cooling("par1-a-c2", "A-C2", "right", 3, 35),
            rack("par1-a-d03", "A-D03", "right", 4),
            rack("par1-a-d04", "A-D04", "right", 5),
            rack("par1-a-d05", "A-D05", "right", 6),
          ],
        },
        {
          id: "par1-b",
          name: "Allée B",
          items: [
            rack("par1-b-g01", "B-G01", "left", 1, [
              equipment({
                id: "par1-b-g01-s1",
                name: "AFF-01",
                type: "storage",
                manufacturer: "NetApp",
                model: "AFF A250",
                positionU: 10,
                heightU: 4,
                powerW: 900,
                assetTag: "STG-01",
              }),
              equipment({
                id: "par1-b-g01-s2",
                name: "AFF-02",
                type: "storage",
                manufacturer: "NetApp",
                model: "AFF A250",
                positionU: 14,
                heightU: 4,
                powerW: 900,
                assetTag: "STG-02",
              }),
              equipment({
                id: "par1-b-g01-s3",
                name: "SHELF-01",
                type: "storage",
                manufacturer: "NetApp",
                model: "NS224",
                positionU: 20,
                heightU: 2,
                powerW: 420,
              }),
            ]),
            rack("par1-b-g02", "B-G02", "left", 2, servers("par1-b-g02", "b-g02", 6, 15)),
            rack("par1-b-g03", "B-G03", "left", 3),
            cooling("par1-b-c1", "B-C1", "left", 4, 25, "maintenance"),
            rack("par1-b-d01", "B-D01", "right", 1, [
              equipment({
                id: "par1-b-d01-s1",
                name: "PURE-01",
                type: "storage",
                manufacturer: "Pure Storage",
                model: "FlashArray X20",
                positionU: 12,
                heightU: 3,
                powerW: 700,
              }),
            ]),
            rack("par1-b-d02", "B-D02", "right", 2),
            rack("par1-b-d03", "B-D03", "right", 3),
            cooling("par1-b-c2", "B-C2", "right", 4, 25),
          ],
        },
        {
          id: "par1-c",
          name: "Allée C",
          items: [
            rack("par1-c-g01", "C-G01", "left", 1, [
              equipment({
                id: "par1-c-g01-sw",
                name: "OOB-SW",
                type: "switch",
                manufacturer: "Cisco",
                model: "C9300-48U",
                positionU: 24,
                heightU: 1,
                powerW: 180,
              }),
            ]),
            cooling("par1-c-c1", "C-C1", "left", 2, 20),
            rack("par1-c-g02", "C-G02", "left", 3),
            rack("par1-c-d01", "C-D01", "right", 1),
            rack("par1-c-d02", "C-D02", "right", 2),
            rack("par1-c-d03", "C-D03", "right", 3),
          ],
        },
      ],
    },
    {
      id: "mrs1",
      name: "MRS1",
      location: "Marseille",
      notes: "Petit site, une seule allée.",
      aisles: [
        {
          id: "mrs1-a",
          name: "Allée A",
          items: [
            rack("mrs1-a-g01", "A-G01", "left", 1, servers("mrs1-a-g01", "mrs-g01", 14, 23)),
            rack("mrs1-a-g02", "A-G02", "left", 2),
            rack("mrs1-a-g03", "A-G03", "left", 3),
            cooling("mrs1-a-c1", "A-C1", "left", 4, 20),
            rack("mrs1-a-d01", "A-D01", "right", 1, [
              equipment({
                id: "mrs1-a-d01-fw",
                name: "FW-MRS",
                type: "firewall",
                manufacturer: "Fortinet",
                model: "FortiGate 600F",
                positionU: 20,
                heightU: 2,
                powerW: 260,
              }),
            ]),
            rack("mrs1-a-d02", "A-D02", "right", 2),
            rack("mrs1-a-d03", "A-D03", "right", 3),
            cooling("mrs1-a-c2", "A-C2", "right", 4, 20),
          ],
        },
      ],
    },
  ];
}
