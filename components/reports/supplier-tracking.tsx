"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    Users,
    Phone,
    MapPin,
    Calendar,
    CreditCard,
    AlertCircle
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"

export function SupplierPerformanceReport({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [suppliers, setSuppliers] = useState<any[]>([])

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // Fetch Suppliers with aggregated purchase data
                let query = supabase
                    .from("suppliers")
                    .select(`
                        *,
                        purchase_orders (
                            total_amount,
                            due_amount,
                            purchase_date,
                            status
                        )
                    `)

                if (filters.supplierId !== "all") {
                    query = query.eq("id", filters.supplierId)
                }

                if (filters.productType !== "all") {
                    if (filters.productType === 'fuel') {
                        query = query.in("supplier_type", ['petrol_only', 'diesel_only', 'both_petrol_diesel'])
                    } else if (filters.productType === 'oil_lubricant') {
                        query = query.eq("supplier_type", 'products_oils')
                    }
                }

                const { data: suppliersData } = await query.order("supplier_name")

                if (suppliersData) {
                    const processed = suppliersData.map(s => {
                        // Filter orders by date if needed for "period-specific" stats
                        const ordersInPeriod = s.purchase_orders?.filter((o: any) =>
                            o.purchase_date >= fromDate && o.purchase_date <= toDate
                        ) || []

                        const totalPurchasedPeriod = ordersInPeriod.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
                        const totalDues = s.purchase_orders?.reduce((sum: number, o: any) => sum + Number(o.due_amount || 0), 0) || 0

                        return {
                            ...s,
                            periodPurchases: totalPurchasedPeriod,
                            outstandingDues: totalDues,
                            orderCount: ordersInPeriod.length
                        }
                    })
                    setSuppliers(processed)
                    onDataLoaded?.(processed)
                }

            } catch (error) {
                console.error("Error fetching supplier report:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) {
        return <Skeleton className="h-[400px] w-full rounded-xl" />
    }

    const totalPayable = suppliers.reduce((sum, s) => sum + s.outstandingDues, 0)

    return (
        <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-primary/5 border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total Suppliers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{suppliers.length}</div>
                    </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-amber-600 uppercase">Total Outstanding Dues</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-700">Rs. {totalPayable.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600 uppercase">Active Orders (Period)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-700">
                            {suppliers.reduce((sum, s) => sum + s.orderCount, 0)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-bold">Supplier Performance Matrix</CardTitle>
                    <CardDescription>Lifetime vs. Period statistics and financial position</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="whitespace-nowrap">Supplier Info</TableHead>
                                    <TableHead className="whitespace-nowrap">Type</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Period Purchases</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Lifetime Total</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Outstanding Dues</TableHead>
                                    <TableHead className="text-center whitespace-nowrap">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suppliers.map((s) => (
                                    <TableRow key={s.id}>
                                        <TableCell className="whitespace-nowrap">
                                            <div className="font-bold">{s.supplier_name}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                                <Phone className="h-3 w-3" /> {s.phone_number}
                                            </div>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <Badge variant="outline" className="text-[10px] capitalize">
                                                {s.supplier_type.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                                            Rs. {s.periodPurchases.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-xs text-blue-600 whitespace-nowrap">
                                            Rs. {Number(s.total_purchases || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            <span className={cn(
                                                "font-bold font-mono",
                                                s.outstandingDues > 0 ? "text-rose-600" : "text-emerald-600"
                                            )}>
                                                Rs. {s.outstandingDues.toLocaleString()}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center whitespace-nowrap">
                                            <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="h-5">
                                                {s.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(" ")
}
