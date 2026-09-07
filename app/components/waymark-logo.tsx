type WaymarkLogoProps = {
  compact?: boolean;
  className?: string;
};

export function WaymarkLogo({ compact = false, className = "" }: WaymarkLogoProps) {
  return (
    <span
      className={`waymark-logo ${compact ? "waymark-logo-compact" : ""} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="waymark-logo-tile">
        <svg viewBox="0 0 72 72" role="img" aria-hidden="true">
          {/* Soft twin peaks — geometric mountain silhouette */}
          <path
            className="waymark-logo-mountain"
            d="M10 54 L28 26 L36 38 L46 20 L62 54 Z"
          />
          {/* Subtle mid ridge for depth */}
          <path
            className="waymark-logo-ridge"
            d="M28 26 L36 38 L46 20"
          />
          {/* Trail path climbing toward the pin */}
          <path
            className="waymark-logo-trail"
            d="M22 54 C28 48 32 46 38 44"
          />
          {/* Trail / location pin */}
          <circle className="waymark-logo-pin-ring" cx="42" cy="40" r="6.2" />
          <circle className="waymark-logo-pin" cx="42" cy="40" r="3.6" />
        </svg>
      </span>
      {!compact && <span className="waymark-wordmark">Waymark</span>}
    </span>
  );
}

/** @deprecated Use WaymarkLogo */
export const RoavlyLogo = WaymarkLogo;
