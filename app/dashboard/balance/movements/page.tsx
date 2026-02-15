"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
    Search,
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    ArrowRightLeft,
    Clock,
    ArrowUpRight,
    ArrowDownRight,
    Filter,
    Eye,
    Receipt,
    History,
    FileText,
    ExternalLink,
    Package
} from "lucide-react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { BrandLoader } from "@/components/ui/brand-loader"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { PurchaseDetailsDialog } from "@/components/purchases/purchase-details-dialog"
import { SaleDetailsDialog } from "@/components/sales/sale-details-dialog"
import { ExpenseDetailsDialog } from "@/components/expenses/expense-details-dialog"

interface Transaction {
    id: string
    transaction_date: string
    transaction_type: 'income' | 'expense' | 'transfer'
    category: string
    description: string
    amount: number
    payment_method: string
    from_account: string | null
    to_account: string | null
    reference_type: string | null
    reference_id: string | null
    created_at: string
    running_cash?: number
    running_bank?: number
    running_total?: number
}

interface Account {
    id: string
    account_name: string
    account_type: string
    current_balance: number
}

export default function BalanceMovementsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])
    const [loading, setLoading] = useState(true)
    const [typeFilter, setTypeFilter] = useState("all")
    const [accountFilter, setAccountFilter] = useState("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [dateRange, setDateRange] = useState("all")
    const [customStart, setCustomStart] = useState<string>("")
    const [customEnd, setCustomEnd] = useState<string>("")

    // Details Dialog State
    const [purchaseOrder, setPurchaseOrder] = useState<any>(null)
    const [isPurchaseDetailsOpen, setIsPurchaseDetailsOpen] = useState(false)

    const [saleDetails, setSaleDetails] = useState<any>(null)
    const [isSaleDetailsOpen, setIsSaleDetailsOpen] = useState(false)

    const [expenseDetails, setExpenseDetails] = useState<any>(null)
    const [isExpenseDetailsOpen, setIsExpenseDetailsOpen] = useState(false)

    // Legacy/Generic Dialog State
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [detailsLoading, setDetailsLoading] = useState(false)
    const [detailsData, setDetailsData] = useState<any>(null)

    const supabase = createClient()

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            // 1. Fetch Accounts for mapping & filter
            const { data: accData } = await supabase
                .from("accounts")
                .select("id, account_name, account_type, current_balance")
                .order("account_name")

            if (accData) setAccounts(accData)

            // 2. Build Transaction Query
            let query = supabase
                .from("transactions")
                .select("*")
                .order("transaction_date", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(200)

            if (typeFilter !== "all") {
                query = query.eq("transaction_type", typeFilter)
            }

            if (accountFilter !== "all") {
                query = query.or(`from_account.eq.${accountFilter},to_account.eq.${accountFilter}`)
            }

            if (dateRange !== "all") {
                const today = new Date()
                let startStr = ""
                let endStr = ""

                if (dateRange === "today") {
                    const start = new Date()
                    start.setHours(0, 0, 0, 0)
                    const end = new Date()
                    end.setHours(23, 59, 59, 999)
                    startStr = start.toISOString()
                    endStr = end.toISOString()
                } else if (dateRange === "week") {
                    const end = new Date()
                    end.setHours(23, 59, 59, 999)
                    const start = new Date()
                    start.setDate(start.getDate() - 7)
                    start.setHours(0, 0, 0, 0)
                    startStr = start.toISOString()
                    endStr = end.toISOString()
                } else if (dateRange === "month") {
                    const end = new Date()
                    end.setHours(23, 59, 59, 999)
                    const start = new Date()
                    start.setMonth(start.getMonth() - 1)
                    start.setHours(0, 0, 0, 0)
                    startStr = start.toISOString()
                    endStr = end.toISOString()
                } else if (dateRange === "custom" && customStart && customEnd) {
                    const startParts = customStart.split('-').map(Number)
                    const endParts = customEnd.split('-').map(Number)
                    const start = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0)
                    const end = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999)
                    startStr = start.toISOString()
                    endStr = end.toISOString()
                }

                if (startStr && endStr) {
                    query = query.gte("transaction_date", startStr).lte("transaction_date", endStr)
                }
            }

            const { data: queryData } = await query
            let transactionList = queryData as Transaction[] || []

            // Client-side search filtering
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase()
                transactionList = transactionList.filter(t =>
                    t.description?.toLowerCase().includes(q) ||
                    t.category?.toLowerCase().includes(q)
                )
            }

            // 3. Calculate Running Balances
            // Backtrack from current balances to past states
            const sorted = [...transactionList].sort((a, b) =>
                new Date(b.created_at || b.transaction_date).getTime() -
                new Date(a.created_at || a.transaction_date).getTime()
            )

            // Calculate current total balances
            let currentCash = 0
            let currentBank = 0
            if (!accData) {
                setTransactions([])
                return
            }

            const activeAccounts = accData as Account[]
            activeAccounts.forEach(acc => {
                const bal = Number(acc.current_balance)
                if (acc.account_type === 'cash') currentCash += bal
                else if (acc.account_type === 'bank') currentBank += bal
            })

            const resultWithBalance = sorted.map(tx => {
                const amount = Number(tx.amount)
                const fromAccId = tx.from_account
                const toAccId = tx.to_account

                const fromAcc = accData.find(a => a.id === fromAccId)
                const toAcc = accData.find(a => a.id === toAccId)

                // Current state is stored in currentCash/currentBank
                const state = {
                    cash: currentCash,
                    bank: currentBank,
                    total: currentCash + currentBank
                }

                // Reverse the transaction to get the PREVIOUS state for the NEXT (older) iteration
                if (tx.transaction_type === 'transfer') {
                    if (fromAcc?.account_type === 'cash') currentCash += amount
                    if (fromAcc?.account_type === 'bank') currentBank += amount
                    if (toAcc?.account_type === 'cash') currentCash -= amount
                    if (toAcc?.account_type === 'bank') currentBank -= amount
                } else if (tx.transaction_type === 'income') {
                    if (toAcc?.account_type === 'cash') currentCash -= amount
                    if (toAcc?.account_type === 'bank') currentBank -= amount
                } else if (tx.transaction_type === 'expense') {
                    if (fromAcc?.account_type === 'cash') currentCash += amount
                    if (fromAcc?.account_type === 'bank') currentBank += amount
                }

                return {
                    ...tx,
                    running_cash: state.cash,
                    running_bank: state.bank,
                    running_total: state.total
                }
            })

            setTransactions(resultWithBalance)
        } catch (err) {
            console.error("Failed to fetch balance movements:", err)
        } finally {
            setLoading(false)
        }
    }, [supabase, typeFilter, accountFilter, dateRange, customStart, customEnd, searchQuery])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const getAccountName = (id: string | null) => {
        if (!id) return "-"
        const acc = accounts.find(a => a.id === id)
        return acc ? acc.account_name : "Unknown Account"
    }

    const formatCurrency = (val: number) => {
        return `Rs. ${Number(val).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    const fetchDetails = async (tx: Transaction) => {
        setSelectedTx(tx)
        setDetailsLoading(true)
        setDetailsData(null)

        try {
            const refLower = tx.reference_type?.toLowerCase() || ""
            const isPurchaseRef = refLower === 'purchase' || refLower === 'purchases' || refLower === 'purchase_order' || refLower === 'purchase_orders'
            const isSaleRef = refLower === 'sale' || refLower === 'sales' || refLower === 'nozzle_readings'
            const isExpenseRef = refLower === 'expense' || refLower === 'expenses'

            if (isPurchaseRef && tx.reference_id) {
                // SPECIAL HANDLING: Use dedicated dialog for purchases
                // First try to find the linked purchase order
                let orderId = tx.reference_id

                // If it's a purchase item, find its parent order
                if (refLower === 'purchase' || refLower === 'purchases') {
                    const { data: item } = await supabase.from('purchases').select('order_id').eq('id', tx.reference_id).maybeSingle()
                    if (item && item.order_id) orderId = item.order_id
                }

                const { data: order } = await supabase
                    .from('purchase_orders')
                    .select('*, suppliers(supplier_name, phone_number), accounts(account_name, account_number), purchases(*, products(product_name, product_type, unit))')
                    .eq('id', orderId)
                    .maybeSingle()

                if (order) {
                    setPurchaseOrder(order)
                    setIsPurchaseDetailsOpen(true)
                    setDetailsLoading(false)
                    return // EXIT HERE to use the dedicated dialog
                } else {
                    // Fallback to legacy generic view if order not found
                    const { data: purchase } = await supabase
                        .from('purchases')
                        .select('*, products(product_name), suppliers(supplier_name), accounts(account_name, account_number), paid_amount, due_amount')
                        .eq('id', tx.reference_id)
                        .maybeSingle()
                    setDetailsData(purchase)
                    setIsDetailsOpen(true)
                }
            } else if (isSaleRef && tx.reference_id) {
                // Try nozzle_readings
                const { data: reading } = await supabase
                    .from('nozzle_readings')
                    .select('*, nozzles(nozzle_number, products(product_name, unit)), accounts(account_name, account_number)')
                    .eq('id', tx.reference_id)
                    .maybeSingle()

                if (reading) {
                    setSaleDetails({ ...reading, type: 'reading' })
                    setIsSaleDetailsOpen(true)
                    setDetailsLoading(false)
                    return
                } else {
                    // Try generic sales
                    const { data: sale } = await supabase
                        .from('sales')
                        .select('*, products(product_name, unit), accounts(account_name, account_number)')
                        .eq('id', tx.reference_id)
                        .maybeSingle()

                    if (sale) {
                        setSaleDetails({ ...sale, type: 'sale' })
                        setIsSaleDetailsOpen(true)
                        setDetailsLoading(false)
                        return
                    }
                }
                // Fallback if nothing found
                setIsDetailsOpen(true)

            } else if (isExpenseRef && tx.reference_id) {
                const { data } = await supabase
                    .from('expenses')
                    .select('*, expense_categories(category_name), accounts(account_name, account_number)')
                    .eq('id', tx.reference_id)
                    .maybeSingle()

                if (data) {
                    setExpenseDetails(data)
                    setIsExpenseDetailsOpen(true)
                    setDetailsLoading(false)
                    return
                }

                // Fallback
                setIsDetailsOpen(true)
            } else {
                // Unknown/Transfer
                setIsDetailsOpen(true)
            }
        } catch (err) {
            console.error("Error fetching details:", err)
            setIsDetailsOpen(true) // Open generic even on error so user sees something
        } finally {
            setDetailsLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <BrandLoader size="lg" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/balance">
                        <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Balance Movements</h1>
                        <p className="text-muted-foreground">Detailed logic of every financial transaction</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-4">
                {/* Search Bar */}
                <div className="relative flex-1 w-full md:w-auto">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search by description or category..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 w-full"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                    {/* Type Filter */}
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="income">Incomes</SelectItem>
                            <SelectItem value="expense">Expenses</SelectItem>
                            <SelectItem value="transfer">Transfers</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Account Filter */}
                    <Select value={accountFilter} onValueChange={setAccountFilter}>
                        <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Accounts" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Accounts</SelectItem>
                            {accounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.account_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Date Range Filter */}
                    <Select value={dateRange} onValueChange={setDateRange}>
                        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Time</SelectItem>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="week">Last 7 Days</SelectItem>
                            <SelectItem value="month">Last 30 Days</SelectItem>
                            <SelectItem value="custom">Custom Range</SelectItem>
                        </SelectContent>
                    </Select>

                    {dateRange === "custom" && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                            <Input
                                type="date"
                                value={customStart}
                                onChange={e => setCustomStart(e.target.value)}
                                className="w-[130px]"
                            />
                            <span className="text-muted-foreground">-</span>
                            <Input
                                type="date"
                                value={customEnd}
                                onChange={e => setCustomEnd(e.target.value)}
                                className="w-[130px]"
                            />
                        </div>
                    )}

                    <div className="h-4 w-[1px] bg-border mx-2 hidden md:block" />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{transactions.length} records</span>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>Visualizing cash inflow and outflow across accounts</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                        <Table className="min-w-[1000px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[120px]">Date</TableHead>
                                    <TableHead className="w-[100px]">Type</TableHead>
                                    <TableHead className="w-[150px]">Description & Cat</TableHead>
                                    <TableHead className="w-[150px]">Account(s)</TableHead>
                                    <TableHead className="text-right w-[120px]">Amount</TableHead>
                                    <TableHead className="text-right w-[100px]">Cash Bal</TableHead>
                                    <TableHead className="text-right w-[100px]">Bank Bal</TableHead>
                                    <TableHead className="text-right w-[120px]">Total Bal</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                            No transactions found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transactions.map((t) => {
                                        const isIncome = t.transaction_type === "income"
                                        const isExpense = t.transaction_type === "expense"
                                        const isTransfer = t.transaction_type === "transfer"
                                        const isPurchase =
                                            t.category?.toLowerCase().includes('purchase') ||
                                            t.reference_type === 'purchase' ||
                                            t.reference_type === 'purchase_order'

                                        const typeLabel = isPurchase ? "Purchase" : t.transaction_type

                                        return (
                                            <TableRow key={t.id}>
                                                <TableCell className="font-medium whitespace-nowrap">
                                                    {new Date(t.transaction_date).toLocaleDateString("en-PK", {
                                                        day: "numeric", month: "short", year: "numeric"
                                                    })}
                                                    <span className="block text-xs text-muted-foreground">
                                                        {new Date(t.transaction_date).toLocaleTimeString("en-PK", {
                                                            hour: "2-digit", minute: "2-digit"
                                                        })}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={isIncome ? "secondary" : (isExpense || isPurchase) ? "outline" : "outline"}
                                                        className={isIncome ? "bg-green-100 text-green-800 hover:bg-green-100" : (isExpense || isPurchase) ? "bg-red-50 text-red-700 hover:bg-red-50" : "bg-blue-50 text-blue-700 font-medium"}>
                                                        <span className="flex items-center gap-1">
                                                            {isIncome && <TrendingUp className="h-3 w-3" />}
                                                            {(isExpense || isPurchase) && <TrendingDown className="h-3 w-3" />}
                                                            {isTransfer && <ArrowRightLeft className="h-3 w-3" />}
                                                            {typeLabel}
                                                        </span>
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-0.5 max-w-[150px]">
                                                        <div className="text-sm font-bold truncate" title={t.description}>{t.description}</div>
                                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground overflow-hidden text-ellipsis">
                                                            {t.category?.replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {isTransfer ? (
                                                        <div className="text-xs flex flex-col gap-0.5">
                                                            <span className="flex items-center gap-1"><ArrowDownRight className="h-3 w-3 text-destructive" /> {getAccountName(t.from_account)}</span>
                                                            <span className="flex items-center gap-1"><ArrowUpRight className="h-3 w-3 text-primary" /> {getAccountName(t.to_account)}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="font-medium text-xs">
                                                            {t.from_account ? getAccountName(t.from_account) : getAccountName(t.to_account)}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className={`font-black text-sm whitespace-nowrap ${isIncome ? "text-green-600" : (isExpense || isPurchase) ? "text-destructive" : "text-blue-600"}`}>
                                                        {isIncome ? "+" : (isExpense || isPurchase) ? "-" : ""}
                                                        {formatCurrency(t.amount)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-muted-foreground bg-muted/5 whitespace-nowrap">
                                                    {formatCurrency(t.running_cash || 0)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-muted-foreground bg-muted/5 whitespace-nowrap">
                                                    {formatCurrency(t.running_bank || 0)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm font-bold text-foreground whitespace-nowrap">
                                                    {formatCurrency(t.running_total || 0)}
                                                </TableCell>
                                                <TableCell>
                                                    {t.reference_id && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-primary hover:bg-primary/10"
                                                            onClick={() => fetchDetails(t)}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Dedicated Modals */}
            <PurchaseDetailsDialog
                open={isPurchaseDetailsOpen}
                onOpenChange={setIsPurchaseDetailsOpen}
                order={purchaseOrder}
            />

            <SaleDetailsDialog
                open={isSaleDetailsOpen}
                onOpenChange={setIsSaleDetailsOpen}
                sale={saleDetails}
            />

            <ExpenseDetailsDialog
                open={isExpenseDetailsOpen}
                onOpenChange={setIsExpenseDetailsOpen}
                expense={expenseDetails}
            />

            {/* Generic Details Dialog (Transfers & Fallback) */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Transaction Details</DialogTitle>
                        <DialogDescription>
                            Raw transaction view
                        </DialogDescription>
                    </DialogHeader>

                    {detailsLoading ? (
                        <div className="flex justify-center p-8">
                            <BrandLoader size="md" />
                        </div>
                    ) : (
                        <div className="p-4 space-y-4">
                            <div className="bg-slate-50 p-4 rounded border">
                                <p className="font-bold text-sm">{selectedTx?.description}</p>
                                <p className="text-xs text-muted-foreground">{selectedTx?.category}</p>
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span>Amount:</span>
                                <span className="font-bold font-mono">{formatCurrency(selectedTx?.amount || 0)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span>Type:</span>
                                <Badge variant="outline">{selectedTx?.transaction_type}</Badge>
                            </div>
                            {selectedTx?.reference_id && (
                                <div className="pt-4 border-t mt-4">
                                    <p className="text-xs text-muted-foreground text-center">
                                        Ref ID: {selectedTx.reference_id}
                                    </p>
                                    <p className="text-xs text-muted-foreground text-center">
                                        Ref Type: {selectedTx.reference_type}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div >
    )
}
