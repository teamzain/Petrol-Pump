"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
    FileText,
    BarChart3,
    TrendingUp,
    Users,
    ShoppingCart,
    Receipt,
    Download,
    Filter,
    Calendar as CalendarIcon,
    ChevronDown,
    RefreshCcw,
    Printer,
    Wallet,
    X
} from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"
import { format, startOfMonth, endOfMonth, startOfToday, subDays, startOfWeek, endOfWeek, startOfYear, endOfYear } from "date-fns"

import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Separator } from "@/components/ui/separator"
import { cn, getTodayPKT } from "@/lib/utils"

// Report Components
import { DailySummaryReport } from "@/components/reports/daily-summary"
import { SalesAnalysisReport } from "@/components/reports/sales-analysis"
import { SupplierPerformanceReport } from "@/components/reports/supplier-tracking"
import { PurchaseHistoryReport } from "@/components/reports/purchase-history"
import { ExpenseBreakdownReport } from "@/components/reports/expense-breakdown"
import { ProfitLossStatement } from "@/components/reports/profit-loss"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { DetailViewDialog } from "@/components/reports/detail-view-dialog"

export type ReportFilter = {
    dateRange: { from: Date; to: Date }
    periodType: "daily" | "weekly" | "monthly" | "yearly" | "custom"
    productType: string
    productId: string
    supplierId: string
    paymentMethod: string
    status: string
}

export default function ReportsPage() {
    const supabase = createClient()

    // Filter State
    const [filters, setFilters] = useState<ReportFilter>({
        dateRange: { from: startOfToday(), to: startOfToday() },
        periodType: "daily",
        productType: "all",
        productId: "all",
        supplierId: "all",
        paymentMethod: "all",
        status: "all"
    })

    const [activeTab, setActiveTab] = useState("daily-summary")
    const [reportData, setReportData] = useState<any>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isFiltersChanging, setIsFiltersChanging] = useState(false)
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)

    // Fetch suppliers for filter
    useEffect(() => {
        async function fetchListData() {
            const [supRes, prodRes] = await Promise.all([
                supabase.from("suppliers").select("id, supplier_name").eq("status", "active"),
                supabase.from("products").select("id, product_name, product_type").eq("status", "active").order("product_name")
            ])

            if (supRes.data) setSuppliers(supRes.data)
            if (prodRes.data) setProducts(prodRes.data)
        }
        fetchListData()
    }, [supabase])

    // Trigger global loader on filter change
    useEffect(() => {
        setIsFiltersChanging(true)
        const timer = setTimeout(() => setIsFiltersChanging(false), 600)
        return () => clearTimeout(timer)
    }, [filters])

    const openDetail = (item: any) => {
        setSelectedItem(item)
        setIsDetailOpen(true)
    }

    const handleExport = () => {
        if (!reportData) return

        let csvContent = "data:text/csv;charset=utf-8,"
        let fileName = `report-${activeTab}-${getTodayPKT()}.csv`

        // Header and Data generation based on current report data structure
        if (activeTab === "daily-summary" && reportData.stockMovements) {
            const headers = ["Product", "Type", "Quantity", "Balance After", "Date"]
            csvContent += headers.join(",") + "\n"
            reportData.stockMovements.forEach((m: any) => {
                const row = [
                    m.products?.product_name || "N/A",
                    m.movement_type,
                    m.quantity,
                    m.balance_after,
                    format(new Date(m.movement_date || m.created_at || new Date()), "yyyy-MM-dd")
                ]
                csvContent += row.join(",") + "\n"
            })
        } else if (activeTab === "sales-analysis" && reportData.breakdownData) {
            const headers = ["Product", "Volume", "Revenue", "Profit"]
            csvContent += headers.join(",") + "\n"
            reportData.breakdownData.forEach((d: any) => {
                const row = [d.name, d.volume, d.revenue, d.profit]
                csvContent += row.join(",") + "\n"
            })
        } else if (activeTab === "purchase-history" && Array.isArray(reportData)) {
            const headers = ["Date", "Invoice", "Supplier", "Amount", "Status"]
            csvContent += headers.join(",") + "\n"
            reportData.forEach((o: any) => {
                const row = [
                    o.purchase_date,
                    o.invoice_number,
                    o.suppliers?.supplier_name || "N/A",
                    o.total_amount,
                    o.status
                ]
                csvContent += row.join(",") + "\n"
            })
        } else if (activeTab === "expense-breakdown" && reportData.expenses) {
            const headers = ["Date", "Category", "Amount", "Method", "Notes"]
            csvContent += headers.join(",") + "\n"
            reportData.expenses.forEach((e: any) => {
                const row = [
                    e.expense_date,
                    e.expense_categories?.category_name || "N/A",
                    e.amount,
                    e.payment_method,
                    e.description || ""
                ]
                csvContent += row.join(",") + "\n"
            })
        } else if (activeTab === "suppliers" && Array.isArray(reportData)) {
            const headers = ["Supplier", "Type", "Period Purchases", "Lifetime Total", "Outstanding Dues"]
            csvContent += headers.join(",") + "\n"
            reportData.forEach((s: any) => {
                const row = [
                    s.supplier_name,
                    s.supplier_type,
                    s.periodPurchases,
                    s.total_purchases,
                    s.outstandingDues
                ]
                csvContent += row.join(",") + "\n"
            })
        } else {
            // Basic generic export
            csvContent += "Data Error: Export not fully configured for this tab yet."
        }

        const encodedUri = encodeURI(csvContent)
        const link = document.body.appendChild(document.createElement("a"))
        link.setAttribute("href", encodedUri)
        link.setAttribute("download", fileName)
        link.click()
        document.body.removeChild(link)
    }

    // Handle Preset Date Ranges
    const handlePeriodChange = (value: string) => {
        const today = new Date()
        let from = today
        let to = today

        switch (value) {
            case "daily":
                from = startOfToday()
                to = startOfToday()
                break
            case "weekly":
                from = startOfWeek(today)
                to = endOfWeek(today)
                break
            case "monthly":
                from = startOfMonth(today)
                to = endOfMonth(today)
                break
            case "yearly":
                from = startOfYear(today)
                to = endOfYear(today)
                break
            case "custom":
                // Keep current range but allow selection
                from = filters.dateRange.from
                to = filters.dateRange.to
                break
        }

        setFilters(prev => ({
            ...prev,
            periodType: value as any,
            dateRange: { from, to }
        }))
    }

    const refreshData = () => {
        setIsRefreshing(true)
        // Child components will react to this if needed or just re-fetch
        setTimeout(() => setIsRefreshing(false), 1000)
    }

    return (
        <div className="space-y-6">
            <div id="reports-page-wrapper" className="flex flex-col gap-4">
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
                        <p className="text-sm text-muted-foreground">Comprehensive business intelligence for your filling station.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 px-3 gap-2"
                            onClick={handleExport}
                            disabled={!reportData}
                        >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={refreshData} disabled={isRefreshing}>
                            {isRefreshing ? (
                                <BrandLoader size="xs" className="mr-2" />
                            ) : (
                                <RefreshCcw className="mr-2 h-4 w-4" />
                            )}
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Advanced Filter Bar */}
                <Card className="border-primary/10 shadow-sm overflow-visible z-20">
                    <CardContent className="p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end">

                            {/* Period Type */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Period</Label>
                                <Select value={filters.periodType} onValueChange={handlePeriodChange}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select Period" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="daily">Specific Date</SelectItem>
                                        <SelectItem value="weekly">This Week</SelectItem>
                                        <SelectItem value="monthly">This Month</SelectItem>
                                        <SelectItem value="yearly">This Year</SelectItem>
                                        <SelectItem value="custom">Custom Range</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Date Picker */}
                            <div className="space-y-2 lg:col-span-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date Range</Label>
                                <div className="flex items-center gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    "h-9 w-full justify-start text-left font-normal",
                                                    !filters.dateRange.from && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                                                {filters.dateRange.from ? (
                                                    filters.dateRange.to ? (
                                                        <>
                                                            {format(filters.dateRange.from, "LLL dd, y")} -{" "}
                                                            {format(filters.dateRange.to, "LLL dd, y")}
                                                        </>
                                                    ) : (
                                                        format(filters.dateRange.from, "LLL dd, y")
                                                    )
                                                ) : (
                                                    <span>Pick a date</span>
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                initialFocus
                                                mode="range"
                                                defaultMonth={filters.dateRange.from}
                                                selected={{
                                                    from: filters.dateRange.from,
                                                    to: filters.dateRange.to
                                                }}
                                                onSelect={(range: any) => {
                                                    if (range?.from) {
                                                        setFilters(prev => ({
                                                            ...prev,
                                                            dateRange: { from: range.from, to: range.to || range.from },
                                                            periodType: "custom"
                                                        }))
                                                    }
                                                }}
                                                numberOfMonths={2}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>

                            {/* Category Filter */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</Label>
                                <Select value={filters.productType} onValueChange={(v) => setFilters(p => ({ ...p, productType: v, productId: 'all' }))}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="All Categories" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Categories</SelectItem>
                                        <SelectItem value="fuel">Fuel Only</SelectItem>
                                        <SelectItem value="oil_lubricant">Lubricants Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Item Filter */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</Label>
                                <Select value={filters.productId} onValueChange={(v) => setFilters(p => ({ ...p, productId: v }))}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select Item" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                        <SelectItem value="all">All Items</SelectItem>
                                        {products
                                            .filter(p => filters.productType === 'all' || p.product_type === filters.productType)
                                            .map(p => (
                                                <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Supplier Filter */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier</Label>
                                <Select value={filters.supplierId} onValueChange={(v) => setFilters(p => ({ ...p, supplierId: v }))}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="All Suppliers" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Suppliers</SelectItem>
                                        {suppliers.map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Payment Method Filter */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment</Label>
                                <Select value={filters.paymentMethod} onValueChange={(v) => setFilters(p => ({ ...p, paymentMethod: v }))}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="All Methods" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Methods</SelectItem>
                                        <SelectItem value="cash">Cash Only</SelectItem>
                                        <SelectItem value="bank">Bank Transfer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* More Filters Toggle */}
                            <div className="flex gap-2">
                                <Button variant="secondary" className="h-9 w-full">
                                    <Filter className="mr-2 h-4 w-4" />
                                    Apply Filters
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Main Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4 overflow-x-auto pb-2 scrollbar-hide">
                            <TabsList className="bg-muted/50 p-1 h-12">
                                <TabsTrigger value="daily-summary" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <FileText className="mr-2 h-4 w-4" /> Daily Summary
                                </TabsTrigger>
                                <TabsTrigger value="sales-analysis" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <BarChart3 className="mr-2 h-4 w-4" /> Sales Analysis
                                </TabsTrigger>
                                <TabsTrigger value="supplier-tracking" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <Users className="mr-2 h-4 w-4" /> Suppliers
                                </TabsTrigger>
                                <TabsTrigger value="purchase-history" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <ShoppingCart className="mr-2 h-4 w-4" /> Purchases
                                </TabsTrigger>
                                <TabsTrigger value="expense-breakdown" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <Receipt className="mr-2 h-4 w-4" /> Expenses
                                </TabsTrigger>
                                <TabsTrigger value="profit-loss" className="px-6 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                    <TrendingUp className="mr-2 h-4 w-4" /> P&L Statement
                                </TabsTrigger>
                            </TabsList>
                        </div>
                    </div>

                    <div className="mt-2 min-h-[500px] relative">
                        {isFiltersChanging && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-xl animate-in fade-in duration-300">
                                <div className="flex flex-col items-center gap-4">
                                    <BrandLoader size="lg" />
                                    <p className="text-sm font-medium animate-pulse">Generating Report...</p>
                                </div>
                            </div>
                        )}

                        <TabsContent value="daily-summary" className="animate-in fade-in-50 duration-500">
                            <DailySummaryReport filters={filters} onDetailClick={openDetail} onDataLoaded={setReportData} />
                        </TabsContent>

                        <TabsContent value="sales-analysis" className="animate-in fade-in-50 duration-500">
                            <SalesAnalysisReport filters={filters} onDetailClick={openDetail} onDataLoaded={setReportData} />
                        </TabsContent>

                        <TabsContent value="supplier-tracking" className="animate-in fade-in-50 duration-500">
                            <SupplierPerformanceReport filters={filters} onDetailClick={openDetail} onDataLoaded={setReportData} />
                        </TabsContent>

                        <TabsContent value="purchase-history" className="animate-in fade-in-50 duration-500">
                            <PurchaseHistoryReport filters={filters} onDetailClick={openDetail} onDataLoaded={setReportData} />
                        </TabsContent>

                        <TabsContent value="expense-breakdown" className="animate-in fade-in-50 duration-500">
                            <ExpenseBreakdownReport filters={filters} onDetailClick={openDetail} onDataLoaded={setReportData} />
                        </TabsContent>

                        <TabsContent value="profit-loss" className="animate-in fade-in-50 duration-500">
                            <ProfitLossStatement filters={filters} onDetailClick={openDetail} onDataLoaded={setReportData} />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
            {/* Detail View Modal - Unmount when closed to prevent duplicate IDs in print */}
            {isDetailOpen && selectedItem && (
                <DetailViewDialog
                    key={selectedItem.id}
                    isOpen={isDetailOpen}
                    onOpenChange={setIsDetailOpen}
                    item={selectedItem}
                />
            )}
        </div>
    )
}

// REMOVED LOCAL DetailViewDialog FUNCTION - NOW IMPORTED FROM @/components/reports/detail-view-dialog



