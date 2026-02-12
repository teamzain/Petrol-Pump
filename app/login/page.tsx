"use client"

import React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Fuel, Eye, EyeOff, Lock, User, AlertCircle } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const supabase = createClient()

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        if (signInError.message.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please try again.")
        } else if (signInError.message.includes("Email not confirmed")) {
          setError("Please confirm your email before logging in.")
        } else {
          setError(signInError.message)
        }
        return
      }

      if (data.user) {
        // Update last login
        await supabase
          .from("users")
          .update({
            last_login: new Date().toISOString(),
            failed_login_attempts: 0
          })
          .eq("id", data.user.id)

        // Check if setup is completed
        const { data: pumpConfig } = await supabase
          .from("pump_config")
          .select("setup_completed")
          .limit(1)

        if (!pumpConfig || pumpConfig.length === 0 || !pumpConfig[0]?.setup_completed) {
          router.push("/setup")
        } else {
          router.push("/dashboard")
        }
        router.refresh()
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-screen grid lg:grid-cols-2 bg-background overflow-hidden">
      {/* Left Column: Branding (Visible only on desktop) */}
      <div className="hidden lg:flex relative flex-col items-center justify-center p-12 overflow-hidden bg-slate-950">
        {/* Animated Background Gradients */}
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-chart-3/10 rounded-full blur-[100px] animate-pulse delay-700" />
        </div>

        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-1000">
          <div className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(251,206,7,0.3)] p-6 transition-transform hover:scale-105 duration-700">
            <img
              src="https://upload.wikimedia.org/wikipedia/en/e/e8/Shell_logo.svg"
              alt="Shell Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-white uppercase">United Filling Station</h1>
            <div className="h-1 w-24 bg-gradient-to-r from-[#fbce07] to-[#ee1c25] mx-auto rounded-full" />
          </div>
        </div>

        <div className="absolute bottom-12 z-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-500">
            Premium Station Management
          </p>
        </div>
      </div>

      {/* Right Column: Login Form */}
      <div className="flex items-center justify-center p-8 bg-background relative overflow-hidden">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          {/* Logo only on Mobile */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white mb-4 shadow-xl p-3 border border-slate-100 italic transition-transform active:scale-95 duration-300">
              <img
                src="https://upload.wikimedia.org/wikipedia/en/e/e8/Shell_logo.svg"
                alt="Shell Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-3xl font-black text-foreground tracking-tighter uppercase">United Filling Station</h1>
            <p className="text-muted-foreground mt-2 font-medium italic">Premium Station Management</p>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-3xl font-black tracking-tight text-foreground">Welcome Back</h2>
            <p className="text-muted-foreground font-medium">Access your station control panel</p>
          </div>

          <Card className="border-none shadow-2xl shadow-primary/5 bg-card/50 backdrop-blur-xl">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Login Credentials</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-5">
                {error && (
                  <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 animate-in zoom-in-95">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="font-semibold text-destructive">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address</Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@fuelstation.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 bg-background/50 border-border/50 focus:border-primary/50 transition-all font-medium"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</Label>
                    <a href="#" className="text-[10px] font-bold uppercase text-primary hover:underline">Forgot?</a>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 bg-background/50 border-border/50 focus:border-primary/50 transition-all font-medium"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      Authenticating...
                    </span>
                  ) : (
                    "Sign In to Dashboard"
                  )}
                </Button>
              </form>

              <div className="mt-8 pt-8 border-t border-border/50">
                <p className="text-sm text-center text-muted-foreground font-medium">
                  Need an operator account?{" "}
                  <a href="/auth/sign-up" className="text-primary hover:underline font-bold">
                    Register Admin
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-center gap-2 text-muted-foreground opacity-50 font-bold uppercase text-[10px] tracking-widest pt-4">
            Certified Secure Portal <Lock className="w-3 h-3" />
          </div>
        </div>
      </div>
    </div>
  )
}
