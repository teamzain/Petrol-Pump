"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { Receipt, TrendingDown } from "lucide-react"

interface ExpenseDetails {
    id: string
    transaction_date: string
    amount: number
    payment_method: string
    paid_to?: string
    invoice_number?: string
    description?: string
    // Relations
    expense_categories?: {
        category_name: string
    }
    accounts?: {
        account_name: string
        account_number: string
    }
}

interface ExpenseDetailsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    expense: ExpenseDetails | null
}

export function ExpenseDetailsDialog({
    open,
    onOpenChange,
    expense,
}: ExpenseDetailsDialogProps) {
    if (!expense) return null

    const formatCurrency = (val: number) => `Rs. ${Number(val).toLocaleString()}`
    const date = expense.transaction_date

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-bold text-xl text-destructive">
                        <TrendingDown className="h-6 w-6" />
                        Expense Details
                    </DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                        Ref: {expense.id.split('-')[0].toUpperCase()}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Header Info */}
                    <div className="flex justify-between items-start border-b pb-4">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Category</p>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 font-bold text-sm">
                                    {expense.expense_categories?.category_name || "Uncategorized"}
                                </Badge>
                            </div>
                            <p className="text-sm font-medium text-slate-700 italic">"{expense.description}"</p>
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

                    {/* Cards Layout for Expense Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-muted/20 p-4 rounded-lg border">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Receipt className="h-3 w-3" /> Paid To
                            </p>
                            <p className="font-bold text-base">{expense.paid_to || "-"}</p>
                            {expense.invoice_number && (
                                <p className="text-xs text-muted-foreground mt-1">Inv #: <span className="font-mono">{expense.invoice_number}</span></p>
                            )}
                        </div>

                        <div className="bg-red-50/50 p-4 rounded-lg border border-red-100 flex flex-col justify-center text-right">
                            <p className="text-xs text-red-600/70 uppercase tracking-wider mb-1">Total Expense</p>
                            <p className="font-black text-2xl text-red-700">{formatCurrency(expense.amount)}</p>
                        </div>
                    </div>


                    {/* Payment Method & Account */}
                    <div className="grid grid-cols-2 gap-4 text-sm bg-secondary/20 p-3 rounded">
                        <div>
                            <span className="text-muted-foreground block mb-1 text-xs uppercase font-bold">Payment Method</span>
                            <Badge variant="outline" className="capitalize bg-white shadow-sm">
                                {expense.payment_method?.replace("_", " ") || "Cash"}
                            </Badge>
                        </div>
                        <div>
                            <span className="text-muted-foreground block mb-1 text-xs uppercase font-bold">Withdrawn From</span>
                            <div className="font-medium flex items-center gap-2">
                                {expense.accounts?.account_name || "Unknown Account"}
                                {expense.accounts?.account_number && (
                                    <span className="text-[10px] text-muted-foreground">({expense.accounts.account_number})</span>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </DialogContent>
        </Dialog>
    )
}
