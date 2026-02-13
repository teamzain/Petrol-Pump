"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    ShoppingCart,
    Search,
    Calendar,
    CreditCard,
    FileText
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"

export function PurchaseHistoryReport({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [orders, setOrders] = useState<any[]>([])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                let query = supabase
                    .from("purchase_orders")
                    .select("*, suppliers!inner(supplier_name, supplier_type), accounts(account_name)")
                    .gte("purchase_date", fromDate)
                    .lte("purchase_date", toDate)

                if (filters.supplierId !== "all") {
                    query = query.eq("supplier_id", filters.supplierId)
                }

                if (filters.paymentMethod !== "all") {
                    query = query.eq("payment_method", filters.paymentMethod)
                }

                if (filters.productId !== "all") {
                    query = query.eq("product_id", filters.productId)
                } else if (filters.productType !== "all") {
                    // Filter suppliers by type if it matches productType
                    if (filters.productType === 'fuel') {
                        query = query.in("suppliers.supplier_type", ['petrol_only', 'diesel_only', 'both_petrol_diesel'])
                    } else if (filters.productType === 'oil_lubricant') {
                        query = query.eq("suppliers.supplier_type", 'products_oils')
                    }
                }

                const { data, error } = await query
                    .order("purchase_date", { ascending: false })

                if (data) {
                    setOrders(data)
                    onDataLoaded?.(data)
                }
            } catch (error) {
                console.error("Error fetching purchases:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) {
        return <Skeleton className="h-[400px] w-full rounded-xl" />
    }

    const totalValue = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    const totalPaid = orders.reduce((sum, o) => sum + Number(o.paid_amount || 0), 0)

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-l-4 border-l-primary shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <ShoppingCart className="h-4 w-4 text-primary" />
                            Total Purchase Value
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black tracking-tight">Rs. {totalValue.toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            For selected period
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-emerald-500" />
                            Total Paid Amount
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-emerald-600 tracking-tight">Rs. {totalPaid.toLocaleString()}</div>
                        <p className="text-[10px] text-emerald-600/70 mt-1 font-medium">Payment cleared</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-destructive shadow-sm bg-destructive/[0.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <FileText className="h-4 w-4 text-destructive" />
                            Outstanding Dues
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-destructive tracking-tight">Rs. {(totalValue - totalPaid).toLocaleString()}</div>
                        <p className="text-[10px] text-destructive/70 mt-1 font-medium">Pending balance</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-bold">Purchase Log</CardTitle>
                    <CardDescription>Detailed list of all stock arrivals and orders</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>Date</TableHead>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-center">Payment</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No purchases found</TableCell></TableRow>
                            ) : (
                                orders.map((order) => (
                                    <TableRow
                                        key={order.id}
                                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                                        onClick={() => onDetailClick?.(order)}
                                    >
                                        <TableCell className="text-xs font-medium">
                                            {format(new Date(order.purchase_date), "MMM dd, yyyy")}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-bold text-xs">{order.invoice_number}</div>
                                        </TableCell>
                                        <TableCell className="text-xs">{order.suppliers?.supplier_name}</TableCell>
                                        <TableCell className="text-right font-bold text-xs">
                                            Rs. {Number(order.total_amount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={order.status === 'completed' ? 'default' : 'secondary'} className="text-[10px] h-4">
                                                {order.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="text-[10px] h-4 capitalize">
                                                {order.payment_method?.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
