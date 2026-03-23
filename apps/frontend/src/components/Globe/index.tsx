import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";
import ARS_ICON from "../../assets/coins/ARS.png";
import BRL_ICON from "../../assets/coins/BRL.png";
import COP_ICON from "../../assets/coins/COP.png";
import EUR_ICON from "../../assets/coins/EU.png";
import MXN_ICON from "../../assets/coins/MXN.png";
import USD_ICON from "../../assets/coins/USD.png";
import { prefersReducedMotion } from "../../constants/animations";
import { cn } from "../../helpers/cn";

const CANVAS_SIZE = 480;
// Cobe renders the globe sphere at NDC radius 0.8 with scale=1, so pixel radius = 0.8 * (size/2)
const GLOBE_PIXEL_RADIUS = 0.8 * (CANVAS_SIZE / 2);
// Must match the theta passed to createGlobe
const GLOBE_THETA = 0.38;
// Must match the phi passed to createGlobe
const GLOBE_INITIAL_PHI = 0;

const CURRENCY_MARKERS = [
  { currency: "usd", icon: USD_ICON, lat: 38.91, lng: -77.04 },
  { currency: "brl", icon: BRL_ICON, lat: -15.8, lng: -47.89 },
  { currency: "eur", icon: EUR_ICON, lat: 50.85, lng: 4.35 },
  { currency: "mxn", icon: MXN_ICON, lat: 19.43, lng: -99.13 },
  { currency: "cop", icon: COP_ICON, lat: 4.71, lng: -74.07 },
  { currency: "ars", icon: ARS_ICON, lat: -34.61, lng: -58.38 }
] as const;

type ProjectedPoint = { x: number; y: number; visible: boolean };

// Matches cobe's shader coordinate system exactly:
//   sphere point: px = -cos(lat)*cos(lng), py = sin(lat), pz = cos(lat)*sin(lng)
//   rotation:     screen = M(theta, phi) * p   (derived from mat3 A(theta,phi) in cobe's GLSL)
function projectToScreen(lat: number, lng: number, phi: number): ProjectedPoint {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const px = -Math.cos(latRad) * Math.cos(lngRad);
  const py = Math.sin(latRad);
  const pz = Math.cos(latRad) * Math.sin(lngRad);

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosTheta = Math.cos(GLOBE_THETA);
  const sinTheta = Math.sin(GLOBE_THETA);

  const sx = cosPhi * px + sinPhi * pz;
  const sy = sinPhi * sinTheta * px + cosTheta * py - cosPhi * sinTheta * pz;
  const sz = -sinPhi * cosTheta * px + sinTheta * py + cosPhi * cosTheta * pz;

  if (sz <= 0) return { visible: false, x: 0, y: 0 };

  return {
    visible: true,
    x: CANVAS_SIZE / 2 + sx * GLOBE_PIXEL_RADIUS,
    y: CANVAS_SIZE / 2 - sy * GLOBE_PIXEL_RADIUS
  };
}

interface GlobeProps {
  className?: string;
}

export const Globe = ({ className }: GlobeProps) => {
  const reducedMotion = prefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(GLOBE_INITIAL_PHI);
  const isDraggingRef = useRef(false);
  const lastPointerXRef = useRef(0);
  const projectedRef = useRef<ProjectedPoint[]>(CURRENCY_MARKERS.map(() => ({ visible: false, x: 0, y: 0 })));
  const [markerPositions, setMarkerPositions] = useState<ProjectedPoint[]>(
    CURRENCY_MARKERS.map(() => ({ visible: false, x: 0, y: 0 }))
  );

  useEffect(() => {
    if (!canvasRef.current || reducedMotion) return;
    let rafId: number;
    const globe = createGlobe(canvasRef.current, {
      arcColor: [0.3, 0.5, 1],
      arcHeight: 0.3,
      arcs: [{ from: [37.78, -122.44], to: [40.71, -74.01] }],
      arcWidth: 0.5,
      baseColor: [0.07, 0.23, 0.72],
      dark: 1,
      devicePixelRatio: window.devicePixelRatio,
      diffuse: 1.2,
      glowColor: [1, 1, 1],
      height: CANVAS_SIZE * 2,
      mapBrightness: 6,
      mapSamples: 16000,
      markerColor: [0.07, 0.23, 0.72],
      markers: [],
      phi: 0,
      theta: 0.38,
      width: CANVAS_SIZE * 2
    });
    const tick = () => {
      if (!isDraggingRef.current) {
        phiRef.current += 0.003;
      }
      globe.update({ phi: phiRef.current });
      projectedRef.current = CURRENCY_MARKERS.map(m => projectToScreen(m.lat, m.lng, phiRef.current));
      setMarkerPositions([...projectedRef.current]);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      globe.destroy();
      cancelAnimationFrame(rafId);
    };
  }, [reducedMotion]);

  const onPointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastPointerXRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - lastPointerXRef.current;
    phiRef.current += (delta / CANVAS_SIZE) * Math.PI;
    lastPointerXRef.current = e.clientX;
  };

  const onPointerUp = () => {
    isDraggingRef.current = false;
  };

  if (reducedMotion) {
    return (
      <div className="flex h-[480px] items-center justify-center">
        <div className="flex flex-wrap justify-center gap-4">
          {CURRENCY_MARKERS.map(m => (
            <img alt={m.currency.toUpperCase()} className="h-12 w-12 rounded-full" key={m.currency} src={m.icon} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("relative mx-auto cursor-grab active:cursor-grabbing", className)}
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ height: CANVAS_SIZE, width: CANVAS_SIZE }}
    >
      <canvas
        height={CANVAS_SIZE * 2}
        ref={canvasRef}
        style={{ height: CANVAS_SIZE, width: CANVAS_SIZE }}
        width={CANVAS_SIZE * 2}
      />
      <div className="pointer-events-none absolute inset-0">
        {CURRENCY_MARKERS.map((m, i) => {
          const pos = markerPositions[i];
          if (!pos?.visible) return null;
          return (
            <img
              alt={m.currency.toUpperCase()}
              className="-translate-x-1/2 -translate-y-1/2 absolute h-8 w-8 rounded-full shadow-lg ring-2 ring-white/60"
              key={m.currency}
              src={m.icon}
              style={{ left: pos.x, top: pos.y }}
            />
          );
        })}
      </div>
    </div>
  );
};
