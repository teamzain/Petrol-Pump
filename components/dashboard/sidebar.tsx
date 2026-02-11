"use client"

import React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Fuel,
  LayoutDashboard,
  Package,
  Truck,
  ShoppingCart,
  DollarSign,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Droplets,
  ClipboardList,
  Calculator,
  ChevronDown,
  Wallet,
  Gauge,
} from "lucide-react"

type NavItem = {
  title: string
  href: string
  icon: React.ElementType
  children?: { title: string; href: string }[]
}

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    title: "Products",
    href: "/dashboard/products",
    icon: Package,
    children: [
      { title: "Fuel Products", href: "/dashboard/products/fuel" },
      { title: "Oils & Lubricants", href: "/dashboard/products/oils" },
    ],
  },
  { title: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
  {
    title: "Inventory",
    href: "/dashboard/inventory",
    icon: Droplets,
    children: [
      { title: "Stock Overview", href: "/dashboard/inventory" },
      { title: "Stock Movements", href: "/dashboard/inventory/movements" },
    ],
  },
  { title: "Purchases", href: "/dashboard/purchases", icon: ShoppingCart },
  { title: "Sales", href: "/dashboard/sales", icon: DollarSign },
  { title: "Balance", href: "/dashboard/balance", icon: Wallet },
  { title: "Nozzles", href: "/dashboard/nozzles", icon: Gauge },
  { title: "Expenses", href: "/dashboard/expenses", icon: Calculator },
  { title: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { title: "Users", href: "/dashboard/users", icon: Users },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function DashboardSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [pumpName, setPumpName] = useState("Petrol Pump")
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const fetchPumpName = async () => {
      const { data } = await supabase
        .from("pump_config")
        .select("pump_name")
        .limit(1)

      if (data && data.length > 0 && data[0].pump_name) {
        setPumpName(data[0].pump_name)
      }
    }

    fetchPumpName()
  }, [supabase])

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title]
    )
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-card border border-border shadow-sm"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-4 border-b border-sidebar-border">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <Fuel className="w-5 h-5 text-sidebar-primary-foreground" />
              </div>
              <div>
                <h1 className="font-semibold text-sidebar-foreground truncate max-w-[160px]">
                  {pumpName}
                </h1>
                <p className="text-xs text-sidebar-foreground/60">Management System</p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navItems.map((item) => (
              <div key={item.title}>
                {item.children ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.title)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                        isActive(item.href)
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <item.icon className="w-4 h-4" />
                        {item.title}
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 transition-transform",
                          expandedItems.includes(item.title) && "rotate-180"
                        )}
                      />
                    </button>
                    {expandedItems.includes(item.title) && (
                      <div className="ml-7 mt-1 space-y-1">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              "block px-3 py-2 rounded-md text-sm transition-colors",
                              pathname === child.href
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                          >
                            {child.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                      isActive(item.href)
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.title}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-sidebar-border">
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
