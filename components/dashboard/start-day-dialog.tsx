"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle2, History } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

interface StartDayDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function StartDayDialog({ open, onOpenChange, onSuccess }: StartDayDialogProps) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    // Data State
    const [previousClosing, setPreviousClosing] = useState<{
        date: string;
        cash: number;
        bank: number;
        status: string;
    } | null>(null)

    const [actualCash, setActualCash] = useState("")
    const [explanation, setExplanation] = useState("")

    const supabase = createClient()

    // Fetch Previous Day Data when dialog opens
    useEffect(() => {
        if (open) {
            setStep(1)
            setError("")
            setActualCash("")
            setExplanation("")
            fetchPreviousDay()
        }
    }, [open])

    const fetchPreviousDay = async () => {
        setLoading(true)
        try {
            // Get the last CLOSED day
            const { data, error } = await supabase
                .from("daily_operations")
                .select("*")
                .eq("status", "closed")
                .order("operation_date", { ascending: false })
                .limit(1)
                .maybeSingle()

            if (error) throw error

            if (data) {
                setPreviousClosing({
                    date: data.operation_date,
                    // Use ACTUAL closing if available, otherwise fallback to calculated logic (or 0)
                    cash: data.closing_cash_actual ?? data.closing_cash ?? 0,
                    bank: data.closing_bank ?? 0,
                    status: data.status
                })
            } else {
                // First day ever? Or after truncate?
                setPreviousClosing({
                    date: "N/A (First Run)",
                    cash: 0,
                    bank: 0,
                    status: "none"
                })
            }
        } catch (err: any) {
            console.error("Error fetching previous day:", err)
            setError("Failed to fetch previous closing balance.")
        } finally {
            setLoading(false)
        }
    }

    // Calculations
    const expectedCash = previousClosing?.cash || 0
    const enteredCash = parseFloat(actualCash) || 0
    const variance = enteredCash - expectedCash
    const variancePercent = expectedCash > 0 ? (variance / expectedCash) * 100 : 0
    const isShort = variance < 0

    // Tolerance Logic (0.5% or Rs. 500, whichever is higher)
    const toleranceAmount = Math.max(500, expectedCash * 0.005)
    const isWithinTolerance = Math.abs(variance) <= toleranceAmount
    const requiresExplanation = !isWithinTolerance && Math.abs(variance) > 0

    const handleStartDay = async () => {
        if (requiresExplanation && !explanation.trim()) {
            setError("Explanation is required for significant variance.")
            return
        }

        setLoading(true)
        setError("")

        try {
            const user = await supabase.auth.getUser()
            const userId = user.data.user?.id
            const today = new Date().toISOString().split("T")[0]

            // 1. Create Daily Operations Record for TODAY
            const { data: dayParams, error: dayError } = await supabase
                .from("daily_operations")
                .insert({
                    operation_date: today,
                    status: "open",
                    opening_cash: expectedCash, // Expected
                    opening_cash_actual: enteredCash, // Actual counted
                    opening_cash_variance: variance,
                    opening_cash_variance_note: explanation,
                    opening_bank: previousClosing?.bank || 0,
                    opened_by: userId,
                    opened_at: new Date().toISOString()
                })
                .select()
                .single()

            if (dayError) throw dayError

            // 2. Log Variance if exists
            if (Math.abs(variance) > 0) {
                await supabase.from("cash_variance_log").insert({
                    variance_date: today,
                    variance_type: "OPENING_CASH",
                    expected_amount: expectedCash,
                    actual_amount: enteredCash,
                    difference: variance,
                    variance_percentage: variancePercent,
                    explanation: explanation,
                    reported_by: userId
                })
            }

            // 3. Audit Log
            await supabase.from("audit_log").insert({
                event_type: "DAY_OPEN",
                action: "Day started",
                performed_by: userId,
                related_record_type: "daily_operations",
                related_record_id: dayParams.id,
                details: {
                    expected: expectedCash,
                    actual: enteredCash,
                    variance: variance
                }
            })

            onSuccess()
            onOpenChange(false)

        } catch (err: any) {
            console.error("Start day error:", err)
            if (err.code === "23505") { // Unique violation
                setError("Day already started! Refresh the page.")
            } else {
                setError(err.message || "Failed to start day")
            }
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (val: number) => `Rs. ${val.toLocaleString("en-PK")}`

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Start New Day</DialogTitle>
                    <DialogDescription>
                        Verify cash in drawer to begin operations for {new Date().toLocaleDateString()}.
                    </DialogDescription>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-6 py-4">
                        {/* Previous Day Summary */}
                        <div className="bg-muted p-4 rounded-lg space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Previous Closing ({previousClosing?.date})</span>
                                <History className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex justify-between items-center font-medium">
                                <span>Expected Opening Cash</span>
                                <span>{formatCurrency(expectedCash)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm text-muted-foreground">
                                <span>Opening Bank Balance</span>
                                <span>{formatCurrency(previousClosing?.bank || 0)}</span>
                            </div>
                        </div>

                        {/* Actual Input */}
                        <div className="space-y-3">
                            <Label htmlFor="actual-cash">Actual Cash in Drawer</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">Rs.</span>
                                <Input
                                    id="actual-cash"
                                    className="pl-10 text-lg font-bold"
                                    placeholder="0"
                                    type="number"
                                    value={actualCash}
                                    onChange={(e) => setActualCash(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Physically count all cash notes and coins in the drawer.
                            </p>
                        </div>

                        {/* Variance Display */}
                        {actualCash && (
                            <div className={`p-4 rounded-lg border ${Math.abs(variance) === 0 ? "bg-green-50 border-green-200" : isWithinTolerance ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium">Variance</span>
                                    <span className={`font-bold ${Math.abs(variance) === 0 ? "text-green-700" : isShort ? "text-red-700" : "text-blue-700"}`}>
                                        {Math.abs(variance) === 0 ? "Perfect Match" : `${isShort ? "-" : "+"}${formatCurrency(Math.abs(variance))}`}
                                    </span>
                                </div>

                                {Math.abs(variance) > 0 && (
                                    <>
                                        <div className="flex items-start gap-2 text-xs mt-2">
                                            {isWithinTolerance ? (
                                                <CheckCircle2 className="w-4 h-4 text-yellow-600 shrink-0" />
                                            ) : (
                                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                            )}
                                            <div>
                                                <p className={isWithinTolerance ? "text-yellow-800" : "text-red-800"}>
                                                    {isWithinTolerance
                                                        ? "Minor variance (within tolerance). You can proceed."
                                                        : "Significant variance detected! Investigation recommended."}
                                                </p>
                                                <p className="text-muted-foreground mt-1">
                                                    Tolerance: {formatCurrency(toleranceAmount)} (0.5%)
                                                </p>
                                            </div>
                                        </div>

                                        {(requiresExplanation || Math.abs(variance) > 0) && (
                                            <div className="mt-3">
                                                <Label className="text-xs">Explanation {requiresExplanation && "*"}</Label>
                                                <Textarea
                                                    placeholder="e.g., Shortage due to change rounding..."
                                                    className="mt-1 h-20 bg-white"
                                                    value={explanation}
                                                    onChange={(e) => setExplanation(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {error && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleStartDay} disabled={loading || !actualCash || (requiresExplanation && !explanation)}>
                        {loading ? "Starting..." : "Confirm & Start Day"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
