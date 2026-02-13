"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Legend,
    Tooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#6366f1', '#ec4899', '#8b5cf6', '#06b6d4']

export function ExpenseBreakdownReport({ filters, onDetailClick, onDataLoaded }: {
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

                let query = supabase
                    .from("expenses")
                    .select("*, expense_categories(category_name)")
                    .gte("expense_date", fromDate)
                    .lte("expense_date", toDate)

                if (filters.paymentMethod !== "all") {
                    const method = filters.paymentMethod === 'bank' ? 'bank_transfer' : 'cash'
                    query = query.eq("payment_method", method)
                }

                const { data: expenses } = await query
                    .order("amount", { ascending: false })

                // Process Category Breakdown
                const categoryMap: any = {}
                expenses?.forEach(e => {
                    const cat = e.expense_categories?.category_name || "Miscellaneous"
                    categoryMap[cat] = (categoryMap[cat] || 0) + Number(e.amount || 0)
                })

                const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }))
                    .sort((a: any, b: any) => b.value - a.value)

                setData({ expenses: expenses || [], categoryData })
                onDataLoaded?.({ expenses: expenses || [], categoryData })
            } catch (error) {
                console.error("Error fetching expense breakdown:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [filters, supabase])

    if (loading) {
        return <Skeleton className="h-[500px] w-full rounded-xl" />
    }

    const totalExpenses = data.categoryData.reduce((sum: number, c: any) => sum + c.value, 0)

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Pie Chart Card */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-base font-bold">Category Distribution</CardTitle>
                        <CardDescription>Where your money is going</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {data.categoryData.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground italic">No expenses recorded</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.categoryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.categoryData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number) => `Rs. ${value.toLocaleString()}`}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Bar Chart Card */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base font-bold">Expenses by Category</CardTitle>
                        <CardDescription>Comparative spending analysis</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {data.categoryData.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground italic">No data available</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.categoryData.slice(0, 8)}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} hide />
                                    <Tooltip formatter={(value: number) => `Rs. ${value.toLocaleString()}`} cursor={{ fill: '#F1F5F9' }} />
                                    <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-bold">Major Expense Items</CardTitle>
                    <CardDescription>Comprehensive list of spending during this period</CardDescription>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="whitespace-nowrap">Date</TableHead>
                                    <TableHead className="whitespace-nowrap">Category</TableHead>
                                    <TableHead className="whitespace-nowrap">Description</TableHead>
                                    <TableHead className="whitespace-nowrap">Paid To</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                                    <TableHead className="text-center whitespace-nowrap">Method</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.expenses.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No expenses found</TableCell></TableRow>
                                ) : (
                                    data.expenses.map((exp: any) => (
                                        <TableRow
                                            key={exp.id}
                                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                                            onClick={() => onDetailClick?.(exp)}
                                        >
                                            <TableCell className="text-xs whitespace-nowrap">{format(new Date(exp.expense_date), "MMM dd, yyyy")}</TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <Badge variant="outline" className="text-[10px] uppercase">{exp.expense_categories?.category_name}</Badge>
                                            </TableCell>
                                            <TableCell className="text-xs truncate max-w-[200px] whitespace-nowrap">{exp.description}</TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">{exp.paid_to || "-"}</TableCell>
                                            <TableCell className="text-right font-bold text-xs text-rose-600 whitespace-nowrap">
                                                Rs. {Number(exp.amount).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-center whitespace-nowrap">
                                                <Badge variant="secondary" className="text-[10px] uppercase h-4">
                                                    {exp.payment_method.replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
