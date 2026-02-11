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
import { Moon, Sun, Laptop, User, Shield, Info, Check, Loader2 } from "lucide-react"

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
    }, [])

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

                {/* System Tab */}
                <TabsContent value="system">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Configuration</CardTitle>
                            <CardDescription>
                                Manage system-wide settings and authorization codes.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handlePinUpdate}>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="admin-pin">Admin Unlock PIN</Label>
                                    <Input
                                        id="admin-pin"
                                        type="text"
                                        maxLength={6}
                                        value={systemConfig.adminPin}
                                        onChange={(e) => setSystemConfig({ ...systemConfig, adminPin: e.target.value.replace(/\D/g, '') })}
                                        placeholder="Enter numeric PIN"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        This PIN is used to unlock nozzle readings in the Sales page.
                                    </p>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" disabled={loading || !systemConfig.adminPin}>
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Update PIN
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
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
