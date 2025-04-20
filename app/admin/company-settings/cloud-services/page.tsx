"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CloudOff, AlertCircle, Check, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

// Mock data for connected services
const mockConnectedServices = [
  {
    id: "aws-cognito",
    name: "AWS Cognito",
    status: "connected",
    lastSynced: "2024-01-31T15:20:00Z",
    userCount: 24,
  },
]

export default function CloudServicesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [connectedServices, setConnectedServices] = useState(mockConnectedServices)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [connectionDetails, setConnectionDetails] = useState({
    serviceType: "aws-cognito",
    userPoolId: "",
    clientId: "",
    region: "",
  })
  const { toast } = useToast()

  // Check if user is logged in
   useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
    }
  }, [router]) 

  const handleConnect = () => {
    setIsConnecting(true)

    // Simulate API call
    setTimeout(() => {
      setIsConnecting(false)
      setIsDialogOpen(false)

      // Add the new service to the list
      const newService = {
        id: `aws-cognito-${Date.now()}`,
        name: "AWS Cognito",
        status: "connected",
        lastSynced: new Date().toISOString(),
        userCount: 0,
      }

      setConnectedServices([...connectedServices, newService])

      toast({
        title: "Service Connected",
        description: "AWS Cognito has been successfully connected.",
      })
    }, 2000)
  }

  const handleDisconnect = (serviceId: string) => {
    // Filter out the service to disconnect
    const updatedServices = connectedServices.filter((service) => service.id !== serviceId)
    setConnectedServices(updatedServices)

    toast({
      title: "Service Disconnected",
      description: "The service has been disconnected successfully.",
    })
  }

  const handleSync = (serviceId: string) => {
    // Update the lastSynced timestamp for the service
    const updatedServices = connectedServices.map((service) => {
      if (service.id === serviceId) {
        return {
          ...service,
          lastSynced: new Date().toISOString(),
        }
      }
      return service
    })

    setConnectedServices(updatedServices)

    toast({
      title: "Service Synced",
      description: "The service has been synced successfully.",
    })
  }

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={0}>
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
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="serviceType" className="text-right">
                    Service Type
                  </Label>
                  <div className="col-span-3">
                    <select
                      id="serviceType"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={connectionDetails.serviceType}
                      onChange={(e) => setConnectionDetails({ ...connectionDetails, serviceType: e.target.value })}
                    >
                      <option value="aws-cognito">AWS Cognito</option>
                      <option value="azure-ad">Azure Active Directory</option>
                      <option value="okta">Okta</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="userPoolId" className="text-right">
                    User Pool ID
                  </Label>
                  <Input
                    id="userPoolId"
                    value={connectionDetails.userPoolId}
                    onChange={(e) => setConnectionDetails({ ...connectionDetails, userPoolId: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="clientId" className="text-right">
                    Client ID
                  </Label>
                  <Input
                    id="clientId"
                    value={connectionDetails.clientId}
                    onChange={(e) => setConnectionDetails({ ...connectionDetails, clientId: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="region" className="text-right">
                    Region
                  </Label>
                  <Input
                    id="region"
                    value={connectionDetails.region}
                    onChange={(e) => setConnectionDetails({ ...connectionDetails, region: e.target.value })}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConnect} disabled={isConnecting}>
                  {isConnecting ? "Connecting..." : "Connect"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {connectedServices.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[300px] text-center">
              <CloudOff className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium mb-2">No Cloud Services Connected</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Connect your identity provider to manage users and authentication for your organization.
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Connect Service</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect Cloud Service</DialogTitle>
                    <DialogDescription>
                      Connect your identity provider to manage users and authentication.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="serviceType" className="text-right">
                        Service Type
                      </Label>
                      <div className="col-span-3">
                        <select
                          id="serviceType"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={connectionDetails.serviceType}
                          onChange={(e) => setConnectionDetails({ ...connectionDetails, serviceType: e.target.value })}
                        >
                          <option value="aws-cognito">AWS Cognito</option>
                          <option value="azure-ad">Azure Active Directory</option>
                          <option value="okta">Okta</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="userPoolId" className="text-right">
                        User Pool ID
                      </Label>
                      <Input
                        id="userPoolId"
                        value={connectionDetails.userPoolId}
                        onChange={(e) => setConnectionDetails({ ...connectionDetails, userPoolId: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="clientId" className="text-right">
                        Client ID
                      </Label>
                      <Input
                        id="clientId"
                        value={connectionDetails.clientId}
                        onChange={(e) => setConnectionDetails({ ...connectionDetails, clientId: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="region" className="text-right">
                        Region
                      </Label>
                      <Input
                        id="region"
                        value={connectionDetails.region}
                        onChange={(e) => setConnectionDetails({ ...connectionDetails, region: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleConnect} disabled={isConnecting}>
                      {isConnecting ? "Connecting..." : "Connect"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                Connected cloud services are used for user management and authentication. Disconnecting a service may
                affect user access.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6">
              {connectedServices.map((service) => (
                <Card key={service.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {service.name}
                          <Badge variant="outline" className="ml-2 bg-green-500/10 text-green-500 border-green-500/20">
                            <Check className="mr-1 h-3 w-3" /> Connected
                          </Badge>
                        </CardTitle>
                        <CardDescription>Last synced: {new Date(service.lastSynced).toLocaleString()}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleSync(service.id)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDisconnect(service.id)}>
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium mb-1">Service Type</h4>
                        <p className="text-sm text-muted-foreground">AWS Cognito</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mb-1">User Count</h4>
                        <p className="text-sm text-muted-foreground">{service.userCount} users</p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/admin/company-settings/user-management")}
                    >
                      Manage Users
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        )}
      </FadeInSection>
    </AppLayout>
  )
}
