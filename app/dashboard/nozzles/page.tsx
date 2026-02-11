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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import {
  Plus,
  Gauge,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Fuel,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"

interface Nozzle {
  id: string
  nozzle_number: string
  pump_number: string | null
  nozzle_side: string | null
  product_id: string
  initial_reading: number
  current_reading: number
  status: string
  products: {
    product_name: string
    product_type: string
  }
}

interface Product {
  id: string
  product_name: string
  product_type: string
}

export default function NozzlesPage() {
  const [nozzles, setNozzles] = useState<Nozzle[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedNozzle, setSelectedNozzle] = useState<Nozzle | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [formData, setFormData] = useState({
    nozzle_number: "",
    pump_number: "",
    nozzle_side: "",
    product_id: "",
    initial_reading: "0",
  })

  const supabase = createClient()

  const fetchNozzles = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("nozzles")
      .select("*, products(product_name, product_type)")
      .order("pump_number", { ascending: true })
      .order("nozzle_side", { ascending: true })

    if (!error && data) {
      setNozzles(data as Nozzle[])
    }
    setLoading(false)
  }, [supabase])

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, product_name, product_type")
      .eq("status", "active")
      .eq("product_type", "fuel")
      .order("product_name")

    if (data) setProducts(data)
  }, [supabase])

  useEffect(() => {
    fetchNozzles()
    fetchProducts()
  }, [fetchNozzles, fetchProducts])

  const handleOpenDialog = (nozzle?: Nozzle) => {
    if (nozzle) {
      setSelectedNozzle(nozzle)
      setFormData({
        nozzle_number: nozzle.nozzle_number,
        pump_number: nozzle.pump_number || "",
        nozzle_side: nozzle.nozzle_side || "",
        product_id: nozzle.product_id,
        initial_reading: nozzle.initial_reading.toString(),
      })
    } else {
      setSelectedNozzle(null)
      setFormData({
        nozzle_number: "",
        pump_number: "",
        nozzle_side: "",
        product_id: "",
        initial_reading: "0",
      })
    }
    setError("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setError("")
    setSaving(true)

    try {
      if (!formData.nozzle_number.trim()) {
        throw new Error("Please enter a nozzle name/number")
      }
      if (!String(formData.pump_number).trim()) {
        throw new Error("Please enter a pump number")
      }
      if (!formData.nozzle_side) {
        throw new Error("Please select a nozzle side (Left or Right)")
      }
      if (!formData.product_id) {
        throw new Error("Please select a fuel type")
      }

      const initialReading = parseFloat(formData.initial_reading) || 0

      if (selectedNozzle) {
        // Update existing nozzle
        const { error: updateError } = await supabase
          .from("nozzles")
          .update({
            nozzle_number: formData.nozzle_number.trim(),
            pump_number: String(formData.pump_number).trim() || null,
            nozzle_side: formData.nozzle_side || null,
            product_id: formData.product_id,
            initial_reading: initialReading,
          })
          .eq("id", selectedNozzle.id)

        if (updateError) throw updateError
        setSuccess("Nozzle updated successfully!")
      } else {
        // Create new nozzle
        const { error: insertError } = await supabase
          .from("nozzles")
          .insert({
            nozzle_number: formData.nozzle_number.trim(),
            pump_number: String(formData.pump_number).trim() || null,
            nozzle_side: formData.nozzle_side || null,
            product_id: formData.product_id,
            initial_reading: initialReading,
            current_reading: initialReading,
            status: "active",
          })

        if (insertError) throw insertError
        setSuccess("Nozzle added successfully!")
      }

      setDialogOpen(false)
      fetchNozzles()
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message: string }).message) : "Failed to save nozzle"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedNozzle) return

    try {
      const { error } = await supabase
        .from("nozzles")
        .delete()
        .eq("id", selectedNozzle.id)

      if (error) throw error

      setSuccess("Nozzle deleted successfully!")
      setDeleteDialogOpen(false)
      setSelectedNozzle(null)
      fetchNozzles()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete nozzle")
    }
  }

  const getNozzleBadgeColor = (productName: string) => {
    const name = productName.toLowerCase()
    if (name.includes("petrol") || name.includes("hi-octane")) {
      return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
    }
    if (name.includes("diesel")) {
      return "bg-green-500/10 text-green-700 border-green-500/20"
    }
    return "bg-primary/10 text-primary border-primary/20"
  }

  // Group nozzles by pump
  const groupedNozzles = nozzles.reduce((acc, nozzle) => {
    const pumpKey = nozzle.pump_number || "Unassigned"
    if (!acc[pumpKey]) {
      acc[pumpKey] = []
    }
    acc[pumpKey].push(nozzle)
    return acc
  }, {} as Record<string, Nozzle[]>)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Nozzle Configuration</h1>
        <p className="text-muted-foreground">
          Manage fuel dispensing nozzles, assign to pumps, and track meter readings
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
            <CardTitle className="text-sm font-medium">Total Nozzles</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nozzles.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Nozzles</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {nozzles.filter(n => n.status === "active").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pumps</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(groupedNozzles).filter(k => k !== "Unassigned").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fuel Types</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(nozzles.map(n => n.product_id)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Nozzles Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Nozzle List</CardTitle>
              <CardDescription>
                Configure nozzles with pump assignments and initial meter readings
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Nozzle
            </Button>
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
              <Button
                variant="link"
                className="mt-1"
                onClick={() => handleOpenDialog()}
              >
                Add your first nozzle
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nozzle Name</TableHead>
                    <TableHead>Pump #</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Fuel Type</TableHead>
                    <TableHead className="text-right">Initial Reading</TableHead>
                    <TableHead className="text-right">Current Reading</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nozzles.map((nozzle) => (
                    <TableRow key={nozzle.id}>
                      <TableCell className="font-medium">{nozzle.nozzle_number}</TableCell>
                      <TableCell>{nozzle.pump_number || "-"}</TableCell>
                      <TableCell className="capitalize">{nozzle.nozzle_side || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getNozzleBadgeColor(nozzle.products?.product_name || "")}
                        >
                          {nozzle.products?.product_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(nozzle.initial_reading || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(nozzle.current_reading || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {nozzle.status === "active" ? (
                          <Badge variant="secondary" className="bg-primary/10 text-primary">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(nozzle)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedNozzle(nozzle)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
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

      {/* Visual Pump Layout */}
      {Object.keys(groupedNozzles).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pump Layout</CardTitle>
            <CardDescription>Visual representation of pumps and their nozzles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(groupedNozzles).map(([pump, pumpNozzles]) => (
                <Card key={pump} className="border-2">
                  <CardHeader className="p-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Fuel className="h-4 w-4" />
                      {pump === "Unassigned" ? "Unassigned Nozzles" : `Pump ${pump}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="grid grid-cols-2 gap-2">
                      {pumpNozzles.map((nozzle) => (
                        <div
                          key={nozzle.id}
                          className="rounded-lg border p-2 text-center"
                        >
                          <div className="text-xs text-muted-foreground capitalize">
                            {nozzle.nozzle_side || "Side"}
                          </div>
                          <div className="font-medium text-sm">{nozzle.nozzle_number}</div>
                          <Badge
                            variant="outline"
                            className={`${getNozzleBadgeColor(nozzle.products?.product_name || "")} text-xs mt-1`}
                          >
                            {nozzle.products?.product_name}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Nozzle Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedNozzle ? "Edit Nozzle" : "Add New Nozzle"}
            </DialogTitle>
            <DialogDescription>
              {selectedNozzle
                ? "Update the nozzle configuration"
                : "Configure a new fuel dispensing nozzle"
              }
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nozzle_number">Nozzle Name/Number</Label>
              <Input
                id="nozzle_number"
                value={formData.nozzle_number}
                onChange={(e) => setFormData({ ...formData, nozzle_number: e.target.value })}
                placeholder="e.g., Nozzle 1, N-1A"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pump_number">Pump Number</Label>
                <Input
                  id="pump_number"
                  value={formData.pump_number}
                  onChange={(e) => setFormData({ ...formData, pump_number: e.target.value })}
                  placeholder="e.g., 1, 2, 3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nozzle_side">Nozzle Side</Label>
                <Select
                  value={formData.nozzle_side}
                  onValueChange={(value) => setFormData({ ...formData, nozzle_side: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select side" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product_id">Fuel Type</Label>
              <Select
                value={formData.product_id}
                onValueChange={(value) => setFormData({ ...formData, product_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fuel type" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="initial_reading">Initial Meter Reading</Label>
              <Input
                id="initial_reading"
                type="number"
                step="0.001"
                min="0"
                value={formData.initial_reading}
                onChange={(e) => setFormData({ ...formData, initial_reading: e.target.value })}
                placeholder="Enter initial reading"
              />
              <p className="text-xs text-muted-foreground">
                The starting meter reading when this nozzle was installed
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : selectedNozzle ? "Update Nozzle" : "Add Nozzle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Delete Nozzle"
        description={`Are you sure you want to delete nozzle "${selectedNozzle?.nozzle_number}"? This action cannot be undone.`}
      />
    </div>
  )
}
