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
        <div className="flex flex-col gap-4">
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
            {/* Detail View Modal */}
            <DetailViewDialog
                isOpen={isDetailOpen}
                onOpenChange={setIsDetailOpen}
                item={selectedItem}
            />
        </div>
    )
}

function DetailViewDialog({ isOpen, onOpenChange, item }: any) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [subItems, setSubItems] = useState<any[]>([])

    useEffect(() => {
        if (isOpen && item) {
            fetchSubDetails()
        } else {
            setSubItems([])
        }
    }, [isOpen, item])

    const fetchSubDetails = async () => {
        if (!item) return
        setLoading(true)
        try {
            // 1. Purchase Details (from purchase_orders or stock movement)
            if (
                (item.total_amount !== undefined && item.invoice_number && !item.product_id) ||
                (item.movement_type === 'purchase' && item.reference_type === 'purchase')
            ) {
                const orderId = item.reference_id || item.id
                const { data } = await supabase
                    .from("purchases")
                    .select("*, products(product_name)")
                    .eq("order_id", orderId)
                if (data) setSubItems(data)
            }
            // 2. Fuel Sale specifics (from nozzle_readings or stock movement)
            else if (
                item.opening_reading !== undefined ||
                (item.sale_amount !== undefined && item.nozzle_id) ||
                (item.movement_type === 'sale' && item.reference_type === 'reading')
            ) {
                const readingId = item.reference_id || item.id
                const { data } = await supabase
                    .from("nozzle_readings")
                    .select("*, nozzles(nozzle_number, products(product_name))")
                    .eq("id", readingId)
                    .single()
                if (data) setSubItems([data])
            }
            // 3. Product Sale specifics (from sales or stock movement)
            else if (
                (item.sale_amount !== undefined && item.product_id) ||
                (item.movement_type === 'sale' && item.reference_type === 'sale')
            ) {
                const saleId = item.reference_id || item.id
                const { data } = await supabase
                    .from("sales")
                    .select("*, products(product_name)")
                    .eq("id", saleId)
                    .single()
                if (data) setSubItems([data])
            }
        } catch (error) {
            console.error("Error fetching sub-details:", error)
        } finally {
            setLoading(false)
        }
    }

    if (!item) return null

    // Precise Type Determination
    const isFuelSale = item.opening_reading !== undefined || (item.sale_amount !== undefined && item.nozzle_id)
    const isProductSale = item.sale_amount !== undefined && item.product_id && !isFuelSale
    const isPurchase = item.total_amount !== undefined
    const isExpense = item.amount !== undefined && !isPurchase

    const type = isFuelSale ? "Fuel Sale" : isProductSale ? "Product Sale" : isPurchase ? "Purchase" : "Expense"

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl w-[98vw] sm:w-[95vw] lg:w-[90vw] p-0 border-none bg-transparent max-h-[95vh] overflow-hidden">
                <Card className="border-none shadow-2xl flex flex-col max-h-[95vh]">
                    <CardHeader className="bg-primary text-primary-foreground rounded-t-xl pb-4 flex-shrink-0">
                        <div className="flex justify-between items-start">
                            <div>
                                <Badge variant="secondary" className="mb-1.5 bg-white/20 text-white hover:bg-white/30 border-none text-[10px]">
                                    {type}
                                </Badge>
                                <CardTitle className="text-xl sm:text-2xl font-black">Transaction Detail</CardTitle>
                                <CardDescription className="text-primary-foreground/70 text-xs mt-0.5">
                                    Recorded at {format(new Date(item.sale_date || item.purchase_date || item.expense_date || item.reading_date || item.movement_date || new Date()), "PPP p")}
                                </CardDescription>
                            </div>
                            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                                <Receipt className="h-5 w-5" />
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-white dark:bg-slate-950 overflow-y-auto custom-scrollbar flex-grow">
                        {/* LANDSCAPE GRID */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">

                            {/* LEFT COLUMN: PRIMARY DETAILS / ITEMS */}
                            <div className="space-y-4">
                                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    {isPurchase ? "Purchase Order Items" : isFuelSale ? "Nozzle / Reading Data" : "Transaction Details"}
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4">
                                    {isFuelSale && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                                                <span className="text-sm font-bold">{item.nozzles?.products?.product_name || subItems[0]?.nozzles?.products?.product_name || "Fuel Sale"}</span>
                                                <Badge variant="secondary" className="text-[10px]">Nozzle {item.nozzles?.nozzle_number || subItems[0]?.nozzles?.nozzle_number || "-"}</Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border text-center shadow-sm">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Start Reading</div>
                                                    <div className="text-base font-mono font-bold">{(item.opening_reading || 0).toFixed(2)}</div>
                                                </div>
                                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border text-center shadow-sm">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">End Reading</div>
                                                    <div className="text-base font-mono font-bold">{(item.closing_reading || 0).toFixed(2)}</div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 text-center">
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Qty Sold</div>
                                                    <div className="text-xs font-bold">{(item.quantity_sold || item.quantity || 0).toLocaleString()} Ltr</div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Price</div>
                                                    <div className="text-xs font-bold text-primary">Rs.{Number(item.selling_price || 0).toLocaleString()}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Total</div>
                                                    <div className="text-xs font-black text-primary">Rs.{Number(item.sale_amount || (item.quantity_sold * item.selling_price) || 0).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {isProductSale && (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                <span className="text-sm font-bold text-primary">{item.products?.product_name || "Product Item"}</span>
                                                <Badge className="h-5">x{item.quantity}</Badge>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Qty</div>
                                                    <div className="text-xs font-bold">{item.quantity} Unit</div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Price</div>
                                                    <div className="text-xs font-bold">Rs. {Number(item.selling_price || 0).toLocaleString()}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[9px] text-muted-foreground uppercase font-black">Total</div>
                                                    <div className="text-xs font-black text-primary">Rs. {Number(item.sale_amount || 0).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {isPurchase && (
                                        <div className="space-y-3">
                                            {loading ? (
                                                <div className="space-y-2">
                                                    <Skeleton className="h-4 w-full" />
                                                    <Skeleton className="h-4 w-3/4" />
                                                </div>
                                            ) : subItems.length > 0 ? (
                                                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                                                    {subItems.map((si) => (
                                                        <div key={si.id} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-2">
                                                            <div className="font-bold text-xs text-primary flex justify-between items-center">
                                                                {si.products?.product_name}
                                                                <Badge variant="outline" className="text-[8px] h-3.5 uppercase">ID# {si.id.slice(-4)}</Badge>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-100 dark:border-slate-800 pt-2">
                                                                <div>
                                                                    <div className="text-[8px] text-muted-foreground uppercase font-black">Qty</div>
                                                                    <div className="text-[10px] font-mono font-bold">{si.quantity} L</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[8px] text-muted-foreground uppercase font-black">Rate</div>
                                                                    <div className="text-[10px] font-mono font-bold">Rs.{Number(si.purchase_price_per_unit).toLocaleString()}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-[8px] text-muted-foreground uppercase font-black">Total</div>
                                                                    <div className="text-[10px] font-black text-primary">Rs.{Number(si.total_amount).toLocaleString()}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                                    <div className="text-sm font-bold text-primary">{item.products?.product_name || "Stock Arrival"}</div>
                                                    <div className="grid grid-cols-3 gap-2 pt-2 mt-2 border-t text-center">
                                                        <div>
                                                            <div className="text-[9px] uppercase font-black">Qty</div>
                                                            <div className="text-xs font-bold">{item.quantity} L</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[9px] uppercase font-black">Rate</div>
                                                            <div className="text-xs font-bold">Rs.{Number(item.purchase_price_per_unit || 0).toLocaleString()}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[9px] uppercase font-black">Total</div>
                                                            <div className="text-xs font-black text-primary">Rs.{Number(item.total_amount || 0).toLocaleString()}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isExpense && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center border-b pb-2 border-dashed border-slate-200 dark:border-slate-800">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Expense Category</span>
                                                <Badge variant="outline" className="text-[10px] bg-white dark:bg-slate-950 px-2 py-0 h-5">{item.expense_categories?.category_name || "Operating"}</Badge>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-center font-bold text-lg text-primary">
                                                <div className="text-[9px] text-muted-foreground uppercase mb-1">Expense Amount</div>
                                                Rs. {Number(item.amount).toLocaleString()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT COLUMN: STATUS, PAYMENT, SUMMARY */}
                            <div className="space-y-4">
                                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                    Order Metadata & Summary
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                                    {/* ID & Status */}
                                    <div className="grid grid-cols-2 gap-4 text-[10px]">
                                        <div className="space-y-1">
                                            <span className="text-muted-foreground uppercase font-black">Reference ID</span>
                                            <div className="font-mono bg-white dark:bg-slate-900 border px-2 py-1.5 rounded-lg shadow-sm text-primary font-bold truncate">
                                                {item.id.toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="text-right space-y-1">
                                            <span className="text-muted-foreground uppercase font-black">System Status</span>
                                            <div><Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] h-7 px-3">COMPLETED</Badge></div>
                                        </div>
                                    </div>

                                    <Separator className="opacity-50" />

                                    {/* Payment & Dues */}
                                    <div className="space-y-3 mt-2">
                                        <div className="flex justify-between items-center bg-white dark:bg-slate-900/40 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Payment Method</span>
                                            <Badge variant="outline" className="text-[10px] capitalize bg-white dark:bg-slate-950 font-bold px-3">
                                                {item.payment_method?.replace('_', ' ') || "Cash"}
                                            </Badge>
                                        </div>
                                        {item.payment_method === 'bank_transfer' && (
                                            <div className="flex justify-between items-center bg-primary/5 p-2 rounded-xl border border-primary/10 animate-in slide-in-from-right-2">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Processed Via</span>
                                                <span className="text-xs font-black text-primary flex items-center gap-1.5">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                                    {item.accounts?.account_name || "Bank Account"}
                                                </span>
                                            </div>
                                        )}
                                        <div className="pt-2 space-y-2.5">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-bold uppercase text-muted-foreground text-[10px]">Amount Paid</span>
                                                <span className="font-black text-emerald-600">
                                                    Rs. {Number(item.paid_amount || item.amount || item.sale_amount || 0).toLocaleString()}
                                                </span>
                                            </div>
                                            {isPurchase && (
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="font-bold uppercase text-muted-foreground text-[10px]">Outstanding Balance</span>
                                                    <span className={`font-black ${Number(item.due_amount || 0) > 0 ? "text-destructive" : "text-emerald-500"}`}>
                                                        Rs. {Number(item.due_amount || 0).toLocaleString()}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {item.description && (
                                        <div className="space-y-1.5 pt-2">
                                            <span className="text-[10px] uppercase font-black text-muted-foreground">Notes / Remarks</span>
                                            <div className="bg-amber-50 dark:bg-amber-500/5 text-[10px] italic p-3 rounded-xl border border-amber-100 dark:border-amber-500/20 text-amber-900 dark:text-amber-200 leading-relaxed shadow-inner">
                                                "{item.description}"
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* GRAND TOTAL BOX IN SIDEBAR */}
                                <div className="bg-primary rounded-2xl p-5 text-primary-foreground shadow-lg shadow-primary/20 relative overflow-hidden group">
                                    <div className="absolute -right-4 -top-4 h-24 w-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                                    <div className="relative z-10">
                                        <div className="text-[11px] uppercase font-black tracking-widest opacity-80 decoration-white/20 underline underline-offset-4">Total Amount</div>
                                        <div className="text-3xl font-black mt-2 tracking-tighter">
                                            Rs. {(item.sale_amount || item.total_amount || item.amount || item.total_purchases || 0).toLocaleString()}
                                        </div>
                                        <div className="text-[9px] mt-1 font-medium opacity-60 italic">Inclusive of all items and taxes</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="bg-slate-50 dark:bg-slate-900/50 p-4 border-t gap-3 flex-shrink-0">
                        <Button
                            variant="outline"
                            className="flex-1 h-11 rounded-xl font-bold border-slate-200 dark:border-slate-800 shadow-sm hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95"
                            onClick={() => window.print()}
                        >
                            <Printer className="mr-2 h-4 w-4" /> Print Voucher
                        </Button>
                        <Button
                            variant="default"
                            className="flex-1 h-11 rounded-xl font-black shadow-lg shadow-primary/20 transition-all active:scale-95 hover:brightness-110"
                            onClick={() => onOpenChange(false)}
                        >
                            Close Details
                        </Button>
                    </CardFooter>
                </Card>
            </DialogContent>
        </Dialog>
    )
}
