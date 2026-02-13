"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ReportFilter } from "@/app/dashboard/reports/page"
import {
    Receipt,
} from "lucide-react"
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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Total Expense Summary Card */}
                <Card className="bg-rose-50/50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/50 shadow-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <Receipt className="h-12 w-12 text-rose-600" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardDescription className="text-xs font-bold uppercase tracking-wider text-rose-600/70 dark:text-rose-400/70">Total Expenses</CardDescription>
                        <CardTitle className="text-3xl font-black tracking-tighter text-rose-700 dark:text-rose-400">
                            Rs. {totalExpenses.toLocaleString()}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-white/50 dark:bg-black/20 border-rose-200 dark:border-rose-800 text-[10px] h-5">
                                {data.expenses.length} Records
                            </Badge>
                            <span className="text-[10px] text-muted-foreground italic truncate">Across {data.categoryData.length} categories</span>
                        </div>
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
