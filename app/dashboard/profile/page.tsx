"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    CheckCircle2, AlertCircle, User, Shield, Lock, Save
} from "lucide-react"
import { BrandLoader as Loader } from "@/components/ui/brand-loader"

export default function ProfilePage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    const [profile, setProfile] = useState({
        id: "",
        full_name: "",
        email: "",
        mobile: "",
        role: "",
    })

    // Separate state checks to avoid infinite loops if we depend on `profile` in effects improperly
    const supabase = createClient()

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                const { data } = await supabase
                    .from("users")
                    .select("*")
                    .eq("id", user.id)
                    .single()

                if (data) {
                    setProfile({
                        id: data.id,
                        full_name: data.full_name || "",
                        email: data.email || user.email || "",
                        mobile: data.mobile || "",
                        role: data.role || "staff",
                    })
                }
            }
            setLoading(false)
        }

        fetchProfile()
    }, [supabase])

    const handleUpdateProfile = async () => {
        setSaving(true)
        setMessage(null)

        try {
            const { error } = await supabase
                .from("users")
                .update({
                    full_name: profile.full_name,
                    mobile: profile.mobile,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", profile.id)

            if (error) throw error

            setMessage({ type: 'success', text: "Profile updated successfully!" })
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : "Failed to update profile" })
        } finally {
            setSaving(false)
        }
    }

    const handlePasswordReset = async () => {
        setSaving(true)
        setMessage(null)

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
                redirectTo: `${window.location.origin}/auth/update-password`,
            })

            if (error) throw error

            setMessage({ type: 'success', text: "Password reset email sent!" })
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : "Failed to send reset email" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
                <p className="text-muted-foreground">
                    Manage your personal information and account security.
                </p>
            </div>

            <div className="grid gap-6 max-w-2xl">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Personal Information
                        </CardTitle>
                        <CardDescription>
                            Update your contact details and display name.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {message && (
                            <Alert variant={message.type === 'error' ? "destructive" : "default"} className={message.type === 'success' ? "border-primary bg-primary/5" : ""}>
                                {message.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
                                <AlertTitle>{message.type === 'error' ? "Error" : "Success"}</AlertTitle>
                                <AlertDescription>{message.text}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                value={profile.email}
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-xs text-muted-foreground">Email cannot be changed directly.</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                <span className="capitalize font-medium">{profile.role}</span>
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <Label htmlFor="full_name">Full Name</Label>
                            <Input
                                id="full_name"
                                value={profile.full_name}
                                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="mobile">Mobile Number</Label>
                            <Input
                                id="mobile"
                                value={profile.mobile}
                                onChange={(e) => setProfile({ ...profile, mobile: e.target.value })}
                                placeholder="0300-1234567"
                                disabled={loading}
                            />
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button onClick={handleUpdateProfile} disabled={loading}>
                                {loading ? <Loader size="xs" /> : "Update Profile"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5" />
                            Security
                        </CardTitle>
                        <CardDescription>
                            Manage your password and authentication.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" onClick={handlePasswordReset} disabled={loading || saving}>
                            Send Password Reset Email
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
