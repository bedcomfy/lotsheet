// Shimmer placeholders for chrome surfaces while server data loads.
// Never used inside a sheet — paper must never show loading chrome.

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span className="skeleton" key={i} />
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return <span className="skeleton skeleton--stat" aria-hidden="true" />;
}
