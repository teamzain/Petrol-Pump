"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
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
    RefreshCw
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

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
    category: { category_name: string }
    payment_method: string
    description: string
    paid_to: string | null
}

export default function ExpensesPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [categories, setCategories] = useState<ExpenseCategory[]>([])
    const [todayBalance, setTodayBalance] = useState<DailyBalance | null>(null)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState<string | null>(null)

    // Form State
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split("T")[0],
        categoryId: "",
        amount: "",
        paymentMethod: "cash",
        description: "",
        paidTo: "",
        invoiceNumber: "",
        notes: ""
    })

    // Duplicate Check
    const [recentExpenses, setRecentExpenses] = useState<Expense[]>([])
    const [potentialDuplicate, setPotentialDuplicate] = useState<Expense | null>(null)

    // Reporting State
    const [dailyExpenses, setDailyExpenses] = useState<Expense[]>([])
    const [monthlyTotal, setMonthlyTotal] = useState(0)

    const supabase = createClient()

    // --- Data Fetching ---
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

            // 2. Fetch Today's Balance Logic (Complex due to rollover)
            const today = new Date().toISOString().split("T")[0]
            const { data: balanceData } = await supabase
                .from("daily_balances")
                .select("*")
                .eq("balance_date", today)
                .maybeSingle()

            if (balanceData) {
                setTodayBalance(balanceData)
            } else {
                // Create mock balance if not exists (UI will handle "Day not started" gracefully or show previous)
                // Ideally we should prompt to start day, but here we just need current cash/bank availability
                // So we fetch theoretically available balance from previous day closing
                const { data: prevData } = await supabase
                    .from("daily_balances")
                    .select("*")
                    .lt("balance_date", today)
                    .order("balance_date", { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (prevData) {
                    setTodayBalance({
                        id: "virtual",
                        cash_opening: prevData.cash_closing ?? prevData.cash_opening ?? 0,
                        cash_closing: null, // Indicates not set
                        bank_opening: prevData.bank_closing ?? prevData.bank_opening ?? 0,
                        bank_closing: null,
                        is_closed: false
                    })
                }
            }

            // 3. Fetch Recent Expenses (for duplicate check & daily report)
            const { data: expensesData } = await supabase
                .from("expenses")
                .select(`
          *,
          category:expense_categories(category_name)
        `)
                .eq("expense_date", today)
                .order("created_at", { ascending: false })

            if (expensesData) {
                setDailyExpenses(expensesData as any)
                setRecentExpenses(expensesData as any)
            }

            // 4. Monthly Total (Approximation)
            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
            const { data: monthData } = await supabase
                .from("expenses")
                .select("amount")
                .gte("expense_date", startOfMonth)
                .lte("expense_date", today)

            if (monthData) {
                setMonthlyTotal(monthData.reduce((sum, e) => sum + Number(e.amount), 0))
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

    // --- Derived Calculations ---
    const currentCash = todayBalance?.cash_closing ?? todayBalance?.cash_opening ?? 0
    const currentBank = todayBalance?.bank_closing ?? todayBalance?.bank_opening ?? 0

    const expenseAmount = parseFloat(formData.amount) || 0
    const isCash = formData.paymentMethod === "cash"
    const isBank = formData.paymentMethod === "bank_transfer" || formData.paymentMethod === "cheque"

    const balanceAfter = isCash
        ? currentCash - expenseAmount
        : isBank
            ? currentBank - expenseAmount
            : 0

    const insufficientFunds = balanceAfter < 0
    const selectedCategory = categories.find(c => c.id === formData.categoryId)

    // Auto-set payment method based on category
    useEffect(() => {
        if (!selectedCategory) return
        if (selectedCategory.category_name.toLowerCase().includes("salary")) {
            setFormData(prev => ({ ...prev, paymentMethod: "cash" }))
        } else if (selectedCategory.category_name.toLowerCase().includes("utility") || selectedCategory.category_name.toLowerCase().includes("bill")) {
            setFormData(prev => ({ ...prev, paymentMethod: "bank_transfer" }))
        }
    }, [selectedCategory])

    // Duplicate Detection
    useEffect(() => {
        if (!formData.amount || !formData.categoryId) return
        const dup = recentExpenses.find(e =>
            e.amount === expenseAmount &&
            (e as any).category_id === formData.categoryId &&
            e.payment_method === formData.paymentMethod
        )
        setPotentialDuplicate(dup || null)
    }, [formData.amount, formData.categoryId, formData.paymentMethod, recentExpenses, expenseAmount])


    // --- Handlers ---
    const handleSubmit = async () => {
        setError("")

        // Validations
        if (!formData.date || !formData.categoryId || !formData.amount || !formData.description) {
            setError("Please fill all required fields")
            return
        }
        if (expenseAmount <= 0) {
            setError("Amount must be greater than 0")
            return
        }
        if (new Date(formData.date) > new Date()) {
            setError("Expense date cannot be in future")
            return
        }
        if (insufficientFunds) {
            setError(`Insufficient ${isCash ? "Cash" : "Bank"} Balance! Available: ${isCash ? currentCash : currentBank}`)
            return
        }

        setSaving(true)
        try {
            const user = await supabase.auth.getUser()
            const userId = user.data.user?.id

            // 1. Transaction Record
            const { data: tx, error: txError } = await supabase.from("transactions").insert({
                transaction_type: "expense",
                category: selectedCategory?.category_name,
                description: formData.description,
                amount: -expenseAmount, // Negative for expense
                payment_method: formData.paymentMethod,
                created_by: userId,
                transaction_date: new Date().toISOString()
            }).select().single()

            if (txError) throw txError

            // 2. Expense Record
            const { error: expError } = await supabase.from("expenses").insert({
                expense_date: formData.date,
                category_id: formData.categoryId,
                amount: expenseAmount,
                payment_method: formData.paymentMethod,
                description: formData.description,
                paid_to: formData.paidTo,
                invoice_number: formData.invoiceNumber,
                notes: formData.notes,
                transaction_id: tx.id,
                created_by: userId
            })

            if (expError) throw expError

            // 3. Update Balance
            if (todayBalance && todayBalance.id !== "virtual") {
                const updateData: any = {}
                if (isCash) updateData.cash_closing = currentCash - expenseAmount
                if (isBank) updateData.bank_closing = currentBank - expenseAmount

                await supabase.from("daily_balances").update(updateData).eq("id", todayBalance.id)
            } else {
                // Create new balance record for today if explicit one didn't exist
                // This handles "virtual" balance case (first transaction of day)
                // We fetch latest again to be safe
                const { data: prevRecord } = await supabase
                    .from("daily_balances")
                    .select("*")
                    .lt("balance_date", formData.date)
                    .order("balance_date", { ascending: false })
                    .limit(1)
                    .single()

                const cashOp = prevRecord?.cash_closing ?? prevRecord?.cash_opening ?? 0
                const bankOp = prevRecord?.bank_closing ?? prevRecord?.bank_opening ?? 0

                await supabase.from("daily_balances").insert({
                    balance_date: formData.date,
                    cash_opening: cashOp,
                    bank_opening: bankOp,
                    cash_closing: isCash ? cashOp - expenseAmount : cashOp,
                    bank_closing: isBank ? bankOp - expenseAmount : bankOp,
                })
            }

            setSuccess(`Expense of Rs. ${expenseAmount} recorded successfully!`)
            setFormData({
                date: new Date().toISOString().split("T")[0],
                categoryId: "",
                amount: "",
                paymentMethod: "cash",
                description: "",
                paidTo: "",
                invoiceNumber: "",
                notes: ""
            })
            fetchData()
        } catch (err: any) {
            setError(err.message || "Failed to save expense")
        } finally {
            setSaving(false)
        }
    }

    const formatCurrency = (val: number) => `Rs. ${val.toLocaleString("en-PK")}`

    return (
        <div className="flex flex-col gap-6 p-4 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Expense Management</h1>
                    <p className="text-muted-foreground">Record and track business expenses (Smart Categorization)</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="px-3 py-1 flex gap-2">
                        <Calendar className="w-4 h-4" />
                        {new Date().toLocaleDateString("en-PK", { dateStyle: "long" })}
                    </Badge>
                </div>
            </div>

            {success && (
                <Alert className="bg-green-50 border-green-200 text-green-800">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT COLUMN: Record Expense Form */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-2 border-primary/10">
                        <CardHeader className="bg-muted/30 pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="w-5 h-5 text-primary" />
                                Record New Expense
                            </CardTitle>
                            <CardDescription>Enter expense details. Fuel purchases should be recorded in Inventory.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 pt-6">

                            {/* Row 1: Date & Amount */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Expense Date</Label>
                                    <Input
                                        type="date"
                                        value={formData.date}
                                        max={new Date().toISOString().split("T")[0]}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Amount (Rs)</Label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            className="pl-9 font-bold text-lg"
                                            value={formData.amount}
                                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Category & Type */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Category</Label>
                                    <Select
                                        value={formData.categoryId}
                                        onValueChange={(v) => setFormData({ ...formData, categoryId: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Payment Method</Label>
                                    <Select
                                        value={formData.paymentMethod}
                                        onValueChange={(v) => setFormData({ ...formData, paymentMethod: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="cash">Cash</SelectItem>
                                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                            <SelectItem value="cheque">Cheque</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Row 3: Description */}
                            <div className="space-y-2">
                                <Label>Description <span className="text-red-500">*</span></Label>
                                <Input
                                    placeholder="e.g., Electricity Bill - Jan 2025"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            {/* Row 4: Payee & Invoice (Optional) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Paid To (Optional)</Label>
                                    <Input
                                        placeholder="Vendor / Person Name"
                                        value={formData.paidTo}
                                        onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Invoice / Ref # (Optional)</Label>
                                    <Input
                                        placeholder="INV-123456"
                                        value={formData.invoiceNumber}
                                        onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Notes</Label>
                                <Textarea
                                    placeholder="Additional details..."
                                    className="h-20"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>

                            {potentialDuplicate && (
                                <Alert className="bg-amber-50 text-amber-900 border-amber-200">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <AlertTitle>Duplicate Warning</AlertTitle>
                                    <AlertDescription>
                                        A similar expense of <strong>{formatCurrency(potentialDuplicate.amount)}</strong> was recorded today for {potentialDuplicate.category?.category_name}.
                                    </AlertDescription>
                                </Alert>
                            )}

                        </CardContent>
                        <CardFooter className="bg-muted/30 flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={() => setFormData({
                                date: new Date().toISOString().split("T")[0],
                                categoryId: "",
                                amount: "",
                                paymentMethod: "cash",
                                description: "",
                                paidTo: "",
                                invoiceNumber: "",
                                notes: ""
                            })}>Reset</Button>
                            <Button onClick={handleSubmit} disabled={saving || loading}>
                                {saving ? "Saving..." : "Record Expense"}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Recent Expenses List */}
                    <Card>
                        <CardHeader><CardTitle>Today's Expenses</CardTitle></CardHeader>
                        <CardContent>
                            {dailyExpenses.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">No expenses recorded today</div>
                            ) : (
                                <div className="space-y-4">
                                    {dailyExpenses.map(exp => (
                                        <div key={exp.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                            <div className="grid gap-1">
                                                <div className="font-medium">{exp.description}</div>
                                                <div className="text-xs text-muted-foreground flex gap-2">
                                                    <Badge variant="secondary" className="text-[10px] h-5">{exp.category?.category_name}</Badge>
                                                    <span>{new Date(exp.expense_date).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-red-600">-{formatCurrency(exp.amount)}</div>
                                                <div className="text-xs text-muted-foreground capitalize">{exp.payment_method.replace("_", " ")}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                </div>

                {/* RIGHT COLUMN: Impact Analysis */}
                <div className="space-y-6">

                    {/* Impact Card */}
                    <Card className={`border-l-4 ${insufficientFunds ? "border-l-destructive shadow-red-100" : "border-l-primary shadow-blue-50"} shadow-md`}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Financial Impact Analysis</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">

                            {/* Account Balance */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Account ({isCash ? "Cash" : "Bank"})</span>
                                    <span className="font-medium">{formatCurrency(isCash ? currentCash : currentBank)}</span>
                                </div>
                                <div className="flex justify-between text-sm font-bold text-destructive">
                                    <span>- Expense</span>
                                    <span>{formatCurrency(expenseAmount)}</span>
                                </div>
                                <Separator />
                                <div className="flex justify-between font-bold text-lg">
                                    <span className={insufficientFunds ? "text-destructive" : ""}>Remaining</span>
                                    <span className={insufficientFunds ? "text-destructive" : "text-primary"}>
                                        {formatCurrency(balanceAfter)}
                                    </span>
                                </div>
                                {insufficientFunds && (
                                    <p className="text-xs text-destructive font-medium mt-1">Insufficient funds! Reduce amount or change payment method.</p>
                                )}
                            </div>

                            {/* Profit Impact */}
                            <div className="rounded-lg bg-slate-100 p-3 mt-4">
                                <div className="flex items-start gap-2">
                                    <TrendingDown className="h-4 w-4 text-orange-600 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Profit Impact</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Reduces <span className="font-medium text-slate-900">Net Profit</span> by {formatCurrency(expenseAmount)}.
                                            <br />(Does not affect Gross Profit)
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </CardContent>
                    </Card>

                    {/* Budget/Summary Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <PieChartIcon className="h-4 w-4" /> Monthly Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Month-to-Date</p>
                                    <p className="text-2xl font-bold">{formatCurrency(monthlyTotal)}</p>
                                </div>

                                {expenseAmount > 0 && selectedCategory && (
                                    <div className="pt-2 border-t">
                                        <p className="text-xs font-semibold mb-1">Budget Check: {selectedCategory.category_name}</p>
                                        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                            <div className="bg-primary h-full w-3/4 rounded-full"></div>
                                            {/* Mock progress bar for visual consistency */}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            Spending is within normal range (Mock)
                                        </p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
