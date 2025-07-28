"use client"

import { useState, useEffect } from "react"
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
import { CloudOff, Check, RefreshCw, Bug, ChevronDown, ChevronUp } from "lucide-react"
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
  
  // Debugging state
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [isDebugging, setIsDebugging] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  
  // Run diagnostics function
  const runDiagnostics = async () => {
    setIsDebugging(true)
    setDebugInfo(null)
    
    try {
      console.log("Running API diagnostics...")
      
      // Direct fetch to the API endpoint with debug header
      const response = await fetch('/api/company-settings/cloud-services', {
        method: 'GET',
        headers: {
          'Debug-Mode': 'true'
        }
      })
      
      let data
      try {
        data = await response.json()
      } catch (parseError) {
        data = { parseError: "Failed to parse response as JSON" }
      }
      
      console.log("API Response:", response.status, data)
      
      // Store diagnostic info
      setDebugInfo({
        timestamp: new Date().toISOString(),
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        data,
        
        // Test direct AWS connectivity
        awsTest: await testAwsConnectivity()
      })
    } catch (err) {
      console.error("Diagnostics error:", err)
      setDebugInfo({
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        type: err instanceof Error ? err.name : typeof err,
        stack: err instanceof Error ? err.stack : undefined
      })
    } finally {
      setIsDebugging(false)
    }
  }
  
  // Helper function to test AWS connectivity
  const testAwsConnectivity = async () => {
    try {
      const response = await fetch('/api/direct-aws-test', {
        method: 'GET'
      })
      
      return await response.json()
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      }
    }
  }
  
  // Create a direct AWS test endpoint when debugging starts
  useEffect(() => {
    // Add a temporary debug endpoint directly in the browser
    if (showDebugPanel && !window.hasOwnProperty('debugEndpointCreated')) {
      const script = document.createElement('script')
      script.innerHTML = `
        window.debugEndpointCreated = true;
        // Create a temporary endpoint for testing
        const oldFetch = window.fetch;
        window.fetch = function(url, options) {
          if (url === '/api/direct-aws-test') {
            // This will only run in the browser
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({
                message: "Browser-only test. For real AWS testing, add a real endpoint.",
                browserInfo: {
                  userAgent: navigator.userAgent,
                  url: window.location.href
                }
              })
            });
          }
          return oldFetch(url, options);
        };
      `
      document.head.appendChild(script)
    }
  }, [showDebugPanel])

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
        {/* Debug Panel */}
        <div className="mb-6">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="mb-2 flex items-center"
          >
            <Bug className="mr-2 h-4 w-4" />
            {showDebugPanel ? "Hide Debug Panel" : "Show Debug Panel"}
            {showDebugPanel ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
          
          {showDebugPanel && (
            <Card className="mb-4 border-dashed border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>API Diagnostics</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={runDiagnostics} 
                    disabled={isDebugging}
                  >
                    {isDebugging ? "Running..." : "Run Diagnostics"}
                  </Button>
                </CardTitle>
                <CardDescription>
                  Troubleshoot API connectivity issues and environment variables
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                {isDebugging ? (
                  <div className="flex justify-center items-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-2">Running diagnostics...</span>
                  </div>
                ) : debugInfo ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-1">Status:</h4>
                      <p className={debugInfo.status >= 400 ? "text-red-500" : "text-green-500"}>
                        {debugInfo.status} {debugInfo.statusText}
                      </p>
                    </div>
                    
                    {debugInfo.error && (
                      <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded">
                        <h4 className="font-medium mb-1">Error:</h4>
                        <p>{debugInfo.error}</p>
                        {debugInfo.stack && (
                          <pre className="mt-2 text-xs overflow-auto max-h-[150px] p-2 bg-red-50 dark:bg-red-900/50 rounded">
                            {debugInfo.stack}
                          </pre>
                        )}
                      </div>
                    )}
                    
                    {debugInfo.data && (
                      <div>
                        <h4 className="font-medium mb-1">API Response:</h4>
                        <pre className="p-3 bg-gray-100 dark:bg-gray-800 rounded overflow-auto text-xs max-h-[200px]">
                          {JSON.stringify(debugInfo.data, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    {debugInfo.awsTest && (
                      <div>
                        <h4 className="font-medium mb-1">AWS Connectivity Test:</h4>
                        <pre className="p-3 bg-gray-100 dark:bg-gray-800 rounded overflow-auto text-xs max-h-[150px]">
                          {JSON.stringify(debugInfo.awsTest, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4 text-center text-muted-foreground">
                    Click "Run Diagnostics" to test API connectivity
                  </div>
                )}
              </CardContent>
              
              <CardFooter className="text-xs text-muted-foreground">
                <p>Add <code>/api/debug/aws-test/route.ts</code> file to enable real AWS testing</p>
              </CardFooter>
            </Card>
          )}
        </div>
        
        {/* Original content */}
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
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
            {showDebugPanel && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2" 
                onClick={runDiagnostics}
              >
                Run Diagnostics
              </Button>
            )}
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