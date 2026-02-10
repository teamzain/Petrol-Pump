"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import {
  Save,
  Gauge,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Fuel,
  Package,
  Calendar,
  RefreshCw,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
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

interface Nozzle {
  id: string
  nozzle_name: string
  pump_number: string | null
  nozzle_side: string | null
  product_id: string
  current_reading: number
  products: {
    id: string
    product_name: string
    selling_price: number
    weighted_avg_cost: number
    current_stock: number
  }
}

interface NozzleReading {
  nozzle_id: string
  opening_reading: number
  closing_reading: string
  liters_sold: number
  sales_amount: number
}

interface OilProduct {
  id: string
  product_name: string
  category: string
  unit: string
  current_stock: number
  selling_price: number
  weighted_avg_cost: number
}

interface ProductSale {
  product_id: string
  quantity: string
  unit: string
  unit_price: number
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
  const [productSales, setProductSales] = useState<ProductSale[]>([])
  const [dailyBalance, setDailyBalance] = useState<DailyBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [productSaleDialogOpen, setProductSaleDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])

  const [newProductSale, setNewProductSale] = useState({
    product_id: "",
    quantity: "",
    payment_method: "cash",
  })

  const supabase = createClient()
  const today = new Date().toISOString().split("T")[0]

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch nozzles with product info
    const { data: nozzlesData } = await supabase
      .from("nozzles")
      .select("*, products(id, product_name, selling_price, weighted_avg_cost, current_stock)")
      .eq("status", "active")
      .order("pump_number")
      .order("nozzle_side")

    // Fetch today's readings
    const { data: readingsData } = await supabase
      .from("nozzle_readings")
      .select("*")
      .eq("reading_date", selectedDate)

    if (nozzlesData) {
      setNozzles(nozzlesData as Nozzle[])
      // Initialize readings with current readings as opening
      setNozzleReadings(nozzlesData.map(n => {
        // Check if we already have a reading for this nozzle today
        const existing = readingsData?.find(r => r.nozzle_id === n.id)

        if (existing) {
          return {
            id: existing.id,
            nozzle_id: n.id,
            opening_reading: existing.opening_reading,
            closing_reading: existing.closing_reading.toString(),
            liters_sold: existing.liters_dispensed,
            sales_amount: existing.sales_amount
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

    // Fetch oil products
    const { data: oilData } = await supabase
      .from("products")
      .select("*")
      .eq("status", "active")
      .eq("product_type", "oil_lubricant")
      .order("product_name")

    if (oilData) setOilProducts(oilData)

    // Fetch today's balance
    const { data: balanceData } = await supabase
      .from("daily_balances")
      .select("*")
      .eq("balance_date", today)
      .limit(1)

    if (balanceData && balanceData.length > 0) {
      setDailyBalance(balanceData[0])
    }

    setLoading(false)
  }, [supabase, today])

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('sales_page_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
        },
        (payload) => {
          if (
            payload.table === 'sales' ||
            payload.table === 'nozzles' ||
            payload.table === 'daily_balances' ||
            payload.table === 'products'
          ) {
            fetchData()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData, supabase])

  // Update nozzle reading
  const handleReadingChange = (nozzleId: string, closingReading: string) => {
    setNozzleReadings(prev => prev.map(r => {
      if (r.nozzle_id !== nozzleId) return r

      const closing = parseFloat(closingReading) || 0
      const liters = closing > r.opening_reading ? closing - r.opening_reading : 0
      const nozzle = nozzles.find(n => n.id === nozzleId)
      const sellingPrice = nozzle?.products?.selling_price || 0

      return {
        ...r,
        closing_reading: closingReading,
        liters_sold: liters,
        sales_amount: liters * sellingPrice,
      }
    }))
  }

  // Calculate totals
  const totalLitersSold = nozzleReadings.reduce((sum, r) => sum + r.liters_sold, 0)
  const totalFuelSales = nozzleReadings.reduce((sum, r) => sum + r.sales_amount, 0)
  const totalProductSales = productSales.reduce((sum, s) => sum + s.total, 0)
  const grandTotal = totalFuelSales + totalProductSales

  // Validate readings
  const validateReadings = (): string | null => {
    for (const reading of nozzleReadings) {
      if (!reading.closing_reading) continue

      const closing = parseFloat(reading.closing_reading)
      if (closing < reading.opening_reading) {
        const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
        return `Closing reading for ${nozzle?.nozzle_name} cannot be less than opening reading`
      }
    }
    return null
  }

  // Handle fuel sales submission
  const handleSubmitFuelSales = async () => {
    const validationError = validateReadings()
    if (validationError) {
      setError(validationError)
      return
    }

    // Filter only readings with actual sales
    const salesReadings = nozzleReadings.filter(r => r.liters_sold > 0)
    if (salesReadings.length === 0) {
      setError("Please enter at least one closing reading")
      return
    }

    // Validate Status and Stock
    for (const reading of salesReadings) {
      const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
      if (!nozzle) continue

      // Check stock
      if (reading.liters_sold > nozzle.products.current_stock) {
        setError(
          `Insufficient stock for ${nozzle.products.product_name}. ` +
          `Attempting to sell ${reading.liters_sold.toLocaleString()} L but only ${nozzle.products.current_stock.toLocaleString()} L available.`
        )
        return
      }
    }

    setConfirmDialogOpen(true)
  }

  const confirmFuelSales = async () => {
    setSaving(true)
    setError("")

    try {
      const salesReadings = nozzleReadings.filter(r => r.liters_sold > 0)

      for (const reading of salesReadings) {
        const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
        if (!nozzle) continue

        const closing = parseFloat(reading.closing_reading)
        const product = nozzle.products

        // Record nozzle reading
        await supabase.from("nozzle_readings").insert({
          nozzle_id: reading.nozzle_id,
          reading_date: selectedDate,
          opening_reading: reading.opening_reading,
          closing_reading: closing,
          liters_dispensed: reading.liters_sold,
          product_id: nozzle.product_id,
        })

        // Update nozzle current reading
        await supabase
          .from("nozzles")
          .update({ current_reading: closing })
          .eq("id", reading.nozzle_id)

        // Record sale
        await supabase.from("sales").insert({
          sale_date: selectedDate,
          product_id: nozzle.product_id,
          quantity: reading.liters_sold,
          unit_price: product.selling_price,
          total_amount: reading.sales_amount,
          cost_price: product.weighted_avg_cost,
          profit: reading.sales_amount - (reading.liters_sold * product.weighted_avg_cost),
          sale_type: "fuel",
          nozzle_id: reading.nozzle_id,
          payment_method: "cash", // Fuel sales default to cash
        })

        // Update product stock
        await supabase
          .from("products")
          .update({
            current_stock: product.current_stock - reading.liters_sold,
            stock_value: (product.current_stock - reading.liters_sold) * product.weighted_avg_cost,
          })
          .eq("id", nozzle.product_id)

        // Record stock movement
        await supabase.from("stock_movements").insert({
          product_id: nozzle.product_id,
          movement_type: "sale",
          quantity: -reading.liters_sold,
          unit_price: product.selling_price,
          balance_after: product.current_stock - reading.liters_sold,
          reference_type: "sale",
          notes: `Fuel Sale - ${product.product_name} via ${nozzle.nozzle_name}`,
        })
      }

      // Update daily balance (add cash from fuel sales)
      if (dailyBalance) {
        const currentCash = dailyBalance.cash_closing ?? dailyBalance.cash_opening
        await supabase
          .from("daily_balances")
          .update({ cash_closing: currentCash + totalFuelSales })
          .eq("id", dailyBalance.id)
      }

      setSuccess(`Fuel sales recorded successfully! Total: Rs. ${totalFuelSales.toLocaleString()}`)
      setConfirmDialogOpen(false)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record sales")
    } finally {
      setSaving(false)
    }
  }

  // Handle product sale
  const handleAddProductSale = async () => {
    setError("")

    if (!newProductSale.product_id) {
      setError("Please select a product")
      return
    }
    if (!newProductSale.quantity || parseFloat(newProductSale.quantity) <= 0) {
      setError("Please enter a valid quantity")
      return
    }

    const product = oilProducts.find(p => p.id === newProductSale.product_id)
    if (!product) {
      setError("Product not found")
      return
    }

    const quantity = parseFloat(newProductSale.quantity)

    // Validate unit precision
    // Assuming 'liters' allows decimals, everything else (cans, bottles, pieces) is integer only
    const isDecimalUnit = product.unit.toLowerCase().includes("liter")

    if (!isDecimalUnit && !Number.isInteger(quantity)) {
      setError(`"${product.product_name}" is sold in ${product.unit} and cannot be sold in fractions. Please enter a whole number.`)
      return
    }

    if (quantity > product.current_stock) {
      setError(`Insufficient stock. Available: ${product.current_stock} ${product.unit}`)
      return
    }

    setSaving(true)

    try {
      const total = quantity * product.selling_price
      const profit = total - (quantity * product.weighted_avg_cost)

      // Record sale
      await supabase.from("sales").insert({
        sale_date: selectedDate,
        product_id: product.id,
        quantity: quantity,
        unit_price: product.selling_price,
        total_amount: total,
        cost_price: product.weighted_avg_cost,
        profit: profit,
        sale_type: "product",
        payment_method: newProductSale.payment_method,
      })

      // Update product stock
      await supabase
        .from("products")
        .update({
          current_stock: product.current_stock - quantity,
          stock_value: (product.current_stock - quantity) * product.weighted_avg_cost,
        })
        .eq("id", product.id)

      // Record stock movement
      await supabase.from("stock_movements").insert({
        product_id: product.id,
        movement_type: "sale",
        quantity: -quantity,
        unit_price: product.selling_price,
        balance_after: product.current_stock - quantity,
        reference_type: "sale",
        notes: `Product Sale - ${product.product_name}`,
      })

      // Update daily balance
      if (dailyBalance) {
        if (newProductSale.payment_method === "cash") {
          const currentCash = dailyBalance.cash_closing ?? dailyBalance.cash_opening
          await supabase
            .from("daily_balances")
            .update({ cash_closing: currentCash + total })
            .eq("id", dailyBalance.id)
        } else {
          const currentBank = dailyBalance.bank_closing ?? dailyBalance.bank_opening
          await supabase
            .from("daily_balances")
            .update({ bank_closing: currentBank + total })
            .eq("id", dailyBalance.id)
        }
      }

      setSuccess(`Product sale recorded: ${quantity} ${product.unit} of ${product.product_name} - Rs. ${total.toLocaleString()}`)
      setProductSaleDialogOpen(false)
      setNewProductSale({ product_id: "", quantity: "", payment_method: "cash" })
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record product sale")
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Group nozzles by pump for display
  const groupedNozzles = nozzles.reduce((acc, nozzle) => {
    const pumpKey = nozzle.pump_number || "Unassigned"
    if (!acc[pumpKey]) acc[pumpKey] = []
    acc[pumpKey].push(nozzle)
    return acc
  }, {} as Record<string, Nozzle[]>)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Sales Management</h1>
        <p className="text-muted-foreground">
          Record daily fuel meter readings and product sales
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fuel Sales</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalFuelSales)}</div>
            <p className="text-xs text-muted-foreground">{totalLitersSold.toLocaleString()} liters</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Product Sales</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalProductSales)}</div>
            <p className="text-xs text-muted-foreground">{productSales.length} items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(grandTotal)}</div>
            <p className="text-xs text-muted-foreground">Today's total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Nozzles</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nozzles.length}</div>
            <p className="text-xs text-muted-foreground">Recording sales</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Fuel and Product Sales */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="fuel" className="gap-2">
            <Fuel className="h-4 w-4" />
            Fuel Sales
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <Package className="h-4 w-4" />
            Product Sales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Daily Meter Readings</CardTitle>
                  <CardDescription>
                    Enter closing readings for each nozzle to calculate fuel sales
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={fetchData}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                  <Button
                    onClick={handleSubmitFuelSales}
                    disabled={totalLitersSold === 0}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Record Sales
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : nozzles.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-center">
                  <Gauge className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No nozzles configured</p>
                  <p className="text-xs text-muted-foreground">
                    Go to Nozzle Configuration to set up your pumps
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedNozzles).map(([pump, pumpNozzles]) => (
                    <div key={pump} className="space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Fuel className="h-4 w-4" />
                        {pump === "Unassigned" ? "Unassigned Nozzles" : `Pump ${pump}`}
                      </h3>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nozzle</TableHead>
                              <TableHead>Fuel Type</TableHead>
                              <TableHead className="text-right">Opening</TableHead>
                              <TableHead className="text-right">Closing</TableHead>
                              <TableHead className="text-right">Liters Sold</TableHead>
                              <TableHead className="text-right">Rate</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pumpNozzles.map((nozzle) => {
                              const reading = nozzleReadings.find(r => r.nozzle_id === nozzle.id)
                              return (
                                <TableRow key={nozzle.id}>
                                  <TableCell className="font-medium">
                                    {nozzle.nozzle_name}
                                    {nozzle.nozzle_side && (
                                      <span className="text-xs text-muted-foreground ml-1 capitalize">
                                        ({nozzle.nozzle_side})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {nozzle.products?.product_name}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {reading?.opening_reading.toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      type="number"
                                      step="0.001"
                                      min={reading?.opening_reading}
                                      value={reading?.closing_reading || ""}
                                      onChange={(e) => handleReadingChange(nozzle.id, e.target.value)}
                                      placeholder="Enter closing"
                                      className="w-32 text-right font-mono"
                                    />
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-medium">
                                    {(reading?.liters_sold || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(nozzle.products?.selling_price || 0)}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatCurrency(reading?.sales_amount || 0)}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}

                  <Separator />

                  {/* Totals */}
                  <div className="flex justify-end">
                    <Card className="w-80">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Liters:</span>
                          <span className="font-mono font-medium">
                            {totalLitersSold.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-lg">
                          <span className="font-medium">Total Sales:</span>
                          <span className="font-bold text-primary">
                            {formatCurrency(totalFuelSales)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Product Sales</CardTitle>
                  <CardDescription>
                    Record manual sales of oils, lubricants, and other products
                  </CardDescription>
                </div>
                <Button onClick={() => setProductSaleDialogOpen(true)}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Record Sale
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {oilProducts.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-center">
                  <Package className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No products available</p>
                  <p className="text-xs text-muted-foreground">
                    Add products in the Oils & Lubricants section first
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Selling Price</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {oilProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.product_name}</TableCell>
                          <TableCell>{product.category || "-"}</TableCell>
                          <TableCell className="text-right">
                            {product.current_stock} {product.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.selling_price)}
                          </TableCell>
                          <TableCell>
                            {product.current_stock > 0 ? (
                              <Badge variant="secondary" className="bg-primary/10 text-primary">
                                In Stock
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Out of Stock</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Fuel Sales Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Fuel Sales</DialogTitle>
            <DialogDescription>
              Review and confirm the fuel sales to be recorded
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="rounded-md border p-4 space-y-2">
              {nozzleReadings.filter(r => r.liters_sold > 0).map((reading) => {
                const nozzle = nozzles.find(n => n.id === reading.nozzle_id)
                return (
                  <div key={reading.nozzle_id} className="flex justify-between text-sm">
                    <span>
                      {nozzle?.nozzle_name} ({nozzle?.products?.product_name})
                    </span>
                    <span className="font-mono">
                      {reading.liters_sold.toLocaleString()} L = {formatCurrency(reading.sales_amount)}
                    </span>
                  </div>
                )
              })}
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(totalFuelSales)}</span>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This will update nozzle readings, reduce stock, and add cash to today's balance.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmFuelSales} disabled={saving}>
              {saving ? "Recording..." : "Confirm Sales"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Sale Dialog */}
      <Dialog open={productSaleDialogOpen} onOpenChange={setProductSaleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Product Sale</DialogTitle>
            <DialogDescription>
              Enter the details of the product sale
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="product_id">Product</Label>
              <Select
                value={newProductSale.product_id}
                onValueChange={(value) => setNewProductSale({ ...newProductSale, product_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {oilProducts.filter(p => p.current_stock > 0).map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      <span className="flex flex-col">
                        <span>{product.product_name}</span>
                        <span className="text-xs text-muted-foreground">
                          Stock: {product.current_stock} {product.unit} | {formatCurrency(product.selling_price)}/{product.unit}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity ({
                oilProducts.find(p => p.id === newProductSale.product_id)?.unit || "units"
              })</Label>
              <Input
                id="quantity"
                type="number"
                step={oilProducts.find(p => p.id === newProductSale.product_id)?.unit.toLowerCase().includes("liter") ? "0.01" : "1"}
                min="0"
                value={newProductSale.quantity}
                onChange={(e) => setNewProductSale({ ...newProductSale, quantity: e.target.value })}
                placeholder={
                  oilProducts.find(p => p.id === newProductSale.product_id)?.unit.toLowerCase().includes("liter")
                    ? "e.g., 1.5"
                    : "e.g., 1, 2, 5 (Whole numbers only)"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">Payment Method</Label>
              <Select
                value={newProductSale.payment_method}
                onValueChange={(value) => setNewProductSale({ ...newProductSale, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newProductSale.product_id && newProductSale.quantity && (
              <div className="rounded-md border p-3 bg-muted/50">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount:</span>
                  <span className="font-bold">
                    {formatCurrency(
                      parseFloat(newProductSale.quantity) *
                      (oilProducts.find(p => p.id === newProductSale.product_id)?.selling_price || 0)
                    )}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProductSaleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddProductSale} disabled={saving}>
              {saving ? "Recording..." : "Record Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
