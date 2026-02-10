"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { 
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Clock,
  ArrowLeft,
} from "lucide-react"
import Link from "next/link"

interface StockMovement {
  id: string
  product_id: string
  movement_date: string
  movement_type: string
  quantity: number
  unit_price: number | null
  balance_after: number
  notes: string | null
  reference_number: string | null
  products: {
    product_name: string
    product_type: string
  }
  suppliers: {
    supplier_name: string
  } | null
}

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")

  const supabase = createClient()

  const fetchMovements = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from("stock_movements")
      .select("*, products(product_name, product_type), suppliers(supplier_name)")
      .order("movement_date", { ascending: false })
      .limit(100)

    if (filter !== "all") {
      query = query.eq("movement_type", filter)
    }

    const { data } = await query
    if (data) setMovements(data as StockMovement[])
    setLoading(false)
  }, [supabase, filter])

  useEffect(() => {
    fetchMovements()
  }, [fetchMovements])

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "purchase": return <ArrowUpRight className="h-4 w-4 text-primary" />
      case "sale": return <ArrowDownRight className="h-4 w-4 text-destructive" />
      case "adjustment": return <TrendingUp className="h-4 w-4 text-muted-foreground" />
      default: return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "purchase": return "Stock Added (Purchase)"
      case "sale": return "Stock Sold"
      case "initial": return "Opening Stock"
      case "adjustment": return "Stock Adjusted"
      default: return type
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
        <div className="flex items-center gap-2">
          <Link href="/dashboard/inventory">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Stock Movements</h1>
            <p className="text-muted-foreground">Complete history of all stock changes</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Movements</SelectItem>
            <SelectItem value="purchase">Purchases Only</SelectItem>
            <SelectItem value="sale">Sales Only</SelectItem>
            <SelectItem value="adjustment">Adjustments Only</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{movements.length} records</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movement History</CardTitle>
          <CardDescription>Detailed log of every stock change with full descriptions</CardDescription>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No movements found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {movements.map((m) => {
                const isPurchase = m.movement_type === "purchase" || m.movement_type === "initial"
                return (
                  <div key={m.id} className="rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isPurchase ? "bg-primary/10" : "bg-destructive/10"}`}>
                        {getMovementIcon(m.movement_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold">{m.products?.product_name}</p>
                            <Badge variant="outline" className="text-xs mt-0.5">{getTypeLabel(m.movement_type)}</Badge>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-lg font-bold ${isPurchase ? "text-primary" : "text-destructive"}`}>
                              {isPurchase ? "+" : "-"}{Number(m.quantity).toLocaleString()}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {new Date(m.movement_date).toLocaleDateString("en-PK", {
                                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                              })}
                            </p>
                          </div>
                        </div>

                        {/* Human-readable description */}
                        <p className="text-sm text-foreground mt-2 bg-muted/50 rounded p-2">
                          {m.notes || (() => {
                            const qty = Math.abs(Number(m.quantity)).toLocaleString()
                            const product = m.products?.product_name || "Unknown Product"
                            const supplier = m.suppliers?.supplier_name
                            const price = m.unit_price ? `Rs. ${Number(m.unit_price).toLocaleString()}` : null
                            switch (m.movement_type) {
                              case "purchase":
                                return `Purchased ${qty} units of ${product}${supplier ? ` from ${supplier}` : ""}${price ? ` at ${price}/unit` : ""}`
                              case "sale":
                                return `Sold ${qty} units of ${product}${price ? ` at ${price}/unit` : ""}`
                              case "initial":
                                return `Initial stock of ${qty} units set for ${product}`
                              case "adjustment":
                                return `Stock adjusted by ${Number(m.quantity) > 0 ? "+" : ""}${Number(m.quantity).toLocaleString()} units for ${product}`
                              default:
                                return `${m.movement_type}: ${qty} units of ${product}`
                            }
                          })()}
                        </p>

                        <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                          {m.unit_price && (
                            <span>Price: Rs. {Number(m.unit_price).toLocaleString()}/unit</span>
                          )}
                          {m.unit_price && m.quantity && (
                            <span className="font-medium text-foreground">
                              Total: Rs. {(Math.abs(Number(m.quantity)) * Number(m.unit_price)).toLocaleString()}
                            </span>
                          )}
                          <span>Stock After: {Number(m.balance_after).toLocaleString()} units</span>
                          {m.reference_number && <span>Invoice: {m.reference_number}</span>}
                          {m.suppliers?.supplier_name && <span>Supplier: {m.suppliers.supplier_name}</span>}
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
    </div>
  )
}
