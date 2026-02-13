import { BrandLoader } from "@/components/ui/brand-loader"

export default function Loading() {
  return (
    <div className="flex h-96 items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <BrandLoader size="lg" />
        <p className="text-muted-foreground">Loading stock movements...</p>
      </div>
    </div>
  )
}
