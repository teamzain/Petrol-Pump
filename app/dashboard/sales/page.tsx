"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Fuel,
  Package,
  TrendingUp,
  Gauge,
  Calendar as CalendarIcon,
  RefreshCw,
  Save,
  Unlock,
  Lock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Droplets,
  Layers,
  ArrowRight
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { UserPasswordDialog } from "@/components/auth/user-password-dialog"

// --- Types ---

interface Nozzle {
  id: string
  nozzle_number: string
  pump_number: string | null
  nozzle_side: string | null
  product_id: string
  current_reading: number
  status: string
  products: {
    id: string
    product_name: string
    selling_price: number
    weighted_avg_cost: number
    current_stock: number
  }
}

interface NozzleReading {
  id?: string
  nozzle_id: string
  opening_reading: number
  closing_reading: string
  liters_sold: number
  sales_amount: number
}

interface OilProduct {
  id: string
  product_name: string
  selling_price: number
  current_stock: number
  unit: string
  category: string
}

interface ProductSale {
  id: string
  total: number
}

interface DailyBalance {
  id: string
  cash_opening: number
  cash_closing: number | null
  bank_opening: number
  bank_closing: number | null
}

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState("fuel")
  const [nozzles, setNozzles] = useState<Nozzle[]>([])
  const [oilProducts, setOilProducts] = useState<OilProduct[]>([])
  const [nozzleReadings, setNozzleReadings] = useState<NozzleReading[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [productSaleDialogOpen, setProductSaleDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])

  // Unlock Logic State
  const [unlockedNozzles, setUnlockedNozzles] = useState<Set<string>>(new Set())
  const [nozzleToUnlock, setNozzleToUnlock] = useState<string | null>(null)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)

  const supabase = createClient()

  // --- Utilities ---
  const formatCurrency = (amount: number) =>
    `Rs. ${amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    setLoading(true)
    setUnlockedNozzles(new Set())
    setError("")

    try {
      const { data: nozzlesData } = await supabase
        .from("nozzles")
        .select("*, products(id, product_name, selling_price, weighted_avg_cost, current_stock)")
        .eq("status", "active")
        .order("pump_number")
        .order("nozzle_side")

      const { data: readingsData } = await supabase
        .from("nozzle_readings")
        .select("*")
        .eq("reading_date", selectedDate)

      if (nozzlesData) {
        setNozzles(nozzlesData as Nozzle[])
        setNozzleReadings(nozzlesData.map(n => {
          const existing = readingsData?.find(r => r.nozzle_id === n.id)
          if (existing) {
            return {
              id: existing.id,
              nozzle_id: n.id,
              opening_reading: existing.opening_reading,
              closing_reading: existing.closing_reading.toString(),
              liters_sold: existing.quantity_sold,
              sales_amount: existing.sale_amount
            }
          }
          return {
            nozzle_id: n.id,
            opening_reading: n.current_reading,
            closing_reading: "",
            liters_sold: 0,
            sales_amount: 0,
          }
        }))
      }

      const { data: oilData } = await supabase
        .from("products")
        .select("*")
        .eq("status", "active")
        .eq("product_type", "oil_lubricant")
        .order("product_name")
      if (oilData) setOilProducts(oilData)

    } catch (err: any) {
      setError("Failed to fetch sales data.")
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // --- Handlers ---
  const handleUnlockRequest = (nozzleId: string) => {
    setNozzleToUnlock(nozzleId)
    setAuthDialogOpen(true)
  }

  const handleAuthSuccess = () => {
    if (nozzleToUnlock) {
      setUnlockedNozzles(prev => new Set(prev).add(nozzleToUnlock!))
      setNozzleToUnlock(null)
      setSuccess("Unlocked for editing.")
      setTimeout(() => setSuccess(""), 3000)
    }
  }

  const handleReadingChange = (nozzleId: string, value: string) => {
    setNozzleReadings(prev => prev.map(r => {
      if (r.nozzle_id !== nozzleId) return r
      if (r.id && !unlockedNozzles.has(nozzleId)) return r

      const closing = parseFloat(value) || 0
      const liters = closing > r.opening_reading ? closing - r.opening_reading : 0
      const nozzle = nozzles.find(n => n.id === nozzleId)
      const sellingPrice = nozzle?.products?.selling_price || 0

      return {
        ...r,
        closing_reading: value,
        liters_sold: liters,
        sales_amount: liters * sellingPrice,
      }
    }))
  }

  const handleSubmitFuelSales = () => {
    const readingsToSave = nozzleReadings.filter(r => r.liters_sold > 0 && (!r.id || unlockedNozzles.has(r.nozzle_id)))
    if (readingsToSave.length === 0) {
      setError("Please enter closing readings to record sales.")
      return
    }

    // Validation
    for (const r of readingsToSave) {
      if (parseFloat(r.closing_reading) < r.opening_reading) {
        const n = nozzles.find(noz => noz.id === r.nozzle_id)
        setError(`Closing reading for Nozzle ${n?.nozzle_number} is less than opening.`)
        return
      }
    }

    setError("")
    setConfirmDialogOpen(true)
  }

  const confirmFuelSales = async () => {
    setSaving(true)
    setError("")
    try {
      const salesReadings = nozzleReadings.filter(r => r.liters_sold > 0 && (!r.id || unlockedNozzles.has(r.nozzle_id)))

      for (const reading of salesReadings) {
        const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
        if (!nozzle) continue

        const closing = parseFloat(reading.closing_reading)
        const product = nozzle.products

        if (reading.id) {
          await supabase.from("nozzle_readings").update({
            closing_reading: closing,
            quantity_sold: reading.liters_sold,
            sale_amount: reading.sales_amount,
          }).eq("id", reading.id)
        } else {
          const costPrice = product.weighted_avg_cost || 0
          const totalCogs = reading.liters_sold * costPrice

          await supabase.from("nozzle_readings").insert({
            nozzle_id: reading.nozzle_id,
            reading_date: selectedDate,
            opening_reading: reading.opening_reading,
            closing_reading: closing,
            quantity_sold: reading.liters_sold,
            selling_price: product.selling_price,
            sale_amount: reading.sales_amount,
            cogs_per_unit: costPrice,
            total_cogs: totalCogs,
            gross_profit: reading.sales_amount - totalCogs,
          })

          await supabase.from("nozzles").update({ current_reading: closing }).eq("id", nozzle.id)

          await supabase.from("sales").insert({
            sale_date: selectedDate,
            product_id: product.id,
            quantity: reading.liters_sold,
            unit_price: product.selling_price,
            total_amount: reading.sales_amount,
            cost_price: costPrice,
            profit: reading.sales_amount - (reading.liters_sold * costPrice),
            sale_type: "fuel",
            nozzle_id: nozzle.id,
            payment_method: "cash",
          })

          await supabase.from("products").update({
            current_stock: product.current_stock - reading.liters_sold,
          }).eq("id", product.id)
        }
      }

      // Update Daily Balance (Cash)
      const totalFuelSales = salesReadings.reduce((sum, r) => sum + r.sales_amount, 0)
      if (totalFuelSales > 0) {
        // Find existing balance for today
        const { data: balanceData } = await supabase
          .from("daily_balances")
          .select("*")
          .eq("balance_date", selectedDate)
          .maybeSingle()

        if (balanceData) {
          const currentCash = balanceData.cash_closing ?? balanceData.cash_opening ?? 0
          await supabase
            .from("daily_balances")
            .update({ cash_closing: currentCash + totalFuelSales })
            .eq("id", balanceData.id)
        } else {
          // If no balance record exists, fetch most recent previous record for rollover
          const { data: prevRecord } = await supabase
            .from("daily_balances")
            .select("*")
            .lt("balance_date", selectedDate)
            .order("balance_date", { ascending: false })
            .limit(1)

          const prevCash = prevRecord?.[0]?.cash_closing ?? prevRecord?.[0]?.cash_opening ?? 0
          const prevBank = prevRecord?.[0]?.bank_closing ?? prevRecord?.[0]?.bank_opening ?? 0

          await supabase.from("daily_balances").insert({
            balance_date: selectedDate,
            cash_opening: prevCash,
            cash_closing: prevCash + totalFuelSales,
            bank_opening: prevBank,
            bank_closing: prevBank
          })
        }
      }

      setSuccess("Sales recorded successfully.")
      setConfirmDialogOpen(false)
      fetchData()
    } catch (err: any) {
      setError(err.message || "Failed to save sales.")
    } finally {
      setSaving(false)
    }
  }

  // --- Product Sales ---
  const [newProductSale, setNewProductSale] = useState({ product_id: "", quantity: "", payment_method: "cash" })

  const handleAddProductSale = async () => {
    if (!newProductSale.product_id || !newProductSale.quantity) return
    const product = oilProducts.find(p => p.id === newProductSale.product_id)
    if (!product) return

    setSaving(true)
    try {
      const qty = parseFloat(newProductSale.quantity)
      const total = qty * product.selling_price

      await supabase.from("sales").insert({
        sale_date: selectedDate,
        product_id: product.id,
        quantity: qty,
        unit_price: product.selling_price,
        total_amount: total,
        sale_type: "product",
        payment_method: newProductSale.payment_method,
      })

      await supabase.from("products").update({
        current_stock: product.current_stock - qty,
      }).eq("id", product.id)

      // Update Daily Balance (Cash)
      const { data: balanceData } = await supabase
        .from("daily_balances")
        .select("*")
        .eq("balance_date", selectedDate)
        .maybeSingle()

      if (balanceData) {
        const currentCash = balanceData.cash_closing ?? balanceData.cash_opening ?? 0
        await supabase
          .from("daily_balances")
          .update({ cash_closing: currentCash + total })
          .eq("id", balanceData.id)
      } else {
        // Fetch most recent previous record for rollover
        const { data: prevRecord } = await supabase
          .from("daily_balances")
          .select("*")
          .lt("balance_date", selectedDate)
          .order("balance_date", { ascending: false })
          .limit(1)

        const prevCash = prevRecord?.[0]?.cash_closing ?? prevRecord?.[0]?.cash_opening ?? 0
        const prevBank = prevRecord?.[0]?.bank_closing ?? prevRecord?.[0]?.bank_opening ?? 0

        await supabase.from("daily_balances").insert({
          balance_date: selectedDate,
          cash_opening: prevCash,
          cash_closing: prevCash + total,
          bank_opening: prevBank,
          bank_closing: prevBank
        })
      }

      setSuccess("Product sale recorded.")
      setProductSaleDialogOpen(false)
      fetchData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // --- Derived ---
  const totals = useMemo(() => {
    const amount = nozzleReadings.reduce((sum, r) => sum + r.sales_amount, 0)
    const liters = nozzleReadings.reduce((sum, r) => sum + r.liters_sold, 0)
    return { amount, liters }
  }, [nozzleReadings])

  const groupedNozzles = useMemo(() => {
    return nozzles.reduce((acc, nozzle) => {
      const pump = nozzle.pump_number || "Other"
      if (!acc[pump]) acc[pump] = []
      acc[pump].push(nozzle)
      return acc
    }, {} as Record<string, Nozzle[]>)
  }, [nozzles])

  return (
    <div className="flex flex-col gap-6 p-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Management</h1>
          <p className="text-muted-foreground">Record daily readings and product sales.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} size={18} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Fuel Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(totals.amount)}</div>
            <p className="text-xs text-muted-foreground">{totals.liters.toLocaleString()} Liters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Active Pumps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(groupedNozzles).length} Units</div>
            <p className="text-xs text-muted-foreground">{nozzles.length} Total Nozzles</p>
          </CardContent>
        </Card>
        <Card className="flex items-center justify-center p-4">
          <Button
            className="w-full h-full text-lg font-bold py-4"
            disabled={totals.liters === 0 || saving}
            onClick={handleSubmitFuelSales}
          >
            <Save className="mr-2" /> Record Daily Sales
          </Button>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200 text-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="fuel">Fuel Sales</TabsTrigger>
          <TabsTrigger value="products">Product Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="mt-4">
          {loading ? (
            <div className="flex justify-center p-12"><RefreshCw className="animate-spin text-muted-foreground" size={32} /></div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedNozzles).map(([pump, pumpNozzles]) => (
                <Card key={pump}>
                  <CardHeader className="bg-slate-50 border-b py-3 px-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Fuel size={18} className="text-primary" /> Dispenser Unit {pump}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/50">
                          <TableHead className="w-[120px]">Nozzle</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Opening</TableHead>
                          <TableHead className="text-right w-[150px]">Closing</TableHead>
                          <TableHead className="text-right">Liters</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pumpNozzles.map(nozzle => {
                          const reading = nozzleReadings.find(r => r.nozzle_id === nozzle.id)
                          const isLocked = !!reading?.id && !unlockedNozzles.has(nozzle.id)
                          return (
                            <TableRow key={nozzle.id}>
                              <TableCell className="font-medium">Nozzle {nozzle.nozzle_number}</TableCell>
                              <TableCell><Badge variant="outline" className="font-normal">{nozzle.products?.product_name}</Badge></TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">{reading?.opening_reading.toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center gap-1 justify-end">
                                  <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={reading?.closing_reading || ""}
                                    onChange={(e) => handleReadingChange(nozzle.id, e.target.value)}
                                    disabled={isLocked}
                                    className={`text-right font-mono h-9 ${isLocked ? "bg-slate-50 text-muted-foreground" : ""}`}
                                  />
                                  {isLocked && (
                                    <Button variant="ghost" size="icon" className="h-9 w-9 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => handleUnlockRequest(nozzle.id)}>
                                      <Unlock size={14} />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">{(reading?.liters_sold || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right font-bold text-primary">{formatCurrency(reading?.sales_amount || 0)}</TableCell>
                              <TableCell className="text-right">
                                {reading?.id ? (
                                  <Badge variant={isLocked ? "secondary" : "outline"} className="gap-1">
                                    {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                                    {isLocked ? "Saved" : "Unlocked"}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Pending</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Retail Sales</CardTitle>
                <CardDescription>Record manual sales of lubricants and other items.</CardDescription>
              </div>
              <Button onClick={() => setProductSaleDialogOpen(true)}><Plus size={16} className="mr-2" /> Record Product Sale</Button>
            </CardHeader>
            <CardContent className="p-8 text-center border-t">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Package size={48} className="opacity-20" />
                <p>Select a product to start recording retail sales.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Sales Export</DialogTitle>
            <DialogDescription>Review your entries before saving. Saved readings will be locked for the day.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="max-h-[300px] overflow-auto border rounded-md">
              <Table>
                <TableHeader><TableRow><TableHead>Nozzle</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {nozzleReadings.filter(r => r.liters_sold > 0).map(r => (
                    <TableRow key={r.nozzle_id}>
                      <TableCell># {nozzles.find(n => n.id === r.nozzle_id)?.nozzle_number}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(r.sales_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between items-center px-2">
              <span className="font-bold">Total Sales</span>
              <span className="text-xl font-bold text-primary">{formatCurrency(totals.amount)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmFuelSales} disabled={saving}>Save & Lock Readings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productSaleDialogOpen} onOpenChange={setProductSaleDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Product Sale</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <Label>Product</Label>
              <Select onValueChange={(v) => setNewProductSale(p => ({ ...p, product_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {oilProducts.map(p => (
                    <SelectItem key={p.id} value={p.id} disabled={p.current_stock <= 0}>{p.product_name} ({p.current_stock} available)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" value={newProductSale.quantity} onChange={(e) => setNewProductSale(p => ({ ...p, quantity: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductSaleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddProductSale} disabled={saving}>Confirm Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserPasswordDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        onSuccess={handleAuthSuccess}
        title="Supervisor Unlock"
        description="Enter your account password to authorize modification of this reading."
      />
    </div>
  )
}

function Plus({ className, size }: { className?: string, size?: number }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
}
