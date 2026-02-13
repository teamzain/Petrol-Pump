"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Layers,
    ArrowRight,
    Calculator,
    PieChart as PieIcon
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"
import { cn } from "@/lib/utils"

export function ProfitLossStatement({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [report, setReport] = useState<any>(null)

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // 1. Current Period Data
                let fuelQ = supabase.from("nozzle_readings").select("sale_amount, gross_profit, nozzles!inner(product_id)").gte("reading_date", fromDate).lte("reading_date", toDate)
                let prodQ = supabase.from("sales").select("sale_amount, gross_profit").gte("sale_date", fromDate).lte("sale_date", toDate).eq("sale_type", "product")
                let expQ = supabase.from("expenses").select("amount").gte("expense_date", fromDate).lte("expense_date", toDate)

                if (filters.paymentMethod !== "all") {
                    fuelQ = fuelQ.eq("payment_method", filters.paymentMethod)
                    prodQ = prodQ.eq("payment_method", filters.paymentMethod)
                    const eMethod = filters.paymentMethod === 'bank' ? 'bank_transfer' : 'cash'
                    expQ = expQ.eq("payment_method", eMethod)
                }

                if (filters.productId !== "all") {
                    fuelQ = fuelQ.eq("nozzles.product_id", filters.productId)
                    prodQ = prodQ.eq("product_id", filters.productId)
                } else {
                    if (filters.productType === 'oil_lubricant') fuelQ = fuelQ.limit(0)
                    if (filters.productType === 'fuel') prodQ = prodQ.limit(0)
                }

                const [{ data: fuelSales }, { data: productSales }, { data: expenses }] = await Promise.all([fuelQ, prodQ, expQ])

                // Aggregations
                const revFuel = fuelSales?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0
                const revProd = productSales?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0
                const totalRev = revFuel + revProd

                const gpFuel = fuelSales?.reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0
                const gpProd = productSales?.reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0
                const grossProfit = gpFuel + gpProd
                const cogs = totalRev - grossProfit

                const totalExp = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0
                const netProfit = grossProfit - totalExp

                // 2. Previous Period Data (for comparison - MoM)
                const prevFrom = format(startOfMonth(subMonths(filters.dateRange.from, 1)), "yyyy-MM-dd")
                const prevTo = format(endOfMonth(subMonths(filters.dateRange.from, 1)), "yyyy-MM-dd")

                let pFuelQ = supabase.from("nozzle_readings").select("sale_amount, gross_profit, nozzles!inner(product_id)").gte("reading_date", prevFrom).lte("reading_date", prevTo)
                let pProdQ = supabase.from("sales").select("sale_amount, gross_profit").gte("sale_date", prevFrom).lte("sale_date", prevTo).eq("sale_type", "product")
                let pExpQ = supabase.from("expenses").select("amount").gte("expense_date", prevFrom).lte("expense_date", prevTo)

                if (filters.paymentMethod !== "all") {
                    pFuelQ = pFuelQ.eq("payment_method", filters.paymentMethod)
                    pProdQ = pProdQ.eq("payment_method", filters.paymentMethod)
                    const eMethod = filters.paymentMethod === 'bank' ? 'bank_transfer' : 'cash'
                    pExpQ = pExpQ.eq("payment_method", eMethod)
                }

                if (filters.productId !== "all") {
                    pFuelQ = pFuelQ.eq("nozzles.product_id", filters.productId)
                    pProdQ = pProdQ.eq("product_id", filters.productId)
                } else {
                    if (filters.productType === 'oil_lubricant') pFuelQ = pFuelQ.limit(0)
                    if (filters.productType === 'fuel') pProdQ = pProdQ.limit(0)
                }

                const [{ data: prevFuel }, { data: prevProd }, { data: prevExp }] = await Promise.all([pFuelQ, pProdQ, pExpQ])

                const prevRev = (prevFuel?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0) + (prevProd?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0)
                const prevNet = ((prevFuel?.reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0) + (prevProd?.reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0)) - (prevExp?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0)

                setReport({
                    totalRev,
                    revFuel,
                    revProd,
                    cogs,
                    grossProfit,
                    totalExp,
                    netProfit,
                    prevRev,
                    prevNet,
                    revChange: prevRev > 0 ? ((totalRev - prevRev) / prevRev) * 100 : 0,
                    netChange: prevNet !== 0 ? ((netProfit - prevNet) / Math.abs(prevNet)) * 100 : 0
                })
                onDataLoaded?.({
                    totalRev, revFuel, revProd, cogs, grossProfit, totalExp, netProfit, prevRev, prevNet
                })

            } catch (error) {
                console.error("Error generating P&L:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) return <Skeleton className="h-[600px] w-full" />

    return (
        <div className="space-y-6">
            {/* P&L Overview Header */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                            <DollarSign className="h-3 w-3" /> Total Revenue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Rs. {report.totalRev.toLocaleString()}</div>
                        <div className={cn("text-xs font-medium mt-1 inline-flex items-center", report.revChange >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {report.revChange >= 0 ? "+" : ""}{report.revChange.toFixed(1)}% vs Last Month
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-emerald-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase flex items-center gap-2">
                            <TrendingUp className="h-3 w-3" /> Gross Profit
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-700">Rs. {report.grossProfit.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-1">Margin: {report.totalRev > 0 ? ((report.grossProfit / report.totalRev) * 100).toFixed(1) : 0}%</div>
                    </CardContent>
                </Card>
                <Card className="bg-rose-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-rose-600 uppercase flex items-center gap-2">
                            <Calculator className="h-3 w-3" /> Operating Expenses
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-700">Rs. {report.totalExp.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-1">OH Ratio: {report.totalRev > 0 ? ((report.totalExp / report.totalRev) * 100).toFixed(1) : 0}%</div>
                    </CardContent>
                </Card>
                <Card className={cn(report.netProfit >= 0 ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-white/80 uppercase">Net Income / Loss</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Rs. {report.netProfit.toLocaleString()}</div>
                        <div className="text-xs text-white/90 mt-1">Final Bottom Line</div>
                    </CardContent>
                </Card>
            </div>

            {/* Structured P&L Statement */}
            <Card className="border-2">
                <CardHeader>
                    <CardTitle>Profit & Loss Statement</CardTitle>
                    <CardDescription>Consolidated financial performance for the period</CardDescription>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                    <div className="overflow-x-auto">
                        <div className="min-w-[600px] space-y-1">
                            {/* REVENUE SECTION */}
                            <div className="bg-muted px-4 py-2 font-bold text-sm uppercase flex justify-between">
                                <span>Operating Revenue</span>
                                <span>Amount (Rs.)</span>
                            </div>
                            <div className="px-6 py-3 border-b flex justify-between text-sm">
                                <span>Fuel Sales (Petrol, Diesel, Hi-Octane)</span>
                                <span className="font-medium">{report.revFuel.toLocaleString()}</span>
                            </div>
                            <div className="px-6 py-3 border-b flex justify-between text-sm">
                                <span>General Product Sales</span>
                                <span className="font-medium">{report.revProd.toLocaleString()}</span>
                            </div>
                            <div className="px-6 py-4 flex justify-between font-bold text-base bg-primary/5 text-primary">
                                <span>Total Revenue</span>
                                <span>{report.totalRev.toLocaleString()}</span>
                            </div>

                            <div className="h-4"></div>

                            {/* COGS SECTION */}
                            <div className="bg-muted px-4 py-2 font-bold text-sm uppercase flex justify-between">
                                <span>Direct Costs</span>
                                <span></span>
                            </div>
                            <div className="px-6 py-4 flex justify-between text-sm italic text-muted-foreground">
                                <span>Cost of Goods Sold (Opening Stock + Purchases - Closing Stock)</span>
                                <span>({report.cogs.toLocaleString()})</span>
                            </div>
                            <div className="px-6 py-4 flex justify-between font-bold text-base border-y-2 border-emerald-200 text-emerald-700">
                                <span>Gross Profit</span>
                                <span>{report.grossProfit.toLocaleString()}</span>
                            </div>

                            <div className="h-4"></div>

                            {/* EXPENSES SECTION */}
                            <div className="bg-muted px-4 py-2 font-bold text-sm uppercase flex justify-between">
                                <span>Operating Expenses</span>
                                <span></span>
                            </div>
                            <div className="px-6 py-4 flex justify-between text-sm text-rose-600 font-medium">
                                <span>General & Administrative Expenses</span>
                                <span>({report.totalExp.toLocaleString()})</span>
                            </div>

                            <div className="h-4"></div>

                            {/* NET INCOME SECTION */}
                            <div className={cn(
                                "px-6 py-6 flex justify-between items-center rounded-xl",
                                report.netProfit >= 0 ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                            )}>
                                <div className="flex flex-col">
                                    <span className="text-xl font-black uppercase tracking-widest">Net Income</span>
                                    <span className="text-[10px] opacity-80 italic">After all operating deductions</span>
                                </div>
                                <div className="text-3xl font-black font-mono">
                                    Rs. {report.netProfit.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
