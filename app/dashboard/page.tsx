"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getTodayPKT } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Fuel,
  DollarSign,
  TrendingUp,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
} from "lucide-react"
import Link from "next/link"
import { DailyOperationsWidget } from "@/components/dashboard/daily-operations-widget"

type DashboardStats = {
  totalProducts: number
  lowStockProducts: number
  todaySales: number
  todayExpenses: number
  cashBalance: number
  bankBalance: number
}

type RecentActivity = {
  id: string
  type: "purchase" | "sale" | "expense"
  description: string
  amount: number
  date: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    lowStockProducts: 0,
    todaySales: 0,
    todayExpenses: 0,
    cashBalance: 0,
    bankBalance: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch products count
        const { count: totalProducts } = await supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("status", "active")

        // Fetch low stock products
        const { data: lowStockData } = await supabase
          .from("products")
          .select("id, current_stock, minimum_stock_level")
          .eq("status", "active")

        const lowStockProducts = lowStockData?.filter(
          (p) => p.current_stock <= p.minimum_stock_level
        ).length || 0

        // Fetch balance from daily_balances - get the most recent record
        const today = getTodayPKT()
        let cashBal = 0
        let bankBal = 0

        // Fetch current balances from accounts table (Source of Truth)
        const { data: accounts } = await supabase
          .from("accounts")
          .select("account_type, current_balance")
          .eq("status", "active")

        if (accounts) {
          cashBal = accounts
            .filter(a => a.account_type === 'cash')
            .reduce((sum, a) => sum + Number(a.current_balance || 0), 0)

          bankBal = accounts
            .filter(a => a.account_type === 'bank')
            .reduce((sum, a) => sum + Number(a.current_balance || 0), 0)
        }

        // Fetch today's fuel sales
        const { data: fuelSales } = await supabase
          .from("nozzle_readings")
          .select("sale_amount")
          .eq("reading_date", today)

        // Fetch today's product sales
        const { data: productSales } = await supabase
          .from("sales")
          .select("sale_amount")
          .eq("sale_date", today)

        const totalFuelSales = fuelSales?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0
        const totalProductSales = productSales?.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0) || 0
        const totalSales = totalFuelSales + totalProductSales

        // Fetch today's purchases total
        const { data: todayPurchases } = await supabase
          .from("purchases")
          .select("total_amount")
          .gte("purchase_date", today)

        const todayExpensesTotal = todayPurchases?.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) || 0

        setStats({
          totalProducts: totalProducts || 0,
          lowStockProducts,
          todaySales: totalSales,
          todayExpenses: todayExpensesTotal,
          cashBalance: cashBal,
          bankBalance: bankBal,
        })
      } catch (error) {
        console.error("Error fetching stats:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()

    // Realtime subscription for daily_balances
    const balanceChannel = supabase
      .channel('dashboard_balance_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_balances',
        },
        () => {
          fetchStats()
        }
      )
      .subscribe()

    // Realtime subscription for accounts
    const accountsChannel = supabase
      .channel('dashboard_accounts_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
        },
        () => {
          fetchStats()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(balanceChannel)
      supabase.removeChannel(accountsChannel)
    }
  }, [supabase])

  const statCards = [
    {
      title: "Total Sales Today",
      value: `Rs. ${stats.todaySales.toLocaleString("en-PK")}`,
      icon: DollarSign,
      description: "Revenue generated today",
      trend: "up",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Cash Balance",
      value: `Rs. ${stats.cashBalance.toLocaleString("en-PK")}`,
      icon: Fuel,
      description: "Current cash in hand",
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
    },
    {
      title: "Bank Balance",
      value: `Rs. ${stats.bankBalance.toLocaleString("en-PK")}`,
      icon: TrendingUp,
      description: "Current bank balance",
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: "Active Products",
      value: stats.totalProducts.toString(),
      icon: Package,
      description: `${stats.lowStockProducts} with low stock`,
      alert: stats.lowStockProducts > 0,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
  ]

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-primary/10 border-t-primary animate-spin shadow-2xl shadow-primary/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Fuel className="h-8 w-8 text-primary animate-pulse" />
          </div>
        </div>
        <p className="mt-6 text-muted-foreground font-medium animate-pulse tracking-wide italic">Preparing your dashboard analytics...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here is your petrol pump overview.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/sales">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Sale
            </Button>
          </Link>
        </div>
      </div>

      {/* Daily Operations Widget */}
      {/* <DailyOperationsWidget /> */}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {stat.alert && (
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                )}
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Alerts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Frequently used operations</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Link href="/dashboard/purchases/new">
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <Plus className="w-4 h-4 mr-2" />
                Add Purchase
              </Button>
            </Link>
            <Link href="/dashboard/sales">
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <DollarSign className="w-4 h-4 mr-2" />
                Record Sale
              </Button>
            </Link>
            <Link href="/dashboard/expenses/new">
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <ArrowDownRight className="w-4 h-4 mr-2" />
                Add Expense
              </Button>
            </Link>
            <Link href="/dashboard/products/fuel">
              <Button variant="outline" className="w-full justify-start bg-transparent">
                <Fuel className="w-4 h-4 mr-2" />
                Manage Products
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Stock Alerts
            </CardTitle>
            <CardDescription>Products requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.lowStockProducts === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>All products are well stocked</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {stats.lowStockProducts} product(s) have low stock levels
                </p>
                <Link href="/dashboard/inventory">
                  <Button variant="outline" className="w-full bg-transparent">
                    View Inventory
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Getting Started Guide - Shows if no products */}
      {stats.totalProducts === 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Complete these steps to start using your petrol pump management system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                  1
                </div>
                <div>
                  <p className="font-medium">Add Suppliers</p>
                  <p className="text-sm text-muted-foreground">
                    Add your fuel and product suppliers
                  </p>
                  <Link href="/dashboard/suppliers">
                    <Button variant="link" className="px-0 h-auto">
                      Add Suppliers
                      <ArrowUpRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                  2
                </div>
                <div>
                  <p className="font-medium">Add Fuel Products</p>
                  <p className="text-sm text-muted-foreground">
                    Configure your fuel products with tank capacity and pricing
                  </p>
                  <Link href="/dashboard/products/fuel">
                    <Button variant="link" className="px-0 h-auto">
                      Add Fuel Products
                      <ArrowUpRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
                  3
                </div>
                <div>
                  <p className="font-medium">Record First Purchase</p>
                  <p className="text-sm text-muted-foreground">
                    Add your initial fuel purchase to start inventory tracking
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
