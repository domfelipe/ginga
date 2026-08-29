/**
 * The roda — Ginga's ownable mark. A thin double ring: the capoeira circle
 * where master and apprentice meet, doubled as the "live" registration ring.
 * Pure SVG, token-colored via `currentColor`, decorative by default.
 *
 * `weight` is the outer stroke in viewBox units (inner ring tracks at 55%),
 * so micro renderings can thicken up without becoming mud.
 */
export function RodaMark({
  className,
  weight = 2.5,
  dashed = false,
  center = false,
}: {
  className?: string;
  weight?: number;
  dashed?: boolean;
  center?: boolean;
}) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden className={className}>
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth={weight} />
      <circle
        cx="50"
        cy="50"
        r="34"
        stroke="currentColor"
        strokeWidth={weight * 0.55}
        strokeDasharray={dashed ? '3 6' : undefined}
        strokeLinecap="round"
      />
      {center && <circle cx="50" cy="50" r="9" fill="currentColor" />}
    </svg>
  );
}
