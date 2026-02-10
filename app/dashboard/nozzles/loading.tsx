export default function NozzlesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-5 w-96 animate-pulse rounded-lg bg-muted" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>

      <div className="h-96 animate-pulse rounded-lg border bg-muted" />
    </div>
  )
}
