"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import { getTodayPKT, cn } from "@/lib/utils"
import Link from "next/link"
import { ArrowLeft, ArrowRightLeft, Calendar as CalendarIcon, Search, Save, Lock, Unlock, AlertTriangle, AlertCircle, CheckCircle2, Fuel, Droplet, TrendingUp, HandCoins, CreditCard, Receipt } from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"

import { Button } from "@/components/ui/button"
import { CardManagement } from "@/components/dashboard/card-management"
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
  bank_account_id?: string
  status?: "pending" | "saved" | "locked"
}

interface BankAccount {
  id: string
  account_name: string
  current_balance: number
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
  sale_amount: number
  total_amount: number
  paid_amount: number
  payment_method: string
  products: {
    product_name: string
  }
}

interface CardType {
  id: string
  card_name: string
  tax_percentage: number
}

export default function SalesPage() {
  const supabase = createClient()
  const { toast } = useToast()

  // State
  const [selectedDate, setSelectedDate] = useState<string>(getTodayPKT())
  const [activeTab, setActiveTab] = useState("fuel")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Data State
  const [nozzles, setNozzles] = useState<Nozzle[]>([])
  const [nozzleReadings, setNozzleReadings] = useState<NozzleReading[]>([])
  const [productSales, setProductSales] = useState<Sale[]>([])
  const [oilProducts, setOilProducts] = useState<OilProduct[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])

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
    total_amount: "",
    discount_amount: "0", // New
    paid_amount: "",
    payment_method: "cash",
    bank_account_id: ""
  })

  // Dynamic Daily Card Summary
  const [activeCardTypes, setActiveCardTypes] = useState<CardType[]>([])
  const [cardAmounts, setCardAmounts] = useState<Record<string, string>>({})
  const [initialCardAmounts, setInitialCardAmounts] = useState<Record<string, string>>({})
  const [cardSubTab, setCardSubTab] = useState<"totals" | "manage">("manage")

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

      // 4. Fetch System Config & Card Types
      const { data: ctData } = await supabase.from("card_types").select("*").eq("is_active", true).order("card_name")
      if (ctData) setActiveCardTypes(ctData)

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
        let dailyShell = 0
        let dailyBank = 0

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
              status: "saved"
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

        // Initialize Card Breakdown from the first saved reading
        const readingWithCard = readingsData?.find(r => r.card_breakdown && Object.keys(r.card_breakdown).length > 0)
        if (readingWithCard) {
          const breakdown = readingWithCard.card_breakdown as Record<string, number>
          const amounts: Record<string, string> = {}
          Object.entries(breakdown).forEach(([id, amt]) => {
            amounts[id] = amt.toString()
          })
          setCardAmounts(amounts)
          setInitialCardAmounts(amounts)
        } else {
          setCardAmounts({})
          setInitialCardAmounts({})
        }
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
      }

      // 5. Fetch Bank Accounts
      const { data: bankData } = await supabase
        .from("accounts")
        .select("id, account_name, current_balance")
        .eq("account_type", "bank")
        .eq("status", "active")
        .order("account_name")

      if (bankData) {
        setBankAccounts(bankData)
        if (bankData.length > 0) {
          setNewProductSale(prev => ({ ...prev, bank_account_id: bankData[0].id }))
        }
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
        payment_method: "cash", // Always cash now
        status: r.id ? "saved" : "pending"
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

      const saveReading = async (reading: any) => {
        const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
        if (!nozzle) return

        const closing = parseFloat(reading.closing_reading)
        const product = nozzle.products
        const user = await supabase.auth.getUser()
        const userId = user.data.user?.id

        if (reading.id) {
          // Update Reading
          const { error: nrUpdateError } = await supabase.from("nozzle_readings").update({
            closing_reading: closing,
            quantity_sold: reading.liters_sold,
            sale_amount: reading.sales_amount,
            payment_method: "cash",
            bank_account_id: null,
            recorded_by: userId
          }).eq("id", reading.id)
          if (nrUpdateError) throw nrUpdateError

          // Sync Sales record
          const fuelQty = reading.liters_sold
          const fuelTotal = reading.sales_amount
          const fuelCogsPerUnit = product.weighted_avg_cost || 0
          const fuelTotalCogs = fuelQty * fuelCogsPerUnit
          const fuelGrossProfit = fuelTotal - fuelTotalCogs

          const { error: sUpdateError } = await supabase.from("sales").update({
            quantity: fuelQty,
            selling_price: product.selling_price,
            sale_amount: fuelTotal,
            payment_method: "cash",
            bank_account_id: null,
            cogs_per_unit: fuelCogsPerUnit,
            total_cogs: fuelTotalCogs,
            gross_profit: fuelGrossProfit,
            recorded_by: userId
          }).eq("nozzle_id", nozzle.id).eq("sale_date", selectedDate).eq("sale_type", "fuel")
          if (sUpdateError) throw sUpdateError

        } else {
          // Insert Reading
          const qty = reading.liters_sold
          const total = reading.sales_amount
          const { error: nrInsertError } = await supabase.from("nozzle_readings").insert({
            nozzle_id: reading.nozzle_id,
            reading_date: selectedDate,
            opening_reading: reading.opening_reading,
            closing_reading: closing,
            quantity_sold: qty,
            selling_price: nozzle.products.selling_price,
            sale_amount: total,
            payment_method: "cash",
            bank_account_id: null,
            cogs_per_unit: nozzle.products.weighted_avg_cost || 0,
            total_cogs: qty * (nozzle.products.weighted_avg_cost || 0),
            gross_profit: total - (qty * (nozzle.products.weighted_avg_cost || 0)),
            recorded_by: userId
          })
          if (nrInsertError) throw nrInsertError

          const fuelInsertCogsPerUnit = product.weighted_avg_cost || 0
          const fuelInsertTotalCogs = qty * fuelInsertCogsPerUnit
          const fuelInsertGrossProfit = total - fuelInsertTotalCogs

          const { error: sInsertError } = await supabase.from("sales").insert({
            sale_date: selectedDate,
            product_id: nozzle.product_id,
            quantity: reading.liters_sold,
            selling_price: product.selling_price,
            sale_amount: reading.sales_amount,
            total_amount: reading.sales_amount,
            paid_amount: reading.sales_amount,
            sale_type: "fuel",
            nozzle_id: nozzle.id,
            payment_method: "cash",
            bank_account_id: null,
            cogs_per_unit: fuelInsertCogsPerUnit,
            total_cogs: fuelInsertTotalCogs,
            gross_profit: fuelInsertGrossProfit,
            recorded_by: userId
          })
          if (sInsertError) throw sInsertError

          // Update Nozzle Current Reading
          const { error: nUpdateError } = await supabase.from("nozzles").update({ current_reading: closing }).eq("id", nozzle.id)
          if (nUpdateError) throw nUpdateError
        }
      }

      for (const r of readingsToSave) {
        await saveReading(r)
      }

      toast({ title: "Success", description: "Fuel sales recorded successfully." })
      fetchData()
    } catch (err: any) {
      console.error("Sale Recording Error:", err)
      const errorMsg = err.message || (err.error && err.error.message) || "Failed to save sales."
      setError(errorMsg)
      toast({ title: "Error", description: errorMsg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitCardPayments = async () => {
    setSaving(true)
    setError("")
    setSuccess("")

    try {
      const cardTotalsChanged = JSON.stringify(cardAmounts) !== JSON.stringify(initialCardAmounts)
      if (!cardTotalsChanged) {
        toast({ title: "No changes", description: "No card totals to save." })
        setSaving(false)
        return
      }

      // Prepare card breakdown JSONB
      const breakdown: Record<string, number> = {}
      let totalCardAmt = 0
      Object.entries(cardAmounts).forEach(([id, val]) => {
        const amt = parseFloat(val) || 0
        if (amt > 0) {
          breakdown[id] = amt
          totalCardAmt += amt
        }
      })

      // Find ANY reading for the day to attach card totals to (financial trigger requirement)
      // If none, we might need a dummy or a specific logic.
      // Current design attaches to one reading per day.
      const existingReading = nozzleReadings.find(r => r.id)
      if (!existingReading) {
        toast({ title: "Incomplete", description: "Please record at least one nozzle reading before saving card totals.", variant: "destructive" })
        setSaving(false)
        return
      }

      // Update the reading
      const { error: nrErr } = await supabase.from("nozzle_readings").update({
        total_card_amount: totalCardAmt,
        card_breakdown: breakdown,
        shell_card_amount: 0,
        bank_card_amount: 0
      }).eq("id", existingReading.id)
      if (nrErr) throw nrErr

      // Update the sale record associated with that reading
      const { error: sErr } = await supabase.from("sales").update({
        total_card_amount: totalCardAmt,
        card_breakdown: breakdown,
        shell_card_amount: 0,
        bank_card_amount: 0
      }).eq("nozzle_id", existingReading.nozzle_id).eq("sale_date", selectedDate).eq("sale_type", "fuel")
      if (sErr) throw sErr

      toast({ title: "Success", description: "Daily card totals updated." })
      fetchData()
    } catch (err: any) {
      console.error("Card Recording Error:", err)
      const errorMsg = err.message || "Failed to save card payments."
      setError(errorMsg)
      toast({ title: "Error", description: errorMsg, variant: "destructive" })
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
      const totalAmount = parseFloat(newProductSale.total_amount)
      const paidAmount = parseFloat(newProductSale.paid_amount) || totalAmount

      const recordedBy = (await supabase.auth.getUser()).data.user?.id

      const { error: sInsertError } = await supabase.from("sales").insert({
        sale_date: selectedDate,
        product_id: product.id,
        quantity: qty,
        selling_price: product.selling_price,
        sale_amount: paidAmount, // Map paid to sale_amount for financials
        total_amount: totalAmount,
        paid_amount: paidAmount,
        sale_type: "product",
        payment_method: newProductSale.payment_method === "bank" ? "bank_transfer" : "cash",
        bank_account_id: newProductSale.payment_method === "bank" ? newProductSale.bank_account_id : null,
        cogs_per_unit: product.weighted_avg_cost || product.purchase_price || 0,
        total_cogs: qty * (product.weighted_avg_cost || product.purchase_price || 0),
        gross_profit: paidAmount - (qty * (product.weighted_avg_cost || product.purchase_price || 0)),
        recorded_by: recordedBy
      })
      if (sInsertError) throw sInsertError

      toast({ title: "Success", description: "Product sale added." })
      setNewProductSale({
        product_id: "",
        quantity: "",
        total_amount: "",
        discount_amount: "0",
        paid_amount: "",
        payment_method: "cash",
        bank_account_id: ""
      })
      fetchData()
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.message || (err.error && err.error.message) || "Failed to add product sale"
      setError(errorMsg)
      toast({ title: "Error", description: errorMsg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // --- Render Helpers ---

  const totalFuelLiters = nozzleReadings.reduce((sum, r) => sum + r.liters_sold, 0)
  const totalFuelAmount = nozzleReadings.reduce((sum, r) => sum + r.sales_amount, 0)

  const totalProductAmount = productSales.reduce((sum, s) => sum + s.sale_amount, 0)
  const totalBankTransferAmount = productSales
    .filter(s => s.payment_method === "bank_transfer")
    .reduce((sum, s) => sum + s.sale_amount, 0)
  const totalCashProductAmount = productSales
    .filter(s => s.payment_method !== "bank_transfer")
    .reduce((sum, s) => sum + s.sale_amount, 0)

  const totalCardAmount = Object.values(cardAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
  const totalCombinedSales = totalFuelAmount + totalProductAmount
  const totalCashAmount = (totalFuelAmount + totalCashProductAmount) - totalCardAmount

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
        <BrandLoader size="lg" className="mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">Initializing Sales Dashboard...</p>
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

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4 flex flex-col gap-1 bg-primary/5 border-primary/10 shadow-sm">
          <div className="flex items-center gap-2 text-primary">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Daily Sale</span>
          </div>
          <span className="text-2xl font-[900] tracking-tighter text-primary">
            Rs. {totalCombinedSales.toLocaleString()}
          </span>
          <div className="flex flex-col gap-0.5 mt-1 border-t border-primary/10 pt-1">
            <p className="text-[10px] text-muted-foreground font-medium flex justify-between">
              <span>Fuel ({totalFuelLiters.toLocaleString()} L)</span>
              <span className="font-bold text-primary/70">Rs. {totalFuelAmount.toLocaleString()}</span>
            </p>
            <p className="text-[10px] text-muted-foreground font-medium flex justify-between">
              <span>Products</span>
              <span className="font-bold text-primary/70">Rs. {totalProductAmount.toLocaleString()}</span>
            </p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col gap-1 shadow-sm border-orange-100 bg-orange-50/30">
          <div className="flex items-center gap-2 text-orange-600">
            <CreditCard className="h-4 w-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-orange-600/70">Total Card Payments</span>
          </div>
          <span className="text-2xl font-bold tracking-tighter text-orange-700">Rs. {totalCardAmount.toLocaleString()}</span>
          <p className="text-[10px] text-orange-600/70 font-medium mt-1 uppercase tracking-tighter italic">Total dynamic card receipts</p>
        </Card>

        <Card className="p-4 flex flex-col gap-1 shadow-sm border-blue-100 bg-blue-50/30">
          <div className="flex items-center gap-2 text-blue-600">
            <ArrowRightLeft className="h-4 w-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600/70">Bank Transfers</span>
          </div>
          <span className="text-2xl font-bold tracking-tighter text-blue-700">Rs. {totalBankTransferAmount.toLocaleString()}</span>
          <p className="text-[10px] text-blue-600/70 font-medium mt-1 uppercase tracking-tighter italic">Lubricant Bank Receipts</p>
        </Card>

        <Card className="p-4 flex flex-col gap-1 shadow-sm border-green-100 bg-green-50/30">
          <div className="flex items-center gap-2 text-green-600">
            <HandCoins className="h-4 w-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-green-600/70">Net Cash Sale</span>
          </div>
          <span className="text-2xl font-bold tracking-tighter text-green-700">Rs. {totalCashAmount.toLocaleString()}</span>
          <p className="text-[10px] text-green-600/70 font-medium mt-1 uppercase tracking-tighter italic">Total Cash to be Deposited</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full md:w-[600px] grid-cols-3">
          <TabsTrigger value="fuel" className="font-bold flex items-center gap-2">
            <Fuel className="h-4 w-4" />
            Fuel Sales
          </TabsTrigger>
          <TabsTrigger value="products" className="font-bold flex items-center gap-2">
            <Droplet className="h-4 w-4" />
            Lubricants & Others
          </TabsTrigger>
          <TabsTrigger value="cards" className="font-bold flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Card Payments
          </TabsTrigger>
        </TabsList>

        {/* FUEL TAB */}
        <TabsContent value="fuel" className="space-y-6 mt-4">
          {/* Main Table Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Nozzle Readings</CardTitle>
                <CardDescription>Enter closing readings for {format(new Date(selectedDate), "MMMM dd, yyyy")}</CardDescription>
              </div>
              <Button onClick={handleSubmitFuelSales} disabled={saving} className="min-w-[120px]">
                {saving ? (
                  <BrandLoader size="xs" />
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Save All</>
                )}
              </Button>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="overflow-x-auto">
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
                        nozzle_id: nozzle.id, opening_reading: 0, closing_reading: "", liters_sold: 0, sales_amount: 0, payment_method: "cash", bank_account_id: ""
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
                            <div className="flex items-center justify-center min-w-[120px]">
                              <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 uppercase text-[10px] font-bold">
                                Cash Only
                              </Badge>
                            </div>
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
              </div>
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
                      onChange={(e) => {
                        const qty = e.target.value;
                        const product = oilProducts.find(p => p.id === newProductSale.product_id);
                        const total = product ? (product.selling_price * parseFloat(qty || "0")).toString() : "0";
                        setNewProductSale(prev => ({
                          ...prev,
                          quantity: qty,
                          total_amount: total,
                          paid_amount: total // Default paid to total
                        }))
                      }}
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

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Retail Total</Label>
                      <Input
                        type="number"
                        value={newProductSale.total_amount}
                        readOnly
                        placeholder="0"
                        className="bg-muted font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-destructive font-bold">Discount</Label>
                      <Input
                        type="number"
                        value={newProductSale.discount_amount}
                        onChange={(e) => {
                          const discount = e.target.value;
                          const total = parseFloat(newProductSale.total_amount || "0");
                          const paid = (total - parseFloat(discount || "0")).toString();
                          setNewProductSale(prev => ({
                            ...prev,
                            discount_amount: discount,
                            paid_amount: paid
                          }))
                        }}
                        placeholder="0"
                        className="border-destructive/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-primary font-bold">Paid Amt</Label>
                      <Input
                        type="number"
                        value={newProductSale.paid_amount}
                        onChange={(e) => {
                          const paid = e.target.value;
                          const total = parseFloat(newProductSale.total_amount || "0");
                          const discount = (total - parseFloat(paid || "0")).toString();
                          setNewProductSale(prev => ({
                            ...prev,
                            paid_amount: paid,
                            discount_amount: discount
                          }))
                        }}
                        placeholder="0"
                        className="border-primary focus-visible:ring-primary font-black"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
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

                    {newProductSale.payment_method === "bank" && (
                      <div className="space-y-2 animate-in slide-in-from-top-2">
                        <Label>Select Bank Account</Label>
                        <Select value={newProductSale.bank_account_id || ""} onValueChange={(v) => setNewProductSale(prev => ({ ...prev, bank_account_id: v }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose Bank..." />
                          </SelectTrigger>
                          <SelectContent>
                            {bankAccounts.map(bank => (
                              <SelectItem key={bank.id} value={bank.id}>
                                {bank.account_name} (Rs. {bank.current_balance.toLocaleString()})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleAddProductSale}
                    disabled={
                      saving ||
                      !newProductSale.product_id ||
                      !newProductSale.quantity ||
                      !newProductSale.paid_amount ||
                      (oilProducts.find(p => p.id === newProductSale.product_id)?.current_stock || 0) < parseFloat(newProductSale.quantity || "0")
                    }
                  >
                    {saving ? <BrandLoader size="xs" /> : "Record Sale"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Today's Sales</CardTitle>
                <CardDescription>{productSales.length} items sold</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Retail</TableHead>
                        <TableHead className="text-right text-destructive">Disc.</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productSales.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No sales yet</TableCell>
                        </TableRow>
                      ) : (
                        productSales.map(sale => (
                          <TableRow key={sale.id}>
                            <TableCell className="font-medium">{sale.products?.product_name}</TableCell>
                            <TableCell className="text-right font-medium">{sale.quantity}</TableCell>
                            <TableCell className="text-right text-muted-foreground font-medium">Rs. {sale.total_amount?.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-destructive font-medium">Rs. {(sale.total_amount - sale.paid_amount).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-bold text-primary">Rs. {sale.paid_amount?.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CARD PAYMENTS TAB - STANDARDIZED PROFESSIONAL DESIGN */}
        <TabsContent value="cards" className="animate-in fade-in slide-in-from-bottom-2 duration-400 mt-4 space-y-6">
          <Tabs value={cardSubTab} onValueChange={(v) => setCardSubTab(v as any)} className="w-full">
            <div className="border-b border-border/10 mb-6">
              <TabsList className="bg-slate-100/50 p-1 gap-1 h-10 w-fit justify-start rounded-xl border border-slate-200/50">
                <TabsTrigger
                  value="manage"
                  className="Lato font-black uppercase text-[10px] tracking-widest px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all h-8"
                >
                  Reconciliation
                </TabsTrigger>
                <TabsTrigger
                  value="totals"
                  className="Lato font-black uppercase text-[10px] tracking-widest px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all h-8"
                >
                  Daily Entry
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="totals" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6 border-b border-border/10">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-black Lato uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Card Sales Entry
                    </CardTitle>
                    <CardDescription className="text-xs font-medium Lato">
                      Enter daily card totals to be deducted from shift net cash.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleSubmitCardPayments}
                    disabled={saving}
                    className="Lato font-black uppercase text-[10px] tracking-widest px-8"
                  >
                    {saving ? <BrandLoader size="xs" /> : <><Save className="mr-2 h-4 w-4" /> Save Totals</>}
                  </Button>
                </CardHeader>
                <CardContent className="pt-8">
                  <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
                    {activeCardTypes.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-muted-foreground italic bg-muted/20 rounded-xl border border-dashed Lato text-xs uppercase tracking-widest">
                        No active card channels integrated
                      </div>
                    ) : (
                      activeCardTypes.map(ct => (
                        <div key={ct.id} className="space-y-2.5 group">
                          <Label htmlFor={`card_${ct.id}`} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-primary Lato">
                            {ct.card_name.toLowerCase().includes("shell") ? (
                              <img src="https://www.shell.com.pk/etc.clientlibs/shell/clientlibs/clientlib-site/resources/resources/favicons/favicon-32x32.png" alt="S" className="h-3.5 w-3.5" />
                            ) : <CreditCard className="h-3.5 w-3.5" />}
                            {ct.card_name}
                          </Label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xs Lato">Rs.</div>
                            <Input
                              id={`card_${ct.id}`}
                              type="number"
                              className="pl-9 h-11 Lato font-black text-lg focus-visible:ring-1 focus-visible:ring-primary/20 transition-all"
                              value={cardAmounts[ct.id] || ""}
                              onChange={(e) => setCardAmounts(prev => ({ ...prev, [ct.id]: e.target.value }))}
                              placeholder="0"
                            />
                            {parseFloat(cardAmounts[ct.id] || "0") > 0 && (
                              <div className="absolute -bottom-5 right-2 flex items-center gap-1.5 animate-in slide-in-from-top-1 duration-300">
                                <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                                <span className="text-[9px] font-bold text-green-600 uppercase Lato">Updated</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
                <CardFooter className="mt-8 bg-muted/20 py-5 border-t flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground font-medium text-[10px] Lato">
                    <AlertCircle className="h-4 w-4" />
                    Pending settlement reconciliation
                  </div>
                  <div className="flex items-center gap-6 px-5 py-2.5 bg-white rounded-lg border shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground Lato">Card Summary Total</span>
                    <span className="text-2xl font-black text-primary tracking-tighter Lato">
                      <span className="text-sm font-medium mr-1 text-muted-foreground">Rs.</span>
                      {Object.values(cardAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toLocaleString()}
                    </span>
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="manage" className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <CardManagement />
            </TabsContent>
          </Tabs>
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
          <BrandLoader size="xl" className="mb-6" />
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold tracking-tight text-[#DD1D21]">Syncing Sales Data...</h3>
            <p className="text-muted-foreground animate-pulse font-bold">Updating inventory and account balances</p>
          </div>
        </div>
      )}
    </div>
  )
}
