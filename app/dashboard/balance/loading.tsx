export default function BalanceLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-5 w-96 animate-pulse rounded-lg bg-muted" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>

      <div className="h-32 animate-pulse rounded-lg border bg-muted" />
      <div className="h-64 animate-pulse rounded-lg border bg-muted" />
    </div>
  )
}
