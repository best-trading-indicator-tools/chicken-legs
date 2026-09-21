"use client";

import {
  Component,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, ContactShadows, Html, useGLTF } from "@react-three/drei";
import { Box3, Mesh, Vector3 } from "three";

type View = "front" | "back";
type Position = [number, number, number];
type ControlsInstance = ComponentRef<typeof CameraControls>;
type ModelFrame = { center: Position; height: number; width: number; depth: number };

export interface LegViewerProps {
  selectedSlot: string | null;
  onSelectSlot: (id: string) => void;
  view: View;
  onViewChange?: (view: View) => void;
  className?: string;
  sponsors?: Record<string, { name: string; logoUrl: string | null }>;
}

interface Placement {
  id: string;
  label: string;
  shortLabel: string;
  position: Position;
  side: View;
}

// Anatomical left is +X: it appears on the viewer's right in front view.
// Runtime positions come from the Y-up Blender export's placement anchors.
const placements: Placement[] = [
  { id: "left-quad", label: "Left quad", shortLabel: "L. QUAD", position: [0.22, 1.38, 0.245], side: "front" },
  { id: "right-quad", label: "Right quad", shortLabel: "R. QUAD", position: [-0.22, 1.38, 0.245], side: "front" },
  { id: "left-hamstring", label: "Left hamstring", shortLabel: "L. HAMSTRING", position: [0.23, 1.4, -0.225], side: "back" },
  { id: "right-hamstring", label: "Right hamstring", shortLabel: "R. HAMSTRING", position: [-0.23, 1.4, -0.225], side: "back" },
  { id: "left-calf", label: "Left calf", shortLabel: "L. CALF", position: [0.25, 0.73, -0.19], side: "back" },
  { id: "right-calf", label: "Right calf", shortLabel: "R. CALF", position: [-0.25, 0.73, -0.19], side: "back" },
];

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

const hotspotStyle: CSSProperties = {
  position: "relative",
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "1px solid rgba(126, 220, 255, .78)",
  borderRadius: "50%",
  color: "#d8f7ff",
  background: "rgba(7, 25, 34, .6)",
  cursor: "pointer",
  boxShadow: "0 0 20px rgba(92, 211, 255, .18)",
  fontFamily: "inherit",
  WebkitTapHighlightColor: "transparent",
};

function HotspotButton({
  placement,
  selected,
  view,
  onSelect,
  sponsor,
}: {
  placement: Placement;
  selected: boolean;
  view: View;
  onSelect: () => void;
  sponsor?: { name: string; logoUrl: string | null };
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const extendRight = (placement.position[0] > 0) === (view === "front");
  const outward = extendRight ? "left" : "right";

  return (
    <button
      type="button"
      aria-label={`Select ${placement.label.toLowerCase()} sponsorship${sponsor ? `, currently sponsored by ${sponsor.name}` : ""}`}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        ...hotspotStyle,
        ...(sponsor ? { width: 58, height: 40, padding: 5, borderRadius: 6 } : {}),
        ...(selected ? {
          background: "#8ce7f4",
          borderColor: "#c6f9ff",
          color: "#07191e",
          boxShadow: "0 0 0 5px rgba(125, 227, 242, .12), 0 0 28px rgba(92, 211, 255, .4)",
        } : {}),
      }}
    >
      {sponsor ? (
        sponsor.logoUrl && !logoFailed ? (
          // Public sponsor logos stay in the DOM, so cross-origin images cannot
          // taint a WebGL texture or make the interactive model fail to load.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sponsor.logoUrl} alt="" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span aria-hidden="true" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", fontSize: 10, fontWeight: 750, lineHeight: 1.15 }}>
            {sponsor.name}
          </span>
        )
      ) : (
        <span aria-hidden="true" style={{ fontSize: 18, fontWeight: 400, lineHeight: 1 }}>
          {selected ? "−" : "+"}
        </span>
      )}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          [outward]: "100%",
          width: 16,
          height: 1,
          background: "rgba(160, 224, 240, .5)",
          pointerEvents: "none",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          [outward]: "calc(100% + 16px)",
          transform: "translateY(-50%)",
          whiteSpace: "nowrap",
          maxWidth: sponsor ? 105 : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: 9,
          fontWeight: 650,
          letterSpacing: ".09em",
          color: selected ? "#b7f5ff" : "#a0b9c3",
          padding: "5px 6px",
          borderRadius: 3,
          background: "rgba(7, 17, 24, .7)",
          pointerEvents: "none",
        }}
      >
        {sponsor?.name ?? placement.shortLabel}
      </span>
    </button>
  );
}

function AthleteModel() {
  const { scene } = useGLTF("/models/chicken-legs.glb");
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return copy;
  }, [scene]);

  // Cached GLTF resources are shared; leave their disposal to the loader.
  return <primitive object={model} dispose={null} />;
}

function ViewControls({
  view,
  reducedMotion,
  controlsRef,
  frame,
}: {
  view: View;
  reducedMotion: boolean;
  controlsRef: RefObject<ControlsInstance | null>;
  frame: ModelFrame;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const aspect = size.width / Math.max(size.height, 1);
  const halfFov = 37 * Math.PI / 360;
  const distance = Math.max(
    frame.height / (2 * Math.tan(halfFov)),
    Math.max(frame.width, 1.38) / (2 * Math.tan(halfFov) * aspect),
  ) * 1.14 + frame.depth * 0.4;

  useEffect(() => {
    if (!controlsRef.current) return;
    const [x, y, z] = frame.center;
    void controlsRef.current.setLookAt(x, y + distance * 0.018, z + (view === "front" ? distance : -distance), x, y, z, !reducedMotion);
    invalidate();
  }, [view, reducedMotion, invalidate, controlsRef, frame, distance]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={distance}
      maxDistance={distance}
      minPolarAngle={Math.PI * 0.2}
      maxPolarAngle={Math.PI * 0.78}
      truckSpeed={0}
      dollySpeed={0}
      azimuthRotateSpeed={0.65}
      polarRotateSpeed={0.45}
      smoothTime={reducedMotion ? 0 : 0.3}
      draggingSmoothTime={reducedMotion ? 0 : 0.1}
    />
  );
}

function Stage() {
  return (
    <group position={[0, -0.035, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[0.66, 0.69, 0.055, 96]} />
        <meshStandardMaterial color="#0d222e" roughness={0.42} metalness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.029, 0]}>
        <ringGeometry args={[0.637, 0.642, 96]} />
        <meshBasicMaterial color="#77d8ee" transparent opacity={0.75} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.52, 0.523, 96]} />
        <meshBasicMaterial color="#3e6c82" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

function Scene({ selectedSlot, onSelectSlot, view, sponsors, reducedMotion, controlsRef }: LegViewerProps & { reducedMotion: boolean; controlsRef: RefObject<ControlsInstance | null> }) {
  const { scene } = useGLTF("/models/chicken-legs.glb");
  const [facing, setFacing] = useState(view);
  const facingRef = useRef(view);
  const frame = useMemo<ModelFrame>(() => {
    const bounds = new Box3().setFromObject(scene);
    const dimensions = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    // Include the floor/platform and a little breathing room above the head.
    center.y = (Math.max(bounds.max.y, 2) + Math.min(bounds.min.y, -0.07)) / 2;
    return {
      center: center.toArray() as Position,
      height: Math.max(dimensions.y, 2) + 0.07,
      width: dimensions.x,
      depth: dimensions.z,
    };
  }, [scene]);
  const anchoredPlacements = useMemo(() => {
    scene.updateMatrixWorld(true);
    return placements.map((placement) => {
      const anchor = scene.getObjectByName(placement.id.replaceAll("-", "_"));
      if (!anchor) return placement;
      const position = anchor.getWorldPosition(new Vector3());
      // Lift the marker slightly above the sculpt to avoid self-occlusion.
      position.addScaledVector(anchor.getWorldDirection(new Vector3()), 0.024);
      return { ...placement, position: position.toArray() as Position };
    });
  }, [scene]);

  // Follow free rotation, not only the Front/Back control. Restrict labels to
  // the facing side as well as testing geometry occlusion, so rear sponsorships
  // never overlap the quad labels while a model's matrices are initializing.
  useFrame(({ camera }) => {
    const nextFacing = camera.position.z >= 0 ? "front" : "back";
    if (facingRef.current !== nextFacing) {
      facingRef.current = nextFacing;
      setFacing(nextFacing);
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} color="#d9eaf5" />
      <hemisphereLight args={["#e7f4ff", "#1b273b", 1.0]} />
      <directionalLight
        position={[-2.5, frame.height + 2, 4]}
        intensity={3.1}
        color="#ffe1c2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-1.5}
        shadow-camera-right={1.5}
        shadow-camera-top={frame.height + 0.5}
        shadow-camera-bottom={-0.5}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[3, frame.height * 0.8, -3]} intensity={3.6} color="#96dcff" />
      <directionalLight position={[-2, frame.height, -2]} intensity={1.7} color="#ffdcc5" />
      <Stage />
      <AthleteModel />
      <ContactShadows position={[0, -0.004, 0]} scale={2.5} opacity={0.65} blur={2.3} far={frame.height + 0.5} resolution={256} frames={1} />
      {anchoredPlacements.filter((placement) => placement.side === facing).map((placement) => (
        <Html key={placement.id} position={placement.position} center occlude zIndexRange={[20, 0]}>
          <HotspotButton
            key={`${placement.id}-${sponsors?.[placement.id]?.logoUrl ?? "empty"}`}
            placement={placement}
            selected={selectedSlot === placement.id}
            view={facing}
            onSelect={() => onSelectSlot(placement.id)}
            sponsor={sponsors?.[placement.id]}
          />
        </Html>
      ))}
      <ViewControls view={view} reducedMotion={reducedMotion} controlsRef={controlsRef} frame={frame} />
    </>
  );
}

function StaticPreview({ selectedSlot, onSelectSlot, view, sponsors, loading = false }: LegViewerProps & { loading?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAspect, setImageAspect] = useState(0.75);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, []);

  // Match Blender's full-body orthographic fallback camera. Account for the
  // letterboxing introduced by object-fit so markers stay on the same muscles.
  const pixelsPerUnit = Math.min(size.height, size.width / imageAspect) / 4.06;
  const renderCameraTilt = Math.atan2(2.25 - 1.79, 7);

  return (
    <div ref={previewRef} style={{ position: "absolute", inset: 0 }}>
      {!imageFailed && (
        // The full-size PNG is also the no-WebGL fallback, not a content image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/images/legs-${view}.png`}
          alt={`Full-body Blender model of the runner, ${view} view`}
          onError={() => setImageFailed(true)}
          onLoad={(event) => setImageAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", maxHeight: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
        />
      )}
      {imageFailed && (
        <p style={{ position: "absolute", top: "45%", left: "50%", transform: "translate(-50%, -50%)", color: "#8fa5b0", width: 200, textAlign: "center", fontSize: 13 }}>
          The model preview is unavailable. Choose a muscle from the sponsorship list.
        </p>
      )}
      {!loading && !imageFailed && size.width > 0 && placements.filter((placement) => placement.side === view).map((placement) => {
        return (
          <div
            key={placement.id}
            style={{
              position: "absolute",
              left: size.width / 2 + placement.position[0] * (view === "front" ? 1 : -1) * pixelsPerUnit,
              top: size.height / 2 - ((placement.position[1] - 0.009 - 1.79) * Math.cos(renderCameraTilt) - Math.abs(placement.position[2]) * Math.sin(renderCameraTilt)) * pixelsPerUnit,
              transform: "translate(-50%, -50%)",
            }}
          >
            <HotspotButton key={`${placement.id}-${sponsors?.[placement.id]?.logoUrl ?? "empty"}`} placement={placement} selected={placement.id === selectedSlot} view={view} onSelect={() => onSelectSlot(placement.id)} sponsor={sponsors?.[placement.id]} />
          </div>
        );
      })}
      {loading && (
        <span role="status" style={{ position: "absolute", bottom: 52, left: "50%", transform: "translateX(-50%)", fontSize: 11, letterSpacing: ".06em", color: "#a4bcc8" }}>
          Loading the model…
        </span>
      )}
    </div>
  );
}

class ViewerErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ContextLossMonitor({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLoss = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", handleLoss);
    return () => canvas.removeEventListener("webglcontextlost", handleLoss);
  }, [gl, onLost]);

  return null;
}

export function LegViewer(props: LegViewerProps) {
  const { className, view } = props;
  const reducedMotion = useReducedMotion();
  const [contextLost, setContextLost] = useState(false);
  const [focused, setFocused] = useState(false);
  const controlsRef = useRef<ControlsInstance>(null);
  const instructionsId = useId();
  const fallback = <StaticPreview {...props} />;

  return (
    <div
      className={className}
      role="group"
      tabIndex={0}
      aria-label={`Interactive full-body sponsorship model, ${view} view`}
      aria-describedby={instructionsId}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
      onFocus={(event) => setFocused(event.target === event.currentTarget)}
      onBlur={() => setFocused(false)}
      onPointerDown={(event) => {
        if (event.target instanceof HTMLCanvasElement) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onKeyDown={(event) => {
        // Sponsorship buttons and other descendants keep their normal keys.
        if (event.target !== event.currentTarget || !controlsRef.current) return;
        const rotations: Record<string, [number, number]> = {
          ArrowLeft: [-Math.PI / 12, 0],
          ArrowRight: [Math.PI / 12, 0],
          ArrowUp: [0, -Math.PI / 24],
          ArrowDown: [0, Math.PI / 24],
        };
        const rotation = rotations[event.key];
        if (!rotation) return;
        event.preventDefault();
        void controlsRef.current.rotate(rotation[0], rotation[1], !reducedMotion);
      }}
      style={{
        position: "relative", width: "100%", height: "100%", minHeight: 440, isolation: "isolate",
        borderRadius: 12, outline: focused ? "1px solid rgba(140, 231, 244, .65)" : "none", outlineOffset: -2,
      }}
    >
      <p id={instructionsId} style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0 }}>
        Drag to rotate the full-body model. When this viewer is focused, use Left and Right arrow keys to turn, and Up and Down to tilt. Tab to a muscle marker and press Enter to select its sponsorship. Use the front and back buttons to reset the view.
      </p>
      <div aria-hidden="true" style={{ position: "absolute", inset: "8% 0 0", background: "radial-gradient(ellipse at 50% 62%, rgba(41, 91, 115, .16), transparent 65%)", pointerEvents: "none" }} />
      {contextLost ? fallback : (
        <ViewerErrorBoundary fallback={fallback}>
          <Suspense fallback={<StaticPreview {...props} loading />}>
            <Canvas
              shadows="percentage"
              camera={{ position: [0, 1.9, 6.5], fov: 37, near: 0.1, far: 30 }}
              dpr={[1, 1.75]}
              frameloop="demand"
              gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
              fallback={fallback}
              style={{ position: "absolute", inset: 0 }}
            >
              <ContextLossMonitor onLost={() => setContextLost(true)} />
              <Scene {...props} reducedMotion={reducedMotion} controlsRef={controlsRef} />
            </Canvas>
          </Suspense>
        </ViewerErrorBoundary>
      )}
    </div>
  );
}

export default LegViewer;
