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
    Plus,
    Search,
    Filter,
    Trash2,
} from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"

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

interface BankAccount {
    id: string
    account_name: string
    current_balance: number
}

interface Expense {
    id: string
    expense_date: string
    amount: number
    category_id: string
    category: { category_name: string, category_type: string }
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
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
    const [error, setError] = useState("")
    const [success, setSuccess] = useState<string | null>(null)

    // Form State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [formData, setFormData] = useState({
        date: format(new Date(), "yyyy-MM-dd"),
        categoryId: "",
        amount: "",
        paymentMethod: "cash",
        bankAccountId: "",
        description: "",
        paidTo: "",
        invoiceNumber: "",
        notes: ""
    })
    const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
    const [newCategory, setNewCategory] = useState({ name: "", type: "operating" })
    const [addingCategory, setAddingCategory] = useState(false)

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
                    category:expense_categories(category_name, category_type)
                `)
                .order("expense_date", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(100)

            if (expensesData) setExpenses(expensesData as any)

            // 4. Fetch Bank Accounts
            const { data: bankData } = await supabase
                .from("accounts")
                .select("id, account_name, current_balance")
                .eq("account_type", "bank")
                .eq("status", "active")
                .order("account_name")

            if (bankData) {
                setBankAccounts(bankData)
                if (bankData.length > 0) {
                    setFormData(prev => ({ ...prev, bankAccountId: bankData[0].id }))
                }
            }

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
        const selectedBank = bankAccounts.find(b => b.id === formData.bankAccountId)
        const available = isCash ? currentCash : (selectedBank ? Number(selectedBank.current_balance) : 0)

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
                bank_account_id: formData.paymentMethod !== "cash" ? formData.bankAccountId : null,
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
                bankAccountId: bankAccounts.length > 0 ? bankAccounts[0].id : "",
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

    const handleAddCategory = async () => {
        if (!newCategory.name.trim()) return

        setAddingCategory(true)
        try {
            const { data, error: catError } = await supabase
                .from("expense_categories")
                .insert({
                    category_name: newCategory.name.trim(),
                    category_type: newCategory.type,
                    status: "active"
                })
                .select()
                .single()

            if (catError) throw catError

            // Refresh categories and select the new one
            await fetchData()
            setFormData(prev => ({ ...prev, categoryId: data.id }))
            setIsCategoryDialogOpen(false)
            setNewCategory({ name: "", type: "operating" })
            setSuccess("Category added successfully!")
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message || "Failed to add category")
        } finally {
            setAddingCategory(false)
        }
    }

    const handleDeleteCategory = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation()
        e.preventDefault()

        if (!confirm(`Are you sure you want to delete the category "${name}"?`)) return

        setAddingCategory(true)
        try {
            const { error: catError } = await supabase
                .from("expense_categories")
                .delete()
                .eq("id", id)

            if (catError) {
                if (catError.code === "23503") {
                    throw new Error("Cannot delete this category because it is already used in existing expense records.")
                }
                throw catError
            }

            // Refresh categories
            await fetchData()

            // If the deleted category was selected, clear it
            if (formData.categoryId === id) {
                setFormData(prev => ({ ...prev, categoryId: "" }))
            }

            setSuccess("Category deleted successfully!")
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message || "Failed to delete category")
        } finally {
            setAddingCategory(false)
        }
    }

    const formatCurrency = (val: number) => `Rs. ${val.toLocaleString("en-PK")}`

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
                <BrandLoader size="lg" className="mb-6" />
                <p className="text-muted-foreground font-medium animate-pulse tracking-wide italic">Syncing expense records...</p>
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
                                        <div className="flex gap-2">
                                            <Select value={formData.categoryId} onValueChange={(v) => setFormData({ ...formData, categoryId: v })}>
                                                <SelectTrigger id="category" className="flex-1 min-w-0 overflow-hidden">
                                                    <div className="truncate">
                                                        <SelectValue placeholder="Select Category" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {categories.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            <div className="flex items-center justify-between w-full min-w-[200px]">
                                                                <span>{c.category_name}</span>
                                                                <div
                                                                    className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                                                                    onPointerDown={(e) => {
                                                                        e.stopPropagation()
                                                                    }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleDeleteCategory(e, c.id, c.category_name)
                                                                    }}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </div>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" size="icon" type="button" className="shrink-0 bg-primary/5 border-primary/20 hover:bg-primary/10">
                                                        <Plus className="h-4 w-4 text-primary" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Add New Category</DialogTitle>
                                                        <DialogDescription>
                                                            Create a new category for your expenses.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="grid gap-4 py-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="newCategoryName">Category Name</Label>
                                                            <Input
                                                                id="newCategoryName"
                                                                placeholder="e.g. Office Supplies"
                                                                value={newCategory.name}
                                                                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="newCategoryType">Category Type</Label>
                                                            <Select value={newCategory.type} onValueChange={(v) => setNewCategory({ ...newCategory, type: v })}>
                                                                <SelectTrigger id="newCategoryType">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="operating">Operating Expense</SelectItem>
                                                                    <SelectItem value="fixed">Fixed Cost</SelectItem>
                                                                    <SelectItem value="maintenance">Maintenance</SelectItem>
                                                                    <SelectItem value="other">Other</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
                                                        <Button onClick={handleAddCategory} disabled={addingCategory}>
                                                            {addingCategory ? <BrandLoader size="xs" /> : "Save Category"}
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
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
                                                <SelectItem value="cash">🏛️ Cash Account</SelectItem>
                                                <SelectItem value="bank_transfer">🏦 Bank Transfer</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {formData.paymentMethod === "bank_transfer" && (
                                        <div className="space-y-2 animate-in slide-in-from-top-2">
                                            <Label htmlFor="bankAccount">Select Bank Account</Label>
                                            <Select value={formData.bankAccountId} onValueChange={(v) => setFormData({ ...formData, bankAccountId: v })}>
                                                <SelectTrigger id="bankAccount">
                                                    <SelectValue placeholder="Choose Bank..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {bankAccounts.map(bank => (
                                                        <SelectItem key={bank.id} value={bank.id}>
                                                            {bank.account_name} ({formatCurrency(bank.current_balance)})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
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
                                <Button onClick={handleSubmit} disabled={saving} className="h-11">
                                    {saving ? <BrandLoader size="xs" /> : "Record Expense"}
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
                        <CardTitle className="text-sm font-medium">Total Bank Balance</CardTitle>
                        <PiggyBank className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(bankAccounts.reduce((sum, b) => sum + Number(b.current_balance), 0))}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Across all bank accounts</p>
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
                <CardContent className="p-0 sm:p-6">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/20">
                                    <TableHead className="w-[120px]">Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-center">Method</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredExpenses.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                            No expenses found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredExpenses.map((expense) => (
                                        <TableRow key={expense.id} className="hover:bg-muted/10">
                                            <TableCell className="font-medium whitespace-nowrap">
                                                {new Date(expense.expense_date).toLocaleDateString("en-PK", {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric"
                                                })}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col min-w-[150px]">
                                                    <span className="font-semibold">{expense.description}</span>
                                                    {expense.notes && <span className="text-[10px] text-muted-foreground italic line-clamp-1">{expense.notes}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="font-normal border-primary/10 whitespace-nowrap">
                                                    {expense.category?.category_name}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                                    {expense.category?.category_type?.replace("_", " ")}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {expense.paid_to && <div className="font-medium text-slate-700">{expense.paid_to}</div>}
                                                {expense.invoice_number && <div className="opacity-70">Ref: {expense.invoice_number}</div>}
                                                {(!expense.paid_to && !expense.invoice_number) && "-"}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 font-medium capitalize whitespace-nowrap">
                                                    {expense.payment_method.replace("_", " ")}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-bold text-destructive whitespace-nowrap">
                                                    {formatCurrency(Number(expense.amount))}
                                                </span>
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
