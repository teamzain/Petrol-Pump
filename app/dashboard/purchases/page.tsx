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
import { Plus, Search, ShoppingCart, TrendingUp, Calendar, Eye, Fuel, Package, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { PurchaseDialog } from "@/components/purchases/purchase-dialog"
import { OilPurchaseDialog } from "@/components/purchases/oil-purchase-dialog"
import { PurchaseDetailsDialog } from "@/components/purchases/purchase-details-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"

interface PurchaseOrder {
  id: string
  purchase_date: string
  invoice_number: string
  total_amount: number
  paid_amount: number
  due_amount: number
  payment_method: string
  status: string
  notes: string | null
  suppliers: {
    supplier_name: string
    phone_number: string
  }
  purchases: {
    id: string
    quantity: number
    purchase_price_per_unit: number
    total_amount: number
    products: {
      product_name: string
      product_type: string
      unit: string
    }
  }[]
  created_at: string
}

export default function PurchasesPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false)
  const [oilDialogOpen, setOilDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)

  const supabase = createClient()

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*, suppliers(supplier_name, phone_number), purchases(*, products(product_name, product_type))")
      .order("purchase_date", { ascending: false })

    if (!error && data) {
      setOrders(data as unknown as PurchaseOrder[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const filteredOrders = orders.filter(order => {
    const searchString = searchQuery.toLowerCase()
    const matchesSearch =
      (order.invoice_number?.toLowerCase() || "").includes(searchString) ||
      (order.suppliers?.supplier_name?.toLowerCase() || "").includes(searchString) ||
      order.purchases?.some(p => (p.products?.product_name?.toLowerCase() || "").includes(searchString))

    // Type filter is tricky with orders that might have mixed products. 
    // For now, we filter if ANY product in order matches the type.
    // Type filter
    const matchesType = filterType === "all" ||
      order.purchases?.some(p => p.products?.product_type === filterType)

    // Status filter
    const matchesStatus = filterStatus === "all" ||
      (filterStatus === "paid" && Number(order.due_amount) <= 0) ||
      (filterStatus === "due" && Number(order.due_amount) > 0)

    return matchesSearch && matchesType && matchesStatus
  })

  const totalPurchaseValue = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const totalPaid = filteredOrders.reduce((sum, o) => sum + Number(o.paid_amount), 0)
  const totalDue = filteredOrders.reduce((sum, o) => sum + Number(o.due_amount), 0)
  const uniqueSuppliers = new Set(orders.map(o => o.suppliers?.supplier_name)).size

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case "cash": return <Badge variant="secondary">Cash</Badge>
      case "bank_transfer": return <Badge className="bg-primary/10 text-primary">Bank</Badge>
      default: return <Badge variant="outline">{method}</Badge>
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Purchases & Invoices</h1>
        <p className="text-muted-foreground">Manage multi-product purchase orders and track payments.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground">Invoice records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs. {totalPurchaseValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Sum of invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Rs. {totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Amount cleared</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Due</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">Rs. {totalDue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Outstanding balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Invoice Records</CardTitle>
              <CardDescription>View all purchase invoices and payment status</CardDescription>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="font-bold shadow-lg shadow-primary/20">
                    <Plus className="mr-2 h-4 w-4" /> New Purchase <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px] p-2 rounded-xl">
                  <DropdownMenuItem onClick={() => setFuelDialogOpen(true)} className="flex items-center gap-2 p-3 rounded-lg cursor-pointer">
                    <Fuel className="h-4 w-4 text-primary" />
                    <span className="font-medium">Fuel Purchase</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOilDialogOpen(true)} className="flex items-center gap-2 p-3 rounded-lg cursor-pointer">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="font-medium">Oil/Lubricant</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                className="pl-10 h-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[150px] h-10">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Type" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="fuel">Fuel Only</SelectItem>
                <SelectItem value="oil_lubricant">Oils & Lubes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px] h-10">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="due">Running Due</SelectItem>
                <SelectItem value="paid">Fully Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10 border rounded-md">
              <p className="text-muted-foreground">No records found.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{new Date(order.purchase_date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-sm">{order.invoice_number}</TableCell>
                      <TableCell>{order.suppliers?.supplier_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.purchases?.length || 0} Products</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">Rs. {Number(order.total_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">Rs. {Number(order.paid_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">
                        {Number(order.due_amount) > 0 ? `Rs. ${Number(order.due_amount).toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={Number(order.due_amount) > 0 ? "destructive" : "default"}>
                          {Number(order.due_amount) > 0 ? "Partial/Due" : "Cleared"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedOrder(order)
                            setDetailsDialogOpen(true)
                          }}
                        >
                          <Eye className="h-4 w-4" />
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
        onSuccess={fetchOrders}
      />

      <OilPurchaseDialog
        open={oilDialogOpen}
        onOpenChange={setOilDialogOpen}
        onSuccess={fetchOrders}
      />

      {/* Selected Order Detail Dialog */}
      {selectedOrder && (
        <PurchaseDetailsDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          order={selectedOrder}
        />
      )}
    </div>
  )
}
