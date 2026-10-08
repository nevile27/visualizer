import { OrbitControls, ContactShadows, Edges, Grid, Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CanvasTexture, SRGBColorSpace, type MeshStandardMaterial } from "three";
import { equipmentFaceUrl } from "../equipment-faces";
import { downloadUrl } from "../download";
import { maxPosition, positionDirection, safeFileName, slotFromLeft, statusMeta, typeMeta, uRange, worstStatus } from "../model";
import { useCanEdit } from "../auth-context";
import { useStore } from "../store";
import { roomColors, useTheme } from "../theme";
import type { AisleItem, DataCenter, Equipment, EquipmentStatus, PositionDirection, Side } from "../types";

const RACK_W = 0.6;
const RACK_D = 1.15;
const RACK_H = 2.02;
const GAP = 0.08;
const COLD_W = 1.25;
const HOT_W = 1.55;
const PITCH = RACK_D + COLD_W + RACK_D + HOT_W;
const BASE = 0.045;

interface CaptureHandle { capture: () => string }

class ViewErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "Erreur inconnue" };
  }

  render() {
    if (this.state.message) return <div className="empty-view">La vue 3D a échoué : {this.state.message}</div>;
    return this.props.children;
  }
}

function FrameCamera({
  endX,
  depth,
  nonce,
  orbit,
}: {
  endX: number;
  depth: number;
  nonce: number;
  orbit: RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((state) => state.camera);
  const applied = useRef("");
  const ticks = useRef(0);
  const key = `${endX}|${depth}|${nonce}`;
  useFrame(() => {
    const controls = orbit.current;
    if (!controls) return;
    if (applied.current !== key) ticks.current = 0;
    if (applied.current === key && ticks.current > 8) return;
    const cx = endX / 2;
    const cz = Math.max(depth - HOT_W, RACK_D) / 2;
    const span = Math.max(endX, depth, 6);
    controls.target.set(cx, 0.6, cz);
    camera.position.set(cx + span * 1.35, span * 0.78, cz + span * 0.42);
    controls.update();
    applied.current = key;
    ticks.current += 1;
  });
  return null;
}

function Capture({ handle }: { handle: Ref<CaptureHandle> }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  useImperativeHandle(handle, () => ({
    capture() {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    },
  }));
  return null;
}

function StatusLed({ color, pulse, position }: { color: string; pulse: boolean; position: [number, number, number] }) {
  const material = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!material.current || !pulse) return;
    material.current.emissiveIntensity = 0.7 + Math.sin(clock.elapsedTime * 7) * 0.55;
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.016, 16, 16]} />
      <meshStandardMaterial ref={material} color={color} emissive={color} emissiveIntensity={0.9} />
    </mesh>
  );
}

function place(aisleIndex: number, side: Side, position: number, slots: number, direction: PositionDirection): [number, number] {
  const x = slotFromLeft(position, slots, direction) * (RACK_W + GAP) + RACK_W / 2;
  const zLeft = aisleIndex * PITCH + RACK_D / 2;
  const z = side === "left" ? zLeft : zLeft + RACK_D / 2 + COLD_W + RACK_D / 2;
  return [x, z];
}

function Cabinet({
  item,
  aisleId,
  aisleIndex,
  slots,
  direction,
  selected,
  selectedEquipmentId,
}: {
  item: AisleItem;
  aisleId: string;
  aisleIndex: number;
  slots: number;
  direction: PositionDirection;
  selected: boolean;
  selectedEquipmentId: string | null;
}) {
  const { select } = useStore();
  const [x, z] = place(aisleIndex, item.side, item.position, slots, direction);
  const face = item.side === "left" ? 1 : -1;
  const doorZ = face * (RACK_D / 2 + 0.01);
  const cooling = item.kind === "cooling";
  const status: EquipmentStatus | null = cooling ? item.status : worstStatus(item.equipment.map((eq) => eq.status));
  const led = status ? statusMeta(status).color : "#3a4654";
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={[x, 0, z]}
      onClick={(event) => {
        event.stopPropagation();
        select({ kind: "item", aisleId, itemId: item.id });
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, BASE / 2, 0]}>
        <boxGeometry args={[RACK_W + 0.06, BASE, RACK_D + 0.06]} />
        <meshStandardMaterial color="#3a4452" />
      </mesh>
      {cooling ? (
        <mesh position={[0, BASE + RACK_H / 2, 0]}>
          <boxGeometry args={[RACK_W, RACK_H, RACK_D]} />
          <meshStandardMaterial color={selected ? "#245c49" : hovered ? "#1f7590" : "#1a6278"} metalness={0.42} roughness={0.46} />
          {selected ? <Edges color="#3ddea0" /> : null}
        </mesh>
      ) : (
        <>
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * (RACK_W / 2 - 0.012), BASE + RACK_H / 2, 0]}>
              <boxGeometry args={[0.03, RACK_H, RACK_D]} />
              <meshStandardMaterial color={selected ? "#2f6d57" : hovered ? "#617086" : "#5c6b7c"} metalness={0.4} roughness={0.42} />
            </mesh>
          ))}
          <mesh position={[0, BASE + RACK_H - 0.02, 0]}>
            <boxGeometry args={[RACK_W, 0.04, RACK_D]} />
            <meshStandardMaterial color={selected ? "#2f6d57" : "#6d7c8e"} metalness={0.35} roughness={0.45} />
            {selected ? <Edges color="#3ddea0" /> : null}
          </mesh>
          <mesh position={[0, BASE + RACK_H / 2, -face * (RACK_D / 2 - 0.015)]}>
            <boxGeometry args={[RACK_W - 0.04, RACK_H - 0.08, 0.02]} />
            <meshStandardMaterial color="#4e5b6b" metalness={0.3} roughness={0.5} />
          </mesh>
        </>
      )}
      <mesh position={[face * (RACK_W * 0.28), BASE + RACK_H * 0.45, doorZ + face * 0.02]}>
        <boxGeometry args={[0.015, 0.14, 0.015]} />
        <meshStandardMaterial color="#c5d2e0" metalness={0.8} roughness={0.25} />
      </mesh>
      <StatusLed color={led} pulse={status === "critical"} position={[0, BASE + RACK_H - 0.08, doorZ + face * 0.02]} />
      {cooling ? Array.from({ length: 6 }, (_, index) => (
        <mesh key={index} position={[0, BASE + 0.28 + index * 0.28, doorZ + face * 0.02]}>
          <boxGeometry args={[RACK_W * 0.72, 0.035, 0.012]} />
          <meshStandardMaterial color="#8fdfff" emissive="#1a6f8a" emissiveIntensity={0.35} />
        </mesh>
      )) : item.equipment.map((eq) => {
        const usable = RACK_H - 0.14;
        const uH = usable / item.heightU;
        const h = Math.max(0.014, eq.heightU * uH * 0.94);
        const y = BASE + 0.07 + (eq.positionU - 1) * uH + (eq.heightU * uH) / 2;
        return (
          <Gear
            key={eq.id}
            equipment={eq}
            rackName={item.name}
            aisleId={aisleId}
            itemId={item.id}
            y={y}
            h={h}
            face={face}
            doorZ={doorZ}
            hot={selectedEquipmentId === eq.id}
          />
        );
      })}
      {selected && !selectedEquipmentId ? (
        <Html position={[0, BASE + RACK_H + 0.18, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div className="float-tag">{item.name}</div>
        </Html>
      ) : null}
    </group>
  );
}

const faceTextures = new Map<string, CanvasTexture>();

function useFaceTexture(url: string) {
  const [texture, setTexture] = useState<CanvasTexture | null>(() => faceTextures.get(url) ?? null);
  useEffect(() => {
    const cached = faceTextures.get(url);
    if (cached) {
      setTexture(cached);
      return;
    }
    let cancel = false;
    const image = new Image();
    image.onload = () => {
      if (cancel) return;
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const map = new CanvasTexture(canvas);
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 8;
      map.needsUpdate = true;
      faceTextures.set(url, map);
      setTexture(map);
    };
    image.src = url;
    return () => {
      cancel = true;
    };
  }, [url]);
  return texture;
}

function Gear({
  equipment,
  rackName,
  aisleId,
  itemId,
  y,
  h,
  face,
  doorZ,
  hot,
}: {
  equipment: Equipment;
  rackName: string;
  aisleId: string;
  itemId: string;
  y: number;
  h: number;
  face: number;
  doorZ: number;
  hot: boolean;
}) {
  const { select } = useStore();
  const texture = useFaceTexture(equipmentFaceUrl(equipment));
  const turn = face > 0 ? 0 : Math.PI;
  const width = RACK_W * 0.84;
  return (
    <group
      position={[0, y, doorZ + face * 0.02]}
      onClick={(event) => {
        event.stopPropagation();
        select({ kind: "equipment", aisleId, itemId, equipmentId: equipment.id });
      }}
    >
      <mesh>
        <boxGeometry args={[width, h, 0.04]} />
        <meshStandardMaterial color="#3a4450" metalness={0.35} roughness={0.55} />
      </mesh>
      {hot ? (
        <mesh position={[0, 0, face * 0.016]} rotation={[0, turn, 0]}>
          <planeGeometry args={[width + 0.012, h + 0.01]} />
          <meshBasicMaterial color="#3ddea0" toneMapped={false} />
        </mesh>
      ) : null}
      {texture ? (
        <mesh position={[0, 0, face * 0.024]} rotation={[0, turn, 0]}>
          <planeGeometry args={[width, h]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ) : null}
      {hot ? (
        <Html position={[face * 0.55, 0, face * 0.06]} zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
          <EquipmentCard equipment={equipment} rackName={rackName} />
        </Html>
      ) : null}
    </group>
  );
}

function equipmentDetail(equipment: Equipment) {
  const extra = [
    equipment.psuCount > 0 ? `${equipment.psuCount} alimentation${equipment.psuCount > 1 ? "s" : ""}` : "",
    equipment.networkPorts > 0 ? `${equipment.networkPorts} port${equipment.networkPorts > 1 ? "s" : ""} réseau` : "",
    equipment.notes,
  ].filter(Boolean);
  return { observations: equipment.observations, ip: equipment.ip, extra };
}

function EquipmentCard({ equipment, rackName }: { equipment: Equipment; rackName: string }) {
  const kind = typeMeta(equipment.type);
  const status = statusMeta(equipment.status);
  const detail = equipmentDetail(equipment);
  const identity = [equipment.manufacturer, equipment.model].filter(Boolean).join(" ");
  return (
    <div className="eq-card">
      <p className="kicker">{rackName} · {uRange(equipment)}</p>
      <strong>{equipment.name}</strong>
      <p>{[kind.label, identity].filter(Boolean).join(" · ")}</p>
      <p><i style={{ background: status.color }} />{status.label}</p>
      {detail.observations ? <p className="eq-card-notes">{detail.observations}</p> : null}
      {detail.ip ? <p className="eq-card-ip">IP {detail.ip}</p> : null}
      {detail.extra.length ? <p>{detail.extra.join(" · ")}</p> : null}
    </div>
  );
}

function World({ dc, frame, captureRef }: { dc: DataCenter; frame: number; captureRef: Ref<CaptureHandle> }) {
  const { selection } = useStore();
  const { theme } = useTheme();
  const room = roomColors[theme];
  const orbit = useRef<OrbitControlsImpl>(null);
  const endX = (maxPosition(dc) - 1) * (RACK_W + GAP) + RACK_W;
  const depth = Math.max(dc.aisles.length, 1) * PITCH;

  const selectedItemId = selection && selection.kind !== "aisle" ? selection.itemId : null;
  const selectedEquipmentId = selection?.kind === "equipment" ? selection.equipmentId : null;

  return (
    <>
      <color attach="background" args={[room.background]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={[room.sky, room.ground, 0.38]} />
      <directionalLight position={[10, 16, 8]} intensity={1.25} />
      <directionalLight position={[-6, 8, -4]} intensity={0.25} />
      <Capture handle={captureRef} />
      <FrameCamera endX={endX} depth={depth} nonce={frame} orbit={orbit} />
      <OrbitControls
        ref={orbit}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.04}
        minDistance={2}
        maxDistance={120}
      />
      <Grid
        position={[endX / 2, 0, depth / 2]}
        args={[Math.max(24, endX + 14), Math.max(24, depth + 14)]}
        cellSize={0.6}
        cellThickness={0.6}
        cellColor={room.cell}
        sectionSize={3}
        sectionThickness={1.1}
        sectionColor={room.section}
        fadeDistance={48}
        fadeStrength={1.2}
        infiniteGrid
      />
      <ContactShadows position={[endX / 2, 0.001, depth / 2]} opacity={room.shadow} scale={Math.max(24, endX + depth)} blur={2.2} far={5} />
      {dc.aisles.map((aisle, aisleIndex) => {
        const zLeft = aisleIndex * PITCH + RACK_D / 2;
        const zCold = zLeft + RACK_D / 2 + COLD_W / 2;
        return (
          <group key={aisle.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[endX / 2, 0.02, zCold]}>
              <planeGeometry args={[Math.max(endX, RACK_W), COLD_W * 0.9]} />
              <meshStandardMaterial color={room.cold} />
            </mesh>
            <Html position={[endX / 2, 2.35, zCold]} center style={{ pointerEvents: "none" }}>
              <div className="aisle-tag">{aisle.name}</div>
            </Html>
            {aisle.items.map((item) => (
              <Cabinet
                key={item.id}
                item={item}
                aisleId={aisle.id}
                aisleIndex={aisleIndex}
                slots={maxPosition(dc)}
                direction={positionDirection(dc)}
                selected={selectedItemId === item.id}
                selectedEquipmentId={selectedItemId === item.id ? selectedEquipmentId : null}
              />
            ))}
          </group>
        );
      })}
    </>
  );
}

export default function Scene3D() {
  const edit = useCanEdit();
  const { activeDc, patchDc } = useStore();
  const [frame, setFrame] = useState(0);
  const captureRef = useRef<CaptureHandle>(null);

  if (!activeDc) return <div className="empty-view">Choisissez ou créez un centre.</div>;

  return (
    <ViewErrorBoundary>
      <div className="stage-fill">
        <Canvas
          camera={{ position: [12, 16, 22], fov: 36, near: 0.1, far: 250 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <World dc={activeDc} frame={frame} captureRef={captureRef} />
        </Canvas>
        <div className="stage-bottom">
          <p>Glisser pour tourner, molette pour zoomer, clic droit pour se déplacer.</p>
          {edit ? (
            <button
              type="button"
              onClick={() => patchDc({ positionDirection: positionDirection(activeDc) === "ltr" ? "rtl" : "ltr" })}
            >
              {positionDirection(activeDc) === "ltr" ? "Positions : gauche → droite" : "Positions : droite → gauche"}
            </button>
          ) : null}
          <button type="button" onClick={() => setFrame((value) => value + 1)}>Recadrer</button>
          <button
            type="button"
            onClick={() => {
              const url = captureRef.current?.capture();
              if (url) downloadUrl(url, `${safeFileName(activeDc.name)}-3d.png`);
            }}
          >
            Image
          </button>
        </div>
      </div>
    </ViewErrorBoundary>
  );
}
