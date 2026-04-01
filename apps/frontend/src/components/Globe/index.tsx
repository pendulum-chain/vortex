import createGlobe from "cobe";
import { useEffect, useRef, useSyncExternalStore } from "react";
import ARS_ICON from "../../assets/coins/ARS.png";
import BRL_ICON from "../../assets/coins/BRL.png";
import COP_ICON from "../../assets/coins/COP.png";
import EUR_ICON from "../../assets/coins/EU.png";
import MXN_ICON from "../../assets/coins/MXN.png";
import USD_ICON from "../../assets/coins/USD.png";
import { prefersReducedMotion } from "../../constants/animations";
import { cn } from "../../helpers/cn";

const GLOBE_THETA = -0.08;
const GLOBE_INITIAL_PHI = -1.32;
const NORMAL_SPEED = 0.0005;
const VERTICAL_SPEED = -0.0005;
const GLOBE_COLOR: [number, number, number] = [0.07, 0.23, 0.72];

const GLOBE_SIZES = {
  lg: 960,
  md: 780,
  sm: 560
} as const;

const CURRENCY_MARKERS = [
  { currency: "usd", icon: USD_ICON, lat: 38.91, lng: -77.04 },
  { currency: "brl", icon: BRL_ICON, lat: -15.8, lng: -47.89 },
  { currency: "eur", icon: EUR_ICON, lat: 50.85, lng: 4.35 },
  { currency: "mxn", icon: MXN_ICON, lat: 19.43, lng: -99.13 },
  { currency: "cop", icon: COP_ICON, lat: 4.71, lng: -74.07 },
  { currency: "ars", icon: ARS_ICON, lat: -34.61, lng: -58.38 }
] as const;

function getGlobeSize(): number {
  if (window.matchMedia("(min-width: 1024px)").matches) return GLOBE_SIZES.lg;
  if (window.matchMedia("(min-width: 640px)").matches) return GLOBE_SIZES.md;
  return GLOBE_SIZES.sm;
}

function createGlobeConfig(size: number) {
  const bufferSize = size * window.devicePixelRatio;
  return {
    arcColor: [0.3, 0.5, 1] as [number, number, number],
    arcHeight: 0.25,
    arcs: CURRENCY_MARKERS.flatMap((a, i) =>
      CURRENCY_MARKERS.slice(i + 1).map(b => ({
        from: [a.lat, a.lng] as [number, number],
        to: [b.lat, b.lng] as [number, number]
      }))
    ),
    arcWidth: 0.3,
    baseColor: GLOBE_COLOR,
    dark: 1,
    devicePixelRatio: window.devicePixelRatio,
    diffuse: 1.2,
    glowColor: GLOBE_COLOR,
    height: bufferSize,
    mapBrightness: 3,
    mapSamples: 12000,
    markerColor: GLOBE_COLOR,
    markers: [],
    phi: 0,
    theta: GLOBE_THETA,
    width: bufferSize
  };
}

// Matches cobe's shader coordinate system exactly:
// sphere point: px = -cos(lat)*cos(lng), py = sin(lat), pz = cos(lat)*sin(lng)
// rotation: screen = R_x(theta) * R_y(phi) * p  (derived from mat3 A(theta,phi) in cobe's GLSL)
function projectToScreen(lat: number, lng: number, phi: number, theta: number, size: number) {
  const pixelRadius = 0.8 * (size / 2);
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const px = -Math.cos(latRad) * Math.cos(lngRad);
  const py = Math.sin(latRad);
  const pz = Math.cos(latRad) * Math.sin(lngRad);

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  const sx = cosPhi * px + sinPhi * pz;
  const sy = sinPhi * sinTheta * px + cosTheta * py - cosPhi * sinTheta * pz;
  const sz = -sinPhi * cosTheta * px + sinTheta * py + cosPhi * cosTheta * pz;

  if (sz <= 0) return null;

  return {
    x: size / 2 + sx * pixelRadius,
    y: size / 2 - sy * pixelRadius
  };
}

function updateMarkers(phi: number, theta: number, size: number, markerRefs: React.RefObject<(HTMLImageElement | null)[]>) {
  for (let i = 0; i < CURRENCY_MARKERS.length; i++) {
    const el = markerRefs.current[i];
    if (!el) continue;
    const pos = projectToScreen(CURRENCY_MARKERS[i].lat, CURRENCY_MARKERS[i].lng, phi + Math.PI, theta, size);
    if (pos) {
      el.style.display = "";
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
    } else {
      el.style.display = "none";
    }
  }
}

function useDragRotation(phiRef: React.RefObject<number>, thetaRef: React.RefObject<number>, size: number) {
  const isDraggingRef = useRef(false);
  const lastPointerXRef = useRef(0);
  const lastPointerYRef = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    phiRef.current += ((e.clientX - lastPointerXRef.current) / size) * Math.PI;
    thetaRef.current += ((e.clientY - lastPointerYRef.current) / size) * Math.PI;
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
  };

  const onPointerUp = () => {
    isDraggingRef.current = false;
  };

  return { isDraggingRef, onPointerCancel: onPointerUp, onPointerDown, onPointerMove, onPointerUp };
}

function subscribeToBreakpoints(callback: () => void) {
  const mq = window.matchMedia("(min-width: 1024px), (min-width: 640px)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

interface GlobeProps {
  className?: string;
}

export const Globe = ({ className }: GlobeProps) => {
  const reducedMotion = prefersReducedMotion();
  const size = useSyncExternalStore(subscribeToBreakpoints, getGlobeSize, getGlobeSize);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // positions written directly to DOM each frame, skipping React re-renders
  const markerRefs = useRef<(HTMLImageElement | null)[]>(CURRENCY_MARKERS.map(() => null));
  const phiRef = useRef(GLOBE_INITIAL_PHI);
  const thetaRef = useRef(GLOBE_THETA);

  const { isDraggingRef, ...dragHandlers } = useDragRotation(phiRef, thetaRef, size);

  useEffect(() => {
    if (!canvasRef.current || reducedMotion) return;
    let rafId: number;
    const globe = createGlobe(canvasRef.current, createGlobeConfig(size));
    const tick = () => {
      if (!isDraggingRef.current) {
        phiRef.current += NORMAL_SPEED;
        thetaRef.current += VERTICAL_SPEED;
      }
      globe.update({ phi: phiRef.current, theta: thetaRef.current });
      updateMarkers(phiRef.current, thetaRef.current, size, markerRefs);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      globe.destroy();
      cancelAnimationFrame(rafId);
    };
  }, [reducedMotion, size]);

  return (
    <div
      className={cn("absolute cursor-grab select-none active:cursor-grabbing", className)}
      style={{ height: size, touchAction: "manipulation", width: size }}
      {...dragHandlers}
    >
      <canvas
        height={size * window.devicePixelRatio}
        ref={canvasRef}
        style={{ height: size, width: size }}
        width={size * window.devicePixelRatio}
      />
      <div className="pointer-events-none absolute inset-0">
        {CURRENCY_MARKERS.map((m, i) => (
          <img
            alt={m.currency.toUpperCase()}
            className="-translate-x-1/2 -translate-y-1/2 absolute rounded-full shadow-lg ring-2 ring-white/60"
            height={32}
            key={m.currency}
            ref={el => {
              markerRefs.current[i] = el;
            }}
            src={m.icon}
            style={{ display: "none", left: 0, top: 0 }}
            width={32}
          />
        ))}
      </div>
    </div>
  );
};
