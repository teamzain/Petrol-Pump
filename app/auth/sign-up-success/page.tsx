import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Fuel, Mail, CheckCircle } from "lucide-react"
import Link from "next/link"

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Fuel className="w-8 h-8 text-primary" />
          </div>
        </div>

        <Card className="shadow-lg border-border/50">
          <CardHeader className="space-y-1 pb-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CheckCircle className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Account Created!</CardTitle>
            <CardDescription>
              Your admin account has been successfully created
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Check your email</p>
                <p className="text-muted-foreground mt-1">
                  We have sent you a confirmation email. Please click the link in the email to verify your account before signing in.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/login" className="block">
                <Button className="w-full">
                  Go to Sign In
                </Button>
              </Link>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              {"Didn't receive the email? Check your spam folder or contact support."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
