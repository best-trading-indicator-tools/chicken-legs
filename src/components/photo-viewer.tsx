"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./photo-viewer.module.css";

type View = "front" | "back";
type Sponsor = { name: string; logoUrl: string | null };

export interface PhotoViewerProps {
  selectedSlot: string | null;
  onSelectSlot: (id: string) => void;
  view: View;
  onViewChange?: (view: View) => void;
  className?: string;
  sponsors?: Record<string, Sponsor>;
}

interface Placement {
  id: string;
  label: string;
  shortLabel: string;
  view: View;
  x: number;
  y: number;
  labelDirection: "left" | "right";
}

// Coordinates match the complete, uncropped V2 front/back photographs. Anatomical
// left appears on the right in the front photograph and on the left in the back.
const placements: Placement[] = [
  { id: "left-quad", label: "Left quad", shortLabel: "L. QUAD", view: "front", x: 0.608, y: 0.608, labelDirection: "right" },
  { id: "right-quad", label: "Right quad", shortLabel: "R. QUAD", view: "front", x: 0.402, y: 0.608, labelDirection: "left" },
  { id: "left-hamstring", label: "Left hamstring", shortLabel: "L. HAMSTRING", view: "back", x: 0.402, y: 0.605, labelDirection: "left" },
  { id: "right-hamstring", label: "Right hamstring", shortLabel: "R. HAMSTRING", view: "back", x: 0.602, y: 0.605, labelDirection: "right" },
  { id: "left-calf", label: "Left calf", shortLabel: "L. CALF", view: "back", x: 0.365, y: 0.750, labelDirection: "left" },
  { id: "right-calf", label: "Right calf", shortLabel: "R. CALF", view: "back", x: 0.654, y: 0.750, labelDirection: "right" },
  { id: "left-ankle", label: "Left front ankle", shortLabel: "L. ANKLE", view: "front", x: 0.670, y: 0.797, labelDirection: "right" },
  { id: "right-ankle", label: "Right front ankle", shortLabel: "R. ANKLE", view: "front", x: 0.359, y: 0.785, labelDirection: "left" },
];

const photographs = {
  front: { src: "/images/runner-front.webp", width: 918, height: 1600 },
  back: { src: "/images/runner-back.webp", width: 918, height: 1600 },
} as const;

function SponsorshipMarker({ placement, selected, sponsor, onSelect }: {
  placement: Placement;
  selected: boolean;
  sponsor?: Sponsor;
  onSelect: () => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <button
      type="button"
      className={styles.marker}
      data-direction={placement.labelDirection}
      data-sponsored={Boolean(sponsor)}
      aria-label={`Select ${placement.label.toLowerCase()} sponsorship${sponsor ? `, currently sponsored by ${sponsor.name}` : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.markerFace} aria-hidden="true">
        {sponsor?.logoUrl && !logoFailed ? (
          // Keep public sponsor logos as DOM images, including a text fallback.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sponsor.logoUrl} alt="" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} />
        ) : sponsor ? (
          <span className={styles.initial}>{sponsor.name.slice(0, 1).toUpperCase()}</span>
        ) : selected ? "✓" : "+"}
      </span>
      <span className={styles.markerLabel} aria-hidden="true">{sponsor?.name ?? placement.shortLabel}</span>
    </button>
  );
}

export function PhotoViewer({ selectedSlot, onSelectSlot, view, onViewChange, className, sponsors }: PhotoViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<Partial<Record<View, HTMLImageElement | null>>>({});
  const instructionsId = useId();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState<Partial<Record<View, boolean>>>({});
  const [failed, setFailed] = useState<Partial<Record<View, boolean>>>({});
  const photograph = photographs[view];
  const scale = Math.min(size.width / photograph.width, size.height / photograph.height);
  const imageWidth = photograph.width * scale;
  const imageHeight = photograph.height * scale;

  useEffect(() => {
    // A cached image may finish loading before React hydrates the server HTML,
    // so its native load event cannot be our only source of readiness.
    const ready: Partial<Record<View, boolean>> = {};
    const unavailable: Partial<Record<View, boolean>> = {};
    for (const side of ["front", "back"] as const) {
      const image = imageRefs.current[side];
      if (!image?.complete) continue;
      if (image.naturalWidth > 0) ready[side] = true;
      else unavailable[side] = true;
    }
    if (Object.keys(ready).length) setLoaded((previous) => ({ ...previous, ...ready }));
    if (Object.keys(unavailable).length) setFailed((previous) => ({ ...previous, ...unavailable }));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => setSize({ width: container.clientWidth, height: container.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={[styles.viewer, className].filter(Boolean).join(" ")}
      role="group"
      tabIndex={0}
      aria-label={`Interactive sponsorship photograph, ${view} view`}
      aria-describedby={instructionsId}
      aria-keyshortcuts="ArrowLeft ArrowRight"
      onPointerDown={(event) => {
        if (!(event.target instanceof Element) || event.target.closest("button")) return;
        event.currentTarget.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        // Arrow keys only act while the viewer itself has keyboard focus.
        if (event.target !== event.currentTarget || !onViewChange) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onViewChange(view === "front" ? "back" : "front");
      }}
    >
      <p id={instructionsId} className={styles.visuallyHidden}>
        Use the front and back buttons to see both photographs. When this viewer is focused, Left and Right arrow keys switch photographs. Tab to a sponsorship marker and press Enter to select the spot.
      </p>
      {(["front", "back"] as const).map((side) => (
        // Both photographs load once, so changing view is immediate. The source
        // image remains complete; its contain bounds also position every marker.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={side}
          ref={(image) => { imageRefs.current[side] = image; }}
          className={styles.photograph}
          src={photographs[side].src}
          alt={`Full-body photograph of the runner, ${side} view`}
          hidden={view !== side || Boolean(failed[side])}
          width={photographs[side].width}
          height={photographs[side].height}
          draggable={false}
          fetchPriority={side === "front" ? "high" : "auto"}
          onLoad={() => setLoaded((previous) => ({ ...previous, [side]: true }))}
          onError={() => setFailed((previous) => ({ ...previous, [side]: true }))}
        />
      ))}
      {failed[view] ? (
        <p role="status" className={styles.status}>This photograph is unavailable. You can still choose a spot from the sponsorship list.</p>
      ) : !loaded[view] ? (
        <p role="status" className={styles.status}>Loading photograph…</p>
      ) : size.width > 0 && placements.filter((placement) => placement.view === view).map((placement) => (
        <div
          key={placement.id}
          className={styles.markerPosition}
          style={{
            left: (size.width - imageWidth) / 2 + placement.x * imageWidth,
            top: (size.height - imageHeight) / 2 + placement.y * imageHeight,
          }}
        >
          <SponsorshipMarker
            key={`${placement.id}-${sponsors?.[placement.id]?.logoUrl ?? "empty"}`}
            placement={placement}
            selected={selectedSlot === placement.id}
            onSelect={() => onSelectSlot(placement.id)}
            sponsor={sponsors?.[placement.id]}
          />
        </div>
      ))}
    </div>
  );
}

export default PhotoViewer;
