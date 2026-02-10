"use client"

import React from "react"
import { useState, useEffect } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { 
  Loader2, 
  AlertCircle, 
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Fuel,
  Banknote,
  ArrowRight,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Supplier {
  id: string
  supplier_name: string
  supplier_type: string
}

interface Product {
  id: string
  product_name: string
  product_type: string
  current_stock: number
  purchase_price: number
  selling_price: number
  tank_capacity: number | null
  minimum_stock_level: number
  stock_value: number
}

interface DailyBalance {
  id: string
  balance_date: string
  cash_opening: number
  cash_closing: number | null
  bank_opening: number
  bank_closing: number | null
  is_closed: boolean
}

interface PurchaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Step = "form" | "confirm" | "success"

export function PurchaseDialog({ open, onOpenChange, onSuccess }: PurchaseDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState<Step>("form")
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [todayBalance, setTodayBalance] = useState<DailyBalance | null>(null)
  const [successData, setSuccessData] = useState<Record<string, any> | null>(null)
  
  const [formData, setFormData] = useState({
    purchase_date: new Date().toISOString().split("T")[0],
    supplier_id: "",
    product_id: "",
    quantity: "",
    purchase_price_per_unit: "",
    payment_method: "cash",
    invoice_number: "",
    notes: "",
  })

  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetchSuppliers()
      fetchProducts()
      fetchTodayBalance()
      setStep("form")
      setError("")
      setSuccessData(null)
      setFormData({
        purchase_date: new Date().toISOString().split("T")[0],
        supplier_id: "",
        product_id: "",
        quantity: "",
        purchase_price_per_unit: "",
        payment_method: "cash",
        invoice_number: `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        notes: "",
      })
    }
  }, [open])

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, supplier_name, supplier_type")
      .eq("status", "active")
      .order("supplier_name")
    if (data) setSuppliers(data)
  }

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("id, product_name, product_type, current_stock, purchase_price, selling_price, tank_capacity, minimum_stock_level, stock_value")
      .eq("status", "active")
      .eq("product_type", "fuel")
      .order("product_name")
    if (data) setProducts(data)
  }

  const fetchTodayBalance = async () => {
    const today = new Date().toISOString().split("T")[0]
    const { data } = await supabase
      .from("daily_balances")
      .select("*")
      .eq("balance_date", today)
      .maybeSingle()

    if (data) {
      setTodayBalance(data)
    } else {
      // Fallback: get latest balance
      const { data: latest } = await supabase
        .from("daily_balances")
        .select("*")
        .order("balance_date", { ascending: false })
        .limit(1)
        .maybeSingle()
      setTodayBalance(latest)
    }
  }

  // Get available balance for selected payment method
  const getAvailableBalance = (): number => {
    if (!todayBalance) return 0
    if (formData.payment_method === "cash") {
      return Number(todayBalance.cash_closing ?? todayBalance.cash_opening ?? 0)
    }
    return Number(todayBalance.bank_closing ?? todayBalance.bank_opening ?? 0)
  }

  // Check if supplier can provide fuel
  const canSupplyFuel = (supplier: Supplier, productName: string): boolean => {
    const lower = productName.toLowerCase()
    const isPetrol = lower.includes("petrol") || lower.includes("hi-octane")
    const isDiesel = lower.includes("diesel")
    const t = supplier.supplier_type

    if (t === "both_petrol_diesel" || t === "both_petrol_diesel_and_oils") return true
    if (t === "petrol" && isPetrol) return true
    if (t === "diesel" && isDiesel) return true
    return false
  }

  // Filter suppliers by selected product - deduplicate by name
  useEffect(() => {
    if (formData.product_id && selectedProduct) {
      const validSuppliers = suppliers.filter(s => canSupplyFuel(s, selectedProduct.product_name))
      // Deduplicate by supplier_name
      const seen = new Set<string>()
      const deduped = validSuppliers.filter(s => {
        const name = s.supplier_name.toLowerCase()
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
      setFilteredSuppliers(deduped)
      if (formData.supplier_id && !deduped.find(s => s.id === formData.supplier_id)) {
        setFormData(prev => ({ ...prev, supplier_id: "" }))
      }
    } else {
      const fuelSuppliers = suppliers.filter(s => s.supplier_type !== "products_oils")
      const seen = new Set<string>()
      const deduped = fuelSuppliers.filter(s => {
        const name = s.supplier_name.toLowerCase()
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
      setFilteredSuppliers(deduped)
    }
  }, [formData.product_id, selectedProduct, suppliers])

  // Update selected product and auto-fill purchase price
  useEffect(() => {
    if (formData.product_id) {
      const product = products.find(p => p.id === formData.product_id)
      setSelectedProduct(product || null)
      if (product) {
        setFormData(prev => ({ ...prev, purchase_price_per_unit: product.purchase_price.toString() }))
      }
    } else {
      setSelectedProduct(null)
    }
  }, [formData.product_id, products])

  // Calculate purchase impact
  const calculation = (() => {
    if (!selectedProduct || !formData.quantity || !formData.purchase_price_per_unit) return null

    const quantity = parseFloat(formData.quantity)
    const unitPrice = parseFloat(formData.purchase_price_per_unit)
    if (quantity <= 0 || unitPrice <= 0) return null

    const currentStock = selectedProduct.current_stock
    const purchaseValue = quantity * unitPrice
    const newTotalStock = currentStock + quantity
    const newStockValue = newTotalStock * unitPrice // All stock valued at new price
    const tankCapacity = selectedProduct.tank_capacity || 0
    const exceedsTank = tankCapacity > 0 && newTotalStock > tankCapacity
    const availableCapacity = tankCapacity > 0 ? tankCapacity - currentStock : Infinity
    const tankPercentAfter = tankCapacity > 0 ? (newTotalStock / tankCapacity) * 100 : 0

    const priceChanged = Math.abs(unitPrice - selectedProduct.purchase_price) > 0.01
    const priceChangeAmount = unitPrice - selectedProduct.purchase_price
    const priceChangePercent = selectedProduct.purchase_price > 0
      ? (priceChangeAmount / selectedProduct.purchase_price) * 100 : 0

    return {
      quantity, unitPrice, purchaseValue,
      currentStock, newTotalStock, newStockValue,
      tankCapacity, exceedsTank, availableCapacity, tankPercentAfter,
      priceChanged, priceChangeAmount, priceChangePercent,
    }
  })()

  const availableBalance = getAvailableBalance()

  const validateForm = async (): Promise<string | null> => {
    if (!formData.purchase_date) return "Please select a purchase date"
    const purchaseDate = new Date(formData.purchase_date)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (purchaseDate > today) return "Purchase date cannot be in the future"
    if (!formData.supplier_id) return "Please select a supplier"
    if (!formData.product_id) return "Please select a fuel type"
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) return "Please enter a valid quantity"
    if (!formData.purchase_price_per_unit || parseFloat(formData.purchase_price_per_unit) <= 0) return "Please enter a valid price"
    if (!formData.invoice_number.trim()) return "Please enter an invoice number"

    // Check duplicate invoice
    const { data: existing } = await supabase
      .from("purchases")
      .select("id")
      .eq("invoice_number", formData.invoice_number.trim())
      .limit(1)
    if (existing && existing.length > 0) {
      return `Invoice "${formData.invoice_number}" already exists. Use a different number.`
    }

    if (!calculation) return "Unable to calculate purchase"
    if (calculation.exceedsTank) {
      return `Exceeds tank capacity! Available: ${calculation.availableCapacity.toLocaleString()} L`
    }
    if (!todayBalance) {
      return "No daily balance found. Please set up today's opening balance in the Balance page first."
    }
    if (calculation.purchaseValue > availableBalance) {
      const method = formData.payment_method === "cash" ? "Cash" : "Bank"
      return `Insufficient ${method} balance.\nRequired: Rs. ${calculation.purchaseValue.toLocaleString()}\nAvailable: Rs. ${availableBalance.toLocaleString()}\nShortfall: Rs. ${(calculation.purchaseValue - availableBalance).toLocaleString()}`
    }
    return null
  }

  const handleProceedToConfirm = async () => {
    setError("")
    const err = await validateForm()
    if (err) { setError(err); return }
    setStep("confirm")
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError("")

    try {
      if (!selectedProduct || !calculation || !todayBalance) {
        throw new Error("Missing required data")
      }

      const supplier = suppliers.find(s => s.id === formData.supplier_id)

      // 1. Insert purchase record
      const { error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          purchase_date: formData.purchase_date,
          supplier_id: formData.supplier_id,
          product_id: formData.product_id,
          quantity: calculation.quantity,
          purchase_price_per_unit: calculation.unitPrice,
          total_amount: calculation.purchaseValue,
          payment_method: formData.payment_method,
          invoice_number: formData.invoice_number.trim(),
          notes: formData.notes || null,
          old_weighted_avg: selectedProduct.purchase_price,
          new_weighted_avg: calculation.unitPrice,
          status: "completed",
        })
      if (purchaseError) throw purchaseError

      // 2. Update product: new stock, new purchase price applied to ALL stock (no avg)
      const { error: productError } = await supabase
        .from("products")
        .update({
          current_stock: calculation.newTotalStock,
          purchase_price: calculation.unitPrice,
          weighted_avg_cost: calculation.unitPrice,
          stock_value: calculation.newStockValue,
          last_purchase_price: calculation.unitPrice,
          last_purchase_date: formData.purchase_date,
        })
        .eq("id", formData.product_id)
      if (productError) throw productError

      // 3. Record stock movement
      await supabase.from("stock_movements").insert({
        product_id: formData.product_id,
        movement_type: "purchase",
        quantity: calculation.quantity,
        unit_price: calculation.unitPrice,
        weighted_avg_after: calculation.unitPrice,
        balance_after: calculation.newTotalStock,
        supplier_id: formData.supplier_id,
        reference_type: "purchase",
        reference_number: formData.invoice_number.trim(),
        notes: `Purchased ${calculation.quantity.toLocaleString()} L of ${selectedProduct.product_name} at Rs. ${calculation.unitPrice}/L from ${supplier?.supplier_name || "supplier"}. Total: Rs. ${calculation.purchaseValue.toLocaleString()}. Paid via ${formData.payment_method === "cash" ? "Cash" : "Bank"}.`,
      })

      // 4. Record price history if price changed
      if (calculation.priceChanged) {
        await supabase.from("price_history").insert({
          product_id: formData.product_id,
          old_purchase_price: selectedProduct.purchase_price,
          new_purchase_price: calculation.unitPrice,
          old_weighted_avg: selectedProduct.purchase_price,
          new_weighted_avg: calculation.unitPrice,
          change_reason: `Price ${calculation.priceChangeAmount > 0 ? "increased" : "decreased"} from Rs. ${selectedProduct.purchase_price} to Rs. ${calculation.unitPrice}/L`,
        })
      }

      // 5. Deduct from daily_balances
      const newBalance = availableBalance - calculation.purchaseValue
      if (formData.payment_method === "cash") {
        await supabase.from("daily_balances").update({
          cash_closing: newBalance,
        }).eq("id", todayBalance.id)
      } else {
        await supabase.from("daily_balances").update({
          bank_closing: newBalance,
        }).eq("id", todayBalance.id)
      }

      // 6. Update supplier totals
      const { data: suppData } = await supabase
        .from("suppliers")
        .select("total_purchases")
        .eq("id", formData.supplier_id)
        .single()
      if (suppData) {
        await supabase.from("suppliers").update({
          total_purchases: (suppData.total_purchases || 0) + calculation.purchaseValue,
          last_purchase_date: formData.purchase_date,
        }).eq("id", formData.supplier_id)
      }

      // 7. Record transaction
      await supabase.from("transactions").insert({
        transaction_date: new Date().toISOString(),
        transaction_type: "expense",
        category: "Fuel Purchase",
        description: `${selectedProduct.product_name} - ${calculation.quantity.toLocaleString()} L @ Rs. ${calculation.unitPrice}/L`,
        amount: calculation.purchaseValue,
        payment_method: formData.payment_method,
        reference_type: "purchase",
      })

      setSuccessData({
        product: selectedProduct.product_name,
        quantity: calculation.quantity,
        unitPrice: calculation.unitPrice,
        totalCost: calculation.purchaseValue,
        paymentMethod: formData.payment_method,
        previousStock: calculation.currentStock,
        newStock: calculation.newTotalStock,
        tankPercent: calculation.tankPercentAfter,
        newBalance,
        invoiceNumber: formData.invoice_number,
        supplierName: supplier?.supplier_name || "",
        priceChanged: calculation.priceChanged,
        oldPrice: selectedProduct.purchase_price,
      })
      setStep("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (step === "success") onSuccess()
    onOpenChange(false)
    setStep("form")
    setError("")
    setSuccessData(null)
  }

  const formatCurrency = (amount: number) => `Rs. ${Number(amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* STEP 1: FORM */}
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Fuel className="h-5 w-5" />
                New Fuel Purchase
              </DialogTitle>
              <DialogDescription>
                Record a fuel purchase. Price will be applied across all stock.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Balance Display */}
              <div className="grid grid-cols-2 gap-4">
                <Card className={`${formData.payment_method === "cash" ? "border-primary" : ""}`}>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Cash Balance</div>
                    <div className="text-lg font-bold">
                      {formatCurrency(Number(todayBalance?.cash_closing ?? todayBalance?.cash_opening ?? 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card className={`${formData.payment_method === "bank_transfer" ? "border-primary" : ""}`}>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Bank Balance</div>
                    <div className="text-lg font-bold">
                      {formatCurrency(Number(todayBalance?.bank_closing ?? todayBalance?.bank_opening ?? 0))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Purchase Date</Label>
                  <Input
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fuel Type</Label>
                  <Select value={formData.product_id} onValueChange={(v) => setFormData({ ...formData, product_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select fuel" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.product_name} (Stock: {p.current_stock.toLocaleString()} L)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {filteredSuppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.supplier_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantity (Liters)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="Enter liters"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Price per Liter</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={formData.purchase_price_per_unit}
                    onChange={(e) => setFormData({ ...formData, purchase_price_per_unit: e.target.value })}
                    placeholder="Enter price"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  placeholder="Enter invoice number"
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>

              {/* Purchase Summary */}
              {calculation && (
                <Card className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Amount:</span>
                        <span className="ml-2 font-bold text-lg">{formatCurrency(calculation.purchaseValue)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Balance After:</span>
                        <span className={`ml-2 font-bold text-lg ${availableBalance - calculation.purchaseValue < 0 ? "text-destructive" : "text-primary"}`}>
                          {formatCurrency(availableBalance - calculation.purchaseValue)}
                        </span>
                      </div>
                      {calculation.priceChanged && (
                        <div className="col-span-2">
                          <Badge variant={calculation.priceChangeAmount > 0 ? "destructive" : "secondary"}>
                            Price {calculation.priceChangeAmount > 0 ? "increased" : "decreased"} by {Math.abs(calculation.priceChangePercent).toFixed(1)}%
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-2">
                            New price will apply to all existing stock
                          </span>
                        </div>
                      )}
                      {calculation.purchaseValue > availableBalance && (
                        <div className="col-span-2 text-destructive font-medium">
                          Insufficient {formData.payment_method === "cash" ? "Cash" : "Bank"} Balance!
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleProceedToConfirm} disabled={!calculation}>
                Review Purchase <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 2: CONFIRMATION */}
        {step === "confirm" && calculation && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5" />
                Confirm Purchase
              </DialogTitle>
              <DialogDescription>Review all details before confirming</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {calculation.priceChanged && (
                <Alert variant={calculation.priceChangeAmount > 0 ? "destructive" : "default"}>
                  {calculation.priceChangeAmount > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  <AlertTitle>Price {calculation.priceChangeAmount > 0 ? "Increase" : "Decrease"} Detected</AlertTitle>
                  <AlertDescription>
                    Price changed from {formatCurrency(selectedProduct!.purchase_price)} to {formatCurrency(calculation.unitPrice)} per liter
                    ({calculation.priceChangePercent > 0 ? "+" : ""}{calculation.priceChangePercent.toFixed(1)}%).
                    This new price will be applied to ALL existing stock.
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Purchase Details</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Product:</span><span className="font-medium">{selectedProduct?.product_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Supplier:</span><span className="font-medium">{suppliers.find(s => s.id === formData.supplier_id)?.supplier_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Quantity:</span><span className="font-medium">{calculation.quantity.toLocaleString()} L</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Price/L:</span><span className="font-medium">{formatCurrency(calculation.unitPrice)}</span></div>
                  <Separator />
                  <div className="flex justify-between text-lg"><span className="font-medium">Total:</span><span className="font-bold">{formatCurrency(calculation.purchaseValue)}</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Stock Update</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Current Stock:</span><span>{calculation.currentStock.toLocaleString()} L</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">After Purchase:</span><span className="font-bold text-primary">{calculation.newTotalStock.toLocaleString()} L</span></div>
                  {calculation.tankCapacity > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Tank Usage:</span><span>{calculation.tankPercentAfter.toFixed(1)}%</span></div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Payment</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Method:</span><Badge variant="outline">{formData.payment_method === "cash" ? "Cash" : "Bank Transfer"}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Current Balance:</span><span>{formatCurrency(availableBalance)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Deduction:</span><span className="text-destructive">-{formatCurrency(calculation.purchaseValue)}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="font-medium">After Purchase:</span><span className="font-bold text-primary">{formatCurrency(availableBalance - calculation.purchaseValue)}</span></div>
                </CardContent>
              </Card>

              {error && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")}>Back</Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Purchase
              </Button>
            </DialogFooter>
          </>
        )}

        {/* STEP 3: SUCCESS */}
        {step === "success" && successData && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                Purchase Completed
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <Alert className="border-primary bg-primary/5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle>Transaction Recorded</AlertTitle>
                <AlertDescription>
                  {successData.quantity.toLocaleString()} L of {successData.product} purchased successfully.
                </AlertDescription>
              </Alert>

              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice:</span><span className="font-mono">{successData.invoiceNumber}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Supplier:</span><span>{successData.supplierName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Paid:</span><span className="font-bold">{formatCurrency(successData.totalCost)}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Stock:</span><span>{successData.previousStock.toLocaleString()} L  {successData.newStock.toLocaleString()} L</span></div>
                  {successData.priceChanged && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Price Updated:</span><span>{formatCurrency(successData.oldPrice)} {formatCurrency(successData.unitPrice)}/L</span></div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{successData.paymentMethod === "cash" ? "Cash" : "Bank"} Balance:</span>
                    <span className="font-bold">{formatCurrency(successData.newBalance)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
