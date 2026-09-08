type WaymarkLogoProps = {
  compact?: boolean;
  className?: string;
};

/** Geometric monogram W — three thick trail-path strokes, sharp joints, flat tops. */
const W_PATH =
  "M14 18 L24.5 18 L30.2 47 L33.5 18 L38.5 18 L41.8 47 L47.5 18 L58 18 L49 54 L41.2 54 L36 30 L30.8 54 L23 54 Z";

export function WaymarkLogo({ compact = false, className = "" }: WaymarkLogoProps) {
  return (
    <span
      className={`waymark-logo ${compact ? "waymark-logo-compact" : ""} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="waymark-logo-tile">
        <svg viewBox="0 0 72 72" role="img" aria-hidden="true">
          <path className="waymark-logo-w" d={W_PATH} />
        </svg>
      </span>
      {!compact && <span className="waymark-wordmark">Waymark</span>}
    </span>
  );
}

/** @deprecated Use WaymarkLogo */
export const RoavlyLogo = WaymarkLogo;
