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
  CheckCircle2,
  Package,
  Banknote,
  ArrowRight,
  ShoppingCart,
  Plus,
  X,
  CheckSquare,
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
  unit: string
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

interface OilPurchaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Step = "form" | "confirm" | "success"

export function OilPurchaseDialog({ open, onOpenChange, onSuccess }: OilPurchaseDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState<Step>("form")

  // Data State
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
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
    invoice_number: "",
    notes: "",
    paid_amount: "",
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
      invoice_number: `OIL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      notes: "",
      paid_amount: "",
    })
    setCurrentItem({ product_id: "", quantity: "", unitPrice: "" })
    setSuccessData(null)
  }



  const fetchSuppliers = async () => {
    const { data } = await supabase.from("suppliers").select("id, supplier_name, supplier_type").eq("status", "active").order("supplier_name")
    if (data) {
      setSuppliers(data.filter(s => s.supplier_type === "products_oils" || s.supplier_type === "both_petrol_diesel_and_oils"))
    }
  }

  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("*").eq("status", "active").eq("product_type", "oil_lubricant").order("product_name")
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
    return Number(todayBalance.bank_closing ?? todayBalance.bank_opening ?? 0)
  })()

  const handleAddItem = () => {
    setError("")
    const product = products.find(p => p.id === currentItem.product_id)
    const qty = parseFloat(currentItem.quantity)
    const price = parseFloat(currentItem.unitPrice)

    if (!product) return setError("Select a product")
    if (!qty || qty <= 0) return setError("Invalid quantity")
    if (!price || price <= 0) return setError("Invalid price")
    if (cart.find(i => i.product.id === product.id)) return setError("Already in cart")

    setCart([...cart, { product, quantity: qty, unitPrice: price, total: qty * price }])
    setCurrentItem({ product_id: "", quantity: "", unitPrice: "" })
  }

  const handleRemoveItem = (productId: string) => setCart(cart.filter(i => i.product.id !== productId))

  useEffect(() => {
    if (currentItem.product_id) {
      const p = products.find(x => x.id === currentItem.product_id)
      if (p) setCurrentItem(prev => ({ ...prev, unitPrice: p.purchase_price.toString() }))
    }
  }, [currentItem.product_id])

  const validateOrder = async (): Promise<string | null> => {
    if (!formData.purchase_date) return "Select date"
    if (!formData.supplier_id) return "Select supplier"
    if (!formData.invoice_number.trim()) return "Enter invoice #"
    if (cart.length === 0) return "Add items"

    const { data: existing } = await supabase.from("purchase_orders").select("id").eq("invoice_number", formData.invoice_number.trim()).limit(1)
    if (existing && existing.length > 0) return `Invoice "${formData.invoice_number}" already exists`

    if (paidAmount > availableBalance) return `Insufficient ${formData.payment_method} balance.`
    return null
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError("")
    try {
      const err = await validateOrder()
      if (err) throw new Error(err)

      const { data: order, error: orderError } = await supabase.from("purchase_orders").insert({
        purchase_date: formData.purchase_date,
        supplier_id: formData.supplier_id,
        invoice_number: formData.invoice_number.trim(),
        total_amount: orderTotal,
        paid_amount: paidAmount,
        due_amount: dueAmount,
        payment_method: formData.payment_method,
        status: "completed",
        notes: formData.notes
      }).select().single()

      if (orderError) throw orderError

      for (let i = 0; i < cart.length; i++) {
        const item = cart[i]
        // 2. Insert Purchase Item
        const { error: itemError } = await supabase.from("purchases").insert({
          order_id: order.id,
          purchase_date: formData.purchase_date,
          supplier_id: formData.supplier_id,
          product_id: item.product.id,
          quantity: item.quantity,
          purchase_price_per_unit: item.unitPrice,
          total_amount: item.total,
          payment_method: formData.payment_method,
          status: "completed",
          old_weighted_avg: item.product.purchase_price,
          new_weighted_avg: item.unitPrice
        })

        if (itemError) throw new Error(`Item "${item.product.product_name}" failed: ${itemError.message}`)
      }

      // 3. Update Balance & Record Transaction (Financials)
      if (paidAmount > 0 && todayBalance) {
        const newBal = availableBalance - paidAmount
        const updateData = formData.payment_method === "cash" ? { cash_closing: newBal } : { bank_closing: newBal }
        const { error: balError } = await supabase.from("daily_balances").update(updateData).eq("id", todayBalance.id)
        if (balError) throw balError

        const { error: transError } = await supabase.from("transactions").insert({
          transaction_date: new Date().toISOString(),
          transaction_type: "expense",
          category: "Oil/Lubricant Purchase",
          description: `Inv# ${formData.invoice_number}`,
          amount: paidAmount,
          payment_method: formData.payment_method,
          reference_type: "purchase_order",
          reference_id: order.id
        })
        if (transError) throw transError
      }

      // 4. Update Supplier Totals
      if (formData.supplier_id) {
        const { data: s } = await supabase.from("suppliers").select("total_purchases").eq("id", formData.supplier_id).single()
        if (s) {
          const { error: supError } = await supabase.from("suppliers").update({
            total_purchases: (s.total_purchases || 0) + orderTotal,
            last_purchase_date: formData.purchase_date
          }).eq("id", formData.supplier_id)
          if (supError) throw supError
        }
      }

      setSuccessData({ total: orderTotal, paid: paidAmount, due: dueAmount, items: cart.length })
      setStep("success")

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => `Rs. ${Number(amount).toLocaleString()}`

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-4xl max-h-[95vh] overflow-y-auto">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-bold text-xl"><Package className="h-5 w-5 text-primary" /> New Oil Purchase</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Date</Label>
                  <Input type="date" className="h-9 rounded-lg" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Invoice #</Label>
                  <Input value={formData.invoice_number} className="h-9 rounded-lg font-mono text-primary font-bold" onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} placeholder="OIL-001" />
                </div>
                <div className="space-y-1 col-span-2">
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
                  <h4 className="text-[11px] uppercase font-black tracking-tight flex items-center gap-1.5 text-primary"><Plus className="h-3 w-3" /> Add Oil Products</h4>
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Product</Label>
                    <Select value={currentItem.product_id} onValueChange={(v) => setCurrentItem({ ...currentItem, product_id: v })}>
                      <SelectTrigger className="h-10 rounded-xl font-semibold bg-background shadow-sm border-muted-foreground/20"><SelectValue placeholder="Select Oil Type..." /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name} ({p.current_stock})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Quantity</Label>
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

              {/* Mini Cart Display */}
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
                  <tbody className="divide-y">
                    {cart.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground italic">No items added to cart</td></tr>
                    ) : cart.map(item => (
                      <tr key={item.product.id} className="hover:bg-muted/50 transition-colors">
                        <td className="p-3 font-medium">{item.product.product_name}</td>
                        <td className="p-3 text-right">{item.quantity} {item.product.unit}</td>
                        <td className="p-3 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-3 text-right font-bold text-primary">{formatCurrency(item.total)}</td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleRemoveItem(item.product.id)}>
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
                        <SelectItem value="bank_transfer">🏦 Bank Account ({formatCurrency(Number(todayBalance?.bank_closing ?? todayBalance?.bank_opening ?? 0))})</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full px-6">Cancel</Button>
              <Button onClick={handleSubmit} disabled={loading || cart.length === 0} className="rounded-full px-8 bg-primary hover:bg-primary/90 font-bold">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />} Submit Invoice
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <div className="py-12 text-center space-y-6 animate-in zoom-in-95">
            <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">Purchase Confirmed!</h2>
              <p className="text-muted-foreground mt-2">The inventory and account balances have been updated.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 px-10">
              <div className="bg-muted p-3 rounded-lg"><p className="text-[10px] uppercase font-bold text-muted-foreground">Total</p><p className="font-bold">{formatCurrency(successData.total)}</p></div>
              <div className="bg-green-50 p-3 rounded-lg text-green-700"><p className="text-[10px] uppercase font-bold">Paid</p><p className="font-black">{formatCurrency(successData.paid)}</p></div>
              <div className="bg-red-50 p-3 rounded-lg text-destructive"><p className="text-[10px] uppercase font-bold">Due</p><p className="font-black">{formatCurrency(successData.due)}</p></div>
            </div>

            <Button onClick={() => { onSuccess(); onOpenChange(false); }} className="mt-8 rounded-full px-12 font-bold uppercase tracking-widest shadow-xl shadow-primary/20">Close Dialog</Button>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-[50] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300 rounded-lg">
            <div className="relative">
              <div className="h-20 w-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin shadow-xl shadow-primary/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Package className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <p className="mt-4 font-bold text-lg tracking-tight">Processing Invoice...</p>
            <p className="text-xs text-muted-foreground animate-pulse">Syncing stock and account balances</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
