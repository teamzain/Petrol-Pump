"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import {
    CreditCard,
    Clock,
    CheckCircle2,
    Settings,
    Search,
    ArrowUpDown,
    SlidersHorizontal,
    ArrowRight,
    ArrowRightLeft,
    TrendingDown,
    Building2,
    Wallet,
    Save,
    Plus,
    Pencil,
    Trash2,
    Power,
    Receipt
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandLoader } from "@/components/ui/brand-loader"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

interface CardType {
    id: string
    card_name: string
    tax_percentage: number
    is_active: boolean
}

interface CardPayment {
    id: string
    payment_date: string
    card_type_id: string
    reference_type: string
    reference_id: string
    amount: number
    tax_percentage: number
    tax_amount: number
    net_amount: number
    status: 'hold' | 'received'
    received_at: string | null
    bank_account_id: string | null
    card_types: {
        card_name: string
    }
    notes?: string
}

interface BankAccount {
    id: string
    account_name: string
    account_type: string
    current_balance: number
}

export function CardManagement() {
    const supabase = createClient()
    const { toast } = useToast()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [cardTypes, setCardTypes] = useState<CardType[]>([])
    const [holdPayments, setHoldPayments] = useState<CardPayment[]>([])
    const [receivedPayments, setReceivedPayments] = useState<CardPayment[]>([])
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])

    const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
    const [selectedPayment, setSelectedPayment] = useState<CardPayment | null>(null)
    const [targetAccountId, setTargetAccountId] = useState("")

    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
    const [addCardDialogOpen, setAddCardDialogOpen] = useState(false)
    const [editingCardType, setEditingCardType] = useState<CardType | null>(null)
    const [taxInput, setTaxInput] = useState("")
    const [nameInput, setNameInput] = useState("")

    const [newCardName, setNewCardName] = useState("")
    const [newCardTax, setNewCardTax] = useState("0")

    const [manageTab, setManageTab] = useState<"hold" | "received">("hold")
    const [receiveNote, setReceiveNote] = useState("")

    const [searchQuery, setSearchQuery] = useState("")
    const [showSearch, setShowSearch] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const { data: ctData } = await supabase.from("card_types").select("*").order("card_name")
            if (ctData) setCardTypes(ctData)

            const { data: hpData } = await supabase
                .from("card_payments")
                .select("*, card_types(card_name)")
                .eq("status", "hold")
                .order("payment_date", { ascending: false })
            if (hpData) setHoldPayments(hpData as any)

            const { data: rpData } = await supabase
                .from("card_payments")
                .select("*, card_types(card_name)")
                .eq("status", "received")
                .order("received_at", { ascending: false })
                .limit(20)
            if (rpData) setReceivedPayments(rpData as any)

            const { data: baData } = await supabase
                .from("accounts")
                .select("*")
                .eq("account_type", "bank")
                .eq("status", "active")
                .order("account_name")
            if (baData) setBankAccounts(baData)

        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleReceive = async () => {
        if (!selectedPayment || !targetAccountId) return
        setSaving(true)
        try {
            const { error: updateError } = await supabase
                .from("card_payments")
                .update({
                    status: "received",
                    received_at: new Date().toISOString(),
                    bank_account_id: targetAccountId,
                    notes: receiveNote
                })
                .eq("id", selectedPayment.id)

            if (updateError) throw updateError

            // [NEW] Update the original sale's card transaction to 'received'
            const { error: txError } = await supabase
                .from("transactions")
                .update({ status: "received" })
                .eq("reference_id", selectedPayment.reference_id)
                .eq("reference_type", selectedPayment.reference_type)
                .eq("payment_method", "card")
                .eq("status", "hold")

            if (txError) {
                console.error("Failed to update original transaction status:", txError)
            }

            // Update account balance
            const { data: accountData } = await supabase
                .from("accounts")
                .select("current_balance")
                .eq("id", targetAccountId)
                .single()

            if (accountData) {
                await supabase
                    .from("accounts")
                    .update({ current_balance: accountData.current_balance + selectedPayment.net_amount })
                    .eq("id", targetAccountId)
            }

            // Record transaction: Transfer from Card Receivable to Bank Account
            const user = await supabase.auth.getUser()
            await supabase.from("transactions").insert({
                transaction_date: new Date().toISOString(),
                transaction_type: "transfer",
                category: "sale",
                description: `Card payment settled: ${selectedPayment.card_types.card_name} (Net: Rs. ${selectedPayment.net_amount.toLocaleString()})${receiveNote ? ` | Note: ${receiveNote}` : ""}`,
                amount: selectedPayment.net_amount,
                payment_method: "card", // Source method
                from_account: null, // Virtual 'card' account
                to_account: targetAccountId,
                reference_type: "card_payments",
                reference_id: selectedPayment.id,
                created_by: user.data.user?.id,
                bank_account_id: targetAccountId
            })

            // Record Tax as Expense: Deduction from Card Receivable
            if (selectedPayment.tax_amount > 0) {
                await supabase.from("transactions").insert({
                    transaction_date: new Date().toISOString(),
                    transaction_type: "expense",
                    category: "tax",
                    description: `Tax deducted on ${selectedPayment.card_types.card_name} settlement`,
                    amount: selectedPayment.tax_amount,
                    payment_method: "card", // Deducted from card receivables
                    from_account: null,
                    reference_type: "card_payments",
                    reference_id: selectedPayment.id,
                    created_by: user.data.user?.id
                })
            }

            toast({ title: "Success", description: "Payment marked as received." })
            setReceiveDialogOpen(false)
            setReceiveNote("") // Reset note
            fetchData()
        } catch (err) {
            console.error(err)
            toast({ title: "Error", description: "Failed to mark as received.", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const handleUpdateCardType = async () => {
        if (!editingCardType || !nameInput) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from("card_types")
                .update({
                    card_name: nameInput,
                    tax_percentage: parseFloat(taxInput) || 0
                })
                .eq("id", editingCardType.id)

            if (error) throw error
            toast({ title: "Success", description: "Card type updated." })
            setEditingCardType(null)
            fetchData()
        } catch (err) {
            console.error(err)
            toast({ title: "Error", description: "Failed to update card type.", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (cardType: CardType) => {
        setSaving(true)
        try {
            const { error } = await supabase
                .from("card_types")
                .update({ is_active: !cardType.is_active })
                .eq("id", cardType.id)

            if (error) throw error
            toast({
                title: cardType.is_active ? "Deactivated" : "Activated",
                description: `${cardType.card_name} has been ${cardType.is_active ? 'deactivated' : 'activated'}.`
            })
            fetchData()
        } catch (err) {
            console.error(err)
            toast({ title: "Error", description: "Failed to update status.", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const handleAddCardType = async () => {
        if (!newCardName) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from("card_types")
                .insert({
                    card_name: newCardName,
                    tax_percentage: parseFloat(newCardTax) || 0,
                    is_active: true
                })

            if (error) throw error
            toast({ title: "Success", description: "New card type added." })
            setAddCardDialogOpen(false)
            setNewCardName("")
            setNewCardTax("0")
            fetchData()
        } catch (err) {
            console.error(err)
            toast({ title: "Error", description: "Failed to add card type.", variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse font-medium">Loading card management...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Shopify-Style Compact Stats Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                <div className="p-4 border-b md:border-b-0 md:border-r border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <p className="text-[10px] font-black Lato uppercase tracking-widest text-muted-foreground mb-1">Outstanding Balances</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-slate-400 Lato">Rs.</span>
                        <span className="text-xl font-black Lato tracking-tight">{holdPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                        <span className="text-[9px] font-bold text-orange-600 uppercase Lato">{holdPayments.length} Pending</span>
                    </div>
                </div>
                <div className="p-4 border-b md:border-b-0 md:border-r border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <p className="text-[10px] font-black Lato uppercase tracking-widest text-muted-foreground mb-1">Net Realized Value</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-slate-400 Lato">Rs.</span>
                        <span className="text-xl font-black Lato tracking-tight">{receivedPayments.reduce((sum, p) => sum + p.net_amount, 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        <span className="text-[9px] font-bold text-green-600 uppercase Lato">Settled</span>
                    </div>
                </div>
                <div className="p-4 hover:bg-slate-50/50 transition-colors relative">
                    <p className="text-[10px] font-black Lato uppercase tracking-widest text-muted-foreground mb-1">Transaction Fees</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-slate-400 Lato">Rs.</span>
                        <span className="text-xl font-black Lato tracking-tight">{receivedPayments.reduce((sum, p) => sum + p.tax_amount, 0).toLocaleString()}</span>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase Lato mt-1 italic opacity-60">System Deductions</p>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSettingsDialogOpen(true)}
                        className="absolute top-3 right-3 h-8 w-8 text-slate-400 hover:text-primary transition-colors"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Reconciliation View (Hold/Received Payments) */}

            {/* Shopify-Style Resource List Container */}
            <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                <Tabs value={manageTab} onValueChange={(v) => setManageTab(v as any)} className="w-full">
                    <div className="px-4 border-b border-slate-100 bg-white">
                        <div className="flex items-center justify-between h-14">
                            {/* Left: Pill Segments */}
                            <TabsList className="bg-transparent p-0 gap-2 h-auto border-none">
                                <TabsTrigger
                                    value="hold"
                                    className="Lato font-bold text-[11px] px-4 py-1.5 rounded-lg bg-transparent data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 transition-all border border-transparent data-[state=active]:border-slate-200/50 shadow-none hover:bg-slate-50"
                                >
                                    Pending
                                </TabsTrigger>
                                <TabsTrigger
                                    value="received"
                                    className="Lato font-bold text-[11px] px-4 py-1.5 rounded-lg bg-transparent data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 transition-all border border-transparent data-[state=active]:border-slate-200/50 shadow-none hover:bg-slate-50"
                                >
                                    Settled
                                </TabsTrigger>
                            </TabsList>

                            {/* Right: Shopify Ghost Actions */}
                            <div className="flex items-center gap-1">
                                <div className={cn(
                                    "flex items-center bg-slate-100/50 rounded-lg px-2 transition-all duration-300",
                                    showSearch ? "w-48 opacity-100" : "w-0 opacity-0 overflow-hidden"
                                )}>
                                    <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="bg-transparent border-none focus:ring-0 text-[11px] Lato h-8 w-full placeholder:text-slate-400"
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("h-8 w-8 text-slate-500 hover:bg-slate-50", showSearch && "text-primary bg-slate-50")}
                                    onClick={() => setShowSearch(!showSearch)}
                                >
                                    <Search className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:bg-slate-50">
                                    <SlidersHorizontal className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:bg-slate-50">
                                    <ArrowUpDown className="h-4 w-4" />
                                </Button>
                                <div className="h-4 w-[1px] bg-slate-100 mx-2" />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="Lato font-black uppercase text-[9px] tracking-widest h-8 px-3 rounded-lg border-slate-200 bg-white hover:bg-slate-50 shadow-none"
                                    onClick={() => setSettingsDialogOpen(true)}
                                >
                                    Add Card
                                </Button>
                            </div>
                        </div>
                    </div>

                    <TabsContent value="hold" className="mt-0 animate-in fade-in duration-200">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-white">
                                    <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                        <TableHead className="Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Date</TableHead>
                                        <TableHead className="Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Channel</TableHead>
                                        <TableHead className="text-right Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Gross</TableHead>
                                        <TableHead className="text-right Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Tax</TableHead>
                                        <TableHead className="text-right Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Net Transfer</TableHead>
                                        <TableHead className="text-center Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Status</TableHead>
                                        <TableHead className="text-right px-6 Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(searchQuery ? holdPayments.filter(p =>
                                        p.card_types.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        p.amount.toString().includes(searchQuery) ||
                                        format(new Date(p.payment_date), "dd MMM yyyy").toLowerCase().includes(searchQuery.toLowerCase())
                                    ) : holdPayments).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-muted-foreground h-48 Lato text-[10px] uppercase font-bold tracking-widest italic opacity-40">
                                                {searchQuery ? "No matching entries" : "No pending entries"}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        (searchQuery ? holdPayments.filter(p =>
                                            p.card_types.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            p.amount.toString().includes(searchQuery) ||
                                            format(new Date(p.payment_date), "dd MMM yyyy").toLowerCase().includes(searchQuery.toLowerCase())
                                        ) : holdPayments).map(p => (
                                            <TableRow key={p.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-50/50 last:border-0 group">
                                                <TableCell className="font-bold Lato text-xs py-4 text-slate-600">{format(new Date(p.payment_date), "dd MMM yyyy")}</TableCell>
                                                <TableCell className="py-4">
                                                    <div className="flex items-center gap-2">
                                                        {p.card_types.card_name.includes("Shell") ? (
                                                            <div className="bg-white p-0.5 rounded border border-slate-100">
                                                                <img src="https://www.shell.com.pk/etc.clientlibs/shell/clientlibs/clientlib-site/resources/resources/favicons/favicon-32x32.png" alt="S" className="h-3 w-3" />
                                                            </div>
                                                        ) : <CreditCard className="h-3.5 w-3.5 text-slate-300" />}
                                                        <span className="text-[11px] font-bold text-slate-700 Lato tracking-tight">{p.card_types.card_name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-bold Lato text-xs py-4 text-slate-600">Rs. {p.amount.toLocaleString()}</TableCell>
                                                <TableCell className="text-right text-slate-400 font-medium Lato text-[10px] py-4">
                                                    -{p.tax_amount.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-black text-primary Lato text-sm py-4">Rs. {p.net_amount.toLocaleString()}</TableCell>
                                                <TableCell className="text-center py-4">
                                                    <span className="text-[8px] font-black uppercase tracking-widest bg-orange-50 text-orange-600 px-2 py-0.5 rounded-md border border-orange-100 Lato">Pending</span>
                                                </TableCell>
                                                <TableCell className="text-right px-6 py-4">
                                                    <Button variant="outline" size="sm" className="Lato font-black uppercase text-[8px] tracking-widest h-7 px-4 invisible group-hover:visible bg-white hover:bg-primary hover:text-white hover:border-primary transition-all shadow-none" onClick={() => {
                                                        setSelectedPayment(p)
                                                        setReceiveDialogOpen(true)
                                                    }}>
                                                        Process
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="received" className="mt-0 animate-in fade-in duration-200">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-white">
                                    <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                        <TableHead className="Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Received</TableHead>
                                        <TableHead className="Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Original Date</TableHead>
                                        <TableHead className="Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Channel</TableHead>
                                        <TableHead className="text-right Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Gross</TableHead>
                                        <TableHead className="text-right Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Net Settled</TableHead>
                                        <TableHead className="Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Account</TableHead>
                                        <TableHead className="Lato uppercase text-[9px] font-black tracking-widest py-4 text-slate-500">Reference</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(searchQuery ? receivedPayments.filter(p =>
                                        p.card_types.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        p.net_amount.toString().includes(searchQuery) ||
                                        (p.received_at && format(new Date(p.received_at), "dd MMM yyyy").toLowerCase().includes(searchQuery.toLowerCase()))
                                    ) : receivedPayments).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-muted-foreground h-48 Lato text-[10px] uppercase font-bold tracking-widest italic opacity-40">
                                                {searchQuery ? "No matching history" : "No settlement history"}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        (searchQuery ? receivedPayments.filter(p =>
                                            p.card_types.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            p.net_amount.toString().includes(searchQuery) ||
                                            (p.received_at && format(new Date(p.received_at), "dd MMM yyyy").toLowerCase().includes(searchQuery.toLowerCase()))
                                        ) : receivedPayments).map(p => (
                                            <TableRow key={p.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                                                <TableCell className="font-bold Lato text-xs py-4">{p.received_at ? format(new Date(p.received_at), "dd MMM HH:mm") : "-"}</TableCell>
                                                <TableCell className="text-muted-foreground Lato text-[10px] py-4">{format(new Date(p.payment_date), "dd MMM")}</TableCell>
                                                <TableCell className="py-4">
                                                    <span className="text-[10px] font-black uppercase Lato tracking-tight">{p.card_types.card_name}</span>
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground Lato text-xs py-4">Rs. {p.amount.toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-black text-green-600 Lato text-sm py-4">Rs. {p.net_amount.toLocaleString()}</TableCell>
                                                <TableCell className="py-4">
                                                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500 Lato">
                                                        <Building2 className="h-3 w-3 opacity-50" />
                                                        {bankAccounts.find(ba => ba.id === p.bank_account_id)?.account_name || "Account"}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-[120px] truncate py-4">
                                                    <span className="text-[9px] text-muted-foreground font-medium Lato italic" title={p.notes}>
                                                        {p.notes || "-"}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Dialogs */}
            <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="Lato font-black uppercase text-sm tracking-widest">Mark as Received</DialogTitle>
                        <DialogDescription className="Lato text-xs">
                            Confirm funds arrival and distribute to your account.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedPayment && (
                        <div className="py-6 space-y-6">
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                                <div className="flex justify-between items-center border-b border-primary/10 pb-2">
                                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest Lato">Original Amount</span>
                                    <span className="font-bold Lato">Rs. {selectedPayment.amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-destructive">
                                    <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 Lato">
                                        <TrendingDown className="h-3 w-3" /> {selectedPayment.card_types.card_name} Tax ({selectedPayment.tax_percentage}%)
                                    </span>
                                    <span className="font-bold Lato">-Rs. {selectedPayment.tax_amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-primary/20">
                                    <span className="text-xs font-black uppercase text-primary tracking-widest Lato">NET TRANSFER</span>
                                    <span className="text-xl font-black text-primary Lato">Rs. {selectedPayment.net_amount.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="space-y-3 px-1">
                                <Label className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 Lato">
                                    <Wallet className="h-4 w-4 text-primary" /> Destination Account
                                </Label>
                                <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                                    <SelectTrigger className="h-11 Lato font-bold border-2">
                                        <SelectValue placeholder="Select Account..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {bankAccounts.map(ba => (
                                            <SelectItem key={ba.id} value={ba.id} className="py-2 Lato">
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{ba.account_name}</span>
                                                    <span className="text-[9px] text-muted-foreground uppercase tracking-widest">Bal: Rs. {ba.current_balance.toLocaleString()}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-3 px-1">
                                <Label className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 Lato">
                                    <ArrowRightLeft className="h-4 w-4 text-primary" /> Additional Note
                                </Label>
                                <Textarea
                                    placeholder="Enter details or reference..."
                                    value={receiveNote}
                                    onChange={(e) => setReceiveNote(e.target.value)}
                                    className="resize-none Lato text-sm min-h-[80px]"
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" className="Lato font-black uppercase text-[10px] tracking-widest" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
                        <Button
                            className="min-w-[150px] bg-primary h-11 text-xs font-black uppercase tracking-widest"
                            onClick={handleReceive}
                            disabled={saving || !targetAccountId}
                        >
                            {saving ? <BrandLoader size="xs" /> : "Confirm Settlement"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <div className="flex items-center justify-between pr-8">
                            <div>
                                <DialogTitle className="Lato font-black uppercase text-sm tracking-widest">Card Channel Config</DialogTitle>
                                <DialogDescription className="Lato text-xs">Configure tax percentages for each card type.</DialogDescription>
                            </div>
                            <Button size="sm" className="Lato font-black uppercase text-[10px] tracking-widest h-9" onClick={() => setAddCardDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Add Channel
                            </Button>
                        </div>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="Lato uppercase text-[10px] font-black tracking-widest">Card Name</TableHead>
                                    <TableHead className="text-right Lato uppercase text-[10px] font-black tracking-widest">Tax %</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cardTypes.map(ct => (
                                    <TableRow key={ct.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold Lato">{ct.card_name}</span>
                                                <Badge variant={ct.is_active ? "default" : "secondary"} className={`w-fit text-[9px] h-4 mt-1 font-black Lato ${ct.is_active ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-100'}`}>
                                                    {ct.is_active ? 'ACTIVE' : 'INACTIVE'}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-black text-primary Lato">{ct.tax_percentage}%</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-primary"
                                                    onClick={() => {
                                                        setEditingCardType(ct)
                                                        setTaxInput(ct.tax_percentage.toString())
                                                        setNameInput(ct.card_name)
                                                    }}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`h-8 w-8 ${ct.is_active ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}`}
                                                    onClick={() => handleToggleActive(ct)}
                                                    disabled={saving}
                                                >
                                                    {ct.is_active ? <Trash2 className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {editingCardType && (
                            <div className="p-4 border rounded-xl bg-slate-50 space-y-4 animate-in slide-in-from-top-2 border-dashed">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary Lato">Edit {editingCardType.card_name}</h4>
                                    <Button variant="ghost" size="sm" className="h-6 w-6" onClick={() => setEditingCardType(null)}>×</Button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold Lato uppercase">Card Name</Label>
                                        <Input
                                            value={nameInput}
                                            onChange={(e) => setNameInput(e.target.value)}
                                            className="font-bold h-9 Lato"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold Lato uppercase">Tax Rate (%)</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={taxInput}
                                                onChange={(e) => setTaxInput(e.target.value)}
                                                className="pr-8 font-bold h-9 Lato"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-1">
                                    <Button onClick={handleUpdateCardType} disabled={saving} size="sm" className="w-full sm:w-auto Lato uppercase font-black text-[9px] tracking-widest px-6 h-9">
                                        {saving ? <BrandLoader size="xs" /> : <><Save className="mr-2 h-4 w-4" /> Update Channel</>}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="Lato font-black uppercase text-sm tracking-widest">Add New Channel</DialogTitle>
                        <DialogDescription className="Lato text-xs">Create a new card payment option.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold Lato uppercase">Channel Name</Label>
                            <Input
                                placeholder="e.g. PSO Card, Local Bank"
                                value={newCardName}
                                onChange={(e) => setNewCardName(e.target.value)}
                                className="Lato font-bold h-11"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold Lato uppercase">Tax Rate (%)</Label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={newCardTax}
                                    onChange={(e) => setNewCardTax(e.target.value)}
                                    className="pr-8 Lato font-bold h-11"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground Lato">%</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="Lato font-black uppercase text-[10px] tracking-widest" onClick={() => setAddCardDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddCardType} disabled={saving || !newCardName} className="Lato font-black uppercase text-[10px] tracking-widest px-6 h-11">
                            {saving ? <BrandLoader size="xs" /> : "Create Channel"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
