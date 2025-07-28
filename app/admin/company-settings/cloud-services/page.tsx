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
import { 
  CloudOff, 
  Check, 
  RefreshCw, 
  Bug, 
  ChevronDown, 
  ChevronUp, 
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HelpCircle,
  Info
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useCloudServices } from "@/hooks/useCloudServices"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// List of valid AWS regions for reference
const VALID_AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'af-south-1', 'ap-east-1', 'ap-south-1', 'ap-northeast-1',
  'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1',
  'ap-southeast-2', 'ca-central-1', 'eu-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-south-1',
  'eu-north-1', 'me-south-1', 'sa-east-1'
];

export default function CloudServicesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { 
    services, 
    loading, 
    error, 
    addService, 
    updateService, 
    removeService, 
    validateConnection, 
    refresh 
  } = useCloudServices()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const [connectionDetails, setConnectionDetails] = useState({
    serviceType: "aws-cognito",
    userPoolId: "",
    clientId: "",
    clientSecret: "", // Added client secret field
    region: "",
  })
  
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null)
  
  // Debugging state
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [isDebugging, setIsDebugging] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)

  // Detect region from User Pool ID
  useEffect(() => {
    const userPoolId = connectionDetails.userPoolId;
    if (userPoolId && userPoolId.includes('_')) {
      const regionFromPoolId = userPoolId.split('_')[0];
      if (VALID_AWS_REGIONS.includes(regionFromPoolId) && regionFromPoolId !== connectionDetails.region) {
        setConnectionDetails(prev => ({
          ...prev,
          region: regionFromPoolId
        }));
      }
    }
  }, [connectionDetails.userPoolId]);
  
  // Run diagnostics function
  const runDiagnostics = async () => {
    setIsDebugging(true)
    setDebugInfo(null)
    
    try {
      console.log("Running API diagnostics...")
      
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
      
      setDebugInfo({
        timestamp: new Date().toISOString(),
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        data,
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
  
  const testAwsConnectivity = async () => {
    try {
      const response = await fetch('/api/debug/aws-test', {
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
  
  useEffect(() => {
    if (showDebugPanel && !window.hasOwnProperty('debugEndpointCreated')) {
      const script = document.createElement('script')
      script.innerHTML = `
        window.debugEndpointCreated = true;
        const oldFetch = window.fetch;
        window.fetch = function(url, options) {
          if (url === '/api/debug/aws-test') {
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

  // Local validation before sending to API
  const validateInputsLocally = () => {
    if (!connectionDetails.userPoolId || !connectionDetails.clientId || !connectionDetails.region) {
      setValidationResult({ 
        valid: false, 
        message: "User Pool ID, Client ID, and Region are required" 
      });
      return false;
    }
    
    if (!VALID_AWS_REGIONS.includes(connectionDetails.region)) {
      setValidationResult({ 
        valid: false, 
        message: `Invalid region format. Use a standard AWS region code like "us-east-1".` 
      });
      return false;
    }
    
    if (!connectionDetails.userPoolId.includes('_')) {
      setValidationResult({ 
        valid: false, 
        message: "User Pool ID should be in the format 'region_identifier'" 
      });
      return false;
    }
    
    const regionFromPoolId = connectionDetails.userPoolId.split('_')[0];
    if (regionFromPoolId !== connectionDetails.region) {
      setValidationResult({ 
        valid: false, 
        message: `The region in your User Pool ID (${regionFromPoolId}) doesn't match the provided region (${connectionDetails.region})` 
      });
      return false;
    }
    
    return true;
  }

  const handleConnectService = async () => {
    try {
      if (!validateInputsLocally()) {
        return;
      }
      
      setIsValidating(true)
      try {
        const result = await validateConnection({
          userPoolId: connectionDetails.userPoolId,
          clientId: connectionDetails.clientId,
          clientSecret: connectionDetails.clientSecret,
          region: connectionDetails.region,
        })
        setValidationResult({ 
          valid: result.valid, 
          message: result.message 
        })
        
        if (!result.valid) {
          return
        }
      } catch (err) {
        setValidationResult({ 
          valid: false, 
          message: err instanceof Error ? err.message : "Validation failed" 
        })
        return
      } finally {
        setIsValidating(false)
      }
      
      await addService(connectionDetails)
      toast({
        title: "Service Connected",
        description: "AWS Cognito has been successfully connected.",
      })
      setIsDialogOpen(false)
      setConnectionDetails({
        serviceType: "aws-cognito",
        userPoolId: "",
        clientId: "",
        clientSecret: "",
        region: "",
      })
      setValidationResult(null)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: (err as Error).message,
      })
    }
  }

  const handleEditService = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (service) {
      setConnectionDetails({
        serviceType: "aws-cognito",
        userPoolId: service.userPoolId || "",
        clientId: service.clientId || "",
        clientSecret: "", // Don't populate the secret for security
        region: service.region || "",
      })
      setSelectedService(serviceId)
      setIsEditDialogOpen(true)
    }
  }

  const handleUpdateService = async () => {
    if (!selectedService) return

    try {
      if (!validateInputsLocally()) {
        return;
      }
      
      setIsValidating(true)
      try {
        const result = await validateConnection({
          userPoolId: connectionDetails.userPoolId,
          clientId: connectionDetails.clientId,
          clientSecret: connectionDetails.clientSecret,
          region: connectionDetails.region,
        })
        setValidationResult({ 
          valid: result.valid, 
          message: result.message 
        })
        
        if (!result.valid) {
          return
        }
      } catch (err) {
        setValidationResult({ 
          valid: false, 
          message: err instanceof Error ? err.message : "Validation failed" 
        })
        return
      } finally {
        setIsValidating(false)
      }
      
      await updateService(selectedService, {
        userPoolId: connectionDetails.userPoolId,
        clientId: connectionDetails.clientId,
        clientSecret: connectionDetails.clientSecret,
        region: connectionDetails.region,
      })
      
      toast({
        title: "Service Updated",
        description: "AWS Cognito configuration has been updated successfully.",
      })
      setIsEditDialogOpen(false)
      setSelectedService(null)
      setValidationResult(null)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Update Error",
        description: (err as Error).message,
      })
    }
  }

  const handleDeleteService = (serviceId: string) => {
    setSelectedService(serviceId)
    setIsDeleteDialogOpen(true)
  }

  const confirmDeleteService = async () => {
    if (!selectedService) return

    try {
      await removeService(selectedService)
      toast({
        title: "Service Removed",
        description: "AWS Cognito has been successfully removed.",
      })
      setIsDeleteDialogOpen(false)
      setSelectedService(null)
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Removal Error",
        description: (err as Error).message,
      })
    }
  }

  const handleValidateCredentials = async () => {
    if (!validateInputsLocally()) {
      return;
    }
    
    setIsValidating(true)
    setValidationResult(null)
    
    try {
      const result = await validateConnection({
        userPoolId: connectionDetails.userPoolId,
        clientId: connectionDetails.clientId,
        clientSecret: connectionDetails.clientSecret,
        region: connectionDetails.region,
      })
      
      setValidationResult({ 
        valid: result.valid, 
        message: result.message 
      })
    } catch (err) {
      setValidationResult({ 
        valid: false, 
        message: err instanceof Error ? err.message : "Validation failed" 
      })
    } finally {
      setIsValidating(false)
    }
  }

  // Helper components for form inputs
  const RegionHelperText = () => (
    <div className="text-xs text-muted-foreground mt-1">
      <p>Enter a valid AWS region code (e.g., us-east-1, eu-west-2). Must match the region in your User Pool ID.</p>
    </div>
  )

  const UserPoolHelperText = () => (
    <div className="text-xs text-muted-foreground mt-1">
      <p>Format: region_identifier (e.g., us-east-1_abcdefghi)</p>
    </div>
  )

  const ClientSecretHelperText = () => (
    <div className="text-xs text-muted-foreground mt-1">
      <p>Your Cognito app client secret. Required for this app client configuration.</p>
    </div>
  )

  const RegionSelector = ({ value, onChange, id }: { value: string; onChange: (value: string) => void; id: string }) => (
    <div className="flex flex-col space-y-1 col-span-3">
      <div className="flex space-x-2">
        <select 
          id={id}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>Select a region</option>
          {VALID_AWS_REGIONS.map(region => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" type="button">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">Region must match the region prefix in your User Pool ID (the part before the underscore).</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )

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
        
        {/* Main Content */}
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
                <Alert variant="default" className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <Info className="h-4 w-4" />
                  <AlertTitle>AWS Cognito Configuration</AlertTitle>
                  <AlertDescription className="text-sm">
                    You'll need your User Pool ID, Client ID, Client Secret, and Region from the AWS Cognito Console.
                    Make sure to use the correct region format (e.g., us-east-1) that matches your User Pool ID.
                  </AlertDescription>
                </Alert>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="userPoolId" className="text-right">
                    User Pool ID
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="userPoolId"
                      value={connectionDetails.userPoolId}
                      onChange={(e) =>
                        setConnectionDetails((p) => ({ ...p, userPoolId: e.target.value }))
                      }
                      placeholder="e.g. us-east-1_abcdefghi"
                    />
                    <UserPoolHelperText />
                  </div>
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
                    placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="clientSecret" className="text-right">
                    Client Secret
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="clientSecret"
                      type="password"
                      value={connectionDetails.clientSecret}
                      onChange={(e) =>
                        setConnectionDetails((p) => ({ ...p, clientSecret: e.target.value }))
                      }
                      placeholder="Your Cognito app client secret"
                    />
                    <ClientSecretHelperText />
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="region" className="text-right">
                    Region
                  </Label>
                  <RegionSelector 
                    id="region" 
                    value={connectionDetails.region}
                    onChange={(value) => setConnectionDetails(p => ({ ...p, region: value }))}
                  />
                </div>
                
                {validationResult && (
                  <Alert variant={validationResult.valid ? "default" : "destructive"} className="mt-4">
                    {validationResult.valid ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    <AlertTitle>{validationResult.valid ? "Success" : "Connection Error"}</AlertTitle>
                    <AlertDescription>{validationResult.message}</AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsDialogOpen(false)
                    setConnectionDetails({
                      serviceType: "aws-cognito",
                      userPoolId: "",
                      clientId: "",
                      clientSecret: "",
                      region: "",
                    })
                    setValidationResult(null)
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleValidateCredentials} 
                  disabled={isValidating || loading}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    "Validate"
                  )}
                </Button>
                <Button 
                  onClick={handleConnectService} 
                  disabled={loading || isValidating}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect"
                  )}
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
            {services.map((service) => (
              <Card key={service.id}>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium">{service.name}</h3>
                      <Badge className="bg-green-500/10 text-green-500">
                        <Check className="mr-1 h-3 w-3" /> Connected
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-4 w-4" />
                        )}
                        Sync
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push("/admin/company-settings/user-management")}
                      >
                        Manage Users
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditService(service.id)}
                      >
                        <Edit className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500"
                        onClick={() => handleDeleteService(service.id)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p>Last synced: {new Date(service.lastSynced).toLocaleString()}</p>
                    <p>Users: {service.userCount}</p>
                    <div className="mt-4 grid grid-cols-4 gap-4">
                      <div className="border rounded p-3 bg-muted/30">
                        <p className="text-sm font-medium mb-1">User Pool ID</p>
                        <p className="text-sm text-muted-foreground truncate">{service.userPoolId || "Not available"}</p>
                      </div>
                      <div className="border rounded p-3 bg-muted/30">
                        <p className="text-sm font-medium mb-1">Region</p>
                        <p className="text-sm text-muted-foreground">{service.region || "Not available"}</p>
                      </div>
                      <div className="border rounded p-3 bg-muted/30">
                        <p className="text-sm font-medium mb-1">Client ID</p>
                        <p className="text-sm text-muted-foreground truncate">{service.clientId || "Not available"}</p>
                      </div>
                      <div className="border rounded p-3 bg-muted/30">
                        <p className="text-sm font-medium mb-1">Client Secret</p>
                        <p className="text-sm text-muted-foreground">
                          {service.hasClientSecret ? "••••••••" : "Not configured"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {/* Edit Service Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit AWS Cognito Configuration</DialogTitle>
              <DialogDescription>
                Update your identity provider settings. Leave client secret blank to keep existing value.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert variant="default" className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4" />
                <AlertTitle>AWS Cognito Configuration</AlertTitle>
                <AlertDescription className="text-sm">
                  Make sure to use the correct region format (e.g., us-east-1) that matches your User Pool ID.
                  Client secret will only be updated if you provide a new value.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-userPoolId" className="text-right">
                  User Pool ID
                </Label>
                <div className="col-span-3 space-y-1">
                  <Input
                    id="edit-userPoolId"
                    value={connectionDetails.userPoolId}
                    onChange={(e) =>
                      setConnectionDetails((p) => ({ ...p, userPoolId: e.target.value }))
                    }
                    placeholder="e.g. us-east-1_abcdefghi"
                  />
                  <UserPoolHelperText />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-clientId" className="text-right">
                  Client ID
                </Label>
                <Input
                  id="edit-clientId"
                  className="col-span-3"
                  value={connectionDetails.clientId}
                  onChange={(e) =>
                    setConnectionDetails((p) => ({ ...p, clientId: e.target.value }))
                  }
                  placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-clientSecret" className="text-right">
                  Client Secret
                </Label>
                <div className="col-span-3 space-y-1">
                  <Input
                    id="edit-clientSecret"
                    type="password"
                    value={connectionDetails.clientSecret}
                    onChange={(e) =>
                      setConnectionDetails((p) => ({ ...p, clientSecret: e.target.value }))
                    }
                    placeholder="Leave blank to keep existing secret"
                  />
                  <ClientSecretHelperText />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-region" className="text-right">
                  Region
                </Label>
                <RegionSelector 
                  id="edit-region" 
                  value={connectionDetails.region}
                  onChange={(value) => setConnectionDetails(p => ({ ...p, region: value }))}
                />
              </div>
              
              {validationResult && (
                <Alert variant={validationResult.valid ? "default" : "destructive"} className="mt-4">
                  {validationResult.valid ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <AlertTitle>{validationResult.valid ? "Success" : "Connection Error"}</AlertTitle>
                  <AlertDescription>{validationResult.message}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsEditDialogOpen(false)
                  setSelectedService(null)
                  setValidationResult(null)
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="outline" 
                onClick={handleValidateCredentials} 
                disabled={isValidating || loading}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Validate"
                )}
              </Button>
              <Button 
                onClick={handleUpdateService} 
                disabled={loading || isValidating}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove AWS Cognito</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this connection? This will disconnect your identity provider
                and you won't be able to manage users until you reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setIsDeleteDialogOpen(false)
                setSelectedService(null)
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteService}
                className="bg-red-500 hover:bg-red-600"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </FadeInSection>
    </AppLayout>
  )
}