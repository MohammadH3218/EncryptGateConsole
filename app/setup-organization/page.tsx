"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  ArrowRight, 
  ArrowLeft,
  Lock, 
  Building, 
  Shield, 
  Users, 
  Mail,
  CheckCircle,
  AlertTriangle,
  Cloud,
  Key,
  UserPlus
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { checkAuth } from "@/lib/auth"

// AWS regions for Cognito & WorkMail
const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' }
]

interface OrganizationData {
  name: string
  adminName: string
  adminEmail: string
}

interface CognitoConfig {
  userPoolId: string
  clientId: string
  clientSecret: string
  domain: string
  redirectUri: string
  region: string
  accessKey: string
  secretKey: string
}

interface CognitoUser {
  username: string
  email: string
  enabled: boolean
  userCreateDate: string
  userStatus: string
  attributes: Record<string, string>
}

interface DuplicateInfo {
  name?: string
  id: string
  loginUrl: string
}

type SetupStep = 'org-info' | 'aws-config' | 'cognito-users' | 'complete'

export default function SetupOrganizationPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<SetupStep>('org-info')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Organization info
  const [orgData, setOrgData] = useState<OrganizationData>({
    name: "",
    adminName: "",
    adminEmail: ""
  })

  // AWS/Cognito config
  const [cognitoConfig, setCognitoConfig] = useState<CognitoConfig>({
    userPoolId: "",
    clientId: "",
    clientSecret: "",
    domain: "",
    redirectUri: "https://console-encryptgate.net/api/auth/callback",
    region: "us-east-1",
    accessKey: "",
    secretKey: ""
  })

  // Cognito users and selected admin
  const [cognitoUsers, setCognitoUsers] = useState<CognitoUser[]>([])
  const [selectedAdminUser, setSelectedAdminUser] = useState<string>("")
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null)

  useEffect(() => {
    // do not auto-redirect to dashboard here
    setCheckingAuth(false)
    // Check if we have pending org data from landing page
    const pendingOrg = localStorage.getItem("pending_org_creation")
    if (pendingOrg) {
      try {
        const data = JSON.parse(pendingOrg)
        setOrgData(data)
        localStorage.removeItem("pending_org_creation")
      } catch (e) {
        console.error("Error parsing pending org data:", e)
        // Redirect back to landing if no valid data
        router.push("/")
      }
    } else {
      // No pending data, redirect to landing page
      router.push("/")
    }
  }, [router])

  const validateCognitoConfig = async () => {
    if (!cognitoConfig.userPoolId || !cognitoConfig.clientId || !cognitoConfig.domain || !cognitoConfig.redirectUri || !cognitoConfig.accessKey || !cognitoConfig.secretKey) {
      setError("All AWS credentials, domain, and redirect URI are required")
      return false
    }

    setValidationStatus('validating')
    setError("")
    setDuplicateInfo(null)

    try {
      const response = await fetch('/api/setup/validate-cognito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cognitoConfig)
      })

      const result = await response.json()

      if (response.ok && result.valid) {
        setValidationStatus('valid')
        setCognitoUsers(result.users || [])
        return true
      } else {
        setValidationStatus('invalid')
        
        // Check if it's a duplicate configuration error
        if (response.status === 409 && result.existingOrganization) {
          setDuplicateInfo(result.existingOrganization)
          setError(result.message || 'Configuration already in use')
        } else {
          setError(result.message || 'Invalid AWS configuration')
        }
        return false
      }
    } catch (err: any) {
      setValidationStatus('invalid')
      setError(err.message || 'Failed to validate AWS configuration')
      return false
    }
  }

  const handleStepForward = async () => {
    setLoading(true)
    setError("")

    try {
      switch (currentStep) {
        case 'org-info':
          if (!orgData.name || !orgData.adminName || !orgData.adminEmail) {
            setError("Please fill in all organization details")
            return
          }
          setCurrentStep('aws-config')
          break

        case 'aws-config':
          const isValid = await validateCognitoConfig()
          if (isValid) {
            setCurrentStep('cognito-users')
          }
          break

        case 'cognito-users':
          if (!selectedAdminUser) {
            setError("Please select an admin user from your Cognito user pool")
            return
          }
          await createOrganization()
          break
      }
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const createOrganization = async () => {
    try {
      const response = await fetch('/api/setup/create-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization: orgData,
          cognito: cognitoConfig,
          adminUser: selectedAdminUser
        })
      })

      const result = await response.json()

      if (response.ok) {
        setCurrentStep('complete')
        // Store organization context for login
        localStorage.setItem('organization_id', result.organizationId)
        localStorage.setItem('organization_name', orgData.name)
      } else {
        // Check if it's a duplicate configuration error
        if (response.status === 409 && result.existingOrganization) {
          setDuplicateInfo(result.existingOrganization)
        }
        setError(result.message || 'Failed to create organization')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create organization')
    }
  }

  const handleBackToLogin = () => {
    const orgId = localStorage.getItem('organization_id')
    if (orgId) {
      router.push(`/o/${orgId}/login`)
    } else {
      router.push('/login')
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-white animate-spin mx-auto" />
          <div className="text-white text-lg font-medium">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center space-x-4">
          {(['org-info', 'aws-config', 'cognito-users', 'complete'] as SetupStep[]).map((step, index) => {
            const stepNames = {
              'org-info': 'Organization',
              'aws-config': 'AWS Setup',
              'cognito-users': 'Admin User',
              'complete': 'Complete'
            }
            
            const isActive = step === currentStep
            const isCompleted = ['org-info', 'aws-config', 'cognito-users', 'complete'].indexOf(currentStep) > index
            
            return (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isCompleted 
                    ? 'bg-green-600 text-white' 
                    : isActive 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-600 text-gray-300'
                }`}>
                  {isCompleted ? <CheckCircle className="w-4 h-4" /> : index + 1}
                </div>
                <span className={`ml-2 text-sm ${
                  isActive || isCompleted ? 'text-white' : 'text-gray-400'
                }`}>
                  {stepNames[step]}
                </span>
                {index < 3 && <ArrowRight className="w-4 h-4 text-gray-600 mx-4" />}
              </div>
            )
          })}
        </div>

        <Card className="bg-[#0f0f0f] border-[#1f1f1f] shadow-2xl">
          <CardHeader className="text-center pb-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl text-white">Setup Your Organization</CardTitle>
                <CardDescription className="text-gray-400">
                  Step {['org-info', 'aws-config', 'cognito-users', 'complete'].indexOf(currentStep) + 1} of 4
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {currentStep === 'org-info' && (
              <OrganizationInfoStep 
                orgData={orgData}
                setOrgData={setOrgData}
              />
            )}
            {currentStep === 'aws-config' && (
              <AWSConfigStep 
                config={cognitoConfig} 
                setConfig={setCognitoConfig}
                validationStatus={validationStatus}
                onValidate={validateCognitoConfig}
              />
            )}
            {currentStep === 'cognito-users' && (
              <CognitoUsersStep 
                users={cognitoUsers}
                selectedUser={selectedAdminUser}
                setSelectedUser={setSelectedAdminUser}
                orgData={orgData}
              />
            )}
            {currentStep === 'complete' && <CompleteStep orgData={orgData} />}

            {error && duplicateInfo && (
              <Alert className="bg-yellow-500/10 border-yellow-500/20">
                <AlertTriangle className="h-4 w-4" />
                <div className="ml-2">
                  <div className="font-medium text-yellow-200 mb-2">Configuration Already In Use</div>
                  <div className="text-sm text-yellow-300 mb-3">{error}</div>
                  <div className="flex flex-col gap-2">
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(duplicateInfo.loginUrl)}
                      className="bg-yellow-600 hover:bg-yellow-700 border-yellow-500 text-white"
                    >
                      Go to Login Page
                      <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                    <p className="text-xs text-yellow-400">
                      If you're the owner of{duplicateInfo.name ? ` "${duplicateInfo.name}"` : ' this organization'}, use the login button above. 
                      Otherwise, contact support or use a different Cognito configuration.
                    </p>
                  </div>
                </div>
              </Alert>
            )}
            {error && !duplicateInfo && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex justify-between pt-6">
            {currentStep === 'complete' ? (
              <Button 
                onClick={handleBackToLogin}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Continue to Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/')}
                  className="bg-transparent border-[#2f2f2f] text-white hover:bg-[#1f1f1f]"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button 
                  onClick={handleStepForward}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {currentStep === 'aws-config' ? 'Validating...' : 'Processing...'}
                    </>
                  ) : (
                    <>
                      {currentStep === 'cognito-users' ? 'Create Organization' : 'Next'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

// Step Components
function OrganizationInfoStep({ 
  orgData, 
  setOrgData 
}: { 
  orgData: OrganizationData
  setOrgData: (data: OrganizationData) => void 
}) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <Building className="w-12 h-12 text-blue-500 mx-auto mb-3" />
        <h3 className="text-xl font-semibold text-white">Organization Details</h3>
        <p className="text-gray-400">Tell us about your organization</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="org-name" className="text-white">Organization Name</Label>
          <Input
            id="org-name"
            value={orgData.name}
            onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
            placeholder="Acme Corporation"
            className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
          />
        </div>
        
        <div>
          <Label htmlFor="admin-name" className="text-white">Your Name</Label>
          <Input
            id="admin-name"
            value={orgData.adminName}
            onChange={(e) => setOrgData({ ...orgData, adminName: e.target.value })}
            placeholder="John Doe"
            className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
          />
        </div>
        
        <div>
          <Label htmlFor="admin-email" className="text-white">Your Email</Label>
          <Input
            id="admin-email"
            type="email"
            value={orgData.adminEmail}
            onChange={(e) => setOrgData({ ...orgData, adminEmail: e.target.value })}
            placeholder="admin@company.com"
            className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
          />
        </div>
      </div>
    </div>
  )
}

function AWSConfigStep({ 
  config, 
  setConfig, 
  validationStatus, 
  onValidate 
}: { 
  config: CognitoConfig
  setConfig: (config: CognitoConfig) => void
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid'
  onValidate: () => Promise<boolean>
}) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <Cloud className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="text-xl font-semibold text-white">AWS Configuration</h3>
        <p className="text-gray-400">Connect your AWS Cognito user pool</p>
      </div>

      {/* AWS Permissions Required */}
      <Alert className="bg-blue-500/10 border-blue-500/20 mb-6">
        <Key className="h-4 w-4" />
        <div className="ml-2">
          <div className="font-medium text-blue-200 mb-2">Required AWS IAM Permissions:</div>
          <div className="text-sm text-blue-300 space-y-1">
            <div>• <code>cognito-idp:DescribeUserPool</code></div>
            <div>• <code>cognito-idp:ListUsers</code></div>
            <div>• <code>cognito-idp:AdminGetUser</code></div>
            <div>• <code>cognito-idp:AdminCreateUser</code></div>
            <div>• <code>cognito-idp:AdminAddUserToGroup</code></div>
            <div>• <code>cognito-idp:AdminRemoveUserFromGroup</code></div>
          </div>
        </div>
      </Alert>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-white">User Pool ID</Label>
          <Input
            value={config.userPoolId}
            onChange={(e) => setConfig({ ...config, userPoolId: e.target.value })}
            placeholder="us-east-1_xxxxxxxxx"
            className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
          />
        </div>
        
        <div>
          <Label className="text-white">Client ID</Label>
          <Input
            value={config.clientId}
            onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
          />
        </div>
      </div>

      <div>
        <Label className="text-white">Cognito Domain</Label>
        <Input
          value={config.domain}
          onChange={(e) => setConfig({ ...config, domain: e.target.value })}
          placeholder="your-domain-name.auth.us-east-1.amazoncognito.com"
          className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
        />
        <p className="text-xs text-gray-400 mt-1">
          Find this in your AWS Cognito User Pool → App Integration → Domain
        </p>
      </div>
      
      <div>
        <Label className="text-white">Redirect URI</Label>
        <Input
          value={config.redirectUri}
          onChange={(e) => setConfig({ ...config, redirectUri: e.target.value })}
          placeholder="https://console-encryptgate.net/api/auth/callback"
          className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
        />
        <p className="text-xs text-gray-400 mt-1">
          The URL where users will be redirected after authentication. This must be configured in your Cognito App Client.
        </p>
      </div>
      
      <div>
        <Label className="text-white">Client Secret (Optional)</Label>
        <Input
          type="password"
          value={config.clientSecret}
          onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
          placeholder="Keep blank if using public client"
          className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
        />
      </div>
      
      <div>
        <Label className="text-white">AWS Region</Label>
        <Select value={config.region} onValueChange={(value) => setConfig({ ...config, region: value })}>
          <SelectTrigger className="bg-[#1f1f1f] border-[#2f2f2f] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1f1f1f] border-[#2f2f2f]">
            {AWS_REGIONS.map((region) => (
              <SelectItem key={region.value} value={region.value} className="text-white">
                {region.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-white">AWS Access Key ID</Label>
          <Input
            type="password"
            value={config.accessKey}
            onChange={(e) => setConfig({ ...config, accessKey: e.target.value })}
            placeholder="AKIA..."
            className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
          />
        </div>
        
        <div>
          <Label className="text-white">AWS Secret Access Key</Label>
          <Input
            type="password"
            value={config.secretKey}
            onChange={(e) => setConfig({ ...config, secretKey: e.target.value })}
            placeholder="..."
            className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
          />
        </div>
      </div>

      {validationStatus === 'valid' && (
        <Alert className="bg-green-500/10 border-green-500/20">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription className="text-green-200">
            AWS configuration validated successfully!
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function CognitoUsersStep({ 
  users, 
  selectedUser, 
  setSelectedUser, 
  orgData 
}: { 
  users: CognitoUser[]
  selectedUser: string
  setSelectedUser: (user: string) => void
  orgData: OrganizationData
}) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <UserPlus className="w-12 h-12 text-purple-500 mx-auto mb-3" />
        <h3 className="text-xl font-semibold text-white">Select Admin User</h3>
        <p className="text-gray-400">Choose who will be the admin for {orgData.name}</p>
      </div>
      
      <div className="max-h-60 overflow-y-auto space-y-2">
        {users.map((user) => (
          <div
            key={user.username}
            onClick={() => setSelectedUser(user.username)}
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedUser === user.username
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-[#2f2f2f] bg-[#1a1a1a] hover:bg-[#2a2a2a]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-medium">{user.email}</div>
                <div className="text-sm text-gray-400">
                  Status: <Badge variant={user.enabled ? "default" : "secondary"} className="ml-1">
                    {user.userStatus}
                  </Badge>
                </div>
              </div>
              {selectedUser === user.username && (
                <CheckCircle className="w-5 h-5 text-blue-500" />
              )}
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="text-center py-8">
          <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No users found in your Cognito user pool</p>
        </div>
      )}
    </div>
  )
}

function CompleteStep({ orgData }: { orgData: OrganizationData }) {
  return (
    <div className="text-center space-y-4">
      <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
      <h3 className="text-2xl font-semibold text-white">Organization Created!</h3>
      <p className="text-gray-400">
        {orgData.name} has been successfully set up with AWS integration.
      </p>
      <div className="bg-[#1a1a1a] p-4 rounded-lg mt-6">
        <p className="text-sm text-gray-300">
          Your organization is now ready. You can log in using your AWS Cognito credentials.
        </p>
      </div>
    </div>
  )
}