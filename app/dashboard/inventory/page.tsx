"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import { 
  Fuel, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface Product {
  id: string
  product_name: string
  product_type: string
  current_stock: number
  tank_capacity: number | null
  minimum_stock_level: number
  weighted_avg_cost: number
  stock_value: number
  last_purchase_date: string | null
}

interface StockMovement {
  id: string
  product_id: string
  movement_date: string
  movement_type: string
  quantity: number
  unit_price: number | null
  balance_after: number
  notes: string | null
  products: {
    product_name: string
  }
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    
    const [productsRes, movementsRes] = await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("status", "active")
        .order("product_name"),
      supabase
        .from("stock_movements")
        .select("*, products(product_name)")
        .order("movement_date", { ascending: false })
        .limit(20)
    ])

    if (productsRes.data) setProducts(productsRes.data)
    if (movementsRes.data) setMovements(movementsRes.data as StockMovement[])
    
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const fuelProducts = products.filter(p => p.product_type === "fuel")
  const oilProducts = products.filter(p => p.product_type === "oil_lubricant")
  
  const totalStockValue = products.reduce((sum, p) => sum + (p.stock_value || 0), 0)
  const lowStockAlerts = products.filter(p => 
    p.product_type === "oil_lubricant" 
      ? p.current_stock <= p.minimum_stock_level
      : p.tank_capacity && (p.current_stock / p.tank_capacity) < 0.2
  )

  const getStockStatus = (product: Product) => {
    if (product.product_type === "fuel" && product.tank_capacity) {
      const percentage = (product.current_stock / product.tank_capacity) * 100
      if (percentage <= 10) return { status: "critical", label: "Critical", color: "bg-destructive" }
      if (percentage <= 20) return { status: "low", label: "Low", color: "bg-warning" }
      if (percentage <= 50) return { status: "medium", label: "Medium", color: "bg-accent" }
      return { status: "good", label: "Good", color: "bg-primary" }
    } else {
      if (product.current_stock <= product.minimum_stock_level * 0.5) return { status: "critical", label: "Critical", color: "bg-destructive" }
      if (product.current_stock <= product.minimum_stock_level) return { status: "low", label: "Low", color: "bg-warning" }
      return { status: "good", label: "In Stock", color: "bg-primary" }
    }
  }

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "purchase":
        return <ArrowUpRight className="h-4 w-4 text-primary" />
      case "sale":
        return <ArrowDownRight className="h-4 w-4 text-accent" />
      case "adjustment":
        return <TrendingUp className="h-4 w-4 text-muted-foreground" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
        <p className="text-muted-foreground">
          Real-time stock tracking with predictive alerts and smart recommendations
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs. {totalStockValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Based on current purchase price</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fuel Products</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fuelProducts.length}</div>
            <p className="text-xs text-muted-foreground">
              {fuelProducts.reduce((sum, p) => sum + p.current_stock, 0).toLocaleString()} liters total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oil Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{oilProducts.length}</div>
            <p className="text-xs text-muted-foreground">
              {oilProducts.reduce((sum, p) => sum + p.current_stock, 0).toLocaleString()} units total
            </p>
          </CardContent>
        </Card>

        <Card className={lowStockAlerts.length > 0 ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockAlerts.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockAlerts.length > 0 ? "text-destructive" : ""}`}>
              {lowStockAlerts.length}
            </div>
            <p className="text-xs text-muted-foreground">Products need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {lowStockAlerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>These products require immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {lowStockAlerts.map((product) => {
                const stockStatus = getStockStatus(product)
                const percentage = product.tank_capacity 
                  ? (product.current_stock / product.tank_capacity) * 100 
                  : (product.current_stock / product.minimum_stock_level) * 100

                return (
                  <div key={product.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{product.product_name}</span>
                      <Badge variant="destructive">{stockStatus.label}</Badge>
                    </div>
                    <div className="space-y-2">
                      <Progress value={Math.min(percentage, 100)} className="h-2" />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Current: {product.current_stock.toLocaleString()}</span>
                        <span>
                          {product.tank_capacity 
                            ? `Capacity: ${product.tank_capacity.toLocaleString()}`
                            : `Min: ${product.minimum_stock_level}`
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Details */}
      <Tabs defaultValue="fuel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fuel" className="gap-2">
            <Fuel className="h-4 w-4" />
            Fuel Stock
          </TabsTrigger>
          <TabsTrigger value="oils" className="gap-2">
            <Package className="h-4 w-4" />
            Oils & Lubricants
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-2">
            <Clock className="h-4 w-4" />
            Recent Movements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {fuelProducts.map((product) => {
              const stockStatus = getStockStatus(product)
              const percentage = product.tank_capacity 
                ? (product.current_stock / product.tank_capacity) * 100 
                : 100

              return (
                <Card key={product.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{product.product_name}</CardTitle>
                      <Badge className={stockStatus.color}>{stockStatus.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Tank Level</span>
                        <span className="font-medium">{percentage.toFixed(1)}%</span>
                      </div>
                      <Progress value={percentage} className="h-3" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Current Stock</p>
                        <p className="font-semibold">{product.current_stock.toLocaleString()} L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tank Capacity</p>
                        <p className="font-semibold">{product.tank_capacity?.toLocaleString() || "-"} L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Purchase Price</p>
                        <p className="font-semibold">Rs. {Number(product.weighted_avg_cost || 0).toFixed(2)}/L</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Stock Value</p>
                        <p className="font-semibold">Rs. {(product.stock_value || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {fuelProducts.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Fuel className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No fuel products added yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="oils" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {oilProducts.map((product) => {
              const stockStatus = getStockStatus(product)
              const percentage = (product.current_stock / Math.max(product.minimum_stock_level * 2, product.current_stock)) * 100

              return (
                <Card key={product.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{product.product_name}</CardTitle>
                      <Badge className={stockStatus.color}>{stockStatus.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Stock Level</span>
                        <span className="font-medium">{product.current_stock} units</span>
                      </div>
                      <Progress value={percentage} className="h-3" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Current Stock</p>
                        <p className="font-semibold">{product.current_stock} units</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Min Level</p>
                        <p className="font-semibold">{product.minimum_stock_level} units</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Purchase Price</p>
                        <p className="font-semibold">Rs. {Number(product.weighted_avg_cost || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Stock Value</p>
                        <p className="font-semibold">Rs. {(product.stock_value || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {oilProducts.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No oil products added yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Stock Movements</CardTitle>
                <CardDescription>Last 20 stock transactions</CardDescription>
              </div>
              <Link href="/dashboard/inventory/movements">
                <Button variant="outline" size="sm" className="bg-transparent">
                  View All <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {movements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No stock movements recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {movements.map((movement) => {
                    const isPurchase = movement.movement_type === "purchase" || movement.movement_type === "initial"
                    const typeLabel = movement.movement_type === "purchase" ? "Stock Added (Purchase)" 
                      : movement.movement_type === "sale" ? "Stock Sold"
                      : movement.movement_type === "initial" ? "Opening Stock"
                      : movement.movement_type === "adjustment" ? "Stock Adjusted"
                      : movement.movement_type
                    
                    return (
                      <div key={movement.id} className="rounded-lg border p-4">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isPurchase ? "bg-primary/10" : "bg-destructive/10"}`}>
                            {getMovementIcon(movement.movement_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold">{movement.products?.product_name}</p>
                                <Badge variant="outline" className="text-xs mt-0.5">
                                  {typeLabel}
                                </Badge>
                              </div>
                              <div className="text-right shrink-0">
                                <span className={`text-lg font-bold ${isPurchase ? "text-primary" : "text-destructive"}`}>
                                  {isPurchase ? "+" : "-"}{Number(movement.quantity).toLocaleString()}
                                </span>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(movement.movement_date).toLocaleDateString("en-PK", {
                                    day: "numeric", month: "short", year: "numeric"
                                  })}
                                </p>
                              </div>
                            </div>
                            {/* Human-readable description */}
                            {movement.notes && (
                              <p className="text-sm text-foreground mt-2 bg-muted/50 rounded p-2">
                                {movement.notes}
                              </p>
                            )}
                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                              {movement.unit_price && (
                                <span>Price: Rs. {Number(movement.unit_price).toLocaleString()}/unit</span>
                              )}
                              <span>Stock After: {Number(movement.balance_after).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
