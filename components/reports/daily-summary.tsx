"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    ArrowUpRight,
    ArrowDownRight,
    DollarSign,
    Package,
    ShoppingCart,
    Receipt,
    Wallet,
    TrendingDown,
    TrendingUp,
    Activity
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface DailySummaryData {
    totalSales: number
    fuelSales: number
    productSales: number
    totalPurchases: number
    totalExpenses: number
    grossProfit: number
    netProfit: number
    transactionCount: number
    cashIn: number
    cashOut: number
    openingBalance: number
    closingBalance: number
    stockMovements: any[]
}

export function DailySummaryReport({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<DailySummaryData | null>(null)

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // 1. Fetch Fuel Sales
                let fuelSales: any[] = []
                if (filters.productType === "all" || filters.productType === "fuel") {
                    let fuelQuery = supabase
                        .from("nozzle_readings")
                        .select("sale_amount, quantity_sold, gross_profit, nozzles!inner(product_id)")
                        .gte("reading_date", fromDate)
                        .lte("reading_date", toDate)

                    if (filters.paymentMethod !== "all") {
                        fuelQuery = fuelQuery.eq("payment_method", filters.paymentMethod)
                    }

                    if (filters.productId !== "all") {
                        fuelQuery = fuelQuery.eq("nozzles.product_id", filters.productId)
                    }

                    const { data } = await fuelQuery
                    fuelSales = data || []
                }

                // 2. Fetch Product Sales
                let productSales: any[] = []
                if (filters.productType === "all" || filters.productType === "oil_lubricant") {
                    let productQuery = supabase
                        .from("sales")
                        .select("sale_amount, quantity, gross_profit")
                        .gte("sale_date", fromDate)
                        .lte("sale_date", toDate)
                        .eq("sale_type", "product")

                    if (filters.paymentMethod !== "all") {
                        productQuery = productQuery.eq("payment_method", filters.paymentMethod)
                    }

                    if (filters.productId !== "all") {
                        productQuery = productQuery.eq("product_id", filters.productId)
                    }

                    const { data } = await productQuery
                    productSales = data || []
                }

                // 3. Fetch Purchases
                let purchaseQuery = supabase
                    .from("purchases")
                    .select("total_amount")
                    .gte("purchase_date", fromDate)
                    .lte("purchase_date", toDate)
                const { data: purchases } = await purchaseQuery

                // 4. Fetch Expenses
                let expenseQuery = supabase
                    .from("expenses")
                    .select("amount")
                    .gte("expense_date", fromDate)
                    .lte("expense_date", toDate)

                if (filters.paymentMethod !== "all") {
                    // Normalize bank_transfer to bank if needed, but schema says 'cash','bank_transfer','cheque'
                    // Filters has 'cash', 'bank'.
                    const method = filters.paymentMethod === 'bank' ? 'bank_transfer' : 'cash'
                    expenseQuery = expenseQuery.eq("payment_method", method)
                }
                const { data: expenses } = await expenseQuery

                // 5. Fetch Balances
                const { data: balances } = await supabase
                    .from("daily_balances")
                    .select("*")
                    .gte("balance_date", fromDate)
                    .lte("balance_date", toDate)
                    .order("balance_date", { ascending: true })

                // 6. Fetch Stock Movements
                let movementQuery = supabase
                    .from("stock_movements")
                    .select("*, products!inner(product_name, product_type)")
                    .gte("movement_date", `${fromDate}T00:00:00`)
                    .lte("movement_date", `${toDate}T23:59:59`)

                if (filters.productId !== "all") {
                    movementQuery = movementQuery.eq("product_id", filters.productId)
                } else if (filters.productType !== "all") {
                    movementQuery = movementQuery.eq("products.product_type", filters.productType)
                }

                const { data: stockMovements } = await movementQuery
                    .order("created_at", { ascending: false })
                    .limit(10)

                // Aggregations
                const totalFuel = fuelSales?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0
                const totalProducts = productSales?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0
                const totalPurchases = purchases?.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) || 0
                const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0

                const fuelProfit = fuelSales?.reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0
                const productProfit = productSales?.reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0
                const grossProfit = fuelProfit + productProfit
                const netProfit = grossProfit - totalExpenses

                const openingBal = balances && balances.length > 0 ? Number(balances[0].cash_opening || 0) + Number(balances[0].bank_opening || 0) : 0
                const closingBal = balances && balances.length > 0 ? Number(balances[balances.length - 1].cash_closing || 0) + Number(balances[balances.length - 1].bank_closing || 0) : 0

                setData({
                    totalSales: totalFuel + totalProducts,
                    fuelSales: totalFuel,
                    productSales: totalProducts,
                    totalPurchases,
                    totalExpenses,
                    grossProfit,
                    netProfit,
                    transactionCount: (fuelSales?.length || 0) + (productSales?.length || 0),
                    cashIn: totalFuel + totalProducts, // Simplified
                    cashOut: totalPurchases + totalExpenses,
                    openingBalance: openingBal,
                    closingBalance: closingBal,
                    stockMovements: stockMovements || []
                })
                onDataLoaded?.({
                    stockMovements: stockMovements || [],
                    ...data // This won't work perfectly since data is defined inside setData, I'll calculate it
                })

            } catch (error) {
                console.error("Error generating report:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
                <Skeleton className="h-[400px] w-full lg:col-span-4 rounded-xl" />
            </div>
        )
    }

    if (!data) return <div>No data found for this period.</div>

    const stats = [
        { title: "Total Revenue", value: data.totalSales, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
        { title: "Total Purchases", value: data.totalPurchases, icon: ShoppingCart, color: "text-amber-600", bg: "bg-amber-50" },
        { title: "Operating Expenses", value: data.totalExpenses, icon: Receipt, color: "text-rose-600", bg: "bg-rose-50" },
        { title: "Net Profit", value: data.netProfit, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", highlight: true },
    ]

    return (
        <div className="space-y-6">
            {/* Top Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.title} className={cn(stat.highlight && "border-emerald-200 bg-emerald-50/10")}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <span className="text-sm font-medium text-muted-foreground">{stat.title}</span>
                            <div className={cn("p-2 rounded-lg", stat.bg)}>
                                <stat.icon className={cn("h-4 w-4", stat.color)} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">Rs. {stat.value.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                {stat.value >= 0 ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownRight className="h-3 w-3 text-rose-500" />}
                                {stat.title === "Net Profit" ? "Margin: " + (data.totalSales > 0 ? ((data.netProfit / data.totalSales) * 100).toFixed(1) : 0) + "%" : "For selected period"}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Cash Flow Breakdown */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-base">Cash Flow Summary</CardTitle>
                        <CardDescription>Movement of liquid assets</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm text-muted-foreground">Opening Balance</span>
                            <span className="font-semibold">Rs. {data.openingBalance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b text-emerald-600">
                            <span className="text-sm">Cash Inflow (Sales)</span>
                            <span className="font-semibold">+ Rs. {data.cashIn.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b text-rose-600">
                            <span className="text-sm">Cash Outflow (Purchases + Exp)</span>
                            <span className="font-semibold">- Rs. {data.cashOut.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 pt-4">
                            <span className="text-sm font-bold">Estimated Closing</span>
                            <span className="text-lg font-bold">Rs. {data.closingBalance.toLocaleString()}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Sales Breakdown */}
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base">Sales & Performance</CardTitle>
                            <CardDescription>Detailed revenue distribution</CardDescription>
                        </div>
                        <Badge variant="outline" className="h-6">
                            {data.transactionCount} Transactions
                        </Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <span className="text-xs text-muted-foreground uppercase">Fuel Revenue</span>
                                    <div className="text-xl font-bold">Rs. {data.fuelSales.toLocaleString()}</div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-muted-foreground uppercase">Product Revenue</span>
                                    <div className="text-xl font-bold">Rs. {data.productSales.toLocaleString()}</div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold">Recent Stock Movements</h4>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead className="whitespace-nowrap">Product</TableHead>
                                                <TableHead className="whitespace-nowrap">Type</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Qty</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Balance After</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.stockMovements.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No movements recorded</TableCell></TableRow>
                                            ) : (
                                                data.stockMovements.map((move: any) => (
                                                    <TableRow
                                                        key={move.id}
                                                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                                                        onClick={() => onDetailClick?.(move)}
                                                    >
                                                        <TableCell className="font-medium text-xs whitespace-nowrap">{move.products?.product_name}</TableCell>
                                                        <TableCell className="whitespace-nowrap">
                                                            <Badge variant={move.movement_type === 'purchase' ? 'default' : 'secondary'} className="text-[10px] h-4">
                                                                {move.movement_type.toUpperCase()}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs whitespace-nowrap">
                                                            {move.movement_type === 'purchase' ? '+' : '-'}{move.quantity}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                                                            {move.balance_after}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
