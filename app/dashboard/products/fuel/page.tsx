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
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, Pencil, Trash2, Fuel, AlertTriangle } from "lucide-react"
import { FuelProductDialog } from "@/components/products/fuel-product-dialog"
import { BrandLoader } from "@/components/ui/brand-loader"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"
import { Progress } from "@/components/ui/progress"

type Product = {
  id: string
  product_name: string
  product_type: string
  unit: string
  current_stock: number
  minimum_stock_level: number
  tank_capacity: number
  purchase_price: number
  weighted_avg_cost: number
  selling_price: number
  last_purchase_price: number | null
  stock_value: number
  status: string
  created_at: string
}

export default function FuelProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const supabase = createClient()

  const fetchProducts = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("product_type", "fuel")
      .order("product_name", { ascending: true })

    if (error) {
      console.error("Error fetching products:", error)
    } else {
      setProducts(data || [])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    if (searchQuery) {
      setFilteredProducts(
        products.filter((p) =>
          p.product_name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    } else {
      setFilteredProducts(products)
    }
  }, [products, searchQuery])

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setIsDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteProduct) return

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", deleteProduct.id)

    if (error) {
      console.error("Error deleting product:", error)
    } else {
      fetchProducts()
    }
    setDeleteProduct(null)
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setEditingProduct(null)
  }

  const handleProductSaved = () => {
    fetchProducts()
    handleDialogClose()
  }

  const getStockPercentage = (current: number, capacity: number) => {
    if (!capacity) return 0
    return Math.min((current / capacity) * 100, 100)
  }

  const isLowStock = (product: Product) => {
    return product.current_stock <= product.minimum_stock_level
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fuel Products</h1>
          <p className="text-muted-foreground">
            Manage your fuel products with tank capacity and pricing
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Fuel Product
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Stock Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rs. {products.reduce((sum, p) => sum + (p.stock_value || 0), 0).toLocaleString("en-PK")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Low Stock Alerts
              {products.filter(isLowStock).length > 0 && (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {products.filter(isLowStock).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search fuel products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Fuel Products</CardTitle>
          <CardDescription>
            {filteredProducts.length} fuel product(s)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <BrandLoader size="md" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Fuel className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                No fuel products found
              </h3>
              <p className="text-muted-foreground mb-4">
                {products.length === 0
                  ? "Add your first fuel product to get started"
                  : "Try adjusting your search"}
              </p>
              {products.length === 0 && (
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Fuel Product
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap">Product</TableHead>
                    <TableHead className="whitespace-nowrap">Tank Level</TableHead>
                    <TableHead className="whitespace-nowrap">Purchase Price</TableHead>
                    <TableHead className="whitespace-nowrap">Selling Price</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Fuel className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{product.product_name}</p>
                            <p className="text-sm text-muted-foreground">
                              Capacity: {product.tank_capacity?.toLocaleString()} {product.unit}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[150px]">
                          <div className="flex items-center justify-between text-sm">
                            <span>{product.current_stock.toLocaleString()} {product.unit}</span>
                            <span className="text-muted-foreground">
                              {getStockPercentage(product.current_stock, product.tank_capacity).toFixed(0)}%
                            </span>
                          </div>
                          <Progress
                            value={getStockPercentage(product.current_stock, product.tank_capacity)}
                            className={isLowStock(product) ? "[&>div]:bg-destructive" : ""}
                          />
                          {isLowStock(product) && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Below minimum ({product.minimum_stock_level} {product.unit})
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-primary">
                          Rs. {product.purchase_price.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        Rs. {product.selling_price.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={product.status === "active" ? "default" : "secondary"}
                        >
                          {product.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(product)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteProduct(product)}
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
      <FuelProductDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        product={editingProduct}
        onSuccess={handleProductSaved}
      />

      <DeleteConfirmDialog
        open={!!deleteProduct}
        onOpenChange={() => setDeleteProduct(null)}
        onConfirm={handleDelete}
        title="Delete Fuel Product"
        description={`Are you sure you want to delete "${deleteProduct?.product_name}"? This will also delete all related inventory records.`}
      />
    </div>
  )
}
