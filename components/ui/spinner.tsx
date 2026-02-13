import { cn } from '@/lib/utils'
import { BrandLoader } from './brand-loader'

function Spinner({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <BrandLoader
      size="sm"
      className={className}
      {...props}
    />
  )
}

export { Spinner }
