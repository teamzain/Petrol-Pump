"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { createClient } from "@/lib/supabase/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, AlertCircle, Save, Building2 } from "lucide-react"

export default function SettingsPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    const [config, setConfig] = useState({
        id: "",
        pump_name: "",
        address: "",
        contact_number: "",
        ntn_strn: "",
        license_number: "",
    })

    const supabase = createClient()

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true)
            const { data, error } = await supabase
                .from("pump_config")
                .select("*")
                .limit(1)
                .single()

            if (data) {
                setConfig({
                    id: data.id,
                    pump_name: data.pump_name || "",
                    address: data.address || "",
                    contact_number: data.contact_number || "",
                    ntn_strn: data.ntn_strn || "",
                    license_number: data.license_number || "",
                })
            } else if (!error) {
                // No config exists yet, we will create one on save
            } else if (error && error.code !== 'PGRST116') {
                // PGRST116 is "The result contains 0 rows" which is fine
                setError("Failed to load settings")
            }
            setLoading(false)
        }

        fetchConfig()
    }, [supabase])

    const handleSave = async () => {
        setSaving(true)
        setError("")
        setSuccess("")

        try {
            if (!config.pump_name || !config.address) {
                throw new Error("Pump Name and Address are required")
            }

            const user = await supabase.auth.getUser()
            if (!user.data.user) throw new Error("Not authenticated")

            let error

            if (config.id) {
                // Update existing
                const { error: updateError } = await supabase
                    .from("pump_config")
                    .update({
                        pump_name: config.pump_name,
                        address: config.address,
                        contact_number: config.contact_number,
                        ntn_strn: config.ntn_strn,
                        license_number: config.license_number,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", config.id)
                error = updateError
            } else {
                // Create new
                const { error: insertError } = await supabase
                    .from("pump_config")
                    .insert({
                        pump_name: config.pump_name,
                        address: config.address,
                        contact_number: config.contact_number,
                        ntn_strn: config.ntn_strn,
                        license_number: config.license_number,
                        setup_completed: true,
                        setup_date: new Date().toISOString(),
                    })
                error = insertError
            }

            if (error) throw error

            setSuccess("Settings saved successfully!")

            // Refresh to get ID if we just created it
            if (!config.id) {
                const { data } = await supabase.from("pump_config").select("id").limit(1).single()
                if (data) setConfig((prev) => ({ ...prev, id: data.id }))
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save settings")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your petrol pump configuration and details.
                </p>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            General Configuration
                        </CardTitle>
                        <CardDescription>
                            Basic information about your petrol pump station.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {success && (
                            <Alert className="border-primary bg-primary/5">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <AlertTitle>Success</AlertTitle>
                                <AlertDescription>{success}</AlertDescription>
                            </Alert>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="pump_name">Pump Name *</Label>
                                <Input
                                    id="pump_name"
                                    value={config.pump_name}
                                    onChange={(e) => setConfig({ ...config, pump_name: e.target.value })}
                                    placeholder="e.g. Al-Madina Petroleum"
                                    disabled={loading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="contact_number">Contact Number</Label>
                                <Input
                                    id="contact_number"
                                    value={config.contact_number}
                                    onChange={(e) => setConfig({ ...config, contact_number: e.target.value })}
                                    placeholder="e.g. 0300-1234567"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="address">Address *</Label>
                            <Input
                                id="address"
                                value={config.address}
                                onChange={(e) => setConfig({ ...config, address: e.target.value })}
                                placeholder="e.g. Main GT Road, Lahore"
                                disabled={loading}
                            />
                        </div>

                        <Separator className="my-2" />

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="ntn_strn">NTN / STRN</Label>
                                <Input
                                    id="ntn_strn"
                                    value={config.ntn_strn}
                                    onChange={(e) => setConfig({ ...config, ntn_strn: e.target.value })}
                                    placeholder="Tax Identification Number"
                                    disabled={loading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="license_number">License Number</Label>
                                <Input
                                    id="license_number"
                                    value={config.license_number}
                                    onChange={(e) => setConfig({ ...config, license_number: e.target.value })}
                                    placeholder="Petroleum License #"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button onClick={handleSave} disabled={loading || saving}>
                                <Save className="mr-2 h-4 w-4" />
                                {saving ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
