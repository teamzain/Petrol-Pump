"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import {
  Wallet,
  Banknote,
  Calendar,
  Lock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Save,
  RefreshCw,
  ArrowRightLeft,
  PlusCircle
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface DailyBalance {
  id: string
  balance_date: string
  cash_opening: number
  cash_closing: number | null
  bank_opening: number
  bank_closing: number | null
  is_closed: boolean
  closed_by: string | null
  closed_at: string | null
  notes: string | null
}

export default function BalanceManagementPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [todayBalance, setTodayBalance] = useState<DailyBalance | null>(null)
  const [balanceHistory, setBalanceHistory] = useState<DailyBalance[]>([])
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [openingDialogOpen, setOpeningDialogOpen] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)

  // Transaction State
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [transactionType, setTransactionType] = useState<"deposit" | "add_cash" | "add_bank">("deposit")
  const [transactionData, setTransactionData] = useState({
    amount: "",
    description: "",
  })

  const [openingBalances, setOpeningBalances] = useState({
    cash: "0",
    bank: "0"
  })

  const supabase = createClient()
  const today = new Date().toISOString().split("T")[0]

  const fetchBalances = useCallback(async () => {
    setLoading(true)

    // 1. Identify all previous unclosed days and finalized the most recent one for rollover
    const { data: allPrevBalances } = await supabase
      .from("daily_balances")
      .select("*")
      .lt("balance_date", today)
      .order("balance_date", { ascending: false })

    let previousClosing = { cash: 0, bank: 0 }

    if (allPrevBalances && allPrevBalances.length > 0) {
      // The first one in the list is the most recent previous day
      const lastRecord = allPrevBalances[0]
      previousClosing = {
        cash: lastRecord.cash_closing ?? lastRecord.cash_opening ?? 0,
        bank: lastRecord.bank_closing ?? lastRecord.bank_opening ?? 0
      }

      // Close all unclosed previous days
      for (const record of allPrevBalances) {
        if (!record.is_closed) {
          console.log(`Attempting to close record for ${record.balance_date}`)
          const { error: closeError } = await supabase
            .from("daily_balances")
            .update({
              is_closed: true,
              cash_closing: record.cash_closing ?? record.cash_opening,
              bank_closing: record.bank_closing ?? record.bank_opening,
            })
            .eq("id", record.id)

          if (closeError) {
            console.error(`Auto-closure failed for ${record.balance_date}:`, closeError)
            setError(`Failed to close ${record.balance_date}: ${closeError.message}`)
          } else {
            console.log(`Successfully closed record for ${record.balance_date}`)
          }
        }
      }
    }

    // 2. Fetch or Create today's balance
    const { data: todayData } = await supabase
      .from("daily_balances")
      .select("*")
      .eq("balance_date", today)
      .limit(1)

    if (todayData && todayData.length > 0) {
      setTodayBalance(todayData[0])
    } else {
      // Create new record for today using previous final values
      console.log("Creating new record for today...")
      const { data: newBalance, error: createError } = await supabase
        .from("daily_balances")
        .insert({
          balance_date: today,
          cash_opening: previousClosing.cash,
          bank_opening: previousClosing.bank,
          cash_closing: previousClosing.cash,
          bank_closing: previousClosing.bank,
          is_closed: false
        })
        .select()
        .single()

      if (createError) {
        console.error("Create today failed:", createError)
        setError("Failed to initialize today: " + createError.message)
      } else if (newBalance) {
        setTodayBalance(newBalance)
      }
    }

    // Fetch balance history (last 30 days)
    const { data: historyData } = await supabase
      .from("daily_balances")
      .select("*")
      .order("balance_date", { ascending: false })
      .limit(30)

    if (historyData) setBalanceHistory(historyData)

    setLoading(false)
  }, [supabase, today])

  useEffect(() => {
    fetchBalances()

    const channel = supabase
      .channel('balance_page_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_balances',
        },
        () => {
          fetchBalances()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchBalances, supabase])

  const handleSetOpeningBalance = async () => {
    setSaving(true)
    setError("")
    setSuccess("")

    try {
      const cashOpening = parseFloat(openingBalances.cash) || 0
      const bankOpening = parseFloat(openingBalances.bank) || 0

      if (todayBalance) {
        // Update existing today's balance
        // Calculate delta to preserve sales/transactions (movements)
        const oldCashOpening = todayBalance.cash_opening || 0
        const oldBankOpening = todayBalance.bank_opening || 0

        const cashDelta = cashOpening - oldCashOpening
        const bankDelta = bankOpening - oldBankOpening

        const updatePayload: any = {
          cash_opening: cashOpening,
          bank_opening: bankOpening,
        }

        // Only adjust closing if it exists (meaning transactions/sales happened)
        // If it's null, it implies it equals opening, so we leave it null (or set to new opening, 
        // but leaving null allows it to float with opening if that's the logic, 
        // though typically we treat null as 'no closing set').
        // However, if we want to "perform operation on today's opening", we should ensure closing reflects that.
        if (todayBalance.cash_closing !== null) {
          updatePayload.cash_closing = Number(todayBalance.cash_closing) + cashDelta
        }

        if (todayBalance.bank_closing !== null) {
          updatePayload.bank_closing = Number(todayBalance.bank_closing) + bankDelta
        }

        const { error: updateError } = await supabase
          .from("daily_balances")
          .update(updatePayload)
          .eq("id", todayBalance.id)

        if (updateError) throw updateError
      } else {
        // Create new balance record for today
        const { error: insertError } = await supabase
          .from("daily_balances")
          .insert({
            balance_date: today,
            cash_opening: cashOpening,
            bank_opening: bankOpening,
          })

        if (insertError) throw insertError
      }

      setSuccess("Opening balance set successfully!")
      setOpeningDialogOpen(false)
      fetchBalances()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set opening balance")
    } finally {
      setSaving(false)
    }
  }

  const handleCloseDay = async () => {
    setSaving(true)
    setError("")

    try {
      if (!todayBalance) {
        throw new Error("No balance record found for today")
      }

      const user = await supabase.auth.getUser()

      const cashClosing = todayBalance.cash_closing ?? todayBalance.cash_opening
      const bankClosing = todayBalance.bank_closing ?? todayBalance.bank_opening

      const { error: updateError } = await supabase
        .from("daily_balances")
        .update({
          cash_closing: cashClosing,
          bank_closing: bankClosing,
          is_closed: true,
          closed_at: new Date().toISOString(),
          closed_by: user.data.user?.id || null,
        })
        .eq("id", todayBalance.id)

      if (updateError) throw updateError

      setSuccess("Day closed successfully! Tomorrow's opening balance will be set automatically.")
      setCloseDialogOpen(false)
      fetchBalances()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close day")
    } finally {
      setSaving(false)
    }
  }

  const handleTransaction = async () => {
    setSaving(true)
    setError("")

    try {
      if (!todayBalance) throw new Error("No balance record for today. Please set opening balance first.")

      const amount = parseFloat(transactionData.amount)
      if (!amount || amount <= 0) throw new Error("Please enter a valid amount")
      if (!transactionData.description) throw new Error("Please enter a description/reason")

      const user = await supabase.auth.getUser()
      const userId = user.data.user?.id

      // 1. Log Transaction
      const { error: txError } = await supabase.from("transactions").insert({
        transaction_type: transactionType === "deposit" ? "transfer" : "income",
        category: transactionType === "deposit" ? "bank_deposit" : "manual_adjustment",
        description: transactionData.description,
        amount: amount,
        created_by: userId,
      })
      if (txError) throw txError

      // 2. Update Daily Balance
      let updateData = {}
      const currentCash = todayBalance.cash_closing ?? todayBalance.cash_opening ?? 0
      const currentBank = todayBalance.bank_closing ?? todayBalance.bank_opening ?? 0

      if (transactionType === "deposit") {
        // Cash -> Bank
        if (currentCash < amount) throw new Error("Insufficient cash balance")
        updateData = {
          cash_closing: currentCash - amount,
          bank_closing: currentBank + amount
        }
      } else if (transactionType === "add_cash") {
        updateData = { cash_closing: currentCash + amount }
      } else if (transactionType === "add_bank") {
        updateData = { bank_closing: currentBank + amount }
      }

      const { error: updateError } = await supabase
        .from("daily_balances")
        .update(updateData)
        .eq("id", todayBalance.id)

      if (updateError) throw updateError

      setSuccess("Transaction recorded successfully!")
      setTransactionDialogOpen(false)
      setTransactionData({ amount: "", description: "" })
      fetchBalances()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to record transaction")
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "-"
    return `Rs. ${Number(amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const currentCashBalance = todayBalance?.cash_closing ?? todayBalance?.cash_opening ?? 0
  const currentBankBalance = todayBalance?.bank_closing ?? todayBalance?.bank_opening ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Balance Management</h1>
        <p className="text-muted-foreground">
          Manage daily cash and bank balances with automatic rollover
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-primary bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Action Buttons Row */}
      <div className="flex justify-end gap-2">
        <Button onClick={() => {
          setTransactionType("deposit")
          setTransactionDialogOpen(true)
        }}>
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Transfer to Bank
        </Button>
        <Button variant="outline" onClick={() => {
          setTransactionType("add_cash")
          setTransactionDialogOpen(true)
        }}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Balance
        </Button>
      </div>

      {/* Current Balance Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Cash Balance
            </CardTitle>
            {todayBalance?.is_closed && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Closed
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(currentCashBalance)}</div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Opening:</span>
                <span>{formatCurrency(todayBalance?.cash_opening ?? 0)}</span>
              </div>
              {todayBalance?.cash_closing !== null && (
                <div className="flex justify-between">
                  <span>Closing:</span>
                  <span>{formatCurrency(todayBalance?.cash_closing)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Bank Balance
            </CardTitle>
            {todayBalance?.is_closed && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Closed
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(currentBankBalance)}</div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Opening:</span>
                <span>{formatCurrency(todayBalance?.bank_opening ?? 0)}</span>
              </div>
              {todayBalance?.bank_closing !== null && (
                <div className="flex justify-between">
                  <span>Closing:</span>
                  <span>{formatCurrency(todayBalance?.bank_closing)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Today - {new Date().toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </CardTitle>
          <CardDescription>
            {todayBalance?.is_closed
              ? "Today's books are closed. Balances will roll over to tomorrow automatically."
              : "Manage today's opening balance and close the day when done."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            onClick={() => {
              setOpeningBalances({
                cash: (todayBalance?.cash_opening || 0).toString(),
                bank: (todayBalance?.bank_opening || 0).toString()
              })
              setOpeningDialogOpen(true)
            }}
            disabled={todayBalance?.is_closed}
            variant={todayBalance?.is_closed ? "secondary" : "default"}
          >
            <Save className="mr-2 h-4 w-4" />
            Set Opening Balance
          </Button>
          <Button
            onClick={() => setCloseDialogOpen(true)}
            disabled={!todayBalance || todayBalance?.is_closed}
            variant="outline"
          >
            <Lock className="mr-2 h-4 w-4" />
            Close Day
          </Button>
          <Button
            onClick={fetchBalances}
            variant="ghost"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Balance History */}
      <Card>
        <CardHeader>
          <CardTitle>Balance History</CardTitle>
          <CardDescription>
            View historical daily balances. Previous days cannot be edited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : balanceHistory.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No balance records found</p>
              <Button
                variant="link"
                className="mt-1"
                onClick={() => setOpeningDialogOpen(true)}
              >
                Set today's opening balance
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Cash Opening</TableHead>
                    <TableHead className="text-right">Cash Closing</TableHead>
                    <TableHead className="text-right">Bank Opening</TableHead>
                    <TableHead className="text-right">Bank Closing</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceHistory.map((balance) => {
                    const isToday = balance.balance_date === today
                    const cashChange = (balance.cash_closing ?? balance.cash_opening) - balance.cash_opening
                    const bankChange = (balance.bank_closing ?? balance.bank_opening) - balance.bank_opening

                    return (
                      <TableRow key={balance.id} className={isToday ? "bg-muted/50" : ""}>
                        <TableCell className="font-medium">
                          {new Date(balance.balance_date).toLocaleDateString("en-PK", {
                            weekday: "short",
                            month: "short",
                            day: "numeric"
                          })}
                          {isToday && <Badge variant="outline" className="ml-2">Today</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(balance.cash_opening)}</TableCell>
                        <TableCell className="text-right">
                          {balance.cash_closing !== null ? (
                            <span className="flex items-center justify-end gap-1">
                              {formatCurrency(balance.cash_closing)}
                              {cashChange !== 0 && (
                                <span className={`text-xs ${cashChange > 0 ? "text-primary" : "text-destructive"}`}>
                                  {cashChange > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(balance.bank_opening)}</TableCell>
                        <TableCell className="text-right">
                          {balance.bank_closing !== null ? (
                            <span className="flex items-center justify-end gap-1">
                              {formatCurrency(balance.bank_closing)}
                              {bankChange !== 0 && (
                                <span className={`text-xs ${bankChange > 0 ? "text-primary" : "text-destructive"}`}>
                                  {bankChange > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {balance.is_closed ? (
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Closed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Open
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Set Opening Balance Dialog */}
      <Dialog open={openingDialogOpen} onOpenChange={setOpeningDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Opening Balance</DialogTitle>
            <DialogDescription>
              Set today's opening balance for cash and bank accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cash_opening" className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Cash Opening Balance
              </Label>
              <Input
                id="cash_opening"
                type="number"
                step="0.01"
                min="0"
                value={openingBalances.cash}
                onChange={(e) => setOpeningBalances({ ...openingBalances, cash: e.target.value })}
                placeholder="Enter cash balance"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_opening" className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Bank Opening Balance
              </Label>
              <Input
                id="bank_opening"
                type="number"
                step="0.01"
                min="0"
                value={openingBalances.bank}
                onChange={(e) => setOpeningBalances({ ...openingBalances, bank: e.target.value })}
                placeholder="Enter bank balance"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetOpeningBalance} disabled={saving}>
              {saving ? "Saving..." : "Save Opening Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Day Confirmation Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Day</DialogTitle>
            <DialogDescription>
              Are you sure you want to close today's books? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Once closed, you cannot edit today's balances. Tomorrow's opening balance will be automatically set to today's closing balance.
              </AlertDescription>
            </Alert>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Closing:</span>
                <span className="font-medium">{formatCurrency(currentCashBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank Closing:</span>
                <span className="font-medium">{formatCurrency(currentBankBalance)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCloseDay} disabled={saving}>
              {saving ? "Closing..." : "Close Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transactionType === "deposit" ? "Transfer Cash to Bank" :
                transactionType === "add_cash" ? "Add Cash Balance" : "Add Bank Balance"}
            </DialogTitle>
            <DialogDescription>
              {transactionType === "deposit"
                ? "Record a deposit of cash earnings into the bank account."
                : "Manually add funds to the balance with a reason."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {transactionType !== "deposit" && (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={transactionType}
                  onValueChange={(v: any) => setTransactionType(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add_cash">Add Cash</SelectItem>
                    <SelectItem value="add_bank">Add Bank Balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="tx_amount">Amount</Label>
              <Input
                id="tx_amount"
                type="number"
                min="0"
                value={transactionData.amount}
                onChange={(e) => setTransactionData({ ...transactionData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx_desc">Reason / Description</Label>
              <Textarea
                id="tx_desc"
                value={transactionData.description}
                onChange={(e) => setTransactionData({ ...transactionData, description: e.target.value })}
                placeholder="e.g., Owner contribution, Night deposit..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleTransaction} disabled={saving}>
              {saving ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
