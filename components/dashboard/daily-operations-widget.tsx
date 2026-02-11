"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    Sun,
    Moon,
    AlertTriangle,
    CheckCircle2,
    Lock,
    PlayCircle,
    TrendingUp,
    DollarSign
} from "lucide-react"
import { StartDayDialog } from "./start-day-dialog"
import { useRouter } from "next/navigation"

export function DailyOperationsWidget() {
    const [loading, setLoading] = useState(true)
    const [dayStatus, setDayStatus] = useState<"not_started" | "open" | "closed" | "locked">("not_started")
    const [warning, setWarning] = useState<string | null>(null)
    const [todayData, setTodayData] = useState<any>(null)
    const [startDayOpen, setStartDayOpen] = useState(false)

    const supabase = createClient()
    const router = useRouter()
    const today = new Date().toISOString().split("T")[0]

    useEffect(() => {
        fetchStatus()

        // Subscribe to changes
        const channel = supabase
            .channel('daily_ops_widget')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_operations' }, () => {
                fetchStatus()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase])

    const fetchStatus = async () => {
        setLoading(true)
        try {
            // 1. Check Previous Day (if not closed, warn)
            const { data: prevDay } = await supabase
                .from("daily_operations")
                .select("*")
                .lt("operation_date", today)
                .order("operation_date", { ascending: false })
                .limit(1)
                .maybeSingle()

            if (prevDay && prevDay.status === "open") {
                setWarning(`Previous day (${new Date(prevDay.operation_date).toLocaleDateString()}) is still OPEN. Please close it first.`)
            } else {
                setWarning(null)
            }

            // 2. Check Today
            const { data: currentDay } = await supabase
                .from("daily_operations")
                .select("*")
                .eq("operation_date", today)
                .maybeSingle()

            if (currentDay) {
                setTodayData(currentDay)
                if (currentDay.day_locked) setDayStatus("locked")
                else if (currentDay.status === "closed") setDayStatus("closed")
                else setDayStatus("open")
            } else {
                setDayStatus("not_started")
                setTodayData(null)
            }

        } catch (err) {
            console.error("Error fetching day status:", err)
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (val: number) => `Rs. ${(val || 0).toLocaleString("en-PK")}`

    if (loading) return <div className="h-32 bg-muted/20 animate-pulse rounded-lg" />

    return (
        <Card className={`border-2 ${dayStatus === "open" ? "border-green-500/20" : dayStatus === "not_started" ? "border-amber-500/20" : "border-slate-200"}`}>
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            {dayStatus === "open" ? <Sun className="w-5 h-5 text-green-500" /> :
                                dayStatus === "closed" ? <Moon className="w-5 h-5 text-slate-500" /> :
                                    <PlayCircle className="w-5 h-5 text-amber-500" />}
                            {dayStatus === "open" ? "Operations Active" :
                                dayStatus === "closed" ? "Day Closed" :
                                    "Start New Day"}
                        </CardTitle>
                        <CardDescription>
                            {new Date().toLocaleDateString("en-PK", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </CardDescription>
                    </div>
                    <Badge variant={dayStatus === "open" ? "default" : "secondary"} className="uppercase text-xs font-bold tracking-wider">
                        {dayStatus.replace("_", " ")}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="pb-3">
                {warning && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Action Required</AlertTitle>
                        <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                )}

                {dayStatus === "not_started" ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
                        <div className="p-3 bg-amber-100 rounded-full text-amber-600">
                            <Sun className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="font-medium">Ready to begin operations?</p>
                            <p className="text-sm text-muted-foreground">Initialize opening balances and verify cash to start tracking.</p>
                        </div>
                        <Button size="lg" className="w-full max-w-xs" onClick={() => setStartDayOpen(true)} disabled={!!warning}>
                            Start Day
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-muted/30 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">Opening Cash</p>
                            <p className="text-lg font-bold">{formatCurrency(todayData?.opening_cash_actual)}</p>
                        </div>
                        {/* These running totals would need to be updated live or fetched. For now using static placehoders if data is null */}
                        <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <DollarSign className="w-3 h-3" /> Total Sales
                            </p>
                            <p className="text-lg font-bold text-primary">{formatCurrency(todayData?.total_sales)}</p>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" /> Expenses
                            </p>
                            <p className="text-lg font-bold text-orange-700">{formatCurrency(todayData?.total_expenses)}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <p className="text-xs text-muted-foreground">Net Profit</p>
                            <p className="text-lg font-bold text-slate-700">
                                {formatCurrency((todayData?.gross_profit || 0) - (todayData?.total_expenses || 0))}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>

            {(dayStatus === "open" || dayStatus === "closed") && (
                <CardFooter className="bg-muted/20 border-t pt-3 flex justify-between">
                    <p className="text-xs text-muted-foreground">
                        Started by: <span className="font-medium">Admin</span> at {new Date(todayData?.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {dayStatus === "open" && (
                        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/operations/close")}>
                            <Lock className="w-3 h-3 mr-2" />
                            Close Day
                        </Button>
                    )}
                </CardFooter>
            )}

            <StartDayDialog
                open={startDayOpen}
                onOpenChange={setStartDayOpen}
                onSuccess={fetchStatus}
            />
        </Card>
    )
}
