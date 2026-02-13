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
import { BrandLoader as Loader } from "@/components/ui/brand-loader"

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
        // Double Check: Verify user exists in the public.users table
        const { data: dbUser, error: dbError } = await supabase
          .from("users")
          .select("id")
          .eq("id", data.user.id)
          .single()

        if (!dbUser || dbError) {
          // If the user exists in Auth but not in our database (e.g. after a truncate)
          // We must sign them out immediately and show an error
          await supabase.auth.signOut()
          setError("Access Denied: Your account record was not found in the database. Please contact your administrator.")
          setIsLoading(false)
          return
        }

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
    <div className="min-h-screen grid lg:grid-cols-5 bg-white font-sans">
      {/* Left Columns (3/5): Branding & Station Preview (Desktop Only) */}
      <div className="hidden lg:flex lg:col-span-3 relative flex-col items-center justify-center p-20 overflow-hidden border-r border-slate-100 shadow-[10px_0_40px_rgba(0,0,0,0.02)] min-h-screen">
        {/* Deep Light Animated Background */}
        <div className="absolute inset-0 bg-slate-50">
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-primary/5 rounded-full blur-[140px] animate-pulse opacity-80" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-[#fbce07]/5 rounded-full blur-[120px] animate-pulse delay-1000 opacity-80" />
        </div>

        {/* Dynamic Light Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />

        <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-2xl animate-in fade-in zoom-in-95 duration-1000">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/10 rounded-[40px] blur-3xl group-hover:bg-primary/20 transition-all duration-700" />
              <div className="relative w-40 h-40 bg-white rounded-[40px] flex items-center justify-center shadow-xl p-8 border border-slate-100 transition-all group-hover:scale-105 duration-700">
                <img
                  src="https://upload.wikimedia.org/wikipedia/en/e/e8/Shell_logo.svg"
                  alt="Shell Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-6xl font-[900] tracking-[-0.04em] text-slate-900 uppercase leading-none italic">
                United <span className="text-primary italic">Filling</span> Station
              </h1>
              <div className="flex items-center justify-center gap-4">
                <div className="h-[2px] w-12 bg-gradient-to-r from-transparent to-primary/30" />
                <span className="text-sm font-black uppercase tracking-[0.5em] text-slate-400">Premium Quality Fuel</span>
                <div className="h-[2px] w-12 bg-gradient-to-l from-transparent to-primary/30" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 w-full mt-8">
            <div className="p-6 rounded-3xl bg-white/80 backdrop-blur-md border border-slate-200 shadow-sm space-y-2">
              <div className="text-primary font-black text-xs uppercase tracking-widest">Real-time Stats</div>
              <div className="text-2xl font-bold text-slate-900">Station Control</div>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="w-2/3 h-full bg-primary" />
              </div>
            </div>
            <div className="p-6 rounded-3xl bg-white/80 backdrop-blur-md border border-slate-200 shadow-sm space-y-2">
              <div className="text-primary font-black text-xs uppercase tracking-widest">System Status</div>
              <div className="text-2xl font-bold text-slate-900">Operational</div>
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-1 w-full bg-primary rounded-full animate-pulse opacity-40 shadow-[0_0_8px_rgba(251,206,7,0.5)]" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-12 z-10 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400">
            Enterprise Management System v2.0
          </p>
        </div>
      </div>

      {/* Right Columns (2/5): Login Form */}
      <div className="lg:col-span-2 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-white relative group/form">
        <div className="w-full max-w-md space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 py-8">
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

          <div className="space-y-3 text-center lg:text-left">
            <div className="lg:hidden animate-bounce inline-block">
              <Fuel className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-[900] tracking-tighter text-slate-900 uppercase leading-tight italic">Administrator <span className="text-primary italic">Login</span></h2>
            <p className="text-slate-500 font-medium tracking-wide italic">Secure console access for station administrators.</p>
          </div>

          <Card className="border border-slate-200 shadow-2xl shadow-slate-200/50 bg-white/70 backdrop-blur-xl px-2">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Login Credentials</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-5">
                {error && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/30 border-2 animate-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="font-black uppercase tracking-widest text-[10px] text-destructive">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address</Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@unitedfilling.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-14 bg-slate-50 border-slate-200 focus:border-primary/50 text-slate-900 transition-all font-bold placeholder:text-slate-300"
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
                      className="pl-10 pr-10 h-14 bg-slate-50 border-slate-200 focus:border-primary/50 text-slate-900 transition-all font-bold placeholder:text-slate-300"
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
                  className="w-full h-14 text-sm font-[900] uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1 active:scale-95 duration-300"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader size="xs" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign In"
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
