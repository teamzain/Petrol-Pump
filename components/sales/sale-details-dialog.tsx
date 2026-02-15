"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { TrendingUp, Package, Fuel } from "lucide-react"

interface SaleDetails {
    id: string
    created_at: string
    amount: number
    sale_amount?: number // for consistency if mapped
    paid_amount?: number // for consistency
    quantity: number
    quantity_sold?: number // for nozzle readings
    selling_price: number
    payment_method: string
    status?: string
    description?: string
    // Relations
    products?: {
        product_name: string
        unit: string
    }
    nozzles?: {
        nozzle_number: string
        products: {
            product_name: string
            unit: string
        }
    }
    accounts?: {
        account_name: string
        account_number: string
    }
    type?: 'sale' | 'reading' // We'll inject this
}

interface SaleDetailsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sale: SaleDetails | null
}

export function SaleDetailsDialog({
    open,
    onOpenChange,
    sale,
}: SaleDetailsDialogProps) {
    if (!sale) return null

    const paymentMethodLabels: Record<string, string> = {
        bank_transfer: "Bank Transfer",
        cheque: "Cheque",
        cash: "Cash",
        credit: "Credit",
        card: "Card",
    }

    const formatCurrency = (val: number) => `Rs. ${Number(val).toLocaleString()}`

    // Normalize data between 'sale' and 'reading'
    const isReading = sale.type === 'reading'
    const productName = isReading ? sale.nozzles?.products?.product_name : sale.products?.product_name
    const productUnit = isReading ? sale.nozzles?.products?.unit : sale.products?.unit
    const quantity = isReading ? sale.quantity_sold : sale.quantity
    const price = sale.selling_price
    const total = isReading ? sale.sale_amount : sale.amount
    const date = sale.created_at

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-bold text-xl text-green-700">
                        <TrendingUp className="h-6 w-6" />
                        Sale Details
                    </DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                        Ref: {sale.id.split('-')[0].toUpperCase()}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Header Info */}
                    <div className="flex justify-between items-start border-b pb-4">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Sale Type</p>
                            <div className="flex items-center gap-2">
                                {isReading ? (
                                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 flex gap-1">
                                        <Fuel className="h-3 w-3" /> Nozzle Sale
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 flex gap-1">
                                        <Package className="h-3 w-3" /> Direct Sale
                                    </Badge>
                                )}
                            </div>
                            {isReading && (
                                <p className="text-sm font-medium text-muted-foreground">Nozzle #{sale.nozzles?.nozzle_number}</p>
                            )}
                        </div>
                        <div className="text-right space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Date</p>
                            <p className="font-medium">
                                {(() => {
                                    const d = new Date(date)
                                    return isNaN(d.getTime()) ? "N/A" : format(d, "PPP p")
                                })()}
                            </p>
                        </div>
                    </div>

                    {/* Items Table (Single Item usually) */}
                    <div className="space-y-3">
                        <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                            Items Sold
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
                                    <tr className="hover:bg-muted/30">
                                        <td className="p-2">
                                            <p className="font-bold text-slate-700">{productName || "Unknown Product"}</p>
                                            <p className="text-[10px] text-muted-foreground capitalize">STOCK OUT</p>
                                        </td>
                                        <td className="p-2 text-right">
                                            {Number(quantity).toLocaleString()} <span className="text-xs text-muted-foreground">{productUnit || 'Units'}</span>
                                        </td>
                                        <td className="p-2 text-right">{formatCurrency(price)}</td>
                                        <td className="p-2 text-right font-bold">{formatCurrency(total || 0)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Totals Section */}
                    <div className="bg-green-50/50 p-4 rounded-lg space-y-2 ml-auto w-full sm:w-64 border border-green-100">
                        <div className="flex justify-between text-base font-bold text-green-800">
                            <span>Total Received:</span>
                            <span>{formatCurrency(total || 0)}</span>
                        </div>
                    </div>

                    {/* Payment Method & Account */}
                    <div className="grid grid-cols-2 gap-4 text-sm bg-secondary/20 p-3 rounded">
                        <div>
                            <span className="text-muted-foreground block mb-1 text-xs uppercase font-bold">Payment Method</span>
                            <Badge variant="outline" className="capitalize bg-white shadow-sm">
                                {sale.payment_method?.replace("_", " ") || "Cash"}
                            </Badge>
                        </div>
                        <div>
                            <span className="text-muted-foreground block mb-1 text-xs uppercase font-bold">Deposited To</span>
                            <div className="font-medium flex items-center gap-2">
                                {sale.accounts?.account_name || "Unknown Account"}
                                {sale.accounts?.account_number && (
                                    <span className="text-[10px] text-muted-foreground">({sale.accounts.account_number})</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Description/Notes */}
                    {sale.description && (
                        <div className="text-sm bg-muted/30 p-3 rounded border border-dashed text-muted-foreground italic">
                            "{sale.description}"
                        </div>
                    )}

                </div>
            </DialogContent>
        </Dialog>
    )
}
