"use client"

import React from "react"

import { useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

interface Product {
  id: string
  product_name: string
  current_stock: number
  unit: string
  weighted_avg_cost: number
}

interface StockAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onSuccess: () => void
}

export function StockAdjustmentDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: StockAdjustmentDialogProps) {
  const [loading, setLoading] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState<"add" | "subtract">("add")
  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState("")
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return

    setLoading(true)

    try {
      const adjustmentQty = adjustmentType === "add" 
        ? parseFloat(quantity) 
        : -parseFloat(quantity)
      
      const newStock = product.current_stock + adjustmentQty

      if (newStock < 0) {
        alert("Stock cannot be negative")
        setLoading(false)
        return
      }

      // Update product stock
      const { error: productError } = await supabase
        .from("products")
        .update({
          current_stock: newStock,
          stock_value: newStock * product.weighted_avg_cost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id)

      if (productError) throw productError

      // Record stock movement
      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: product.id,
          movement_type: "adjustment",
          quantity: adjustmentQty,
          unit_price: product.weighted_avg_cost,
          weighted_avg_after: product.weighted_avg_cost,
          balance_after: newStock,
          notes: reason,
        })

      if (movementError) throw movementError

      onSuccess()
      onOpenChange(false)
      resetForm()
    } catch (error) {
      console.error("Error adjusting stock:", error)
      alert("Failed to adjust stock. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setAdjustmentType("add")
    setQuantity("")
    setReason("")
  }

  if (!product) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
          <DialogDescription>
            Adjust stock for {product.product_name}. Current stock: {product.current_stock.toLocaleString()} {product.unit}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="adjustmentType">Adjustment Type</Label>
              <Select
                value={adjustmentType}
                onValueChange={(value: "add" | "subtract") => setAdjustmentType(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add Stock</SelectItem>
                  <SelectItem value="subtract">Subtract Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity ({product.unit})</Label>
              <Input
                id="quantity"
                type="number"
                step="0.001"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Reason for Adjustment</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for stock adjustment..."
                required
              />
            </div>

            {quantity && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm text-muted-foreground">New Stock After Adjustment:</p>
                <p className="text-lg font-semibold">
                  {(product.current_stock + (adjustmentType === "add" ? parseFloat(quantity) || 0 : -(parseFloat(quantity) || 0))).toLocaleString()} {product.unit}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
