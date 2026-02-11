"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Bell,
    AlertTriangle,
    CheckCircle2,
    Info,
    Package,
    Wallet,
    X
} from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

type NotificationItem = {
    id: string
    title: string
    message: string
    type: "info" | "warning" | "error" | "success"
    timestamp: string
    read: boolean
    source: "system" | "stock" | "supplier"
    link?: string
}

export function NotificationsPopover() {
    const [open, setOpen] = useState(false)
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        fetchNotifications()

        // Subscribe to new notifications
        const channel = supabase
            .channel('notifications_popover')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
                fetchNotifications()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    // Poll for stock/supplier updates every minute
    useEffect(() => {
        const interval = setInterval(fetchNotifications, 60000)
        return () => clearInterval(interval)
    }, [])

    const fetchNotifications = async () => {
        setLoading(true)
        try {
            const allItems: NotificationItem[] = []

            // 1. Fetch System Notifications (from DB)
            const { data: dbNotifs } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20)

            if (dbNotifs) {
                dbNotifs.forEach(n => {
                    allItems.push({
                        id: n.id,
                        title: n.title,
                        message: n.message,
                        type: n.type as any,
                        timestamp: n.created_at,
                        read: n.is_read,
                        source: 'system',
                        link: n.link
                    })
                })
            }

            // 2. Fetch Low Stock Alerts (Live)
            const { data: lowStock } = await supabase
                .from('products')
                .select('id, product_name, current_stock, minimum_stock_level, unit')
                .eq('status', 'active')

            if (lowStock) {
                lowStock.forEach(p => {
                    if (p.current_stock <= p.minimum_stock_level) {
                        allItems.push({
                            id: `stock-${p.id}`,
                            title: "Low Stock Alert",
                            message: `${p.product_name} is running low (${p.current_stock} ${p.unit}).`,
                            type: "warning",
                            timestamp: new Date().toISOString(), // Live
                            read: false, // Always unread if low
                            source: "stock",
                            link: "/dashboard/inventory"
                        })
                    }
                })
            }

            // 3. Fetch Supplier Dues (Live) - Only if balance column exists (graceful fallback)
            try {
                const { data: suppliers } = await supabase
                    .from('suppliers')
                    .select('id, supplier_name, balance')
                    .gt('balance', 0)
                    .eq('status', 'active')

                if (suppliers) {
                    suppliers.forEach(s => {
                        allItems.push({
                            id: `supplier-${s.id}`,
                            title: "Payment Due",
                            message: `Outstanding balance of Rs. ${s.balance} for ${s.supplier_name}.`,
                            type: "warning",
                            timestamp: new Date().toISOString(),
                            read: false,
                            source: "supplier",
                            link: "/dashboard/suppliers"
                        })
                    })
                }
            } catch (err) {
                // Ignore column not found error if schema not applied yet
            }

            // Sort by timestamp (newest first)
            // Note: For live items, timestamp is now, so they appear at top.
            allItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

            setNotifications(allItems)
            setUnreadCount(allItems.filter(n => !n.read).length)

        } catch (error) {
            console.error("Error fetching notifications:", error)
        } finally {
            setLoading(false)
        }
    }

    const markAsRead = async (id: string, source: string) => {
        if (source === 'system') {
            await supabase.from('notifications').update({ is_read: true }).eq('id', id)
            fetchNotifications()
        }
        // Live items (stock/supplier) cannot be marked read, they disappear when resolved.
    }

    const markAllRead = async () => {
        const unreadSystemIds = notifications
            .filter(n => n.source === 'system' && !n.read)
            .map(n => n.id)

        if (unreadSystemIds.length > 0) {
            await supabase.from('notifications').update({ is_read: true }).in('id', unreadSystemIds)
            fetchNotifications()
        }
    }

    const getIcon = (type: string, source: string) => {
        if (source === 'stock') return <Package className="h-4 w-4 text-orange-500" />
        if (source === 'supplier') return <Wallet className="h-4 w-4 text-red-500" />
        switch (type) {
            case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />
            case 'error': return <AlertTriangle className="h-4 w-4 text-destructive" />
            case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />
            default: return <Info className="h-4 w-4 text-blue-500" />
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-4 border-b">
                    <h4 className="font-semibold leading-none">Notifications</h4>
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-auto px-2 text-xs" onClick={markAllRead}>
                            Mark all read
                        </Button>
                    )}
                </div>

                {loading && notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
                ) : notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No new notifications
                    </div>
                ) : (
                    <ScrollArea className="h-[300px]">
                        <div className="grid gap-1">
                            {notifications.map((item) => (
                                <div
                                    key={item.id}
                                    className={`flex items-start gap-4 p-4 hover:bg-muted/50 transition-colors ${!item.read ? 'bg-muted/30' : ''}`}
                                >
                                    <div className="mt-1">
                                        {getIcon(item.type, item.source)}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <p className={`text-sm font-medium leading-none ${!item.read ? 'font-semibold' : ''}`}>
                                            {item.title}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {item.message}
                                        </p>
                                        <div className="flex items-center justify-between mt-2">
                                            <p className="text-xs text-muted-foreground">
                                                {item.source === 'system' ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true }) : 'Now'}
                                            </p>
                                            {item.link && (
                                                <Link href={item.link} onClick={() => setOpen(false)}>
                                                    <span className="text-xs text-primary hover:underline cursor-pointer">View</span>
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                    {item.source === 'system' && !item.read && (
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => markAsRead(item.id, item.source)}>
                                            <span className="sr-only">Dismiss</span>
                                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </PopoverContent>
        </Popover>
    )
}
