import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Grid, Html, OrbitControls, PerspectiveCamera, TransformControls } from "@react-three/drei";
import { Camera, ChevronDown, Cuboid, Focus, HelpCircle, ImagePlus, Layers3, Maximize2, Move3D, Plus, RotateCcw, Save, Sparkles, Trash2, UploadCloud, UserRound, X, ZoomIn } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { assetApi } from "../../services/assetApi";
import type { Asset } from "../../types/asset";
import type { Director3DNodeData, DirectorCamera, DirectorScene, DirectorSceneObject, DirectorSceneObjectType, DirectorScreenshot, DirectorVector3 } from "../../types/node";
import { createClientId } from "../../utils/id";

const aspectOptions = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const characterSubtypes = ["男性素体", "女性素体", "宽肩素体", "健壮素体", "纤细素体", "少年素体", "儿童素体", "二头身"];
const geometrySubtypes = ["cube", "sphere", "cylinder", "plane", "product_placeholder"];

type TransformMode = "translate" | "rotate" | "scale";
type ViewMode = "director" | "camera";
type Selection = { kind: "scene" } | { kind: "object"; id: string } | { kind: "camera"; id: string };

type Props = {
  nodeId: string;
  data: Director3DNodeData;
  projectId?: string;
  onClose: () => void;
  onSave: (patch: Partial<Director3DNodeData>) => void;
};

type ViewportBridge = {
  capture: () => Promise<{ blob: Blob; width: number; height: number }>;
};

const vector = (x: number, y: number, z: number): DirectorVector3 => ({ x, y, z });
const now = () => Date.now();
const assetUrl = (asset: Asset) => asset.publicUrl || asset.url || asset.thumbnailUrl || "";

function defaultScene(nodeId: string, projectId?: string): DirectorScene {
  const timestamp = now();
  return {
    id: createClientId("director_scene"),
    projectId,
    nodeId,
    objects: [
      {
        id: createClientId("character"),
        type: "character",
        subtype: "女性素体",
        name: "默认人形素体",
        position: vector(0, 0, 0),
        rotation: vector(0, 0, 0),
        scale: vector(1, 1, 1),
        material: { color: "#d8e8ff", opacity: 0.92 },
        visible: true,
        locked: false,
        labelVisible: true
      }
    ],
    cameras: [
      { id: createClientId("camera"), name: "主机位", position: vector(4, 3, 6), target: vector(0, 1, 0), fov: 42, aspectRatio: "16:9" }
    ],
    background: { type: "color", color: "#050816" },
    sceneSettings: { gridVisible: true, groundVisible: true, groundOpacity: 0.22, skyColor: "#050816", sceneScale: 1, snapToGrid: false, labelVisible: true },
    screenshots: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function filenameSafe(value: string) {
  return value.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "Camera";
}

function parseAspectRatio(value: string) {
  const [width, height] = value.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

async function cropShotToAspect(shot: { blob: Blob; width: number; height: number }, aspectRatio: string) {
  const targetRatio = parseAspectRatio(aspectRatio);
  const sourceRatio = shot.width / shot.height;
  const cropWidth = sourceRatio > targetRatio ? Math.round(shot.height * targetRatio) : shot.width;
  const cropHeight = sourceRatio > targetRatio ? shot.height : Math.round(shot.width / targetRatio);
  const cropX = Math.max(0, Math.floor((shot.width - cropWidth) / 2));
  const cropY = Math.max(0, Math.floor((shot.height - cropHeight) / 2));
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(shot.blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("截图裁切失败"));
    };
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建截图画布");
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((nextBlob) => nextBlob ? resolve(nextBlob) : reject(new Error("截图导出失败")), "image/png", 1));
  return { blob, width: cropWidth, height: cropHeight };
}

function eulerFrom(value: DirectorVector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function vecArray(value: DirectorVector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function patchVector(value: DirectorVector3, axis: keyof DirectorVector3, next: number) {
  return { ...value, [axis]: Number.isFinite(next) ? next : 0 };
}

function stopCanvas(event: ThreeEvent<MouseEvent>) {
  event.stopPropagation();
}

function HumanoidPrimitive({ object, selected }: { object: DirectorSceneObject; selected: boolean }) {
  const color = object.material?.color || "#d8e8ff";
  const opacity = object.material?.opacity ?? 0.92;
  const outline = selected ? "#67e8f9" : "#20314f";
  const headScale = object.subtype === "二头身" ? 1.35 : 1;
  const bodyY = object.subtype === "儿童素体" || object.subtype === "二头身" ? 0.82 : 1.05;
  const shoulder = object.subtype === "宽肩素体" || object.subtype === "健壮素体" ? 1.28 : object.subtype === "纤细素体" ? 0.82 : 1;
  return (
    <group>
      <mesh position={[0, bodyY + 1.12, 0]} scale={[headScale, headScale, headScale]} castShadow>
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} emissive={selected ? "#172554" : "#000000"} roughness={0.45} />
      </mesh>
      <mesh position={[0, bodyY + 0.55, 0]} scale={[shoulder, 1, 0.72]} castShadow>
        <capsuleGeometry args={[0.28, 0.68, 10, 18]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.55} />
      </mesh>
      <mesh position={[-0.38 * shoulder, bodyY + 0.42, 0]} rotation={[0, 0, -0.22]} castShadow>
        <capsuleGeometry args={[0.07, 0.72, 8, 12]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.55} />
      </mesh>
      <mesh position={[0.38 * shoulder, bodyY + 0.42, 0]} rotation={[0, 0, 0.22]} castShadow>
        <capsuleGeometry args={[0.07, 0.72, 8, 12]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.55} />
      </mesh>
      <mesh position={[-0.14, bodyY - 0.28, 0]} rotation={[0, 0, 0.04]} castShadow>
        <capsuleGeometry args={[0.08, 0.92, 8, 12]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.55} />
      </mesh>
      <mesh position={[0.14, bodyY - 0.28, 0]} rotation={[0, 0, -0.04]} castShadow>
        <capsuleGeometry args={[0.08, 0.92, 8, 12]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.55} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(0.86 * shoulder, 2.18, 0.38)]} />
        <lineBasicMaterial color={outline} transparent opacity={selected ? 0.78 : 0.24} />
      </lineSegments>
    </group>
  );
}

function GeometryPrimitive({ object, selected }: { object: DirectorSceneObject; selected: boolean }) {
  const color = object.material?.color || (object.subtype === "product_placeholder" ? "#fef3c7" : "#a5b4fc");
  const opacity = object.material?.opacity ?? 0.86;
  const material = <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.48} metalness={object.subtype === "product_placeholder" ? 0.18 : 0.02} />;
  const wire = <meshBasicMaterial color={selected ? "#67e8f9" : "#334155"} wireframe transparent opacity={selected ? 0.55 : 0.24} />;
  if (object.subtype === "sphere") return <><mesh castShadow><sphereGeometry args={[0.58, 32, 24]} />{material}</mesh><mesh scale={1.012}><sphereGeometry args={[0.58, 20, 14]} />{wire}</mesh></>;
  if (object.subtype === "cylinder") return <><mesh castShadow><cylinderGeometry args={[0.46, 0.46, 1.2, 32]} />{material}</mesh><mesh scale={1.012}><cylinderGeometry args={[0.46, 0.46, 1.2, 16]} />{wire}</mesh></>;
  if (object.subtype === "plane") return <><mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.6, 1.05]} />{material}</mesh><mesh rotation={[-Math.PI / 2, 0, 0]} scale={1.01}><planeGeometry args={[1.6, 1.05]} />{wire}</mesh></>;
  if (object.subtype === "product_placeholder") return <><mesh castShadow><boxGeometry args={[0.86, 1.18, 0.5]} />{material}</mesh><mesh position={[0, 0.72, 0]}><torusGeometry args={[0.32, 0.035, 8, 28]} /><meshStandardMaterial color="#f8fafc" transparent opacity={0.62} /></mesh><mesh scale={1.012}><boxGeometry args={[0.86, 1.18, 0.5]} />{wire}</mesh></>;
  return <><mesh castShadow><boxGeometry args={[1, 1, 1]} />{material}</mesh><mesh scale={1.012}><boxGeometry args={[1, 1, 1]} />{wire}</mesh></>;
}

function ImagePlanePrimitive({ object, selected }: { object: DirectorSceneObject; selected: boolean }) {
  const texture = object.assetUrl ? useLoader(THREE.TextureLoader, object.assetUrl) : undefined;
  useEffect(() => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <group>
      <mesh>
        <planeGeometry args={[1.8, 1.2]} />
        {texture ? <meshBasicMaterial map={texture} transparent opacity={object.material?.opacity ?? 1} side={THREE.DoubleSide} /> : <meshStandardMaterial color={object.material?.color || "#172554"} transparent opacity={0.5} side={THREE.DoubleSide} />}
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(1.84, 1.24)]} />
        <lineBasicMaterial color={selected ? "#a78bfa" : "#38bdf8"} transparent opacity={selected ? 0.92 : 0.38} />
      </lineSegments>
    </group>
  );
}

function CameraFrustum({ camera, selected, onSelect }: { camera: DirectorCamera; selected: boolean; onSelect: () => void }) {
  const points = useMemo(() => {
    const near = 0.32;
    const far = 0.9;
    const h = Math.tan((camera.fov * Math.PI / 180) / 2) * far;
    const w = h * 1.4;
    return [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(-w, h, -far), new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, h, -far),
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, -h, -far), new THREE.Vector3(0, 0, 0), new THREE.Vector3(-w, -h, -far),
      new THREE.Vector3(-w, h, -far), new THREE.Vector3(w, h, -far), new THREE.Vector3(w, h, -far), new THREE.Vector3(w, -h, -far),
      new THREE.Vector3(w, -h, -far), new THREE.Vector3(-w, -h, -far), new THREE.Vector3(-w, -h, -far), new THREE.Vector3(-w, h, -far),
      new THREE.Vector3(0, 0, -near), new THREE.Vector3(0, 0, -far)
    ];
  }, [camera.fov]);
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    group.position.set(camera.position.x, camera.position.y, camera.position.z);
    group.lookAt(camera.target.x, camera.target.y, camera.target.z);
  }, [camera]);
  return (
    <group ref={ref} onClick={(event) => { stopCanvas(event); onSelect(); }}>
      <mesh>
        <boxGeometry args={[0.24, 0.16, 0.18]} />
        <meshBasicMaterial color={selected ? "#67e8f9" : "#94a3b8"} wireframe />
      </mesh>
      <lineSegments geometry={new THREE.BufferGeometry().setFromPoints(points)}>
        <lineBasicMaterial color={selected ? "#67e8f9" : "#7dd3fc"} transparent opacity={selected ? 0.95 : 0.42} />
      </lineSegments>
    </group>
  );
}

function SceneObjectView({ object, selected, labelVisible, onSelect, setObjectRef }: { object: DirectorSceneObject; selected: boolean; labelVisible: boolean; onSelect: () => void; setObjectRef: (node: THREE.Object3D | null) => void }) {
  if (!object.visible) return null;
  return (
    <group ref={setObjectRef} position={vecArray(object.position)} rotation={eulerFrom(object.rotation)} scale={vecArray(object.scale)} onClick={(event) => { stopCanvas(event); onSelect(); }}>
      <Suspense fallback={null}>
        {object.type === "character" ? <HumanoidPrimitive object={object} selected={selected} /> : null}
        {object.type === "geometry" || object.type === "product_placeholder" ? <GeometryPrimitive object={object} selected={selected} /> : null}
        {object.type === "image_plane" ? <ImagePlanePrimitive object={object} selected={selected} /> : null}
      </Suspense>
      {(object.labelVisible ?? labelVisible) && (
        <Html position={[0, object.type === "character" ? 2.45 : 0.9, 0]} center distanceFactor={8}>
          <span className={`director3d-label ${selected ? "is-selected" : ""}`}>{object.name}</span>
        </Html>
      )}
    </group>
  );
}

function ActiveCamera({ camera }: { camera?: DirectorCamera }) {
  const ref = useRef<THREE.PerspectiveCamera>(null);
  useFrame(() => {
    if (!ref.current || !camera) return;
    ref.current.position.set(camera.position.x, camera.position.y, camera.position.z);
    ref.current.fov = camera.fov;
    ref.current.lookAt(camera.target.x, camera.target.y, camera.target.z);
    ref.current.updateProjectionMatrix();
  });
  if (!camera) return <PerspectiveCamera makeDefault position={[4, 3.2, 6]} fov={45} />;
  return <PerspectiveCamera ref={ref} makeDefault position={vecArray(camera.position)} fov={camera.fov} />;
}

function SceneViewport({ scene, selection, viewMode, activeCameraId, transformMode, onSelect, onObjectTransform, bridgeRef }: { scene: DirectorScene; selection: Selection; viewMode: ViewMode; activeCameraId?: string; transformMode: TransformMode; onSelect: (selection: Selection) => void; onObjectTransform: (object: DirectorSceneObject) => void; bridgeRef: React.MutableRefObject<ViewportBridge | null> }) {
  const objectRefs = useRef<Record<string, THREE.Object3D | null>>({});
  const { gl, scene: threeScene, camera: threeCamera } = useThree();
  const selectedObjectId = selection.kind === "object" ? selection.id : undefined;
  const selectedObject = selectedObjectId ? objectRefs.current[selectedObjectId] : null;
  const activeCamera = scene.cameras.find((camera) => camera.id === activeCameraId) ?? scene.cameras[0];

  useEffect(() => {
    bridgeRef.current = {
      capture: () => new Promise((resolve, reject) => {
        gl.render(threeScene, threeCamera);
        gl.domElement.toBlob((blob) => {
          if (!blob) reject(new Error("截图失败，请稍后再试。"));
          else resolve({ blob, width: gl.domElement.width, height: gl.domElement.height });
        }, "image/png", 1);
      })
    };
    return () => { bridgeRef.current = null; };
  }, [bridgeRef, gl, threeCamera, threeScene]);

  function commitSelectedTransform() {
    if (!selectedObjectId) return;
    const node = objectRefs.current[selectedObjectId];
    const object = scene.objects.find((item) => item.id === selectedObjectId);
    if (!node || !object) return;
    onObjectTransform({
      ...object,
      position: vector(Number(node.position.x.toFixed(3)), Number(node.position.y.toFixed(3)), Number(node.position.z.toFixed(3))),
      rotation: vector(Number(node.rotation.x.toFixed(3)), Number(node.rotation.y.toFixed(3)), Number(node.rotation.z.toFixed(3))),
      scale: vector(Number(node.scale.x.toFixed(3)), Number(node.scale.y.toFixed(3)), Number(node.scale.z.toFixed(3)))
    });
  }

  return (
    <>
      <color attach="background" args={[scene.sceneSettings.skyColor]} />
      <fog attach="fog" args={[scene.sceneSettings.skyColor, 12, 34]} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[3, 6, 5]} intensity={1.35} color="#dbeafe" castShadow />
      <pointLight position={[-5, 3, -4]} intensity={0.62} color="#a78bfa" />
      <ActiveCamera camera={viewMode === "camera" ? activeCamera : undefined} />
      {viewMode === "director" && <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[0, 1, 0]} />}
      {scene.sceneSettings.groundVisible && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow onClick={() => onSelect({ kind: "scene" })}>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#07111f" transparent opacity={scene.sceneSettings.groundOpacity} roughness={0.8} />
        </mesh>
      )}
      {scene.sceneSettings.gridVisible && <Grid args={[80, 80]} cellSize={1} sectionSize={5} cellColor="#1e3a8a" sectionColor="#38bdf8" fadeDistance={38} fadeStrength={1.4} position={[0, 0, 0]} />}
      <axesHelper args={[2.2]} />
      {scene.objects.map((object) => (
        <SceneObjectView
          key={object.id}
          object={object}
          selected={selection.kind === "object" && selection.id === object.id}
          labelVisible={scene.sceneSettings.labelVisible}
          onSelect={() => onSelect({ kind: "object", id: object.id })}
          setObjectRef={(node) => { objectRefs.current[object.id] = node; }}
        />
      ))}
      {scene.cameras.map((camera) => <CameraFrustum key={camera.id} camera={camera} selected={selection.kind === "camera" && selection.id === camera.id} onSelect={() => onSelect({ kind: "camera", id: camera.id })} />)}
      {selectedObject && <TransformControls object={selectedObject} mode={transformMode} onMouseUp={commitSelectedTransform} onObjectChange={commitSelectedTransform} />}
    </>
  );
}

function UploadImportDialog({ onClose, onUpload }: { onClose: () => void; onUpload: (file: File) => Promise<void> }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="director3d-dialog-backdrop" onClick={onClose}>
      <div className="director3d-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="director3d-dialog-head"><div><strong>图片上传 / AI 识图导入</strong><span>轻量导入参考图，自动生成图片平面</span></div><button type="button" onClick={onClose}><X size={18} /></button></div>
        <label
          className={`director3d-dropzone ${dragging ? "is-dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void pick(event.dataTransfer.files[0]); }}
        >
          <input type="file" accept="image/*" onChange={(event) => void pick(event.target.files?.[0])} />
          <UploadCloud size={34} />
          <strong>{busy ? "正在上传并导入…" : "点击上传图片，或拖拽本地图至此上传。"}</strong>
          <span>上传后将自动生成一个图片平面放入 3D 场景中作为参考。</span>
        </label>
        <div className="director3d-dialog-options">
          <button type="button" className="is-active"><ImagePlus size={16} /> 插入当前导演台</button>
          <button type="button" disabled><Layers3 size={16} /> 覆盖当前导演台 · 后续支持</button>
        </div>
        <p className="director3d-dialog-note">注意：第一版 AI 识图仅作为入口，不做复杂场景解析。</p>
        <div className="director3d-history-placeholder">历史记录：第一版占位，后续接入素材历史。</div>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return <label className="director3d-number-field"><span>{label}</span><input type="number" step={step} value={Number(value.toFixed(3))} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function VectorFields({ title, value, onChange, step = 0.1 }: { title: string; value: DirectorVector3; onChange: (value: DirectorVector3) => void; step?: number }) {
  return <div className="director3d-field-group"><strong>{title}</strong><div className="director3d-vector-grid">{(["x", "y", "z"] as const).map((axis) => <NumberField key={axis} label={axis.toUpperCase()} step={step} value={value[axis]} onChange={(next) => onChange(patchVector(value, axis, next))} />)}</div></div>;
}

export function Director3DWorkspace({ nodeId, data, projectId, onClose, onSave }: Props) {
  const [scene, setScene] = useState<DirectorScene>(() => data.scene ?? defaultScene(nodeId, projectId));
  const [selection, setSelection] = useState<Selection>({ kind: "scene" });
  const [viewMode, setViewMode] = useState<ViewMode>("director");
  const [activeCameraId, setActiveCameraId] = useState(scene.cameras[0]?.id);
  const [aspectRatio, setAspectRatio] = useState(scene.cameras[0]?.aspectRatio ?? "16:9");
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridgeRef = useRef<ViewportBridge | null>(null);

  const selectedObject = selection.kind === "object" ? scene.objects.find((object) => object.id === selection.id) : undefined;
  const selectedCamera = selection.kind === "camera" ? scene.cameras.find((camera) => camera.id === selection.id) : scene.cameras.find((camera) => camera.id === activeCameraId);

  useEffect(() => {
    onSave({ status: "editing", scene: { ...scene, updatedAt: now() } });
  }, []);

  function commitScene(next: DirectorScene) {
    const updated = { ...next, updatedAt: now() };
    setScene(updated);
    onSave({ scene: updated, screenshots: updated.screenshots, status: "editing" });
  }

  function updateObject(id: string, patch: Partial<DirectorSceneObject>) {
    commitScene({ ...scene, objects: scene.objects.map((object) => object.id === id ? { ...object, ...patch } : object) });
  }

  function updateCamera(id: string, patch: Partial<DirectorCamera>) {
    commitScene({ ...scene, cameras: scene.cameras.map((camera) => camera.id === id ? { ...camera, ...patch } : camera) });
  }

  function addCharacter(subtype = "女性素体") {
    const object: DirectorSceneObject = { id: createClientId("character"), type: "character", subtype, name: subtype, position: vector(scene.objects.length * 0.4 - 0.4, 0, 0), rotation: vector(0, 0, 0), scale: vector(1, 1, 1), material: { color: "#d8e8ff", opacity: 0.92 }, visible: true, locked: false, labelVisible: true };
    commitScene({ ...scene, objects: [...scene.objects, object] });
    setSelection({ kind: "object", id: object.id });
  }

  function addGeometry(subtype = "cube") {
    const object: DirectorSceneObject = { id: createClientId("geometry"), type: subtype === "product_placeholder" ? "product_placeholder" : "geometry", subtype, name: subtype === "product_placeholder" ? "产品占位" : `几何体 ${subtype}`, position: vector(0.8, 0.6, 0), rotation: vector(0, 0, 0), scale: vector(1, 1, 1), material: { color: subtype === "product_placeholder" ? "#fde68a" : "#a5b4fc", opacity: 0.86 }, visible: true, locked: false, labelVisible: true };
    commitScene({ ...scene, objects: [...scene.objects, object] });
    setSelection({ kind: "object", id: object.id });
  }

  function addEmptyImagePlane(asset?: Pick<Asset, "id" | "url" | "publicUrl" | "thumbnailUrl" | "name">) {
    const camera = scene.cameras.find((item) => item.id === activeCameraId) ?? scene.cameras[0];
    const object: DirectorSceneObject = { id: createClientId("image_plane"), type: "image_plane", subtype: "reference", name: asset?.name || "图片平面", position: vector(0, 1.15, -0.85), rotation: vector(0, 0, 0), scale: vector(1.6, 1.6, 1), material: { color: "#172554", opacity: 1 }, assetId: asset?.id, assetUrl: asset ? assetUrl(asset as Asset) : undefined, visible: true, locked: false, labelVisible: true };
    if (camera) object.rotation.y = Math.atan2(camera.position.x - object.position.x, camera.position.z - object.position.z);
    commitScene({ ...scene, objects: [...scene.objects, object] });
    setSelection({ kind: "object", id: object.id });
  }

  function addCamera() {
    const camera: DirectorCamera = { id: createClientId("camera"), name: `机位 ${scene.cameras.length + 1}`, position: vector(3 + scene.cameras.length, 2.4, 5), target: vector(0, 1, 0), fov: 45, aspectRatio };
    commitScene({ ...scene, cameras: [...scene.cameras, camera] });
    setActiveCameraId(camera.id);
    setSelection({ kind: "camera", id: camera.id });
  }

  async function uploadReference(file: File) {
    setBusy("正在上传图片…");
    setError(null);
    try {
      const asset = await assetApi.upload(file, { name: file.name });
      addEmptyImagePlane(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片上传失败");
    } finally {
      setBusy(null);
    }
  }

  async function takeScreenshot() {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setBusy("正在截图并保存到素材库…");
    setError(null);
    onSave({ status: "screenshotting" });
    try {
      const activeCamera = scene.cameras.find((camera) => camera.id === activeCameraId) ?? scene.cameras[0];
      const shot = await cropShotToAspect(await bridge.capture(), aspectRatio);
      const cameraName = activeCamera?.name ?? "DirectorView";
      const fileName = `DirectorShot_${filenameSafe(cameraName)}_${Date.now()}.png`;
      const file = new File([shot.blob], fileName, { type: "image/png" });
      const asset = await assetApi.upload(file, { name: fileName });
      const screenshot: DirectorScreenshot = { id: createClientId("director_shot"), projectId, nodeId, cameraId: viewMode === "camera" ? activeCamera?.id : undefined, aspectRatio, imageUrl: assetUrl(asset), cosKey: asset.storageKey, assetId: asset.id, width: asset.width ?? shot.width, height: asset.height ?? shot.height, createdAt: now() };
      const nextScene = { ...scene, screenshots: [screenshot, ...scene.screenshots], updatedAt: now() };
      setScene(nextScene);
      onSave({ status: "succeeded", scene: nextScene, screenshots: nextScene.screenshots, outputAssetId: asset.id, outputUrl: screenshot.imageUrl, thumbnailUrl: asset.thumbnailUrl || screenshot.imageUrl, aspectRatio, errorMessage: undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : "截图保存失败";
      setError(message);
      onSave({ status: "failed", errorMessage: message });
    } finally {
      setBusy(null);
    }
  }

  function saveScene() {
    onSave({ scene: { ...scene, updatedAt: now() }, screenshots: scene.screenshots, status: scene.screenshots.length ? "succeeded" : "editing" });
  }

  function deleteSelected() {
    if (selection.kind === "object") {
      commitScene({ ...scene, objects: scene.objects.filter((object) => object.id !== selection.id) });
      setSelection({ kind: "scene" });
    }
    if (selection.kind === "camera" && scene.cameras.length > 1) {
      const cameras = scene.cameras.filter((camera) => camera.id !== selection.id);
      commitScene({ ...scene, cameras });
      setActiveCameraId(cameras[0]?.id);
      setSelection({ kind: "scene" });
    }
  }

  return (
    <div className="director3d-shell nodrag nopan">
      <header className="director3d-topbar">
        <div className="director3d-title"><span><Layers3 size={20} /></span><div><strong>3D 导演台</strong><small>搭建场景、管理机位，并把截图回填到 Moon 画布</small></div></div>
        <div className="director3d-topbar-actions">
          <button type="button" className={viewMode === "director" ? "is-active" : ""} onClick={() => setViewMode("director")}><Move3D size={16} />导演视角</button>
          <button type="button" className={viewMode === "camera" ? "is-active" : ""} onClick={() => setViewMode("camera")}><Camera size={16} />机位视角</button>
          <label className="director3d-select"><Camera size={15} /><select value={activeCameraId} onChange={(event) => { setActiveCameraId(event.target.value); setViewMode("camera"); }}>{scene.cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select><ChevronDown size={14} /></label>
          <button type="button" onClick={saveScene}><Save size={16} />保存场景</button>
          <button type="button" title="帮助"><HelpCircle size={16} />帮助</button>
          <button type="button" className="director3d-close" onClick={onClose}><X size={17} />关闭</button>
        </div>
      </header>
      <aside className="director3d-sidebar director3d-leftbar">
        <input className="director3d-search" placeholder="搜索对象 / 机位" />
        <Section title="机位列表" items={scene.cameras.map((camera) => ({ id: camera.id, label: camera.name, icon: Camera, active: selection.kind === "camera" && selection.id === camera.id, onClick: () => setSelection({ kind: "camera", id: camera.id }) }))} />
        <Section title="角色列表" items={scene.objects.filter((object) => object.type === "character").map((object) => ({ id: object.id, label: object.name, icon: UserRound, active: selection.kind === "object" && selection.id === object.id, onClick: () => setSelection({ kind: "object", id: object.id }) }))} />
        <Section title="几何体列表" items={scene.objects.filter((object) => object.type === "geometry" || object.type === "product_placeholder").map((object) => ({ id: object.id, label: object.name, icon: Cuboid, active: selection.kind === "object" && selection.id === object.id, onClick: () => setSelection({ kind: "object", id: object.id }) }))} />
        <Section title="图片平面列表" items={scene.objects.filter((object) => object.type === "image_plane").map((object) => ({ id: object.id, label: object.name, icon: ImagePlus, active: selection.kind === "object" && selection.id === object.id, onClick: () => setSelection({ kind: "object", id: object.id }) }))} />
        <Section title="背景对象" items={[{ id: "scene", label: "场景 / 背景", icon: Layers3, active: selection.kind === "scene", onClick: () => setSelection({ kind: "scene" }) }]} />
        <div className="director3d-imported"><strong>已导入素材</strong>{scene.objects.filter((object) => object.assetUrl).slice(0, 4).map((object) => <span key={object.id}>{object.name}</span>)}{!scene.objects.some((object) => object.assetUrl) && <small>暂无导入素材</small>}</div>
      </aside>
      <main className="director3d-viewport-wrap">
        <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ position: [4, 3.2, 6], fov: 45 }} onPointerMissed={() => setSelection({ kind: "scene" })}>
          <SceneViewport scene={scene} selection={selection} viewMode={viewMode} activeCameraId={activeCameraId} transformMode={transformMode} onSelect={setSelection} onObjectTransform={(object) => updateObject(object.id, object)} bridgeRef={bridgeRef} />
        </Canvas>
        <div className="director3d-busy">{busy || error || "Moon 3D Director Stage MVP"}</div>
        <div className="director3d-bottom-toolbar">
          <button type="button" className={transformMode === "translate" ? "is-active" : ""} onClick={() => setTransformMode("translate")}><Move3D size={17} />选择/移动</button>
          <button type="button" className={transformMode === "rotate" ? "is-active" : ""} onClick={() => setTransformMode("rotate")}><RotateCcw size={17} />旋转</button>
          <button type="button" className={transformMode === "scale" ? "is-active" : ""} onClick={() => setTransformMode("scale")}><ZoomIn size={17} />缩放</button>
          <button type="button" onClick={() => addCharacter()}><UserRound size={17} />添加角色</button>
          <button type="button" onClick={() => addGeometry()}><Cuboid size={17} />添加几何体</button>
          <button type="button" onClick={() => addEmptyImagePlane()}><ImagePlus size={17} />添加图片平面</button>
          <button type="button" onClick={addCamera}><Camera size={17} />添加机位</button>
          <label className="director3d-aspect"><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>{aspectOptions.map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label>
          <button type="button" onClick={takeScreenshot}><Focus size={17} />截图</button>
          <button type="button" onClick={() => setUploadOpen(true)}><Sparkles size={17} />AI 识图导入</button>
          <button type="button"><Maximize2 size={17} />全屏</button>
        </div>
      </main>
      <aside className="director3d-sidebar director3d-rightbar">
        <Inspector
          selection={selection}
          scene={scene}
          selectedObject={selectedObject}
          selectedCamera={selectedCamera}
          updateObject={updateObject}
          updateCamera={updateCamera}
          updateScene={(patch) => commitScene({ ...scene, sceneSettings: { ...scene.sceneSettings, ...patch } })}
          setActiveCamera={(id) => { setActiveCameraId(id); setViewMode("camera"); }}
          deleteSelected={deleteSelected}
          addCharacter={addCharacter}
          addGeometry={addGeometry}
          screenshot={takeScreenshot}
        />
      </aside>
      {uploadOpen && <UploadImportDialog onClose={() => setUploadOpen(false)} onUpload={uploadReference} />}
    </div>
  );
}

function Section({ title, items }: { title: string; items: Array<{ id: string; label: string; icon: typeof Camera; active?: boolean; onClick: () => void }> }) {
  return <div className="director3d-section"><strong>{title}</strong>{items.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={item.active ? "is-active" : ""} onClick={item.onClick}><Icon size={15} /><span>{item.label}</span></button>; })}</div>;
}

function Inspector({ selection, scene, selectedObject, selectedCamera, updateObject, updateCamera, updateScene, setActiveCamera, deleteSelected, addCharacter, addGeometry, screenshot }: { selection: Selection; scene: DirectorScene; selectedObject?: DirectorSceneObject; selectedCamera?: DirectorCamera; updateObject: (id: string, patch: Partial<DirectorSceneObject>) => void; updateCamera: (id: string, patch: Partial<DirectorCamera>) => void; updateScene: (patch: Partial<DirectorScene["sceneSettings"]>) => void; setActiveCamera: (id: string) => void; deleteSelected: () => void; addCharacter: (subtype?: string) => void; addGeometry: (subtype?: string) => void; screenshot: () => Promise<void> }) {
  if (selection.kind === "camera" && selectedCamera) {
    return <div className="director3d-inspector"><h3>机位参数</h3><label className="director3d-text-field"><span>名称</span><input value={selectedCamera.name} onChange={(event) => updateCamera(selectedCamera.id, { name: event.target.value })} /></label><VectorFields title="位置" value={selectedCamera.position} onChange={(position) => updateCamera(selectedCamera.id, { position })} /><VectorFields title="注视目标" value={selectedCamera.target} onChange={(target) => updateCamera(selectedCamera.id, { target })} /><NumberField label="FOV" value={selectedCamera.fov} step={1} onChange={(fov) => updateCamera(selectedCamera.id, { fov })} /><label className="director3d-text-field"><span>画幅比例</span><select value={selectedCamera.aspectRatio} onChange={(event) => updateCamera(selectedCamera.id, { aspectRatio: event.target.value })}>{aspectOptions.map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label><div className="director3d-shot-preview">镜头截图预览</div><button type="button" onClick={() => setActiveCamera(selectedCamera.id)}>切换到该机位</button><button type="button" className="is-primary" onClick={() => void screenshot()}>截图</button>{scene.cameras.length > 1 && <button type="button" className="is-danger" onClick={deleteSelected}><Trash2 size={15} />删除机位</button>}</div>;
  }
  if (selection.kind === "object" && selectedObject) {
    return <div className="director3d-inspector"><h3>对象参数</h3><label className="director3d-text-field"><span>名称</span><input value={selectedObject.name} onChange={(event) => updateObject(selectedObject.id, { name: event.target.value })} /></label><label className="director3d-text-field"><span>类型</span><input value={`${selectedObject.type} / ${selectedObject.subtype ?? "default"}`} readOnly /></label><VectorFields title="位置" value={selectedObject.position} onChange={(position) => updateObject(selectedObject.id, { position })} /><VectorFields title="旋转" value={selectedObject.rotation} step={0.05} onChange={(rotation) => updateObject(selectedObject.id, { rotation })} /><VectorFields title="缩放" value={selectedObject.scale} step={0.05} onChange={(scale) => updateObject(selectedObject.id, { scale })} /><label className="director3d-color-field"><span>材质颜色</span><input type="color" value={selectedObject.material?.color || "#a5b4fc"} onChange={(event) => updateObject(selectedObject.id, { material: { ...selectedObject.material, color: event.target.value } })} /></label><NumberField label="透明度" value={selectedObject.material?.opacity ?? 1} step={0.05} onChange={(opacity) => updateObject(selectedObject.id, { material: { ...selectedObject.material, opacity: Math.max(0, Math.min(1, opacity)) } })} /><label className="director3d-check"><input type="checkbox" checked={selectedObject.labelVisible ?? true} onChange={(event) => updateObject(selectedObject.id, { labelVisible: event.target.checked })} />显示标签</label><label className="director3d-check"><input type="checkbox" checked={selectedObject.locked ?? false} onChange={(event) => updateObject(selectedObject.id, { locked: event.target.checked })} />锁定</label><button type="button" className="is-danger" onClick={deleteSelected}><Trash2 size={15} />删除对象</button></div>;
  }
  return <div className="director3d-inspector"><h3>场景设置</h3><NumberField label="场景缩放" value={scene.sceneSettings.sceneScale} step={0.1} onChange={(sceneScale) => updateScene({ sceneScale })} /><label className="director3d-color-field"><span>天空颜色</span><input type="color" value={scene.sceneSettings.skyColor} onChange={(event) => updateScene({ skyColor: event.target.value })} /></label><label className="director3d-check"><input type="checkbox" checked={scene.sceneSettings.groundVisible} onChange={(event) => updateScene({ groundVisible: event.target.checked })} />地面显示</label><NumberField label="地面透明度" value={scene.sceneSettings.groundOpacity} step={0.05} onChange={(groundOpacity) => updateScene({ groundOpacity: Math.max(0, Math.min(1, groundOpacity)) })} /><label className="director3d-check"><input type="checkbox" checked={scene.sceneSettings.gridVisible} onChange={(event) => updateScene({ gridVisible: event.target.checked })} />网格显示</label><label className="director3d-check"><input type="checkbox" checked={scene.sceneSettings.snapToGrid} onChange={(event) => updateScene({ snapToGrid: event.target.checked })} />网格吸附</label><label className="director3d-check"><input type="checkbox" checked={scene.sceneSettings.labelVisible} onChange={(event) => updateScene({ labelVisible: event.target.checked })} />角色标签开关</label><div className="director3d-mini-actions"><strong>快速添加角色</strong>{characterSubtypes.map((item) => <button key={item} type="button" onClick={() => addCharacter(item)}><Plus size={14} />{item}</button>)}</div><div className="director3d-mini-actions"><strong>快速添加几何体</strong>{geometrySubtypes.map((item) => <button key={item} type="button" onClick={() => addGeometry(item)}><Plus size={14} />{item}</button>)}</div></div>;
}
