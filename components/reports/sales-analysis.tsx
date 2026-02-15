"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { format, eachDayOfInterval, parseISO, isSameDay } from "date-fns"
import { cn } from "@/lib/utils"

const COLORS = ['#2563eb', '#fbbf24', '#f43f5e', '#10b981', '#8b5cf6', '#f97316']

export function SalesAnalysisReport({ filters, onDetailClick, onDataLoaded }: {
    filters: ReportFilter,
    onDetailClick?: (item: any) => void,
    onDataLoaded?: (data: any) => void
}) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<any>(null)

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const fromDate = format(filters.dateRange.from, "yyyy-MM-dd")
                const toDate = format(filters.dateRange.to, "yyyy-MM-dd")

                // 1. Fetch Fuel Sales (Readings)
                let fuelSales: any[] = []
                if (filters.productType === "all" || filters.productType === "fuel") {
                    let fuelQuery = supabase
                        .from("nozzle_readings")
                        .select("*, nozzles!inner(product_id, nozzle_number, products!inner(product_name, product_type))")
                        .gte("reading_date", fromDate)
                        .lte("reading_date", toDate)

                    if (filters.paymentMethod !== "all") {
                        fuelQuery = fuelQuery.eq("payment_method", filters.paymentMethod)
                    }

                    if (filters.productId !== "all") {
                        fuelQuery = fuelQuery.eq("nozzles.product_id", filters.productId)
                    } else if (filters.productType !== "all") {
                        fuelQuery = fuelQuery.eq("nozzles.products.product_type", filters.productType)
                    }

                    const { data } = await fuelQuery
                    fuelSales = data || []
                }

                // 2. Fetch Product Sales
                let productSales: any[] = []
                if (filters.productType === "all" || filters.productType === "oil_lubricant") {
                    let productQuery = supabase
                        .from("sales")
                        .select("*, products!inner(product_name, product_type)")
                        .gte("sale_date", fromDate)
                        .lte("sale_date", toDate)
                        .eq("sale_type", "product")

                    if (filters.paymentMethod !== "all") {
                        productQuery = productQuery.eq("payment_method", filters.paymentMethod)
                    }

                    if (filters.productId !== "all") {
                        productQuery = productQuery.eq("product_id", filters.productId)
                    } else if (filters.productType !== "all") {
                        productQuery = productQuery.eq("products.product_type", filters.productType)
                    }

                    const { data } = await productQuery
                    productSales = data || []
                }

                // 3. Process Product Breakdown (Revenue & Volume)
                const productStats: any = {}

                fuelSales?.forEach(s => {
                    const name = s.nozzles?.products?.product_name || "Unknown Fuel"
                    if (!productStats[name]) productStats[name] = { name, revenue: 0, volume: 0, profit: 0 }
                    productStats[name].revenue += Number(s.sale_amount || 0)
                    productStats[name].volume += Number(s.quantity_sold || 0)
                    productStats[name].profit += Number(s.gross_profit || 0)
                })

                productSales?.forEach(s => {
                    const name = s.products?.product_name || "Unknown Product"
                    if (!productStats[name]) productStats[name] = { name, revenue: 0, volume: 0, profit: 0 }
                    productStats[name].revenue += Number(s.sale_amount || 0)
                    productStats[name].volume += Number(s.quantity || 0)
                    productStats[name].profit += Number(s.gross_profit || 0)
                })

                const breakdownData = Object.values(productStats).sort((a: any, b: any) => b.revenue - a.revenue)

                // 4. Process Daily Trends
                const days = eachDayOfInterval({ start: filters.dateRange.from, end: filters.dateRange.to })
                const trendData = days.map(day => {
                    const dateStr = format(day, "yyyy-MM-dd")
                    const dayFuel = fuelSales?.filter(s => s.reading_date === dateStr)
                        .reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0
                    const dayProd = productSales?.filter(s => s.sale_date === dateStr)
                        .reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0

                    return {
                        date: format(day, "MMM dd"),
                        revenue: dayFuel + dayProd,
                        profit: (fuelSales?.filter(s => s.reading_date === dateStr).reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0) +
                            (productSales?.filter(s => s.sale_date === dateStr).reduce((sum, s) => sum + Number(s.gross_profit || 0), 0) || 0)
                    }
                })

                setData({
                    breakdownData,
                    trendData,
                    rawFuelSales: fuelSales || [],
                    rawProductSales: productSales || []
                })
                onDataLoaded?.({
                    breakdownData,
                    trendData,
                    totalRevenue: breakdownData.reduce((sum: number, item: any) => sum + item.revenue, 0),
                    totalProfit: breakdownData.reduce((sum: number, item: any) => sum + item.profit, 0),
                    rawFuelSales: fuelSales || [],
                    rawProductSales: productSales || []
                })

            } catch (error) {
                console.error("Error in sales analysis:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) {
        return <Skeleton className="h-[600px] w-full rounded-xl" />
    }

    return (
        <div className="space-y-6">
            {/* Charts Row */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Revenue Trend Line Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-bold">Revenue & Profit Trend</CardTitle>
                        <CardDescription>Daily performance overview</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data.trendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, '']}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="profit" name="Gross Profit" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Revenue by Product Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-bold">Revenue by Product</CardTitle>
                        <CardDescription>Major income generators</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.breakdownData.slice(0, 5)} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} width={100} />
                                    <Tooltip
                                        cursor={{ fill: '#F1F5F9' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Product Performance Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Product Performance Matrix</CardTitle>
                    <CardDescription>Volume and margin analysis for all products</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="whitespace-nowrap">Product Name</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Volume Sold</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Total Revenue</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Gross Profit</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Margin %</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.breakdownData.map((item: any, idx: number) => (
                                    <TableRow key={item.name}>
                                        <TableCell className="font-semibold whitespace-nowrap">{item.name}</TableCell>
                                        <TableCell className="text-right font-mono whitespace-nowrap">{item.volume.toFixed(2)}</TableCell>
                                        <TableCell className="text-right font-bold whitespace-nowrap">Rs. {item.revenue.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-emerald-600 font-bold whitespace-nowrap">Rs. {item.profit.toLocaleString()}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            <span className={cn(
                                                "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                                                (item.profit / item.revenue) > 0.1 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                                            )}>
                                                {item.revenue > 0 ? ((item.profit / item.revenue) * 100).toFixed(1) : 0}%
                                            </span>
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
