"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Moon, Sun, Laptop, User, Shield, Info, Check, Loader2, Landmark, Plus, Edit2, Trash2, Power } from "lucide-react"

interface BankAccount {
    id: string
    account_name: string
    account_number: string | null
    opening_balance: number
    current_balance: number
    status: 'active' | 'inactive'
}

export default function SettingsPage() {
    const { setTheme, theme } = useTheme()
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Profile State
    const [profile, setProfile] = useState({
        id: '',
        fullName: '',
        email: '',
        phone: ''
    })

    // System Settings State
    const [systemConfig, setSystemConfig] = useState({
        id: '',
        adminPin: ''
    })

    // Password State
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    })

    useEffect(() => {
        fetchProfile()
        fetchSystemConfig()
        fetchBankAccounts()
    }, [])

    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
    const [bankFormData, setBankFormData] = useState({
        id: '',
        account_name: '',
        account_number: '',
        opening_balance: '',
        status: 'active' as 'active' | 'inactive'
    })
    const [isBankDialogOpen, setIsBankDialogOpen] = useState(false)
    const [isEditingBank, setIsEditingBank] = useState(false)

    const fetchBankAccounts = async () => {
        const { data } = await supabase
            .from('accounts')
            .select('*')
            .eq('account_type', 'bank')
            .order('account_name')
        if (data) setBankAccounts(data)
    }

    const handleBankSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        try {
            const payload = {
                account_name: bankFormData.account_name,
                account_number: bankFormData.account_number,
                opening_balance: parseFloat(bankFormData.opening_balance) || 0,
                account_type: 'bank',
                status: bankFormData.status
            }

            if (isEditingBank) {
                const { error } = await supabase
                    .from('accounts')
                    .update(payload)
                    .eq('id', bankFormData.id)
                if (error) throw error
                setMessage({ type: 'success', text: 'Bank account updated!' })
            } else {
                // For new accounts, current_balance = opening_balance
                const { error } = await supabase
                    .from('accounts')
                    .insert({ ...payload, current_balance: payload.opening_balance })
                if (error) throw error
                setMessage({ type: 'success', text: 'Bank account added!' })
            }

            setIsBankDialogOpen(false)
            fetchBankAccounts()
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to save bank account' })
        } finally {
            setLoading(false)
        }
    }

    const fetchSystemConfig = async () => {
        try {
            const { data, error } = await supabase
                .from('pump_config')
                .select('id, admin_pin')
                .limit(1)
                .maybeSingle()

            if (data) {
                setSystemConfig({
                    id: data.id,
                    adminPin: data.admin_pin || ''
                })
            }
        } catch (error) {
            console.error('Error loading system config:', error)
        }
    }

    const fetchProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                // Get extra details from public.users table if exists, or metadata
                const { data: userDetails } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single()

                setProfile({
                    id: user.id,
                    fullName: userDetails?.full_name || user.user_metadata?.full_name || '',
                    email: user.email || '',
                    phone: userDetails?.mobile || user.user_metadata?.mobile || ''
                })
            }
        } catch (error) {
            console.error('Error loading profile:', error)
        }
    }

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        try {
            // 1. Update Supabase Auth Metadata
            const { error: authError } = await supabase.auth.updateUser({
                data: { full_name: profile.fullName, mobile: profile.phone }
            })
            if (authError) throw authError

            // 2. Update public.users table
            const { error: dbError } = await supabase
                .from('users')
                .update({
                    full_name: profile.fullName,
                    mobile: profile.phone,
                    updated_at: new Date().toISOString()
                })
                .eq('id', profile.id)

            if (dbError) throw dbError

            setMessage({ type: 'success', text: 'Profile updated successfully!' })
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to update profile' })
        } finally {
            setLoading(false)
        }
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        if (passwords.new !== passwords.confirm) {
            setMessage({ type: 'error', text: 'New passwords do not match' })
            return
        }

        setLoading(true)
        setMessage(null)

        try {
            const { error } = await supabase.auth.updateUser({
                password: passwords.new
            })

            if (error) throw error

            setMessage({ type: 'success', text: 'Password updated successfully!' })
            setPasswords({ current: '', new: '', confirm: '' })
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to update password' })
        } finally {
            setLoading(false)
        }
    }

    const handlePinUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!systemConfig.adminPin || systemConfig.adminPin.length < 4) {
            setMessage({ type: 'error', text: 'PIN must be at least 4 digits' })
            return
        }

        setLoading(true)
        setMessage(null)

        try {
            const { error } = await supabase
                .from('pump_config')
                .update({
                    admin_pin: systemConfig.adminPin,
                    updated_at: new Date().toISOString()
                })
                .eq('id', systemConfig.id)

            if (error) throw error

            setMessage({ type: 'success', text: 'Admin PIN updated successfully!' })
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Failed to update PIN' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="container max-w-4xl py-6 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">Manage your account settings and preferences.</p>
            </div>

            <Tabs defaultValue="appearance" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="appearance" className="flex items-center gap-2">
                        <Sun className="w-4 h-4" /> Appearance
                    </TabsTrigger>
                    <TabsTrigger value="profile" className="flex items-center gap-2">
                        <User className="w-4 h-4" /> Profile
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center gap-2">
                        <Shield className="w-4 h-4" /> Security
                    </TabsTrigger>
                    <TabsTrigger value="system" className="flex items-center gap-2">
                        <Shield className="w-4 h-4" /> System
                    </TabsTrigger>
                    <TabsTrigger value="banks" className="flex items-center gap-2">
                        <Landmark className="w-4 h-4" /> Banks
                    </TabsTrigger>
                    <TabsTrigger value="about" className="flex items-center gap-2">
                        <Info className="w-4 h-4" /> About
                    </TabsTrigger>
                </TabsList>

                {message && (
                    <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className={message.type === 'success' ? 'border-green-500 text-green-700 bg-green-50' : ''}>
                        {message.type === 'success' ? <Check className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                        <AlertTitle>{message.type === 'success' ? 'Success' : 'Error'}</AlertTitle>
                        <AlertDescription>{message.text}</AlertDescription>
                    </Alert>
                )}

                {/* Appearance Tab */}
                <TabsContent value="appearance">
                    <Card>
                        <CardHeader>
                            <CardTitle>Theme Preferences</CardTitle>
                            <CardDescription>
                                Customize how the application looks on your device.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 pt-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground ${theme === 'light' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("light")}
                                >
                                    <div className="mb-2 rounded-md bg-[#ecedef] p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Sun className="w-4 h-4" /> Light
                                    </div>
                                </div>
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground ${theme === 'dark' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("dark")}
                                >
                                    <div className="mb-2 rounded-md bg-slate-950 p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Moon className="w-4 h-4" /> Dark
                                    </div>
                                </div>
                                <div
                                    className={`cursor-pointer rounded-lg border-2 p-4 hover:bg-accent hover:text-accent-foreground ${theme === 'system' ? 'border-primary bg-accent' : 'border-muted'}`}
                                    onClick={() => setTheme("system")}
                                >
                                    <div className="mb-2 rounded-md bg-gradient-to-r from-[#ecedef] to-slate-950 p-2 h-20 w-full" />
                                    <div className="flex items-center gap-2 font-medium">
                                        <Laptop className="w-4 h-4" /> System
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Profile Tab */}
                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>Profile Information</CardTitle>
                            <CardDescription>
                                Update your personal details.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleProfileUpdate}>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="fullName">Full Name</Label>
                                    <Input
                                        id="fullName"
                                        value={profile.fullName}
                                        onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        value={profile.email}
                                        disabled
                                        className="bg-muted"
                                    />
                                    <p className="text-xs text-muted-foreground">Email cannot be changed directly.</p>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        value={profile.phone}
                                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" disabled={loading}>
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Changes
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>

                {/* Security Tab */}
                <TabsContent value="security">
                    <Card>
                        <CardHeader>
                            <CardTitle>Change Password</CardTitle>
                            <CardDescription>
                                Ensure your account is using a strong password.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handlePasswordChange}>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="new-password">New Password</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        value={passwords.new}
                                        onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="confirm-password">Confirm Password</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        value={passwords.confirm}
                                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                    />
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" disabled={loading || !passwords.new}>
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Update Password
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </TabsContent>

                {/* Banks Tab */}
                <TabsContent value="banks" className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="space-y-1">
                            <h3 className="text-lg font-medium">Bank Accounts</h3>
                            <p className="text-sm text-muted-foreground">Manage your payment methods and balances.</p>
                        </div>
                        <Button onClick={() => {
                            setBankFormData({ id: '', account_name: '', account_number: '', opening_balance: '', status: 'active' })
                            setIsEditingBank(false)
                            setIsBankDialogOpen(true)
                        }}>
                            <Plus className="w-4 h-4 mr-2" /> Add Bank
                        </Button>
                    </div>

                    <div className="grid gap-4">
                        {bankAccounts.map(bank => (
                            <Card key={bank.id} className={`overflow-hidden transition-all hover:shadow-md border-2 ${bank.status === 'inactive' ? 'opacity-50 grayscale' : 'hover:border-primary/50'}`}>
                                <div className={`h-1.5 w-full ${bank.status === 'inactive' ? 'bg-muted' : 'bg-gradient-to-r from-primary/80 to-primary'}`} />
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-2xl bg-primary/5 border border-primary/10 shadow-inner">
                                            <Landmark className="w-6 h-6 text-primary" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg font-bold tracking-tight">{bank.account_name}</CardTitle>
                                            <CardDescription className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70 flex items-center gap-2 mt-0.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                                {bank.account_number || 'No Account Number'}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right px-4 py-2 rounded-xl bg-secondary/30 border border-secondary/50 backdrop-blur-sm">
                                            <div className="text-[9px] text-muted-foreground uppercase font-black tracking-tighter mb-0.5">Current Balance</div>
                                            <div className="text-lg font-black text-primary tracking-tight">
                                                <span className="text-xs mr-0.5 opacity-60">Rs.</span>
                                                {bank.current_balance.toLocaleString()}
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-primary/5 hover:text-primary transition-colors" onClick={() => {
                                            setBankFormData({
                                                id: bank.id,
                                                account_name: bank.account_name,
                                                account_number: bank.account_number || '',
                                                opening_balance: bank.opening_balance.toString(),
                                                status: bank.status
                                            })
                                            setIsEditingBank(true)
                                            setIsBankDialogOpen(true)
                                        }}>
                                            <Edit2 className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </CardHeader>
                            </Card>
                        ))}

                        {bankAccounts.length === 0 && (
                            <div className="text-center py-12 border-2 border-dashed rounded-xl">
                                <Landmark className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                                <p className="text-muted-foreground font-medium">No bank accounts configured yet.</p>
                                <Button variant="link" onClick={() => setIsBankDialogOpen(true)}>Add your first bank account</Button>
                            </div>
                        )}
                    </div>

                    {/* Bank Dialog */}
                    <Dialog open={isBankDialogOpen} onOpenChange={setIsBankDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{isEditingBank ? 'Edit Bank Account' : 'Add New Bank Account'}</DialogTitle>
                                <DialogDescription>
                                    Provide details for your bank account. Opening balance sets the starting point.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleBankSubmit}>
                                <div className="grid gap-6 py-6">
                                    <div className="grid gap-2">
                                        <Label htmlFor="bank-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Bank Name / Display Name</Label>
                                        <Input
                                            id="bank-name"
                                            required
                                            value={bankFormData.account_name}
                                            onChange={(e) => setBankFormData({ ...bankFormData, account_name: e.target.value })}
                                            placeholder="e.g. Meezan Bank Main"
                                            className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 bg-background/50"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="bank-account" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Account Number (Optional)</Label>
                                        <Input
                                            id="bank-account"
                                            value={bankFormData.account_number}
                                            onChange={(e) => setBankFormData({ ...bankFormData, account_number: e.target.value })}
                                            placeholder="XXXX-XXXX-XXXX"
                                            className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 font-mono bg-background/50"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="bank-opening" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Opening Balance (Rs)</Label>
                                        <div className="relative">
                                            <Input
                                                id="bank-opening"
                                                type="number"
                                                required
                                                disabled={isEditingBank}
                                                value={bankFormData.opening_balance}
                                                onChange={(e) => setBankFormData({ ...bankFormData, opening_balance: e.target.value })}
                                                placeholder="0.00"
                                                className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 font-bold text-lg bg-background/50 pl-10"
                                            />
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">Rs</span>
                                        </div>
                                        {isEditingBank && <p className="text-[10px] text-muted-foreground italic ml-1 opacity-70">Opening balance cannot be changed after creation.</p>}
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Account Status</Label>
                                        <div className="flex p-1.5 bg-secondary/50 backdrop-blur-sm rounded-2xl gap-1.5 border-2 border-secondary">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className={`flex-1 rounded-xl h-10 transition-all duration-300 ${bankFormData.status === 'active' ? 'bg-background shadow-md text-primary font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                                                onClick={() => setBankFormData({ ...bankFormData, status: 'active' })}
                                            >
                                                Active
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className={`flex-1 rounded-xl h-10 transition-all duration-300 ${bankFormData.status === 'inactive' ? 'bg-background shadow-md text-destructive font-bold' : 'text-muted-foreground hover:text-foreground'}`}
                                                onClick={() => setBankFormData({ ...bankFormData, status: 'inactive' })}
                                            >
                                                Inactive
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter className="pt-2">
                                    <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                                        {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                                        {isEditingBank ? 'Update Bank Account' : 'Register Bank Account'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* About Tab */}
                <TabsContent value="about">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Information</CardTitle>
                            <CardDescription>
                                Details about the current application version.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="font-medium">App Name</p>
                                    <p className="text-muted-foreground">Petrol Pump Manager</p>
                                </div>
                                <div>
                                    <p className="font-medium">Version</p>
                                    <p className="text-muted-foreground">v1.2.0 (Beta)</p>
                                </div>
                                <div>
                                    <p className="font-medium">Environment</p>
                                    <p className="text-muted-foreground">Production</p>
                                </div>
                                <div>
                                    <p className="font-medium">License</p>
                                    <p className="text-muted-foreground">Pro License</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
