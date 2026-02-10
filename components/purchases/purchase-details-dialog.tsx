"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"

interface Purchase {
  id: string
  purchase_date: string
  quantity: number
  purchase_price_per_unit: number
  total_amount: number
  payment_method: string
  invoice_number: string
  notes: string | null
  old_weighted_avg: number | null
  new_weighted_avg: number | null
  status: string
  created_at: string
  suppliers: {
    supplier_name: string
    phone_number: string
  }
  products: {
    product_name: string
    product_type: string
    unit: string
  }
}

interface PurchaseDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchase: Purchase | null
}

export function PurchaseDetailsDialog({
  open,
  onOpenChange,
  purchase,
}: PurchaseDetailsDialogProps) {
  if (!purchase) return null

  const paymentMethodLabels: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
    cash: "Cash",
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Purchase Details</DialogTitle>
          <DialogDescription>
            Invoice #{purchase.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge
              variant={
                purchase.status === "completed"
                  ? "default"
                  : purchase.status === "pending"
                    ? "secondary"
                    : "destructive"
              }
            >
              {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
            </Badge>
          </div>

          <Separator />

          <div className="grid gap-3">
            <h4 className="font-medium">Product Information</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Product</span>
              <span className="font-medium">{purchase.products.product_name}</span>
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{purchase.products.product_type.replace("_", " ")}</span>
              <span className="text-muted-foreground">Quantity</span>
              <span>{purchase.quantity.toLocaleString()} {purchase.products.unit}</span>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <h4 className="font-medium">Supplier Information</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Supplier</span>
              <span className="font-medium">{purchase.suppliers.supplier_name}</span>
              <span className="text-muted-foreground">Contact</span>
              <span>{purchase.suppliers.phone_number}</span>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <h4 className="font-medium">Price Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Price per Unit</span>
              <span>Rs. {purchase.purchase_price_per_unit.toLocaleString()}</span>
              <span className="text-muted-foreground">Total Amount</span>
              <span className="font-semibold text-primary">
                Rs. {purchase.total_amount.toLocaleString()}
              </span>
              <span className="text-muted-foreground">Payment Method</span>
              <span>{paymentMethodLabels[purchase.payment_method] || purchase.payment_method}</span>
            </div>
          </div>

          {(purchase.old_weighted_avg || purchase.new_weighted_avg) && (
            <>
              <Separator />
              <div className="grid gap-3">
                <h4 className="font-medium">Weighted Average Impact</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Before Purchase</span>
                  <span>Rs. {purchase.old_weighted_avg?.toFixed(2) || "N/A"}</span>
                  <span className="text-muted-foreground">After Purchase</span>
                  <span className="font-medium text-primary">
                    Rs. {purchase.new_weighted_avg?.toFixed(2) || "N/A"}
                  </span>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="grid gap-3">
            <h4 className="font-medium">Additional Information</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Purchase Date</span>
              <span>{format(new Date(purchase.purchase_date), "PPP")}</span>
              <span className="text-muted-foreground">Recorded On</span>
              <span>{format(new Date(purchase.created_at), "PPP p")}</span>
            </div>
            {purchase.notes && (
              <div className="mt-2">
                <span className="text-sm text-muted-foreground">Notes:</span>
                <p className="mt-1 text-sm rounded-md bg-muted p-2">{purchase.notes}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
