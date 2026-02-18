"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import { getTodayPKT } from "@/lib/utils"
import Link from "next/link"
import { ArrowLeft, Calendar as CalendarIcon, Search, Save, Lock, Unlock, AlertTriangle, CheckCircle2, Fuel, Droplet, TrendingUp, HandCoins, CreditCard } from "lucide-react"
import { BrandLoader } from "@/components/ui/brand-loader"

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
      // Logic for changes:
      // 1. Meter readings changed?
      // 2. Card totals changed?
      const cardTotalsChanged = JSON.stringify(cardAmounts) !== JSON.stringify(initialCardAmounts)

      const readingsToSave = nozzleReadings.filter(r => {
        const hasChange = r.liters_sold > 0
        const isEditable = !r.id || unlockedNozzles.has(r.nozzle_id)
        return hasChange && isEditable
      })

      if (readingsToSave.length === 0 && !cardTotalsChanged) {
        toast({ title: "No changes", description: "No new valid readings or card totals to save." })
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

      // If ONLY card totals changed, we need to apply them to an EXISTING reading
      if (readingsToSave.length === 0 && cardTotalsChanged) {
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
          shell_card_amount: 0, // Reset legacy
          bank_card_amount: 0   // Reset legacy
        }).eq("id", existingReading.id)
        if (nrErr) throw nrErr

        // Update the sale
        const { error: sErr } = await supabase.from("sales").update({
          total_card_amount: totalCardAmt,
          card_breakdown: breakdown,
          shell_card_amount: 0,
          bank_card_amount: 0
        }).eq("nozzle_id", existingReading.nozzle_id).eq("sale_date", selectedDate).eq("sale_type", "fuel")
        if (sErr) throw sErr

        toast({ title: "Success", description: "Daily card totals updated." })
        fetchData()
        return
      }

      // Validation
      for (const r of readingsToSave) {
        if (parseFloat(r.closing_reading) < r.opening_reading) {
          throw new Error(`Closing reading < Opening for a nozzle.`)
        }
      }

      // Save card totals to the first reading (or create/update)
      // Since we want to save "daily" totals, we just put them on the FIRST reading of the day.
      // The trigger will handle the deduction from cash.
      const firstReading = readingsToSave[0]
      const otherReadings = readingsToSave.slice(1)

      const saveReading = async (reading: any, isFirst: boolean) => {
        const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
        if (!nozzle) return

        const closing = parseFloat(reading.closing_reading)
        const product = nozzle.products
        const user = await supabase.auth.getUser()
        const userId = user.data.user?.id

        // Dynamic card breakdown only for the first reading
        const finalTotalCard = isFirst ? totalCardAmt : 0
        const finalBreakdown = isFirst ? breakdown : {}

        if (reading.id) {
          // Update Reading
          const { error: nrUpdateError } = await supabase.from("nozzle_readings").update({
            closing_reading: closing,
            quantity_sold: reading.liters_sold,
            sale_amount: reading.sales_amount,
            payment_method: reading.payment_method,
            bank_account_id: reading.payment_method === "bank" ? reading.bank_account_id : null,
            total_card_amount: finalTotalCard,
            card_breakdown: finalBreakdown,
            shell_card_amount: 0, // Clear legacy
            bank_card_amount: 0
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
            payment_method: reading.payment_method,
            bank_account_id: reading.payment_method === "bank" ? reading.bank_account_id : null,
            total_card_amount: finalTotalCard,
            card_breakdown: finalBreakdown,
            shell_card_amount: 0,
            bank_card_amount: 0,
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
            payment_method: reading.payment_method,
            bank_account_id: reading.payment_method === "bank" ? reading.bank_account_id : null,
            total_card_amount: finalTotalCard,
            card_breakdown: finalBreakdown,
            shell_card_amount: 0,
            bank_card_amount: 0,
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
            payment_method: reading.payment_method,
            bank_account_id: reading.payment_method === "bank" ? reading.bank_account_id : null,
            total_card_amount: finalTotalCard,
            card_breakdown: finalBreakdown,
            shell_card_amount: 0,
            bank_card_amount: 0,
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

      // Execute first reading save
      await saveReading(firstReading, true)

      // Execute others
      for (const r of otherReadings) {
        await saveReading(r, false)
      }

      toast({ title: "Success", description: "Sales recorded successfully." })
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
  const totalCardAmount = Object.values(cardAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
  const totalCombinedSales = totalFuelAmount + totalProductAmount
  const totalCashAmount = totalCombinedSales - totalCardAmount

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
      <div className="grid gap-4 md:grid-cols-3">
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
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="fuel" className="font-bold flex items-center gap-2">
            <Fuel className="h-4 w-4" />
            Fuel Sales
          </TabsTrigger>
          <TabsTrigger value="products" className="font-bold flex items-center gap-2">
            <Droplet className="h-4 w-4" />
            Lubricants & Others
          </TabsTrigger>
        </TabsList>

        {/* FUEL TAB */}
        <TabsContent value="fuel" className="space-y-6 mt-4">
          {/* Daily Card Summary */}
          <Card className="bg-slate-50 border-slate-200">
            <CardHeader className="py-4">
              <div className="flex items-center gap-2 text-slate-600">
                <HandCoins className="h-4 w-4" />
                <CardTitle className="text-sm font-bold uppercase tracking-wider">Daily Card Summary (Hold Payments)</CardTitle>
              </div>
              <CardDescription>Enter total card payments for the entire day. These will be deducted from cash sales.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {activeCardTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic col-span-2">No active card types found. Add them in Card Payments &gt; Card Settings.</p>
                ) : (
                  activeCardTypes.map(ct => (
                    <div key={ct.id} className="space-y-2">
                      <Label htmlFor={`card_${ct.id}`} className="flex items-center gap-2">
                        {ct.card_name.toLowerCase().includes("shell") ? (
                          <img src="https://www.shell.com.pk/etc.clientlibs/shell/clientlibs/clientlib-site/resources/resources/favicons/favicon-32x32.png" alt="S" className="h-4 w-4" />
                        ) : <CreditCard className="h-4 w-4 text-slate-400" />}
                        Total {ct.card_name} Payments
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Rs.</span>
                        <Input
                          id={`card_${ct.id}`}
                          type="number"
                          className="pl-12 font-bold text-lg border-2 focus-visible:ring-primary h-12"
                          value={cardAmounts[ct.id] || ""}
                          onChange={(e) => setCardAmounts(prev => ({ ...prev, [ct.id]: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
            <CardFooter className="bg-slate-100/50 py-3 flex justify-between">
              <div className="text-xs text-muted-foreground font-medium">
                Note: These amounts will be kept on "hold" until marked as received.
              </div>
              <div className="text-sm font-bold text-primary">
                Total Deductions: Rs. {Object.values(cardAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toLocaleString()}
              </div>
            </CardFooter>
          </Card>

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
