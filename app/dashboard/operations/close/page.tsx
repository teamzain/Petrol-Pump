"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    CheckCircle2,
    AlertTriangle,
    Lock,
    ArrowLeft,
    Calculator,
    DollarSign,
    TrendingUp,
    Fuel
} from "lucide-react"

export default function CloseDayPage() {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [step, setStep] = useState(1)
    const [error, setError] = useState("")

    // Data State
    const [dayData, setDayData] = useState<any>(null)
    const [financials, setFinancials] = useState({
        openingCash: 0,
        openingBank: 0,
        totalFuelSales: 0,
        totalProductSales: 0,
        totalExpenses: 0,
        totalCashIn: 0,
        totalCashOut: 0,
        expectedCash: 0
    })

    // Input State
    const [actualCash, setActualCash] = useState("")
    const [actualBank, setActualBank] = useState("")
    const [bankVarianceNote, setBankVarianceNote] = useState("")
    const [cashVarianceNote, setCashVarianceNote] = useState("")

    const today = new Date().toISOString().split("T")[0]

    useEffect(() => {
        fetchDayData()
    }, [])

    const fetchDayData = async () => {
        setLoading(true)
        try {
            // 1. Get Day Record
            const { data: dayRecord, error: dayError } = await supabase
                .from("daily_operations")
                .select("*")
                .eq("operation_date", today)
                .maybeSingle()

            if (dayError) throw dayError
            if (!dayRecord) {
                setError("No active day found for today. Please start the day first.")
                setLoading(false)
                return
            }
            if (dayRecord.status === "closed") {
                setError("Day is already closed!")
                setLoading(false)
                return
            }

            setDayData(dayRecord)

            // 2. Fetch Sales (Fuel)
            const { data: fuelReadings } = await supabase
                .from("nozzle_readings")
                .select("sale_amount")
                .eq("reading_date", today)

            const fuelTotal = fuelReadings?.reduce((sum, r) => sum + (Number(r.sale_amount) || 0), 0) || 0

            // 3. Fetch Product Sales
            const { data: productSales } = await supabase
                .from("sales")
                .select("sale_amount, payment_method")
                .eq("sale_date", today)

            // Assuming all sales are cash for now unless payment_method is specific
            const prodTotal = productSales?.filter(s => s.payment_method !== 'credit').reduce((sum, s) => sum + (Number(s.sale_amount) || 0), 0) || 0

            // 4. Fetch Expenses & Purchases (Cash Out)
            // Check transactions table for accurate cash flow
            const { data: cashTxns } = await supabase
                .from("transactions")
                .select("amount, transaction_type, payment_method")
                .gte("transaction_date", `${today}T00:00:00`)
                .lte("transaction_date", `${today}T23:59:59`)
                .eq("payment_method", "cash") // Only count CASH transactions

            // Simple logic: Income = Cash In, Expense = Cash Out
            const cashIn = cashTxns?.filter(t => t.transaction_type === 'income').reduce((sum, t) => sum + Number(t.amount), 0) || 0
            const cashOut = cashTxns?.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0) || 0

            // Combine logic
            // Opening + (Fuel Sales [assume cash]) + (Product Sales [assume cash]) - Expenses(cash)
            // Note: Fuel sales might not be in transactions table yet depending on implementation.
            // Usually Fuel Sales are added to cash daily.
            // Let's assume Fuel Sales = Cash In (unless credit). petrol pump usually cash.

            const opening = Number(dayRecord.opening_cash_actual || 0)

            // Refined Calc:
            // If transactions table handles everything, just use that.
            // But usually Nozzle Readings are separate until closed.
            // So: Expected = Opening + FuelSales + ProductSales(Cash) - Expenses(Cash)

            // Check if expenses in transactions covers purhcases? likely yes.

            const calculatedExpected = opening + fuelTotal + prodTotal - cashOut

            setFinancials({
                openingCash: opening,
                openingBank: Number(dayRecord.opening_bank || 0),
                totalFuelSales: fuelTotal,
                totalProductSales: prodTotal,
                totalExpenses: cashOut,
                totalCashIn: fuelTotal + prodTotal,
                totalCashOut: cashOut,
                expectedCash: calculatedExpected
            })

        } catch (err) {
            console.error("Error fetching data:", err)
            setError("Failed to load daily data.")
        } finally {
            setLoading(false)
        }
    }

    const handleCloseDay = async () => {
        setSubmitting(true)
        setError("")

        try {
            const enteredCashVal = Number(actualCash)
            const cashVariance = enteredCashVal - financials.expectedCash

            // 1. Update Daily Operations
            const { error: updateError } = await supabase
                .from("daily_operations")
                .update({
                    status: "closed",
                    closing_cash: financials.expectedCash, // Expected
                    closing_cash_actual: enteredCashVal, // Actual
                    closing_cash_variance: cashVariance,
                    closing_cash_variance_note: cashVarianceNote,
                    total_sales: financials.totalFuelSales + financials.totalProductSales, // Total Revenue
                    total_expenses: financials.totalExpenses,
                    closed_at: new Date().toISOString(),
                    day_locked: true,
                    locked_at: new Date().toISOString()
                })
                .eq("id", dayData.id)

            if (updateError) throw updateError

            // 2. Log Variance if significant
            if (Math.abs(cashVariance) > 0) {
                await supabase.from("cash_variance_log").insert({
                    variance_date: today,
                    variance_type: "CLOSING_CASH",
                    expected_amount: financials.expectedCash,
                    actual_amount: enteredCashVal,
                    difference: cashVariance,
                    explanation: cashVarianceNote,
                    reported_by: (await supabase.auth.getUser()).data.user?.id
                })
            }

            // 3. Update Balance History (Daily Balance Table or Opening Balance for Next Day)
            // We rely on `daily_operations` as the primary record now.

            router.push("/dashboard")

        } catch (err: any) {
            console.error("Close day error:", err)
            setError("Failed to close day: " + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const formatCurrency = (val: number) => `Rs. ${val.toLocaleString("en-PK")}`

    const cashVariance = Number(actualCash) - financials.expectedCash
    const isCashShort = cashVariance < 0
    const tolerance = Math.max(500, financials.expectedCash * 0.005)
    const isCriticalVariance = Math.abs(cashVariance) > tolerance

    if (loading) return <div className="p-8 text-center">Loading daily data...</div>
    if (error) return (
        <div className="p-8 flex justify-center">
            <Alert variant="destructive" className="max-w-md">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                <div className="mt-4">
                    <Button variant="outline" onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
                </div>
            </Alert>
        </div>
    )

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Close Day Operations</h1>
                        <p className="text-muted-foreground">Reconcile cash and finalize accounts for {today}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <div className="flex items-center justify-end gap-2 text-green-600 font-bold">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Active
                    </div>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Step Indicator (Desktop) */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle className="text-lg">Closing Process</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {[
                            { id: 1, label: "Day Summary", icon: Calculator },
                            { id: 2, label: "Cash Reconciliation", icon: DollarSign },
                            { id: 3, label: "Final Review", icon: CheckCircle2 },
                        ].map((s) => (
                            <div
                                key={s.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${step === s.id ? "bg-primary/5 border-primary text-primary" : step > s.id ? "bg-muted text-muted-foreground border-transparent" : "opacity-50 border-transparent"}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === s.id ? "bg-primary text-primary-foreground" : step > s.id ? "bg-muted-foreground/20" : "bg-muted"}`}>
                                    {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : s.id}
                                </div>
                                <span className="font-medium">{s.label}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Main Content Area */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>{step === 1 ? "Flash Report" : step === 2 ? "Cash Reconciliation" : "Final Verification"}</CardTitle>
                        <CardDescription>
                            {step === 1 ? "Review today's total activity." :
                                step === 2 ? "Verify physical cash against expected totals." :
                                    "Confirm and lock the day."}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        {step === 1 && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-muted/20 rounded-lg space-y-1">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Opening Cash</p>
                                        <p className="text-xl font-mono font-bold">{formatCurrency(financials.openingCash)}</p>
                                    </div>
                                    <div className="p-4 bg-muted/20 rounded-lg space-y-1">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Sales</p>
                                        <p className="text-xl font-mono font-bold text-green-600">+{formatCurrency(financials.totalCashIn)}</p>
                                    </div>
                                    <div className="p-4 bg-muted/20 rounded-lg space-y-1">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Expenses</p>
                                        <p className="text-xl font-mono font-bold text-red-600">-{formatCurrency(financials.totalCashOut)}</p>
                                    </div>
                                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
                                        <p className="text-xs text-primary uppercase tracking-wider font-bold">Expected Closing</p>
                                        <p className="text-xl font-mono font-bold text-primary">{formatCurrency(financials.expectedCash)}</p>
                                    </div>
                                </div>
                                <Alert>
                                    <AlertTitle>Check Pending Items</AlertTitle>
                                    <AlertDescription>
                                        Ensure all nozzle readings and expense receipts for today have been entered before proceeding.
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                                    <span className="font-medium">Expected Cash</span>
                                    <span className="font-bold font-mono text-lg">{formatCurrency(financials.expectedCash)}</span>
                                </div>

                                <div className="space-y-4">
                                    <Label>Actual Cash Count</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-muted-foreground font-bold">Rs.</span>
                                        <Input
                                            className="pl-10 text-xl font-bold h-12"
                                            placeholder="0"
                                            type="number"
                                            value={actualCash}
                                            onChange={(e) => setActualCash(e.target.value)}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">Count notes and coins in the drawer.</p>
                                </div>

                                {actualCash && (
                                    <div className={`p-4 rounded-lg border ${Math.abs(cashVariance) === 0 ? "bg-green-50 border-green-200" : isCriticalVariance ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-sm">Variance</span>
                                            <span className={`font-bold ${Math.abs(cashVariance) === 0 ? "text-green-700" : "text-foreground"}`}>
                                                {Math.abs(cashVariance) === 0 ? "Matched" : `${isCashShort ? "Shortage" : "Excess"}: ${formatCurrency(Math.abs(cashVariance))}`}
                                            </span>
                                        </div>
                                        {Math.abs(cashVariance) > 0 && (
                                            <div className="mt-4">
                                                <Label className="text-xs mb-1.5 block">Explanation for variance {isCriticalVariance && "*"}</Label>
                                                <Textarea
                                                    placeholder="Reason for discrepancy..."
                                                    value={cashVarianceNote}
                                                    onChange={(e) => setCashVarianceNote(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-6 text-center py-6">
                                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                                    <Lock className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-bold">Ready to Close Day?</h3>
                                <p className="text-muted-foreground max-w-sm mx-auto">
                                    This action will lock today's operations. You will not be able to edit transactions or sales for {today} after this.
                                </p>
                                <div className="bg-muted inline-block px-6 py-2 rounded-full font-mono font-medium mt-4">
                                    Final Cash: {formatCurrency(Number(actualCash))}
                                </div>
                            </div>
                        )}
                    </CardContent>

                    <CardFooter className="flex justify-between border-t pt-6">
                        {step > 1 ? (
                            <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>
                        ) : (
                            <Button variant="outline" disabled>Back</Button>
                        )}

                        {step < 3 ? (
                            <Button onClick={() => setStep(step + 1)} disabled={step === 2 && !actualCash}>Next Step</Button>
                        ) : (
                            <Button
                                variant="destructive"
                                onClick={handleCloseDay}
                                disabled={submitting || (isCriticalVariance && !cashVarianceNote)}
                            >
                                {submitting ? "Closing..." : "Close Day & Lock"}
                            </Button>
                        )}
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
