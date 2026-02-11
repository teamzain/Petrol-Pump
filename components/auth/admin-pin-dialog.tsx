"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { Lock, Loader2 } from "lucide-react"

interface AdminPinDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
    title?: string
    description?: string
}

export function AdminPinDialog({
    open,
    onOpenChange,
    onSuccess,
    title = "Admin Authorization",
    description = "Enter Admin PIN to authorize this action."
}: AdminPinDialogProps) {
    const [pin, setPin] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            // Validate PIN against pump_config
            const { data, error } = await supabase
                .from("pump_config")
                .select("admin_pin")
                .limit(1)
                .single()

            if (error) throw error

            if (data?.admin_pin === pin) {
                setPin("")
                onSuccess()
                onOpenChange(false)
            } else {
                setError("Invalid PIN")
            }
        } catch (err) {
            console.error("PIN verification error:", err)
            setError("Verification failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-destructive" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="pin">Admin PIN</Label>
                        <Input
                            id="pin"
                            type="password"
                            placeholder="Enter PIN"
                            value={pin}
                            onChange={(e) => {
                                setPin(e.target.value)
                                setError("")
                            }}
                            autoFocus
                            maxLength={6}
                            className="text-center text-2xl tracking-widest"
                        />
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!pin || loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Authorize
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
