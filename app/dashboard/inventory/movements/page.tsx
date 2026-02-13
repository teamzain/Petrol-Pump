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
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Clock,
  ArrowLeft,
} from "lucide-react"
import Link from "next/link"
import { BrandLoader } from "@/components/ui/brand-loader"

interface StockMovement {
  id: string
  product_id: string
  movement_date: string
  movement_type: string
  quantity: number
  previous_stock: number
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
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [dateRange, setDateRange] = useState("all") // all, today, week, month, custom
  const [customStart, setCustomStart] = useState<string>("")
  const [customEnd, setCustomEnd] = useState<string>("")
  const [products, setProducts] = useState<{ id: string, product_name: string }[]>([])

  const supabase = createClient()

  const fetchMovements = useCallback(async () => {
    setLoading(true)
    // Fetch products for filter
    const { data: prodData } = await supabase.from("products").select("id, product_name").order("product_name")
    if (prodData) setProducts(prodData)

    let query = supabase
      .from("stock_movements")
      .select("*, products(product_name, product_type), suppliers(supplier_name)")
      .order("movement_date", { ascending: false })
      .limit(200)

    if (filter !== "all") {
      query = query.eq("movement_type", filter)
    }

    if (productFilter !== "all") {
      query = query.eq("product_id", productFilter)
    }

    if (dateRange !== "all") {
      const today = new Date()
      let startStr = ""
      let endStr = ""

      if (dateRange === "today") {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date()
        end.setHours(23, 59, 59, 999)
        startStr = start.toISOString()
        endStr = end.toISOString()
      } else if (dateRange === "week") {
        const end = new Date()
        end.setHours(23, 59, 59, 999)
        const start = new Date()
        start.setDate(start.getDate() - 7)
        start.setHours(0, 0, 0, 0)
        startStr = start.toISOString()
        endStr = end.toISOString()
      } else if (dateRange === "month") {
        const end = new Date()
        end.setHours(23, 59, 59, 999)
        const start = new Date()
        start.setMonth(start.getMonth() - 1)
        start.setHours(0, 0, 0, 0)
        startStr = start.toISOString()
        endStr = end.toISOString()
      } else if (dateRange === "custom" && customStart && customEnd) {
        // Create dates from "YYYY-MM-DD" which defaults to UTC if passed directly to new Date()
        // Instead, valid approach: split and construct local date
        const s = new Date(customStart)
        s.setHours(0, 0, 0, 0) // Force local midnight
        // If input "2026-02-10" is parsed as UTC midnight, converting to local might shift it.
        // Better: new Date(year, index, day)
        // input type="date" returns "YYYY-MM-DD".

        const startParts = customStart.split('-').map(Number)
        const endParts = customEnd.split('-').map(Number)

        // Month is 0-indexed in Date constructor
        const start = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0)
        const end = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999)

        startStr = start.toISOString()
        endStr = end.toISOString()
      }

      if (startStr && endStr) {
        // Supabase/Postgres expects ISO string (UTC)
        query = query.gte("movement_date", startStr).lte("movement_date", endStr)
      }
    }

    // Search Filter
    if (searchQuery.trim()) {
      // Note: This relies on Supabase ability to filter on joined tables or local columns
      // Filtering on joined 'products.product_name' is hard with simple OR.
      // Easiest strategies: 
      // 1. Client-side filter (if data small). 
      // 2. RPC. 
      // 3. Simple text search on notes/reference.
      // Let's try text search on notes/reference first, maybe product name if possible.
      // But standard PostgREST doesn't support easy deep filtering on joined relations in OR.
      // We will perform client-side filtering for search to be safe and searching joined data.
    }

    const { data } = await query

    let result = data as StockMovement[] || []

    // Client-side search filtering to handle joined product names
    if (searchQuery.trim() && result) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m =>
        m.products?.product_name?.toLowerCase().includes(q) ||
        m.notes?.toLowerCase().includes(q) ||
        m.reference_number?.toLowerCase().includes(q) ||
        m.suppliers?.supplier_name?.toLowerCase().includes(q)
      )
    }

    setMovements(result)
    setLoading(false)
  }, [supabase, filter, productFilter, dateRange, customStart, customEnd, searchQuery])

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
        <BrandLoader size="lg" />
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

      <div className="flex flex-col md:flex-row items-center gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by product, notes, reference, or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Type Filter */}
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="purchase">Purchases</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="adjustment">Adjustments</SelectItem>
            </SelectContent>
          </Select>

          {/* Product Filter */}
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Range Filter */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === "custom" && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <Input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-[130px]"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-[130px]"
              />
            </div>
          )}

          <div className="h-4 w-[1px] bg-border mx-2 hidden md:block" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">{movements.length} records</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movement History</CardTitle>
          <CardDescription>Detailed log of every stock transaction</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Previous Stock</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead>Reference / Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No movements found
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((m) => {
                    const diff = Number(m.balance_after) - Number(m.previous_stock)
                    const isIncrease = diff > 0
                    const displayChange = Math.abs(diff)

                    const isPurchase = m.movement_type === "purchase"
                    const isSale = m.movement_type === "sale"

                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {new Date(m.movement_date).toLocaleDateString("en-PK", {
                            day: "numeric", month: "short", year: "numeric"
                          })}
                          <span className="block text-xs text-muted-foreground">
                            {new Date(m.movement_date).toLocaleTimeString("en-PK", {
                              hour: "2-digit", minute: "2-digit"
                            })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{m.products?.product_name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{m.products?.product_type?.replace('_', ' ')}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isPurchase ? "secondary" : isSale ? "outline" : "outline"}
                            className={isPurchase ? "bg-green-100 text-green-800 hover:bg-green-100" : isSale ? "bg-red-50 text-red-700 hover:bg-red-50" : ""}>
                            {m.movement_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(m.previous_stock || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold ${isIncrease ? "text-green-600" : "text-destructive"}`}>
                            {isIncrease ? "+" : "-"}{displayChange.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {Number(m.balance_after).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="truncate text-sm" title={m.notes || ""}>
                            {m.reference_number && <span className="font-mono text-xs bg-muted px-1 rounded mr-1">{m.reference_number}</span>}
                            {m.notes || "-"}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
