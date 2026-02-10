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
import { 
  Fuel, Building2, Wallet, CheckCircle, 
  ArrowLeft, ArrowRight, AlertCircle 
} from "lucide-react"
import { cn } from "@/lib/utils"

type Step = {
  id: number
  title: string
  description: string
  icon: React.ElementType
}

const steps: Step[] = [
  { id: 1, title: "Pump Information", description: "Basic petrol pump details", icon: Building2 },
  { id: 2, title: "Opening Balance", description: "Set initial cash & bank balance", icon: Wallet },
  { id: 3, title: "Complete Setup", description: "Review and finish", icon: CheckCircle },
]

export function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Pump Information
  const [pumpInfo, setPumpInfo] = useState({
    pumpName: "",
    address: "",
    contactNumber: "",
    ntnStrn: "",
    licenseNumber: "",
  })

  // Opening Balance
  const [openingBalance, setOpeningBalance] = useState({
    openingCash: "",
    openingBank: "",
  })

  const handlePumpInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPumpInfo((prev) => ({ ...prev, [name]: value }))
  }

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setOpeningBalance((prev) => ({ ...prev, [name]: value }))
  }

  const validateStep = () => {
    setError(null)
    
    if (currentStep === 1) {
      if (!pumpInfo.pumpName.trim()) {
        setError("Pump name is required")
        return false
      }
      if (!pumpInfo.address.trim()) {
        setError("Address is required")
        return false
      }
      if (!pumpInfo.contactNumber.trim()) {
        setError("Contact number is required")
        return false
      }
    }

    if (currentStep === 2) {
      const cash = parseFloat(openingBalance.openingCash) || 0
      const bank = parseFloat(openingBalance.openingBank) || 0
      if (cash < 0 || bank < 0) {
        setError("Balance values cannot be negative")
        return false
      }
    }

    return true
  }

  const handleNext = () => {
    if (!validateStep()) return
    setCurrentStep((prev) => Math.min(prev + 1, steps.length))
  }

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const handleComplete = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("Session expired. Please login again.")
        router.push("/login")
        return
      }

      // Save pump configuration
      const { error: pumpError } = await supabase.from("pump_config").insert({
        pump_name: pumpInfo.pumpName,
        address: pumpInfo.address,
        contact_number: pumpInfo.contactNumber,
        ntn_strn: pumpInfo.ntnStrn || null,
        license_number: pumpInfo.licenseNumber || null,
        setup_completed: true,
        setup_date: new Date().toISOString().split("T")[0],
      })

      if (pumpError) throw pumpError

      // Save opening balance
      const { error: balanceError } = await supabase.from("opening_balance").insert({
        opening_cash: parseFloat(openingBalance.openingCash) || 0,
        opening_bank: parseFloat(openingBalance.openingBank) || 0,
        balance_date: new Date().toISOString().split("T")[0],
      })

      if (balanceError) throw balanceError

      // Create default accounts
      const cashAmount = parseFloat(openingBalance.openingCash) || 0
      const bankAmount = parseFloat(openingBalance.openingBank) || 0

      const { error: accountsError } = await supabase.from("accounts").insert([
        {
          account_type: "cash",
          account_name: "Cash Account",
          current_balance: cashAmount,
        },
        {
          account_type: "bank",
          account_name: "Bank Account",
          current_balance: bankAmount,
        },
      ])

      if (accountsError) throw accountsError

      // Navigate to dashboard
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      console.error("Setup error:", err)
      setError("Failed to complete setup. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Fuel className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Setup Your Petrol Pump</h1>
          <p className="text-muted-foreground mt-2">Complete the initial configuration to get started</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                      currentStep === step.id
                        ? "bg-primary border-primary text-primary-foreground"
                        : currentStep > step.id
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-muted border-border text-muted-foreground"
                    )}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-2 text-center hidden sm:block",
                      currentStep === step.id
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-2",
                      currentStep > step.id ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card className="shadow-lg border-border/50">
          <CardHeader>
            <CardTitle>{steps[currentStep - 1].title}</CardTitle>
            <CardDescription>{steps[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Step 1: Pump Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pumpName">Pump Name *</Label>
                  <Input
                    id="pumpName"
                    name="pumpName"
                    placeholder="e.g., City Petrol Station"
                    value={pumpInfo.pumpName}
                    onChange={handlePumpInfoChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address *</Label>
                  <Input
                    id="address"
                    name="address"
                    placeholder="Full address of the pump"
                    value={pumpInfo.address}
                    onChange={handlePumpInfoChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactNumber">Contact Number *</Label>
                  <Input
                    id="contactNumber"
                    name="contactNumber"
                    placeholder="+92 300 1234567"
                    value={pumpInfo.contactNumber}
                    onChange={handlePumpInfoChange}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ntnStrn">NTN/STRN (Optional)</Label>
                    <Input
                      id="ntnStrn"
                      name="ntnStrn"
                      placeholder="Tax registration number"
                      value={pumpInfo.ntnStrn}
                      onChange={handlePumpInfoChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">License Number (Optional)</Label>
                    <Input
                      id="licenseNumber"
                      name="licenseNumber"
                      placeholder="Operating license number"
                      value={pumpInfo.licenseNumber}
                      onChange={handlePumpInfoChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Opening Balance */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                  <p>
                    Enter your current cash in hand and bank balance. 
                    This will be used as the starting point for all financial tracking.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="openingCash">Opening Cash Balance</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        Rs.
                      </span>
                      <Input
                        id="openingCash"
                        name="openingCash"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-10"
                        value={openingBalance.openingCash}
                        onChange={handleBalanceChange}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="openingBank">Opening Bank Balance</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        Rs.
                      </span>
                      <Input
                        id="openingBank"
                        name="openingBank"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-10"
                        value={openingBalance.openingBank}
                        onChange={handleBalanceChange}
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-foreground">Total Opening Balance</p>
                  <p className="text-2xl font-bold text-primary mt-1">
                    Rs. {((parseFloat(openingBalance.openingCash) || 0) + (parseFloat(openingBalance.openingBank) || 0)).toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Review & Complete */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Pump Information</h4>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <p><span className="font-medium text-foreground">Name:</span> {pumpInfo.pumpName}</p>
                      <p><span className="font-medium text-foreground">Address:</span> {pumpInfo.address}</p>
                      <p><span className="font-medium text-foreground">Contact:</span> {pumpInfo.contactNumber}</p>
                      {pumpInfo.ntnStrn && <p><span className="font-medium text-foreground">NTN/STRN:</span> {pumpInfo.ntnStrn}</p>}
                      {pumpInfo.licenseNumber && <p><span className="font-medium text-foreground">License:</span> {pumpInfo.licenseNumber}</p>}
                    </div>
                  </div>
                  <div className="border-t border-border pt-4">
                    <h4 className="text-sm font-medium text-foreground">Opening Balance</h4>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <p><span className="font-medium text-foreground">Cash:</span> Rs. {(parseFloat(openingBalance.openingCash) || 0).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</p>
                      <p><span className="font-medium text-foreground">Bank:</span> Rs. {(parseFloat(openingBalance.openingBank) || 0).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                  <p className="text-sm text-foreground">
                    Click {"Complete Setup"} to finish the configuration and start managing your petrol pump.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8 pt-6 border-t border-border">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1 || isLoading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              {currentStep < steps.length ? (
                <Button onClick={handleNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      Completing...
                    </span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Complete Setup
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
