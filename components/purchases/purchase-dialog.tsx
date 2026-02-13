"use client"

import React from "react"
import { useState, useEffect } from "react"
import { getTodayPKT } from "@/lib/utils"
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
  ShoppingCart,
  Plus,
  X,
  CheckSquare,
  Package,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingCart as CartIcon } from "lucide-react"

interface Supplier {
  id: string
  supplier_name: string
  supplier_type: string
}

interface BankAccount {
  id: string
  account_name: string
  account_number: string | null
  current_balance: number
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

  // Data State
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [todayBalance, setTodayBalance] = useState<DailyBalance | null>(null)

  // Form State
  const [cart, setCart] = useState<{
    product: Product
    quantity: number
    unitPrice: number
    total: number
  }[]>([])

  const [formData, setFormData] = useState({
    purchase_date: getTodayPKT(),
    supplier_id: "",
    payment_method: "cash",
    bank_account_id: "",
    invoice_number: "",
    notes: "",
    paid_amount: "", // User input for amount paid
  })

  // Item Input State
  const [currentItem, setCurrentItem] = useState({
    product_id: "",
    quantity: "",
    unitPrice: "",
  })

  const [successData, setSuccessData] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetchSuppliers()
      fetchBankAccounts()
      fetchProducts()
      fetchTodayBalance()
      resetForm()
    }
  }, [open])

  const resetForm = () => {
    setStep("form")
    setError("")
    setCart([])
    setFormData({
      purchase_date: getTodayPKT(),
      supplier_id: "",
      payment_method: "cash",
      bank_account_id: "",
      invoice_number: `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      notes: "",
      paid_amount: "",
    })
    setCurrentItem({ product_id: "", quantity: "", unitPrice: "" })
    setSuccessData(null)
  }



  const fetchSuppliers = async () => {
    const { data } = await supabase.from("suppliers").select("id, supplier_name, supplier_type").eq("status", "active").order("supplier_name")
    if (data) setSuppliers(data)
  }

  const fetchBankAccounts = async () => {
    const { data } = await supabase.from("accounts").select("id, account_name, account_number, current_balance").eq("account_type", "bank").eq("status", "active").order("account_name")
    if (data) {
      setBankAccounts(data)
      if (data.length > 0) {
        setFormData(prev => ({ ...prev, bank_account_id: data[0].id }))
      }
    }
  }

  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("*").eq("status", "active").eq("product_type", "fuel").order("product_name")
    if (data) setProducts(data)
  }

  const fetchTodayBalance = async () => {
    const today = getTodayPKT()
    const { data } = await supabase.from("daily_balances").select("*").eq("balance_date", today).maybeSingle()
    if (data) setTodayBalance(data)
    else {
      const { data: latest } = await supabase.from("daily_balances").select("*").order("balance_date", { ascending: false }).limit(1).maybeSingle()
      setTodayBalance(latest)
    }
  }

  // --- Cart Calculations ---
  const orderTotal = cart.reduce((sum, item) => sum + item.total, 0)

  // Auto-fill paid amount when total changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, paid_amount: orderTotal.toString() }))
  }, [orderTotal])

  const paidAmount = parseFloat(formData.paid_amount) || 0
  const dueAmount = orderTotal - paidAmount

  const availableBalance = (() => {
    if (!todayBalance) return 0
    if (formData.payment_method === "cash") return Number(todayBalance.cash_closing ?? todayBalance.cash_opening ?? 0)
    const selectedBank = bankAccounts.find(b => b.id === formData.bank_account_id)
    return selectedBank ? Number(selectedBank.current_balance) : 0
  })()

  // --- Handlers ---

  const handleAddItem = () => {
    setError("")
    const product = products.find(p => p.id === currentItem.product_id)
    const qty = parseFloat(currentItem.quantity)
    const price = parseFloat(currentItem.unitPrice)

    if (!product) return setError("Select a product")
    if (!qty || qty <= 0) return setError("Invalid quantity")
    if (!price || price <= 0) return setError("Invalid price")

    // Check duplicate
    if (cart.find(i => i.product.id === product.id)) return setError("Product already in cart")

    setCart([...cart, {
      product,
      quantity: qty,
      unitPrice: price,
      total: qty * price
    }])
    setCurrentItem({ product_id: "", quantity: "", unitPrice: "" })
  }

  const handleRemoveItem = (productId: string) => {
    setCart(cart.filter(i => i.product.id !== productId))
  }

  // Auto-fill price when product selected
  useEffect(() => {
    if (currentItem.product_id) {
      const p = products.find(x => x.id === currentItem.product_id)
      if (p) setCurrentItem(prev => ({ ...prev, unitPrice: p.purchase_price.toString() }))
    }
  }, [currentItem.product_id])

  const validateOrder = async (): Promise<string | null> => {
    if (!formData.purchase_date) return "Select purchase date"
    if (!formData.supplier_id) return "Select supplier"
    if (formData.payment_method === "bank_transfer" && !formData.bank_account_id) return "Select a bank account"
    if (!formData.invoice_number.trim()) return "Enter invoice number"
    if (cart.length === 0) return "Add at least one product"

    // Check duplicate invoice (in purchase_orders now)
    const { data: existing } = await supabase.from("purchase_orders").select("id").eq("invoice_number", formData.invoice_number.trim()).limit(1)
    if (existing && existing.length > 0) return `Invoice "${formData.invoice_number}" already exists`

    if (paidAmount > availableBalance) {
      return `Insufficient ${formData.payment_method} balance. Needed: ${paidAmount}, Available: ${availableBalance}`
    }

    return null
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError("")

    try {
      const err = await validateOrder()
      if (err) throw new Error(err)

      // 1. Create Purchase Order
      const { data: order, error: orderError } = await supabase.from("purchase_orders").insert({
        purchase_date: formData.purchase_date,
        supplier_id: formData.supplier_id,
        invoice_number: formData.invoice_number.trim(),
        total_amount: orderTotal,
        paid_amount: paidAmount,
        due_amount: dueAmount,
        payment_method: formData.payment_method,
        bank_account_id: formData.payment_method === "bank_transfer" ? formData.bank_account_id : null,
        status: "completed",
        notes: formData.notes
      }).select().single()

      if (orderError) throw orderError

      // 2. Process Cart Items
      for (const item of cart) {
        // Insert Purchase Item
        const { error: itemError } = await supabase.from("purchases").insert({
          order_id: order.id,
          purchase_date: formData.purchase_date,
          supplier_id: formData.supplier_id,
          product_id: item.product.id,
          quantity: item.quantity,
          purchase_price_per_unit: item.unitPrice,
          total_amount: item.total,
          payment_method: formData.payment_method,
          bank_account_id: formData.payment_method === "bank_transfer" ? formData.bank_account_id : null,
          // invoice_number is optional now, skipping or using order's
          status: "completed",
          old_weighted_avg: item.product.purchase_price,
          new_weighted_avg: item.unitPrice
        })
        if (itemError) throw itemError

        // Update Product Stock & Price
        const newStock = item.product.current_stock + item.quantity
        const newValue = newStock * item.unitPrice

        await supabase.from("products").update({
          current_stock: newStock,
          purchase_price: item.unitPrice,
          weighted_avg_cost: item.unitPrice,
          stock_value: newValue,
          last_purchase_price: item.unitPrice,
          last_purchase_date: formData.purchase_date
        }).eq("id", item.product.id)

        // Stock Movement is now handled by database trigger (trg_universal_stock_purchases)
        // This prevents duplicate entries in the stock_movements table

        // Price History
        if (Math.abs(item.unitPrice - item.product.purchase_price) > 0.01) {
          await supabase.from("price_history").insert({
            product_id: item.product.id,
            old_purchase_price: item.product.purchase_price,
            new_purchase_price: item.unitPrice,
            change_reason: `Purchase Price Update`
          })
        }
      }

      // 3. Update Balance (Deduct PAID amount only)
      if (paidAmount > 0 && todayBalance) {
        const newBal = availableBalance - paidAmount
        const updateData = formData.payment_method === "cash"
          ? { cash_closing: newBal }
          : { bank_closing: newBal }

        await supabase.from("daily_balances").update(updateData).eq("id", todayBalance.id)

        // Log Transaction
        await supabase.from("transactions").insert({
          transaction_date: new Date().toISOString(),
          transaction_type: "expense",
          category: "Fuel Purchase",
          description: `Inv# ${formData.invoice_number} (Partial/Full Payment)`,
          amount: paidAmount,
          payment_method: formData.payment_method,
          bank_account_id: formData.payment_method === "bank_transfer" ? formData.bank_account_id : null,
          reference_type: "purchase_order",
          reference_id: order.id
        })
      }

      // 4. Update Supplier Totals
      if (formData.supplier_id) {
        const { data: s } = await supabase.from("suppliers").select("total_purchases").eq("id", formData.supplier_id).single()
        if (s) {
          await supabase.from("suppliers").update({
            total_purchases: (s.total_purchases || 0) + orderTotal,
            last_purchase_date: formData.purchase_date
          }).eq("id", formData.supplier_id)
        }
      }

      setSuccessData({ total: orderTotal, paid: paidAmount, due: dueAmount, items: cart.length })
      setStep("success")

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save purchase")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (step === "success") onSuccess()
    onOpenChange(false)
    resetForm()
  }

  const formatCurrency = (amount: number) => `Rs. ${Number(amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-4xl max-h-[95vh] overflow-y-auto">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-bold text-xl"><Fuel className="h-5 w-5 text-primary" /> New Fuel Purchase</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Date</Label>
                  <Input type="date" className="h-9 rounded-lg" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Invoice #</Label>
                  <Input value={formData.invoice_number} className="h-9 rounded-lg font-mono text-primary font-bold" onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} placeholder="FUEL-001" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Supplier</Label>
                  <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                    <SelectTrigger className="h-9 rounded-lg font-medium"><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Cart Input */}
              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] uppercase font-black tracking-tight flex items-center gap-1.5 text-primary"><Plus className="h-3 w-3" /> Add Fuel Products</h4>
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Product</Label>
                    <Select value={currentItem.product_id} onValueChange={(v) => setCurrentItem({ ...currentItem, product_id: v })}>
                      <SelectTrigger className="h-10 rounded-xl font-semibold bg-background shadow-sm border-muted-foreground/20"><SelectValue placeholder="Select Fuel Type..." /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name} ({p.current_stock})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Quantity (Ltr)</Label>
                    <Input type="number" className="h-10 rounded-xl font-bold bg-background shadow-sm border-muted-foreground/20" value={currentItem.quantity} onChange={e => setCurrentItem({ ...currentItem, quantity: e.target.value })} />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Unit Rate</Label>
                    <Input type="number" className="h-10 rounded-xl font-bold bg-background shadow-sm border-muted-foreground/20" value={currentItem.unitPrice} onChange={e => setCurrentItem({ ...currentItem, unitPrice: e.target.value })} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Button size="icon" className="h-10 w-full rounded-xl shadow-md bg-primary hover:bg-primary/90" onClick={handleAddItem}><Plus className="h-5 w-5" /></Button>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-left">
                    <tr className="text-[10px] uppercase tracking-wider font-bold">
                      <th className="p-3">Product</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3 text-right">Rate</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-card">
                    {cart.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground italic">No items added to invoice</td></tr>
                    ) : cart.map(item => (
                      <tr key={item.product.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold">{item.product.product_name}</td>
                        <td className="p-3 text-right font-mono">{item.quantity} Ltr</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-3 text-right font-black text-primary">{formatCurrency(item.total)}</td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => handleRemoveItem(item.product.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary & Payment */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6 mt-4 border-t">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Payment Method</Label>
                    <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                      <SelectTrigger className="h-10 rounded-xl font-bold border-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">🏛️ Cash Account ({formatCurrency(Number(todayBalance?.cash_closing ?? todayBalance?.cash_opening ?? 0))})</SelectItem>
                        <SelectItem value="bank_transfer">🏦 Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.payment_method === "bank_transfer" && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Select Bank Account</Label>
                      <Select value={formData.bank_account_id || ""} onValueChange={(v) => setFormData({ ...formData, bank_account_id: v })}>
                        <SelectTrigger className="h-10 rounded-xl font-bold border-2"><SelectValue placeholder="Chose Bank..." /></SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map(bank => (
                            <SelectItem key={bank.id} value={bank.id}>
                              {bank.account_name} ({formatCurrency(bank.current_balance)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Internal Notes</Label>
                    <Textarea rows={2} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Shipping details, trailer #, etc..." className="resize-none rounded-xl bg-muted/30 focus-visible:ring-primary/30 text-xs" />
                  </div>
                </div>

                <div className="bg-foreground/[0.02] p-4 rounded-[1.5rem] border-2 border-dashed border-muted-foreground/10 space-y-3 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform duration-500" />

                  <div className="flex justify-between items-end relative z-10">
                    <div className="space-y-0.5">
                      <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">Total Payable</p>
                      <p className="font-black text-2xl tracking-tighter text-foreground">{formatCurrency(orderTotal)}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full bg-background/50 h-5 px-2 text-[9px] font-bold uppercase border-muted-foreground/20">Tax Incl.</Badge>
                  </div>

                  <div className="space-y-1.5 relative z-10">
                    <div className="flex justify-between items-center px-1">
                      <Label className="text-[10px] uppercase font-black text-green-700 tracking-tight">Payment Recieved</Label>
                    </div>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 h-7 w-7 bg-green-100 rounded-full flex items-center justify-center">
                        <Banknote className="h-3.5 w-3.5 text-green-600" />
                      </div>
                      <Input type="number" className="h-12 pl-12 text-right text-xl font-black border-2 border-green-200 focus:border-green-500 bg-green-50/20 rounded-xl shadow-inner-sm transition-all focus:ring-0" value={formData.paid_amount} onChange={e => setFormData({ ...formData, paid_amount: e.target.value })} placeholder="0.00" />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1 px-1 relative z-10 border-t border-dashed border-muted-foreground/10 mt-1">
                    <span className="font-black text-muted-foreground text-[10px] uppercase tracking-tighter">Balance Due</span>
                    <span className={`text-2xl font-black tracking-tighter drop-shadow-sm ${dueAmount > 0 ? "text-destructive" : "text-green-600"}`}>
                      {formatCurrency(dueAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="animate-in slide-in-from-bottom-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="font-medium">{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full px-8 hover:bg-muted font-bold">Discard</Button>
              <Button onClick={handleSubmit} disabled={loading || cart.length === 0} className="rounded-full px-10 bg-primary hover:bg-primary/90 font-black shadow-lg shadow-primary/20">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />} SAVE INVOICE
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <div className="py-12 text-center space-y-8 animate-in zoom-in-95 duration-300">
            <div className="relative h-24 w-24 mx-auto">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
              <div className="relative h-full w-full bg-primary/10 rounded-full flex items-center justify-center border-2 border-primary/20">
                <CheckCircle2 className="h-12 w-12 text-primary drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tight text-foreground">Purchase Recorded!</h2>
              <p className="text-muted-foreground px-12">The inventory has been updated and the transaction is saved to history.</p>
            </div>

            <div className="grid grid-cols-3 gap-3 px-8">
              <div className="bg-muted/40 p-4 rounded-2xl border border-muted-foreground/10"><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Total</p><p className="font-bold text-sm">{formatCurrency(successData.total)}</p></div>
              <div className="bg-green-50 p-4 rounded-2xl border border-green-100"><p className="text-[10px] uppercase font-bold text-green-600 mb-1">Paid</p><p className="font-black text-sm text-green-700">{formatCurrency(successData.paid)}</p></div>
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100"><p className="text-[10px] uppercase font-bold text-destructive mb-1">Due</p><p className="font-black text-sm text-destructive">{formatCurrency(successData.due)}</p></div>
            </div>

            <Button onClick={() => { onSuccess(); onOpenChange(false); }} className="rounded-full px-16 h-12 font-black uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 transition-all active:scale-95 shadow-2xl">Return to List</Button>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-[50] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300 rounded-2xl">
            <div className="relative">
              <div className="h-24 w-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin shadow-2xl shadow-primary/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Fuel className="h-10 w-10 text-primary animate-pulse" />
              </div>
            </div>
            <h3 className="mt-6 text-xl font-black tracking-tight">Recording Fuel Bulk...</h3>
            <p className="text-sm text-muted-foreground animate-pulse font-medium">Updating tanks and accounts</p>
          </div>
        )}
      </DialogContent>
    </Dialog >
  )
}
