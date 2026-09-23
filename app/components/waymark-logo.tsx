type WaymarkLogoProps = {
  compact?: boolean;
  className?: string;
};

/**
 * Monogram W mark — exact asset from approved variant A mockup
 * (geometric white W on forest-green squircle).
 */
export function WaymarkLogo({ compact = false, className = "" }: WaymarkLogoProps) {
  return (
    <span
      className={`waymark-logo ${compact ? "waymark-logo-compact" : ""} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="waymark-logo-tile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="waymark-logo-mark"
          src="/waymark-mark.png"
          alt=""
          width={72}
          height={72}
          draggable={false}
        />
      </span>
      {!compact && <span className="waymark-wordmark">Waymark</span>}
    </span>
  );
}

/** @deprecated Use WaymarkLogo */
export const RoavlyLogo = WaymarkLogo;
