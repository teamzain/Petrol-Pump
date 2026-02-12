"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import Link from "next/link"
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Search,
  Save,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Fuel,
  Droplet,
  Loader2
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

// --- Interfaces ---
interface Nozzle {
  id: string
  nozzle_number: string
  // pump_id: string 
  product_id: string
  current_reading: number
  // pumps: {
  //   pump_name: string
  // }
  products: {
    product_name: string
    selling_price: number
    weighted_avg_cost: number
  }
}

interface NozzleReading {
  id?: string
  nozzle_id: string
  opening_reading: number
  closing_reading: string
  liters_sold: number
  sales_amount: number
  payment_method: "cash" | "bank"
  status?: "pending" | "saved" | "locked"
}

interface OilProduct {
  id: string
  product_name: string
  selling_price: number
  weighted_avg_cost: number
  purchase_price: number
  current_stock: number
  unit: string
  category: string
}

interface Sale {
  id: string
  product_id: string
  quantity: number
  sale_amount: number // Corrected mapping
  payment_method: string
  products: {
    product_name: string
  }
}

export default function SalesPage() {
  const supabase = createClient()
  const { toast } = useToast()

  // State
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [activeTab, setActiveTab] = useState("fuel")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Data State
  const [nozzles, setNozzles] = useState<Nozzle[]>([])
  const [nozzleReadings, setNozzleReadings] = useState<NozzleReading[]>([])
  const [productSales, setProductSales] = useState<Sale[]>([])
  const [oilProducts, setOilProducts] = useState<OilProduct[]>([])

  // Unlock Logic
  const [unlockedNozzles, setUnlockedNozzles] = useState<Set<string>>(new Set())
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [unlockPin, setUnlockPin] = useState("")
  const [dbAdminPin, setDbAdminPin] = useState("1234") // Fallback
  const [nozzleToUnlock, setNozzleToUnlock] = useState<string | null>(null)

  // Product Sale Form
  const [newProductSale, setNewProductSale] = useState({
    product_id: "",
    quantity: "",
    payment_method: "cash"
  })

  // Alerts
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      // 1. Fetch Nozzles
      const { data: nozzlesData } = await supabase
        .from("nozzles")
        .select(`
          *,
          products (product_name, selling_price, weighted_avg_cost)
        `)
        // .order("pump_id", { ascending: true })
        .order("nozzle_number", { ascending: true })

      // 2. Fetch Readings/Sales for selected date
      const { data: readingsData } = await supabase
        .from("nozzle_readings")
        .select("*")
        .eq("reading_date", selectedDate)

      const { data: salesData } = await supabase
        .from("sales")
        .select("*, products(product_name)")
        .eq("sale_date", selectedDate)
        .eq("sale_type", "product")

      if (salesData) setProductSales(salesData)

      // 4. Fetch System Config (Admin PIN)
      const { data: configData } = await supabase
        .from("pump_config")
        .select("admin_pin")
        .limit(1)
        .maybeSingle()

      if (configData?.admin_pin) {
        setDbAdminPin(configData.admin_pin)
      }

      // Initialize readings state
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
              sales_amount: existing.sale_amount,
              payment_method: existing.payment_method || "cash",
              status: "saved" // If it exists, it's saved
            }
          }
          return {
            nozzle_id: n.id,
            opening_reading: n.current_reading,
            closing_reading: "",
            liters_sold: 0,
            sales_amount: 0,
            payment_method: "cash",
            status: "pending"
          }
        }))
      }

      // 3. Fetch Oil Products
      const { data: oilData } = await supabase
        .from("products")
        .select("*")
        .eq("status", "active")
        .neq("product_type", "fuel") // Broader: Anything that isn't fuel is a product sale
        .order("product_name")

      if (oilData) {
        setOilProducts(oilData)
        console.log("Fetched Oil Products:", oilData.length)
      } else {
        console.log("No active oil_lubricant products found.")
      }

    } catch (err: any) {
      console.error(err)
      setError("Failed to fetch data.")
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedDate])


  useEffect(() => {
    fetchData()
  }, [fetchData])

  // --- Handlers ---

  const handleReadingChange = (nozzleId: string, value: string) => {
    setNozzleReadings(prev => prev.map(r => {
      if (r.nozzle_id !== nozzleId) return r
      // Allow editing if new (no id) OR explicitly unlocked
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
        status: r.id ? "saved" : "pending" // Naive status update
      }
    }))
  }

  const handleUnlockRequest = (nozzleId: string) => {
    setNozzleToUnlock(nozzleId)
    setAuthDialogOpen(true)
    setUnlockPin("")
  }

  const confirmUnlock = () => {
    // Check against PIN from database
    if (unlockPin === dbAdminPin) {
      if (nozzleToUnlock) {
        setUnlockedNozzles(prev => new Set(prev).add(nozzleToUnlock))
        setNozzleToUnlock(null)
        setAuthDialogOpen(false)
        toast({ title: "Unlocked", description: "You can now edit the reading." })
      }
    } else {
      setError("Invalid PIN")
    }
  }

  const handleSubmitFuelSales = async () => {
    setSaving(true)
    setError("")
    setSuccess("")

    try {
      // Filter valid readings to save
      // Logic: Must have liters > 0. Must be editable (no ID or unlocked).
      const readingsToSave = nozzleReadings.filter(r => {
        const hasChange = r.liters_sold > 0
        const isEditable = !r.id || unlockedNozzles.has(r.nozzle_id)
        return hasChange && isEditable
      })

      if (readingsToSave.length === 0) {
        toast({ title: "No changes", description: "No new valid readings to save." })
        setSaving(false)
        return
      }

      // Validation
      for (const r of readingsToSave) {
        if (parseFloat(r.closing_reading) < r.opening_reading) {
          throw new Error(`Closing reading < Opening for a nozzle.`)
        }
      }

      for (const reading of readingsToSave) {
        const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
        if (!nozzle) continue

        const closing = parseFloat(reading.closing_reading)
        const product = nozzle.products
        const costPrice = nozzle.products.selling_price * 0.9 // Fallback or fetch weighted_avg

        // Note: For real implementation, we should have weighted_avg in nozzle->product join too.
        // Simplified for this redesign view.

        if (reading.id) {
          // Update Reading
          await supabase.from("nozzle_readings").update({
            closing_reading: closing,
            quantity_sold: reading.liters_sold,
            sale_amount: reading.sales_amount,
            payment_method: reading.payment_method, // Add payment method to update
          }).eq("id", reading.id)

          // Sync Sales record (Trigger handles stock and movement delta automatically)
          await supabase.from("sales").update({
            quantity: reading.liters_sold,
            selling_price: product.selling_price,
            sale_amount: reading.sales_amount,
            payment_method: reading.payment_method, // Add payment method to update
          }).eq("nozzle_id", nozzle.id).eq("sale_date", selectedDate).eq("sale_type", "fuel")

        } else {
          // Insert Reading
          const qty = reading.liters_sold
          const total = reading.sales_amount
          const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
          if (!nozzle) continue

          await supabase.from("nozzle_readings").insert({
            nozzle_id: reading.nozzle_id,
            reading_date: selectedDate,
            opening_reading: reading.opening_reading,
            closing_reading: closing,
            quantity_sold: qty,
            selling_price: nozzle.products.selling_price,
            sale_amount: total,
            payment_method: reading.payment_method,
            cogs_per_unit: nozzle.products.weighted_avg_cost || 0,
            total_cogs: qty * (nozzle.products.weighted_avg_cost || 0),
            gross_profit: total - (qty * (nozzle.products.weighted_avg_cost || 0)),
            recorded_by: (await supabase.auth.getUser()).data.user?.id
          })

          await supabase.from("sales").insert({
            sale_date: selectedDate,
            product_id: nozzle.product_id,
            quantity: reading.liters_sold,
            selling_price: product.selling_price,
            sale_amount: reading.sales_amount,
            sale_type: "fuel",
            nozzle_id: nozzle.id,
            payment_method: reading.payment_method
          })

          // Update Nozzle Current Reading
          await supabase.from("nozzles").update({ current_reading: closing }).eq("id", nozzle.id)
        }
      }

      // Prevent immediate re-locking for nozzles we just edited/saved
      const justSavedIds = readingsToSave.map(r => r.nozzle_id)
      setUnlockedNozzles(prev => {
        const next = new Set(prev)
        justSavedIds.forEach(id => next.add(id))
        return next
      })

      toast({ title: "Success", description: "Sales recorded successfully." })
      fetchData() // Refresh

    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to save sales.")
    } finally {
      setSaving(false)
    }
  }

  const handleAddProductSale = async () => {
    if (!newProductSale.product_id || !newProductSale.quantity) return
    setSaving(true)
    try {
      const product = oilProducts.find(p => p.id === newProductSale.product_id)
      if (!product) return

      const qty = parseFloat(newProductSale.quantity)
      const total = qty * product.selling_price

      await supabase.from("sales").insert({
        sale_date: selectedDate,
        product_id: product.id,
        quantity: qty,
        selling_price: product.selling_price,
        sale_amount: total,
        sale_type: "product",
        payment_method: newProductSale.payment_method,
        cogs_per_unit: product.weighted_avg_cost || product.purchase_price || 0,
        total_cogs: qty * (product.weighted_avg_cost || product.purchase_price || 0),
        gross_profit: total - (qty * (product.weighted_avg_cost || product.purchase_price || 0))
      })

      toast({ title: "Success", description: "Product sale added." })
      setNewProductSale({ product_id: "", quantity: "", payment_method: "cash" })
      fetchData()
    } catch (err) {
      setError("Failed to add product sale")
    } finally {
      setSaving(false)
    }
  }


  // --- Render Helpers ---

  const totalFuelLiters = nozzleReadings.reduce((sum, r) => sum + r.liters_sold, 0)
  const totalFuelAmount = nozzleReadings.reduce((sum, r) => sum + r.sales_amount, 0)

  const totalProductAmount = productSales.reduce((sum, s) => sum + s.sale_amount, 0)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Droplet className="h-8 w-8 text-primary/40" />
          </div>
        </div>
        <p className="mt-4 text-muted-foreground font-medium animate-pulse">Initializing Sales Dashboard...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Management</h1>
          <p className="text-muted-foreground">Record daily nozzle readings and product sales.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-10 w-[160px]"
            />
          </div>
          <Link href="/dashboard">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Button>
          </Link>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="fuel">Fuel Sales</TabsTrigger>
          <TabsTrigger value="products">Lubricants & Others</TabsTrigger>
        </TabsList>

        {/* FUEL TAB */}
        <TabsContent value="fuel" className="space-y-6 mt-4">
          {/* Stats Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground font-medium">Total Fuel Sales</span>
              <span className="text-2xl font-bold">Rs. {totalFuelAmount.toLocaleString()}</span>
            </Card>
            <Card className="p-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground font-medium">Total Volume</span>
              <span className="text-2xl font-bold">{totalFuelLiters.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">Liters</span></span>
            </Card>
          </div>

          {/* Main Table Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Nozzle Readings</CardTitle>
                <CardDescription>Enter closing readings for {format(new Date(selectedDate), "MMMM dd, yyyy")}</CardDescription>
              </div>
              <Button onClick={handleSubmitFuelSales} disabled={saving} className="min-w-[120px]">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Save All</>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pump / Nozzle</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right w-[150px]">Closing</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Liters</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center w-[120px]">Payment</TableHead>
                    <TableHead className="text-center w-[50px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nozzles.map((nozzle) => {
                    const reading = nozzleReadings.find(r => r.nozzle_id === nozzle.id) || {
                      nozzle_id: nozzle.id, opening_reading: 0, closing_reading: "", liters_sold: 0, sales_amount: 0, payment_method: "cash"
                    }
                    const isLocked = reading.id && !unlockedNozzles.has(nozzle.id)

                    return (
                      <TableRow key={nozzle.id}>
                        <TableCell>
                          <div className="font-medium">Nozzle {nozzle.nozzle_number}</div>
                          {/* <div className="text-xs text-muted-foreground">Pump {nozzle.pumps?.pump_name}</div> */}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{nozzle.products?.product_name}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {reading.opening_reading.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="relative flex items-center justify-end gap-2">
                            {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
                            <Input
                              type="number"
                              className="w-24 text-right font-mono h-8"
                              value={reading.closing_reading}
                              onChange={(e) => handleReadingChange(nozzle.id, e.target.value)}
                              disabled={!!isLocked}
                            />
                            {/* Unlock Button Context */}
                            {isLocked && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleUnlockRequest(nozzle.id)}>
                                <Unlock className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {nozzle.products?.selling_price}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {reading.liters_sold > 0 ? reading.liters_sold.toFixed(2) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {reading.sales_amount > 0 ? reading.sales_amount.toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={reading.payment_method}
                            onValueChange={(v) => setNozzleReadings(prev => prev.map(pr => pr.nozzle_id === nozzle.id ? { ...pr, payment_method: v as any } : pr))}
                            disabled={!!isLocked}
                          >
                            <SelectTrigger className="h-8 py-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="bank">Bank</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          {reading.id ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-slate-200 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="space-y-6 mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Add Product Sale</CardTitle>
                <CardDescription>Record sale of lubricants or other items</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select value={newProductSale.product_id} onValueChange={(v) => setNewProductSale(prev => ({ ...prev, product_id: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {oilProducts.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.product_name} ({p.current_stock} {p.unit}) - Rs.{p.selling_price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {newProductSale.product_id && (
                    <div className="text-xs text-muted-foreground font-medium px-1">
                      Available Stock: <span className={
                        (oilProducts.find(p => p.id === newProductSale.product_id)?.current_stock || 0) < parseFloat(newProductSale.quantity || "0")
                          ? "text-destructive font-bold"
                          : "text-primary font-bold"
                      }>
                        {oilProducts.find(p => p.id === newProductSale.product_id)?.current_stock} {oilProducts.find(p => p.id === newProductSale.product_id)?.unit}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={newProductSale.quantity}
                      onChange={(e) => setNewProductSale(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="0"
                      className={
                        newProductSale.product_id &&
                          (oilProducts.find(p => p.id === newProductSale.product_id)?.current_stock || 0) < parseFloat(newProductSale.quantity || "0")
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                    />
                    {newProductSale.product_id && newProductSale.quantity &&
                      (oilProducts.find(p => p.id === newProductSale.product_id)?.current_stock || 0) < parseFloat(newProductSale.quantity) && (
                        <p className="text-[10px] text-destructive font-bold">
                          Exceeds available stock!
                        </p>
                      )}
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={newProductSale.payment_method} onValueChange={(v) => setNewProductSale(prev => ({ ...prev, payment_method: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Payment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleAddProductSale}
                    disabled={
                      saving ||
                      !newProductSale.product_id ||
                      !newProductSale.quantity ||
                      (oilProducts.find(p => p.id === newProductSale.product_id)?.current_stock || 0) < parseFloat(newProductSale.quantity || "0")
                    }
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Sale"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Today's Sales</CardTitle>
                <CardDescription>{productSales.length} items sold</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground h-24">No sales yet</TableCell>
                      </TableRow>
                    ) : (
                      productSales.map(sale => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">{sale.products?.product_name}</TableCell>
                          <TableCell className="text-right">{sale.quantity}</TableCell>
                          <TableCell className="text-right font-bold">Rs. {sale.sale_amount?.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Auth Dialog */}
      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Reading</DialogTitle>
            <DialogDescription>Enter Admin PIN to edit this locked reading.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="PIN Code"
              value={unlockPin}
              onChange={(e) => setUnlockPin(e.target.value)}
            />
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmUnlock}>Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {saving && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative">
            <div className="h-24 w-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin shadow-2xl shadow-primary/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Droplet className="h-8 w-8 text-primary animate-pulse" />
            </div>
          </div>
          <div className="mt-6 text-center space-y-2">
            <h3 className="text-xl font-bold tracking-tight">Syncing Sales Data...</h3>
            <p className="text-muted-foreground animate-pulse">Updating inventory and account balances</p>
          </div>
        </div>
      )}
    </div>
  )
}
