// Chrome-only loading placeholders. Paper sheets never render these.

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton" key={index} />
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return <span className="skeleton skeleton--stat" aria-hidden="true" />;
}
