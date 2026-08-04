type RoavlyLogoProps = {
  compact?: boolean;
  className?: string;
};

export function RoavlyLogo({ compact = false, className = "" }: RoavlyLogoProps) {
  return (
    <span className={`roavly-logo ${compact ? "roavly-logo-compact" : ""} ${className}`.trim()} aria-hidden="true">
      <span className="roavly-logo-tile">
        <svg viewBox="0 0 72 72" role="img">
          <path
            className="roavly-logo-ridge"
            d="M18 59V16H42.5C54.7 16 61 22.2 61 31.8C61 41.8 54.1 47 42.2 47H18"
          />
          <path className="roavly-logo-trail" d="M34 42.5L56 61" />
          <circle className="roavly-logo-waypoint-keyline" cx="34" cy="42.5" r="7.4" />
          <circle className="roavly-logo-waypoint" cx="34" cy="42.5" r="5.2" />
        </svg>
      </span>
      {!compact && <span className="roavly-wordmark">ROAVLY</span>}
    </span>
  );
}
