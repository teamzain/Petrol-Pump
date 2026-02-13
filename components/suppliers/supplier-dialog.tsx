"use client"

import React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { BrandLoader } from "../ui/brand-loader"

type Supplier = {
  id: string
  supplier_name: string
  contact_person: string | null
  phone_number: string
  address: string | null
  supplier_type: string
  notes: string | null
  status: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: Supplier | null
  onSaved: () => void
}

export function SupplierDialog({ open, onOpenChange, supplier, onSaved }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    supplier_name: "",
    contact_person: "",
    phone_number: "",
    address: "",
    supplier_type: "both_petrol_diesel",
    notes: "",
    status: "active",
  })
  const supabase = createClient()

  useEffect(() => {
    if (supplier) {
      setFormData({
        supplier_name: supplier.supplier_name,
        contact_person: supplier.contact_person || "",
        phone_number: supplier.phone_number,
        address: supplier.address || "",
        supplier_type: supplier.supplier_type,
        notes: supplier.notes || "",
        status: supplier.status,
      })
    } else {
      setFormData({
        supplier_name: "",
        contact_person: "",
        phone_number: "",
        address: "",
        supplier_type: "both_petrol_diesel",
        notes: "",
        status: "active",
      })
    }
    setError(null)
  }, [supplier, open])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // Validation
      if (!formData.supplier_name.trim()) {
        throw new Error("Supplier name is required")
      }
      if (!formData.phone_number.trim()) {
        throw new Error("Phone number is required")
      }

      const data = {
        supplier_name: formData.supplier_name.trim(),
        contact_person: formData.contact_person.trim() || null,
        phone_number: formData.phone_number.trim(),
        address: formData.address.trim() || null,
        supplier_type: formData.supplier_type,
        notes: formData.notes.trim() || null,
        status: formData.status,
        updated_at: new Date().toISOString(),
      }

      if (supplier) {
        // Update existing supplier
        const { error: updateError } = await supabase
          .from("suppliers")
          .update(data)
          .eq("id", supplier.id)

        if (updateError) throw updateError
      } else {
        // Create new supplier
        const { error: insertError } = await supabase
          .from("suppliers")
          .insert(data)

        if (insertError) throw insertError
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {supplier ? "Edit Supplier" : "Add New Supplier"}
          </DialogTitle>
          <DialogDescription>
            {supplier
              ? "Update supplier information"
              : "Add a new fuel or product supplier"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="supplier_name">Supplier Name *</Label>
            <Input
              id="supplier_name"
              name="supplier_name"
              value={formData.supplier_name}
              onChange={handleChange}
              placeholder="Enter supplier name"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                name="contact_person"
                value={formData.contact_person}
                onChange={handleChange}
                placeholder="Contact name"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone Number *</Label>
              <Input
                id="phone_number"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleChange}
                placeholder="+92 300 1234567"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Full address"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier_type">Supplier Type *</Label>
              <Select
                value={formData.supplier_type}
                onValueChange={(value) => handleSelectChange("supplier_type", value)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="petrol">Petrol Only</SelectItem>
                  <SelectItem value="diesel">Diesel Only</SelectItem>
                  <SelectItem value="both_petrol_diesel">Petrol & Diesel</SelectItem>
                  <SelectItem value="products_oils">Products & Oils Only</SelectItem>
                  <SelectItem value="both_petrol_diesel_and_oils">Fuel + Oils (All Products)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleSelectChange("status", value)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Additional notes (optional)"
              rows={3}
              disabled={isLoading}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <BrandLoader size="xs" />
              ) : supplier ? (
                "Update Supplier"
              ) : (
                "Add Supplier"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
