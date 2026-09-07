type RoavlyLogoProps = {
  compact?: boolean;
  className?: string;
};

export function RoavlyLogo({ compact = false, className = "" }: RoavlyLogoProps) {
  return (
    <span
      className={`roavly-logo ${compact ? "roavly-logo-compact" : ""} ${className}`.trim()}
      aria-hidden="true"
    >
      <span className="roavly-logo-tile">
        <svg viewBox="0 0 72 72" role="img" aria-hidden="true">
          {/* Soft twin peaks — geometric mountain silhouette */}
          <path
            className="roavly-logo-mountain"
            d="M10 54 L28 26 L36 38 L46 20 L62 54 Z"
          />
          {/* Subtle mid ridge for depth */}
          <path
            className="roavly-logo-ridge"
            d="M28 26 L36 38 L46 20"
          />
          {/* Trail path climbing toward the pin */}
          <path
            className="roavly-logo-trail"
            d="M22 54 C28 48 32 46 38 44"
          />
          {/* Trail / location pin */}
          <circle className="roavly-logo-pin-ring" cx="42" cy="40" r="6.2" />
          <circle className="roavly-logo-pin" cx="42" cy="40" r="3.6" />
        </svg>
      </span>
      {!compact && <span className="roavly-wordmark">Roavly</span>}
    </span>
  );
}
