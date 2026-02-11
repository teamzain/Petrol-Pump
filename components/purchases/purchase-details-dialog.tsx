"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"

interface PurchaseOrder {
  id: string
  purchase_date: string
  invoice_number: string
  total_amount: number
  paid_amount: number
  due_amount: number
  payment_method: string
  status: string
  notes: string | null
  created_at: string
  suppliers: {
    supplier_name: string
    phone_number: string
  }
  purchases: {
    id: string
    quantity: number
    purchase_price_per_unit: number
    total_amount: number
    products: {
      product_name: string
      product_type: string
      unit: string
    }
  }[]
}

interface PurchaseDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: PurchaseOrder | null
}

export function PurchaseDetailsDialog({
  open,
  onOpenChange,
  order,
}: PurchaseDetailsDialogProps) {
  if (!order) return null

  const paymentMethodLabels: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
    cash: "Cash",
  }

  const formatCurrency = (val: number) => `Rs. ${Number(val).toLocaleString()}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold text-xl">
            Invoice Details
          </DialogTitle>
          <DialogDescription className="font-mono text-sm">
            #{order.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Header Info */}
          <div className="flex justify-between items-start border-b pb-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier</p>
              <p className="font-bold text-lg">{order.suppliers?.supplier_name}</p>
              <p className="text-sm text-muted-foreground">{order.suppliers?.phone_number}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Date</p>
              <p className="font-medium">{format(new Date(order.purchase_date), "PPP")}</p>
              <Badge variant={order.due_amount > 0 ? "destructive" : "default"}>
                {order.due_amount > 0 ? "Outstanding" : "Completed"}
              </Badge>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Order Items
            </h4>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-left">
                  <tr>
                    <th className="p-2 font-medium">Product</th>
                    <th className="p-2 font-medium text-right">Qty</th>
                    <th className="p-2 font-medium text-right">Rate</th>
                    <th className="p-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {order.purchases?.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="p-2">
                        <p className="font-medium">{item.products?.product_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{item.products?.product_type.replace("_", " ")}</p>
                      </td>
                      <td className="p-2 text-right">{item.quantity.toLocaleString()} {item.products?.unit}</td>
                      <td className="p-2 text-right">{formatCurrency(item.purchase_price_per_unit)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Section */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-2 ml-auto w-full sm:w-64">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Total:</span>
              <span className="font-bold">{formatCurrency(order.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm text-green-600">
              <span>Amount Paid:</span>
              <span className="font-bold">-{formatCurrency(order.paid_amount)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg pt-1">
              <span>Due Balance:</span>
              <span className={order.due_amount > 0 ? "text-destructive" : "text-green-600"}>
                {formatCurrency(order.due_amount)}
              </span>
            </div>
          </div>

          {/* Payment Method & Notes */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-secondary/20 p-3 rounded">
            <div>
              <span className="text-muted-foreground block mb-1">Payment Method</span>
              <Badge variant="outline" className="capitalize">
                {order.payment_method?.replace("_", " ")}
              </Badge>
            </div>
            {order.notes && (
              <div className="col-span-2 mt-2">
                <span className="text-muted-foreground block mb-1">Notes</span>
                <p className="italic text-muted-foreground">{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
