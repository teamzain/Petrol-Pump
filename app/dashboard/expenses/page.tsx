"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { format } from "date-fns"
import { getTodayPKT } from "@/lib/utils"
import {
    DollarSign,
    TrendingDown,
    Calendar,
    AlertTriangle,
    CheckCircle2,
    AlertCircle,
    PiggyBank,
    Wallet,
    Receipt,
    FileText,
    PieChart as PieChartIcon,
    RefreshCw,
    Loader2,
    Plus,
    Search,
    Filter,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { createClient } from "@/lib/supabase/client"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

// --- Interfaces ---
interface ExpenseCategory {
    id: string
    category_name: string
    category_type: string
}

interface DailyBalance {
    id: string
    cash_closing: number | null
    cash_opening: number
    bank_closing: number | null
    bank_opening: number
    is_closed: boolean
}

interface Expense {
    id: string
    expense_date: string
    amount: number
    category_id: string
    category: { category_name: string }
    payment_method: string
    description: string
    paid_to: string | null
    invoice_number: string | null
    notes: string | null
}

export default function ExpensesPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [categories, setCategories] = useState<ExpenseCategory[]>([])
    const [todayBalance, setTodayBalance] = useState<DailyBalance | null>(null)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState<string | null>(null)

    // Form State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [formData, setFormData] = useState({
        date: format(new Date(), "yyyy-MM-dd"),
        categoryId: "",
        amount: "",
        paymentMethod: "cash",
        description: "",
        paidTo: "",
        invoiceNumber: "",
        notes: ""
    })

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState("")
    const [categoryFilter, setCategoryFilter] = useState("all")
    const [expenses, setExpenses] = useState<Expense[]>([])

    const supabase = createClient()

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            // 1. Fetch Categories
            const { data: catData } = await supabase
                .from("expense_categories")
                .select("*")
                .eq("status", "active")
                .order("category_name")

            if (catData) setCategories(catData)

            // 2. Fetch Today's Balance
            const today = getTodayPKT()
            const { data: balanceData } = await supabase
                .from("daily_balances")
                .select("*")
                .eq("balance_date", today)
                .maybeSingle()

            if (balanceData) setTodayBalance(balanceData)

            // 3. Fetch Expenses
            const { data: expensesData } = await supabase
                .from("expenses")
                .select(`
                    *,
                    category:expense_categories(category_name)
                `)
                .order("expense_date", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(100)

            if (expensesData) setExpenses(expensesData as any)

        } catch (err: any) {
            setError(err.message || "Failed to load data")
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // --- Derived Stats ---
    const stats = useMemo(() => {
        const today = getTodayPKT()
        const todayTotal = expenses
            .filter(e => e.expense_date === today)
            .reduce((sum, e) => sum + Number(e.amount), 0)

        const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
        const monthTotal = expenses
            .filter(e => e.expense_date >= startOfMonth)
            .reduce((sum, e) => sum + Number(e.amount), 0)

        return { todayTotal, monthTotal }
    }, [expenses])

    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => {
            const matchesSearch = e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (e.paid_to?.toLowerCase() || "").includes(searchQuery.toLowerCase())
            const matchesCategory = categoryFilter === "all" || e.category_id === categoryFilter
            return matchesSearch && matchesCategory
        })
    }, [expenses, searchQuery, categoryFilter])

    const currentCash = todayBalance?.cash_closing ?? todayBalance?.cash_opening ?? 0
    const currentBank = todayBalance?.bank_closing ?? todayBalance?.bank_opening ?? 0

    const handleSubmit = async () => {
        setError("")
        const amountNum = parseFloat(formData.amount) || 0

        if (!formData.categoryId || amountNum <= 0 || !formData.description) {
            setError("Please fill all required fields correctly.")
            return
        }

        const isCash = formData.paymentMethod === "cash"
        const available = isCash ? currentCash : currentBank
        // Warning if insufficient, but allow if it's a "backdate" or if balance isn't strictly tracked for now
        // Usually it's better to warn and block
        if (amountNum > available) {
            setError(`Insufficient ${isCash ? "Cash" : "Bank"} Balance! Available: Rs. ${available.toLocaleString()}`)
            return
        }

        setSaving(true)
        try {
            const user = await supabase.auth.getUser()

            // Insert into expenses table. Triggers handle transactions & balance.
            const { error: expError } = await supabase.from("expenses").insert({
                expense_date: formData.date,
                category_id: formData.categoryId,
                amount: amountNum,
                payment_method: formData.paymentMethod,
                description: formData.description,
                paid_to: formData.paidTo,
                invoice_number: formData.invoiceNumber,
                notes: formData.notes,
                created_by: user.data.user?.id
            })

            if (expError) throw expError

            setSuccess("Expense recorded successfully!")
            setIsDialogOpen(false)
            setFormData({
                date: getTodayPKT(),
                categoryId: "",
                amount: "",
                paymentMethod: "cash",
                description: "",
                paidTo: "",
                invoiceNumber: "",
                notes: ""
            })
            fetchData()

            // Hide success after 3 seconds
            setTimeout(() => setSuccess(null), 3000)

        } catch (err: any) {
            setError(err.message || "Failed to save expense")
        } finally {
            setSaving(false)
        }
    }

    const formatCurrency = (val: number) => `Rs. ${val.toLocaleString("en-PK")}`

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
                <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-primary/10 border-t-primary animate-spin shadow-2xl shadow-primary/10" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Wallet className="h-8 w-8 text-primary animate-pulse" />
                    </div>
                </div>
                <p className="mt-6 text-muted-foreground font-medium animate-pulse tracking-wide italic">Syncing expense records...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Expense Management</h1>
                    <p className="text-muted-foreground">Detailed tracking of operating costs and daily reconcilements.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={fetchData} className="hidden md:flex">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="shadow-lg shadow-primary/20">
                                <Plus className="mr-2 h-4 w-4" />
                                Record Expense
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Record New Expense</DialogTitle>
                                <DialogDescription>
                                    Automated financial tracking will update your account balances instantly.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="date">Date</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="category">Category</Label>
                                        <Select value={formData.categoryId} onValueChange={(v) => setFormData({ ...formData, categoryId: v })}>
                                            <SelectTrigger id="category">
                                                <SelectValue placeholder="Select Category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {categories.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Amount (Rs)</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            placeholder="0.00"
                                            className="font-bold border-primary/20 focus:border-primary"
                                            value={formData.amount}
                                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="method">Payment Method</Label>
                                        <Select value={formData.paymentMethod} onValueChange={(v) => setFormData({ ...formData, paymentMethod: v })}>
                                            <SelectTrigger id="method">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">Cash Account</SelectItem>
                                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                                <SelectItem value="cheque">Cheque</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="desc">Description <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="desc"
                                        placeholder="e.g. Electricity Bill Jan 2025"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="payee">Paid To</Label>
                                        <Input
                                            id="payee"
                                            placeholder="Recipient name"
                                            value={formData.paidTo}
                                            onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="inv">Invoice / Ref #</Label>
                                        <Input
                                            id="inv"
                                            placeholder="INV-XXX"
                                            value={formData.invoiceNumber}
                                            onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="notes">Notes</Label>
                                    <Textarea
                                        id="notes"
                                        placeholder="Internal record notes..."
                                        className="h-20"
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleSubmit} disabled={saving} className="min-w-[120px]">
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Expense"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-l-primary shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Today's Expenses</CardTitle>
                        <TrendingDown className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(stats.todayTotal)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Impact on today's books</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Monthly Total</CardTitle>
                        <PieChartIcon className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(stats.monthTotal)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Total operating costs</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Cash</CardTitle>
                        <Wallet className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(currentCash)}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Cash Balance</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-blue-500 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Bank</CardTitle>
                        <PiggyBank className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(currentBank)}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Bank Balance</p>
                    </CardContent>
                </Card>
            </div>

            {success && (
                <Alert className="border-green-200 bg-green-50 animate-in fade-in slide-in-from-top-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 font-bold">Success</AlertTitle>
                    <AlertDescription className="text-green-700">{success}</AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Validation / Connection Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card className="border-2 border-primary/5 shadow-lg overflow-hidden">
                <CardHeader className="bg-muted/30 border-b">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <CardTitle className="flex items-center gap-2">
                            <Receipt className="h-5 w-5 text-primary" />
                            Expense History
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search details..."
                                    className="pl-9 h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-[180px] h-9">
                                    <Filter className="mr-2 h-4 w-4 text-primary" />
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/20">
                                <TableHead className="w-[120px]">Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead className="text-center">Method</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredExpenses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        No expenses found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredExpenses.map((expense) => (
                                    <TableRow key={expense.id} className="hover:bg-muted/10">
                                        <TableCell className="font-medium">
                                            {new Date(expense.expense_date).toLocaleDateString("en-PK", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric"
                                            })}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-semibold">{expense.description}</span>
                                                {expense.notes && <span className="text-[10px] text-muted-foreground italic line-clamp-1">{expense.notes}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="font-normal border-primary/10">
                                                {expense.category?.category_name}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {expense.paid_to && <div className="font-medium text-slate-700">{expense.paid_to}</div>}
                                            {expense.invoice_number && <div className="opacity-70">Ref: {expense.invoice_number}</div>}
                                            {(!expense.paid_to && !expense.invoice_number) && "-"}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 font-medium capitalize">
                                                {expense.payment_method.replace("_", " ")}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className="font-bold text-destructive">
                                                {formatCurrency(Number(expense.amount))}
                                            </span>
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
