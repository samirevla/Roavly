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
          {/* Classic trail blaze — diamond marker hikers follow */}
          <path
            className="waymark-logo-blaze"
            d="M36 14 L50 28 L36 42 L22 28 Z"
          />
          {/* Vertical post / stem under the blaze */}
          <rect
            className="waymark-logo-post"
            x="33"
            y="40"
            width="6"
            height="16"
            rx="3"
          />
          {/* Subtle path curve at the base for motion */}
          <path
            className="waymark-logo-path"
            d="M18 60 C28 54 44 54 54 60"
          />
        </svg>
      </span>
      {!compact && <span className="waymark-wordmark">Waymark</span>}
    </span>
  );
}

/** @deprecated Use WaymarkLogo */
export const RoavlyLogo = WaymarkLogo;
