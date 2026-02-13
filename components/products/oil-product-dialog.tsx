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
import { createClient } from "@/lib/supabase/client"
import { Droplet, AlertCircle, Package } from "lucide-react"
import { BrandLoader } from "../ui/brand-loader"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface OilProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: {
    id: string
    product_name: string
    category: string
    unit: string
    current_stock: number
    minimum_stock_level: number
    purchase_price: number
    weighted_avg_cost: number
    selling_price: number
    status: string
  } | null
  onSuccess: () => void
}

const CATEGORIES = [
  "Engine Oil",
  "Gear Oil",
  "Brake Fluid",
  "Coolant",
  "Transmission Fluid",
  "Grease",
  "Other",
]

const UNITS = [
  { value: "pieces", label: "Pieces" },
  { value: "liters", label: "Liters" },
  { value: "bottles", label: "Bottles" },
  { value: "cans", label: "Cans" },
]

export function OilProductDialog({ open, onOpenChange, product, onSuccess }: OilProductDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [formData, setFormData] = useState({
    product_name: "",
    category: "",
    unit: "pieces",
    current_stock: "",
    minimum_stock_level: "",
    purchase_price: "",
    selling_price: "",
  })

  const supabase = createClient()
  const isEditing = !!product

  useEffect(() => {
    if (product) {
      setFormData({
        product_name: product.product_name,
        category: product.category || "",
        unit: product.unit,
        current_stock: product.current_stock.toString(),
        minimum_stock_level: product.minimum_stock_level.toString(),
        purchase_price: product.purchase_price.toString(),
        selling_price: product.selling_price.toString(),
      })
    } else {
      setFormData({
        product_name: "",
        category: "",
        unit: "pieces",
        current_stock: "",
        minimum_stock_level: "",
        purchase_price: "",
        selling_price: "",
      })
    }
    setError("")
  }, [product, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const currentStock = parseFloat(formData.current_stock)
      const minimumStockLevel = parseFloat(formData.minimum_stock_level)
      const purchasePrice = parseFloat(formData.purchase_price)
      const sellingPrice = parseFloat(formData.selling_price)

      // Validation
      if (sellingPrice <= purchasePrice) {
        throw new Error("Selling price must be greater than purchase price")
      }

      const productData = {
        product_name: formData.product_name,
        product_type: "oil_lubricant" as const,
        category: formData.category,
        unit: formData.unit,
        current_stock: currentStock,
        minimum_stock_level: minimumStockLevel,
        purchase_price: purchasePrice,
        weighted_avg_cost: purchasePrice,
        selling_price: sellingPrice,
        stock_value: currentStock * purchasePrice,
        status: "active",
      }

      if (isEditing && product) {
        const { error: updateError } = await supabase
          .from("products")
          .update({
            product_name: productData.product_name,
            category: productData.category,
            unit: productData.unit,
            minimum_stock_level: productData.minimum_stock_level,
            selling_price: productData.selling_price,
          })
          .eq("id", product.id)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from("products")
          .insert(productData)

        if (insertError) throw insertError

        // Record initial stock movement if there's opening stock
        if (currentStock > 0) {
          const { data: newProduct } = await supabase
            .from("products")
            .select("id")
            .eq("product_name", formData.product_name)
            .eq("product_type", "oil_lubricant")
            .single()

          if (newProduct) {
            await supabase.from("stock_movements").insert({
              product_id: newProduct.id,
              movement_type: "initial",
              quantity: currentStock,
              unit_price: purchasePrice,
              weighted_avg_after: purchasePrice,
              balance_after: currentStock,
              notes: "Initial opening stock",
            })
          }
        }
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const profitMargin = formData.purchase_price && formData.selling_price
    ? (((parseFloat(formData.selling_price) - parseFloat(formData.purchase_price)) / parseFloat(formData.purchase_price)) * 100).toFixed(2)
    : "0"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {isEditing ? "Edit Product" : "Add Oil/Lubricant Product"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Update product details" : "Add a new oil or lubricant product"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="product_name">Product Name</Label>
              <Input
                id="product_name"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                placeholder="e.g., Mobil 1 5W-30"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData({ ...formData, unit: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="current_stock">
                  {isEditing ? "Current Stock" : "Opening Stock"}
                </Label>
                <Input
                  id="current_stock"
                  type="number"
                  step="1"
                  min="0"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                  placeholder="e.g., 50"
                  required
                  disabled={isEditing}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="minimum_stock_level">Minimum Stock Level</Label>
                <Input
                  id="minimum_stock_level"
                  type="number"
                  step="1"
                  min="0"
                  value={formData.minimum_stock_level}
                  onChange={(e) => setFormData({ ...formData, minimum_stock_level: e.target.value })}
                  placeholder="e.g., 10"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="purchase_price">Purchase Price</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                  placeholder="e.g., 1500.00"
                  required
                  disabled={isEditing}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="selling_price">Selling Price</Label>
                <Input
                  id="selling_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  placeholder="e.g., 1800.00"
                  required
                />
              </div>
            </div>

            {formData.purchase_price && formData.selling_price && (
              <div className="rounded-lg bg-muted p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Profit Margin:</span>
                  <span className={`font-medium ${parseFloat(profitMargin) > 0 ? "text-primary" : "text-destructive"}`}>
                    {profitMargin}%
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Profit per Unit:</span>
                  <span className="font-medium">
                    Rs. {(parseFloat(formData.selling_price) - parseFloat(formData.purchase_price)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <BrandLoader size="xs" /> : (isEditing ? "Update Product" : "Add Product")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
