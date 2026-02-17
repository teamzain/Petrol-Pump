"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { BrandLoader } from "../ui/brand-loader"

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
  supplier_id: string
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
      id: string
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
  onRefresh?: () => void
}

export function PurchaseDetailsDialog({
  open,
  onOpenChange,
  order,
  onRefresh
}: PurchaseDetailsDialogProps) {
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const supabase = createClient()

  if (!order) return null

  const paymentMethodLabels: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
    cash: "Cash",
  }

  const formatCurrency = (val: number) => `Rs. ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const handleStatusUpdate = async (newStatus: string) => {
    if (newStatus === order.status) return

    setUpdating(true)
    setError("")
    setSuccess("")

    try {
      // 1. Update the order status
      const { error: updateError } = await supabase
        .from("purchase_orders")
        .update({ status: newStatus })
        .eq("id", order.id)

      if (updateError) throw updateError

      // 2. If moving to 'received', update stock
      if (newStatus === "received" && order.status !== "received") {
        for (const item of order.purchases) {
          const { data: product } = await supabase
            .from("products")
            .select("current_stock, purchase_price")
            .eq("id", item.products.id) // Fix: item.products is an object in the interface, but item.product_id might be needed. Wait, the interface says 'products'.
            .single()

          if (product) {
            const newStock = Number(product.current_stock) + Number(item.quantity)
            await supabase.from("products").update({
              current_stock: newStock,
              last_purchase_price: item.purchase_price_per_unit,
              last_purchase_date: order.purchase_date
            }).eq("id", item.products.id)
          }
        }

        // Update supplier totals
        const { data: supplier } = await supabase.from("suppliers").select("total_purchases").eq("id", (order as any).supplier_id).single()
        if (supplier) {
          await supabase.from("suppliers").update({
            total_purchases: (supplier.total_purchases || 0) + order.total_amount,
            last_purchase_date: order.purchase_date
          }).eq("id", (order as any).supplier_id)
        }
      }

      setSuccess(`Order status updated to ${newStatus}`)
      if (onRefresh) onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setUpdating(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received": return <Badge className="bg-green-100 text-green-700 border-green-200">Received</Badge>
      case "hold": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">On Hold</Badge>
      case "scheduled": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Scheduled</Badge>
      case "completed": return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

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
              {getStatusBadge(order.status)}
            </div>
          </div>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-4 w-4 mr-2" /><AlertDescription>{success}</AlertDescription></Alert>}

          {/* Status Update Control */}
          <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-background border shadow-sm">
                <RefreshCw className={`h-4 w-4 text-primary ${updating ? "animate-spin" : ""}`} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Order Status</p>
                <p className="text-sm font-medium capitalize">{order.status}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select defaultValue={order.status} onValueChange={handleStatusUpdate} disabled={updating || order.status === "received"}>
                <SelectTrigger className="w-full sm:w-40 h-9 font-bold bg-background">
                  <SelectValue placeholder="Update Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hold">⏳ Hold</SelectItem>
                  <SelectItem value="scheduled">📅 Scheduled</SelectItem>
                  <SelectItem value="received">✅ Received</SelectItem>
                  <SelectItem value="cancelled">❌ Cancelled</SelectItem>
                </SelectContent>
              </Select>
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
