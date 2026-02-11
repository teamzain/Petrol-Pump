"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, Pencil, Trash2, Truck, Filter } from "lucide-react"
import { SupplierDialog } from "@/components/suppliers/supplier-dialog"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"

type Supplier = {
  id: string
  supplier_name: string
  contact_person: string | null
  phone_number: string
  address: string | null
  supplier_type: string
  notes: string | null
  status: string
  total_purchases: number
  last_purchase_date: string | null
  created_at: string
}

const supplierTypeLabels: Record<string, string> = {
  petrol: "Petrol Only",
  diesel: "Diesel Only",
  petrol_only: "Petrol Only", // Legacy support
  diesel_only: "Diesel Only", // Legacy support
  both_petrol_diesel: "Petrol & Diesel",
  products_oils: "Products & Oils",
  both_petrol_diesel_and_oils: "Fuel + Oils",
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null)
  const supabase = createClient()

  const fetchSuppliers = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching suppliers:", error)
    } else {
      setSuppliers(data || [])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchSuppliers()
  }, [])

  useEffect(() => {
    let filtered = suppliers

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (s) =>
          s.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.phone_number.includes(searchQuery) ||
          s.contact_person?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((s) => s.supplier_type === typeFilter)
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((s) => s.status === statusFilter)
    }

    setFilteredSuppliers(filtered)
  }, [suppliers, searchQuery, typeFilter, statusFilter])

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setIsDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteSupplier) return

    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", deleteSupplier.id)

    if (error) {
      console.error("Error deleting supplier:", error)
    } else {
      fetchSuppliers()
    }
    setDeleteSupplier(null)
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setEditingSupplier(null)
  }

  const handleSupplierSaved = () => {
    fetchSuppliers()
    handleDialogClose()
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-muted-foreground">
            Manage your fuel and product suppliers
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search suppliers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="petrol_only">Petrol Only</SelectItem>
                <SelectItem value="diesel_only">Diesel Only</SelectItem>
                <SelectItem value="both_petrol_diesel">Petrol & Diesel</SelectItem>
                <SelectItem value="products_oils">Products & Oils</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Suppliers</CardTitle>
          <CardDescription>
            {filteredSuppliers.length} supplier(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-primary/10 border-t-primary animate-spin shadow-lg shadow-primary/5" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Truck className="h-6 w-6 text-primary animate-pulse" />
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground font-medium animate-pulse">Loading suppliers...</p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                No suppliers found
              </h3>
              <p className="text-muted-foreground mb-4">
                {suppliers.length === 0
                  ? "Get started by adding your first supplier"
                  : "Try adjusting your search or filters"}
              </p>
              {suppliers.length === 0 && (
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Supplier
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Total Purchases</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{supplier.supplier_name}</p>
                          {supplier.address && (
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {supplier.address}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{supplier.phone_number}</p>
                          {supplier.contact_person && (
                            <p className="text-sm text-muted-foreground">
                              {supplier.contact_person}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {supplierTypeLabels[supplier.supplier_type] || supplier.supplier_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        Rs. {supplier.total_purchases.toLocaleString("en-PK")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={supplier.status === "active" ? "default" : "secondary"}
                        >
                          {supplier.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(supplier)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteSupplier(supplier)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <SupplierDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        supplier={editingSupplier}
        onSaved={handleSupplierSaved}
      />

      <DeleteConfirmDialog
        open={!!deleteSupplier}
        onOpenChange={() => setDeleteSupplier(null)}
        onConfirm={handleDelete}
        title="Delete Supplier"
        description={`Are you sure you want to delete "${deleteSupplier?.supplier_name}"? This action cannot be undone.`}
      />
    </div>
  )
}
