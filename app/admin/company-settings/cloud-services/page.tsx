"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CloudOff, Check, RefreshCw } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useCloudServices } from "@/hooks/useCloudServices"

export default function CloudServicesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { services, loading, error, addService, refresh } = useCloudServices()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [connectionDetails, setConnectionDetails] = useState({
    serviceType: "aws-cognito",
    userPoolId: "",
    clientId: "",
    region: "",
  })

  const handleConnectService = async () => {
    try {
      await addService(connectionDetails)
      toast({
        title: "Service Connected",
        description: "AWS Cognito has been successfully connected.",
      })
      setIsDialogOpen(false)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: (err as Error).message,
      })
    }
  }

  return (
    <AppLayout username="John Doe" onSearch={() => {}} notificationsCount={0}>
      <FadeInSection>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Cloud Services</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>Connect New Service</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect Cloud Service</DialogTitle>
                <DialogDescription>
                  Connect your identity provider to manage users and authentication.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="userPoolId" className="text-right">
                    User Pool ID
                  </Label>
                  <Input
                    id="userPoolId"
                    className="col-span-3"
                    value={connectionDetails.userPoolId}
                    onChange={(e) =>
                      setConnectionDetails((p) => ({ ...p, userPoolId: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="clientId" className="text-right">
                    Client ID
                  </Label>
                  <Input
                    id="clientId"
                    className="col-span-3"
                    value={connectionDetails.clientId}
                    onChange={(e) =>
                      setConnectionDetails((p) => ({ ...p, clientId: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="region" className="text-right">
                    Region
                  </Label>
                  <Input
                    id="region"
                    className="col-span-3"
                    value={connectionDetails.region}
                    onChange={(e) =>
                      setConnectionDetails((p) => ({ ...p, region: e.target.value }))
                    }
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConnectService} disabled={loading}>
                  {loading ? "Connecting..." : "Connect"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {!services.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[300px] text-center">
              <CloudOff className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium mb-2">No Cloud Services Connected</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Connect your identity provider to manage users and authentication for
                your organization.
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>Connect Service</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium">{services[0].name}</h3>
                    <Badge className="bg-green-500/10 text-green-500">
                      <Check className="mr-1 h-3 w-3" /> Connected
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={refresh}>
                      <RefreshCw className="mr-1 h-4 w-4" />
                      Sync
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push("/admin/company-settings/user-management")
                      }
                    >
                      Manage Users
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p>Last synced: {new Date(services[0].lastSynced).toLocaleString()}</p>
                <p>Users: {services[0].userCount}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </FadeInSection>
    </AppLayout>
  )
}
