"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { format } from "date-fns"
import {
    CreditCard,
    Clock,
    CheckCircle2,
    Settings,
    ArrowRight,
    AlertCircle,
    Receipt,
    TrendingDown,
    Building2,
    Wallet,
    Save,
    Plus,
    Pencil,
    Trash2,
    Power
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
}

interface BankAccount {
    id: string
    account_name: string
    account_type: string
    current_balance: number
}

export default function CardsPage() {
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
                    bank_account_id: targetAccountId
                })
                .eq("id", selectedPayment.id)

            if (updateError) throw updateError

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

            // Record transaction
            const user = await supabase.auth.getUser()
            await supabase.from("transactions").insert({
                transaction_date: new Date().toISOString(),
                transaction_type: "income",
                category: "sale",
                description: `Card payment received: ${selectedPayment.card_types.card_name} (Net: Rs. ${selectedPayment.net_amount.toLocaleString()}, Tax: Rs. ${selectedPayment.tax_amount.toLocaleString()})`,
                amount: selectedPayment.net_amount,
                payment_method: "bank_transfer",
                to_account: targetAccountId,
                reference_type: "card_payments",
                reference_id: selectedPayment.id,
                created_by: user.data.user?.id,
                bank_account_id: targetAccountId
            })

            // Record Tax as Expense if any
            if (selectedPayment.tax_amount > 0) {
                await supabase.from("transactions").insert({
                    transaction_date: new Date().toISOString(),
                    transaction_type: "expense",
                    category: "operating_expense",
                    description: `Tax deducted on ${selectedPayment.card_types.card_name} payment`,
                    amount: selectedPayment.tax_amount,
                    payment_method: "cash", // Virtual deduction
                    reference_type: "card_payments",
                    reference_id: selectedPayment.id,
                    created_by: user.data.user?.id
                })
            }

            toast({ title: "Success", description: "Payment marked as received." })
            setReceiveDialogOpen(false)
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
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <BrandLoader size="lg" className="mb-4" />
                <p className="text-muted-foreground animate-pulse font-medium">Loading card management...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Card Payments</h1>
                    <p className="text-muted-foreground">Manage card hold status, taxes, and bank transfers.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setSettingsDialogOpen(true)}>
                        <Settings className="mr-2 h-4 w-4" /> Card Settings
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-yellow-50/50 border-yellow-200 shadow-sm transition-all hover:bg-yellow-50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-yellow-700">Total on Hold</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-700" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-yellow-700">
                            Rs. {holdPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                        </div>
                        <p className="text-[10px] text-yellow-600 font-bold mt-1 uppercase">
                            {holdPayments.length} Pending Payments
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-green-50/50 border-green-200 shadow-sm transition-all hover:bg-green-50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-green-700">Net Received (20)</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-700" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-green-700">
                            Rs. {receivedPayments.reduce((sum, p) => sum + p.net_amount, 0).toLocaleString()}
                        </div>
                        <p className="text-[10px] text-green-600 font-bold mt-1 uppercase">
                            After tax deduction
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50 border-slate-200 shadow-sm transition-all hover:bg-slate-100">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700">Total Tax Deducted</CardTitle>
                        <TrendingDown className="h-4 w-4 text-slate-700" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-slate-700">
                            Rs. {receivedPayments.reduce((sum, p) => sum + p.tax_amount, 0).toLocaleString()}
                        </div>
                        <p className="text-[10px] text-slate-600 font-bold mt-1 uppercase text-destructive italic">
                            Company Commissions
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="hold" className="w-full">
                <TabsList className="grid w-full md:w-[400px] grid-cols-2">
                    <TabsTrigger value="hold" className="font-bold flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Payments on Hold
                    </TabsTrigger>
                    <TabsTrigger value="received" className="font-bold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Received History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="hold" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Hold Payments (Daily Totals)</CardTitle>
                            <CardDescription>Click mark as received to transfer funds and deduct tax.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Card Type</TableHead>
                                            <TableHead className="text-right">Total Amount</TableHead>
                                            <TableHead className="text-right">Tax (Est.)</TableHead>
                                            <TableHead className="text-right">Net (Est.)</TableHead>
                                            <TableHead className="text-center">Status</TableHead>
                                            <TableHead className="text-right px-6">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {holdPayments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground h-32">
                                                    No payments currently on hold
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            holdPayments.map(p => (
                                                <TableRow key={p.id}>
                                                    <TableCell className="font-medium">{format(new Date(p.payment_date), "dd MMM yyyy")}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="flex w-fit items-center gap-1 border-slate-300">
                                                            {p.card_types.card_name.includes("Shell") ? (
                                                                <img src="https://www.shell.com.pk/etc.clientlibs/shell/clientlibs/clientlib-site/resources/resources/favicons/favicon-32x32.png" alt="S" className="h-3 w-3" />
                                                            ) : <CreditCard className="h-3 w-3" />}
                                                            {p.card_types.card_name}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold font-mono">Rs. {p.amount.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right text-destructive font-medium font-mono text-xs">
                                                        -Rs. {p.tax_amount.toLocaleString()} ({p.tax_percentage}%)
                                                    </TableCell>
                                                    <TableCell className="text-right font-black text-primary font-mono">Rs. {p.net_amount.toLocaleString()}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 uppercase text-[10px] font-bold">On Hold</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right px-6">
                                                        <Button size="sm" onClick={() => {
                                                            setSelectedPayment(p)
                                                            setReceiveDialogOpen(true)
                                                        }}>
                                                            Mark Received
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="received" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Received Payments</CardTitle>
                            <CardDescription>Successfully settled and transferred payments.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 sm:p-6">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Received Date</TableHead>
                                            <TableHead>Original Date</TableHead>
                                            <TableHead>Card Type</TableHead>
                                            <TableHead className="text-right">Original</TableHead>
                                            <TableHead className="text-right">Tax Paid</TableHead>
                                            <TableHead className="text-right">Net Amount</TableHead>
                                            <TableHead>Account</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {receivedPayments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground h-32">
                                                    No received payments yet
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            receivedPayments.map(p => (
                                                <TableRow key={p.id}>
                                                    <TableCell className="font-medium">{p.received_at ? format(new Date(p.received_at), "dd MMM HH:mm") : "-"}</TableCell>
                                                    <TableCell className="text-muted-foreground">{format(new Date(p.payment_date), "dd MMM yyyy")}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="flex w-fit items-center gap-1">
                                                            {p.card_types.card_name}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-muted-foreground">Rs. {p.amount.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right text-destructive font-mono text-xs">Rs. {p.tax_amount.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right font-black text-green-600 font-mono">Rs. {p.net_amount.toLocaleString()}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
                                                            <Building2 className="h-3 w-3" />
                                                            {bankAccounts.find(ba => ba.id === p.bank_account_id)?.account_name || "Account"}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Receive Dialog */}
            <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Mark as Received</DialogTitle>
                        <DialogDescription>
                            Confirm funds arrival and distribute to your account.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedPayment && (
                        <div className="py-6 space-y-6">
                            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                                <div className="flex justify-between items-center border-b border-primary/10 pb-2">
                                    <span className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Original Amount</span>
                                    <span className="font-mono font-bold">Rs. {selectedPayment.amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-destructive">
                                    <span className="text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                                        <TrendingDown className="h-3 w-3" /> {selectedPayment.card_types.card_name} Tax ({selectedPayment.tax_percentage}%)
                                    </span>
                                    <span className="font-mono font-bold">-Rs. {selectedPayment.tax_amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-primary/20">
                                    <span className="text-sm font-black uppercase text-primary tracking-widest">NET TRANSFER</span>
                                    <span className="text-xl font-black text-primary">Rs. {selectedPayment.net_amount.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="space-y-3 px-1">
                                <Label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                    <Wallet className="h-4 w-4 text-primary" /> Destination Account
                                </Label>
                                <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                                    <SelectTrigger className="h-12 text-lg font-bold border-2">
                                        <SelectValue placeholder="Select Account..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {bankAccounts.map(ba => (
                                            <SelectItem key={ba.id} value={ba.id} className="py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{ba.account_name}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Current Bal: Rs. {ba.current_balance.toLocaleString()}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground italic px-1 font-medium">
                                    Select where you want to transfer Rs. {selectedPayment.net_amount.toLocaleString()}
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
                        <Button
                            className="min-w-[120px] bg-primary h-11 text-lg font-bold"
                            onClick={handleReceive}
                            disabled={saving || !targetAccountId}
                        >
                            {saving ? <BrandLoader size="xs" /> : "Confirm & Transfer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Settings Dialog */}
            <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle>Card Type Settings</DialogTitle>
                                <DialogDescription>Configure tax percentages for each card type.</DialogDescription>
                            </div>
                            <Button size="sm" onClick={() => setAddCardDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Add Card Type
                            </Button>
                        </div>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Card Name</TableHead>
                                    <TableHead className="text-right">Tax %</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cardTypes.map(ct => (
                                    <TableRow key={ct.id}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold">{ct.card_name}</span>
                                                <Badge variant={ct.is_active ? "default" : "secondary"} className={`w-fit text-[10px] h-4 ${ct.is_active ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-100'}`}>
                                                    {ct.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-primary">{ct.tax_percentage}%</TableCell>
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
                            <div className="p-4 border-2 rounded-xl bg-slate-50 space-y-4 animate-in slide-in-from-top-2">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Edit {editingCardType.card_name} Tax</h4>
                                    <Button variant="ghost" size="sm" onClick={() => setEditingCardType(null)}>×</Button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Card Name</Label>
                                        <Input
                                            value={nameInput}
                                            onChange={(e) => setNameInput(e.target.value)}
                                            className="font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tax Percentage (%)</Label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Input
                                                    type="number"
                                                    value={taxInput}
                                                    onChange={(e) => setTaxInput(e.target.value)}
                                                    className="pr-8 font-bold"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <Button onClick={handleUpdateCardType} disabled={saving} className="w-full sm:w-auto">
                                        {saving ? <BrandLoader size="xs" /> : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Card Type Dialog */}
            <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Card Type</DialogTitle>
                        <DialogDescription>Create a new card payment option.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Card Name</Label>
                            <Input
                                placeholder="e.g. PSO Card, Local Bank"
                                value={newCardName}
                                onChange={(e) => setNewCardName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tax Percentage (%)</Label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={newCardTax}
                                    onChange={(e) => setNewCardTax(e.target.value)}
                                    className="pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">%</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic">
                                This percentage will be deducted automatically when marking as received.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddCardDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddCardType} disabled={saving || !newCardName}>
                            {saving ? <BrandLoader size="xs" /> : "Create Card Type"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
