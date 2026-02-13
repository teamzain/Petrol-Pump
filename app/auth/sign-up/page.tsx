"use client"

import React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Fuel, Eye, EyeOff, Lock, User, Mail, Phone, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react"
import { BrandLoader as Loader } from "@/components/ui/brand-loader"
import Link from "next/link"

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLocked, setIsLocked] = useState<boolean | null>(null)
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match")
      return false
    }
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long")
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError("Please enter a valid email address")
      return false
    }
    if (formData.mobile && !/^\+?[\d\s-]{10,}$/.test(formData.mobile)) {
      setError("Please enter a valid mobile number")
      return false
    }
    return true
  }

  useEffect(() => {
    const checkLock = async () => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from("users")
        .select("*", { count: 'exact', head: true })

      if (!error && count && count > 0) {
        setIsLocked(true)
      } else {
        setIsLocked(false)
      }
    }
    checkLock()
  }, [])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isLocked) {
      setError("Registration is locked. Only one administrator is allowed.")
      return
    }

    if (!validateForm()) return

    setIsLoading(true)

    try {
      const supabase = createClient()

      // Double check before submission
      const { count } = await supabase
        .from("users")
        .select("*", { count: 'exact', head: true })

      if (count && count > 0) {
        setIsLocked(true)
        setError("A user account already exists. This system is restricted to a single user.")
        setIsLoading(false)
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/dashboard`,
          data: {
            full_name: formData.fullName,
            username: formData.username,
            mobile: formData.mobile,
            role: "admin",
          },
        },
      })

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          setError("This email is already registered. Please sign in instead.")
        } else {
          setError(signUpError.message)
        }
        return
      }

      if (data.user) {
        router.push("/auth/sign-up-success")
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLocked === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Loader size="lg" />
      </div>
    )
  }

  if (isLocked === true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4 font-sans">
        <div className="w-full max-w-md text-center space-y-8 animate-in fade-in zoom-in duration-700">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-destructive/5 border border-destructive/10 mb-4 shadow-[0_0_50px_rgba(239,68,68,0.05)]">
            <Lock className="w-10 h-10 text-destructive" />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic leading-tight">System <span className="text-destructive uppercase">Locked</span></h1>
            <p className="text-slate-500 font-medium">This station management system is already configured with an administrator account.</p>
          </div>
          <Alert variant="destructive" className="bg-destructive/[0.02] border-destructive/10 shadow-sm">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-bold uppercase tracking-widest text-[10px] text-destructive">Access to registration has been permanently restricted for security.</AlertDescription>
          </Alert>
          <div className="pt-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 h-14 w-full bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-black uppercase tracking-widest hover:bg-slate-100 shadow-sm transition-all active:scale-95"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="w-full max-w-md py-8">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tighter uppercase italic">Create <span className="text-primary uppercase italic">Admin</span> Account</h1>
          <p className="text-slate-500 font-medium tracking-wide italic mt-2">Set up your premium station management system</p>
        </div>

        <Card className="shadow-2xl shadow-slate-200/50 border-slate-200 bg-white/80 backdrop-blur-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Admin Registration</CardTitle>
            <CardDescription className="text-center">
              Create the first admin account to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="johndoe"
                    value={formData.username}
                    onChange={handleChange}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="mobile"
                    name="mobile"
                    type="tel"
                    placeholder="+1234567890"
                    value={formData.mobile}
                    onChange={handleChange}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-10 pr-10"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="pl-10 pr-10"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? <Loader size="xs" /> : "Create Admin Account"}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
