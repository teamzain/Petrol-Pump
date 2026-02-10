import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Fuel, AlertTriangle, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function AuthErrorPage() {
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
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-xl">Authentication Error</CardTitle>
            <CardDescription>
              Something went wrong during authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground text-center">
              <p>
                There was an error during the authentication process. 
                This could be due to an expired link, invalid credentials, 
                or a temporary issue.
              </p>
            </div>

            <div className="space-y-3">
              <Link href="/login" className="block">
                <Button className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>
              </Link>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              If the problem persists, please contact your system administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
