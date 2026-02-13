import { BrandLoader } from "@/components/ui/brand-loader"

export default function Loading() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <BrandLoader size="lg" />
    </div>
  )
}
