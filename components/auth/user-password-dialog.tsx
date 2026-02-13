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
import { Lock, KeyRound } from "lucide-react"
import { BrandLoader } from "../ui/brand-loader"

interface UserPasswordDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
    title?: string
    description?: string
}

export function UserPasswordDialog({
    open,
    onOpenChange,
    onSuccess,
    title = "Confirm Password",
    description = "Please enter your account password to unlock this action."
}: UserPasswordDialogProps) {
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            // Get current user email
            const { data: { user } } = await supabase.auth.getUser()
            if (!user?.email) throw new Error("User not found")

            // Verify password by attempting to sign in (this doesn't change actual session if already logged in)
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: password,
            })

            if (authError) {
                setError("Incorrect password")
                return
            }

            setPassword("")
            onSuccess()
            onOpenChange(false)
        } catch (err) {
            console.error("Password verification error:", err)
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
                        <KeyRound className="h-5 w-5 text-primary" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">Your Password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value)
                                setError("")
                            }}
                            autoFocus
                            className="text-lg"
                        />
                        {error && <p className="text-sm text-destructive font-medium">{error}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!password || loading}>
                            {loading && <BrandLoader size="xs" className="mr-2" />}
                            Unlock Now
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
