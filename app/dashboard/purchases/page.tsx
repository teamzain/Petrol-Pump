"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { Plus, Search, ShoppingCart, TrendingUp, Calendar, Eye, Fuel, Package } from "lucide-react"
import { PurchaseDialog } from "@/components/purchases/purchase-dialog"
import { OilPurchaseDialog } from "@/components/purchases/oil-purchase-dialog"
import { PurchaseDetailsDialog } from "@/components/purchases/purchase-details-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Purchase {
  id: string
  purchase_date: string
  invoice_number: string
  quantity: number
  purchase_price_per_unit: number
  total_amount: number
  payment_method: string
  old_weighted_avg: number | null
  new_weighted_avg: number | null
  status: string
  notes: string | null
  suppliers: {
    supplier_name: string
    phone_number: string
  }
  products: {
    product_name: string
    product_type: string
    unit: string
  }
  created_at: string
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false)
  const [oilDialogOpen, setOilDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null)
  const [purchaseType, setPurchaseType] = useState<"fuel" | "oil">("fuel")
  const [dialogOpen, setDialogOpen] = useState(false)

  const supabase = createClient()

  const fetchPurchases = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("purchases")
      .select("*, suppliers(supplier_name, phone_number), products(product_name, product_type, unit)")
      .order("purchase_date", { ascending: false })

    if (!error && data) {
      setPurchases(data as Purchase[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchPurchases()
  }, [fetchPurchases])

  const filteredPurchases = purchases.filter(purchase => {
    const matchesSearch =
      purchase.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      purchase.suppliers?.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      purchase.products?.product_name.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesType = filterType === "all" || purchase.products?.product_type === filterType

    return matchesSearch && matchesType
  })

  const totalPurchaseValue = filteredPurchases.reduce((sum, p) => sum + p.total_amount, 0)
  const totalQuantity = filteredPurchases.reduce((sum, p) => sum + p.quantity, 0)
  const uniqueSuppliers = new Set(purchases.map(p => p.suppliers?.supplier_name)).size

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case "cash":
        return <Badge variant="secondary">Cash</Badge>
      case "bank_transfer":
        return <Badge className="bg-primary/10 text-primary">Bank Transfer</Badge>
      case "cheque":
        return <Badge className="bg-accent/10 text-accent">Cheque</Badge>
      default:
        return <Badge variant="outline">{method}</Badge>
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Purchase Management</h1>
        <p className="text-muted-foreground">
          Record purchases with automatic stock and balance updates
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchases.length}</div>
            <p className="text-xs text-muted-foreground">All time records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs. {totalPurchaseValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Filtered results</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQuantity.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Units purchased</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueSuppliers}</div>
            <p className="text-xs text-muted-foreground">Suppliers with purchases</p>
          </CardContent>
        </Card>
      </div>

      {/* Purchases Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Purchase Records</CardTitle>
              <CardDescription>View and manage all purchase transactions</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setFuelDialogOpen(true)}>
                <Fuel className="mr-2 h-4 w-4" />
                Fuel Purchase
              </Button>
              <Button variant="outline" onClick={() => setOilDialogOpen(true)}>
                <Package className="mr-2 h-4 w-4" />
                Oil Purchase
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by invoice, supplier, or product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="fuel">Fuel Only</SelectItem>
                <SelectItem value="oil_lubricant">Oils Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No purchases found</p>
              <Button
                variant="link"
                className="mt-1"
                onClick={() => setFuelDialogOpen(true)}
              >
                Record your first purchase
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell>
                        {new Date(purchase.purchase_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{purchase.invoice_number}</TableCell>
                      <TableCell>{purchase.suppliers?.supplier_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {purchase.products?.product_name}
                          <Badge variant="outline" className="text-xs">
                            {purchase.products?.product_type === "fuel" ? "Fuel" : "Oil"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {purchase.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        Rs. {purchase.purchase_price_per_unit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        Rs. {purchase.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell>{getPaymentBadge(purchase.payment_method)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedPurchase(purchase)
                            setDetailsDialogOpen(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View Details</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PurchaseDialog
        open={fuelDialogOpen}
        onOpenChange={setFuelDialogOpen}
        onSuccess={fetchPurchases}
      />

      <OilPurchaseDialog
        open={oilDialogOpen}
        onOpenChange={setOilDialogOpen}
        onSuccess={fetchPurchases}
      />

      {selectedPurchase && (
        <PurchaseDetailsDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          purchase={selectedPurchase}
        />
      )}
    </div>
  )
}
