"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/app-layout'
import { FadeInSection } from '@/components/fade-in-section'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CloudOff,
  Check,
  RefreshCw,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HelpCircle,
  Info,
  Users,
  Mail,
  Plus,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useCloudServices } from '@/hooks/useCloudServices'
import type {
  CognitoDetails,
  WorkMailDetails,
  AddServiceDetails,
  ValidationResult,
} from '@/hooks/useCloudServices'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// valid AWS regions
const VALID_AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'af-south-1',
  'ap-east-1',
  'ap-south-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ca-central-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-south-1',
  'eu-north-1',
  'me-south-1',
  'sa-east-1',
] as const

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
    refresh,
  } = useCloudServices()

  // -- dialogs
  const [isCognitoDialogOpen, setIsCognitoDialogOpen] = useState(false)
  const [isWorkmailDialogOpen, setIsWorkmailDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // -- form state - Fixed with proper literal types
  const [cognitoDetails, setCognitoDetails] = useState<CognitoDetails>({
    serviceType: 'aws-cognito' as const,
    userPoolId: '',
    clientId: '',
    clientSecret: '',
    region: '',
  })
  
  const [workmailDetails, setWorkmailDetails] = useState<WorkMailDetails>({
    serviceType: 'aws-workmail' as const,
    organizationId: '',
    region: '',
    alias: '',
  })

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [editingServiceType, setEditingServiceType] = useState<'aws-cognito' | 'aws-workmail' | null>(null)

  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    message: string
  } | null>(null)

  // split out
  const cognitoServices = services.filter((s) =>
    s.id.includes('aws-cognito')
  )
  const workmailServices = services.filter((s) =>
    s.id.includes('aws-workmail')
  )

  // auto-detect region from pool ID
  useEffect(() => {
    const parts = cognitoDetails.userPoolId.split('_')
    if (parts.length > 1) {
      const r = parts[0]
      if (
        VALID_AWS_REGIONS.includes(r as any) &&
        r !== cognitoDetails.region
      ) {
        setCognitoDetails((p) => ({ ...p, region: r }))
      }
    }
  }, [cognitoDetails.userPoolId, cognitoDetails.region])

  // validators
  const validateCognito = () => {
    if (
      !cognitoDetails.userPoolId ||
      !cognitoDetails.clientId ||
      !cognitoDetails.region
    ) {
      setValidationResult({
        valid: false,
        message: 'User Pool ID, Client ID, and Region are required',
      })
      return false
    }
    if (!VALID_AWS_REGIONS.includes(cognitoDetails.region as any)) {
      setValidationResult({
        valid: false,
        message:
          'Region must be a standard AWS region (e.g. us-east-1)',
      })
      return false
    }
    if (!cognitoDetails.userPoolId.includes('_')) {
      setValidationResult({
        valid: false,
        message:
          "User Pool ID must follow 'region_identifier' format",
      })
      return false
    }
    const regionFromPool = cognitoDetails.userPoolId.split('_')[0]
    if (regionFromPool !== cognitoDetails.region) {
      setValidationResult({
        valid: false,
        message: `Region in Pool ID (${regionFromPool}) must match selected region (${cognitoDetails.region})`,
      })
      return false
    }
    return true
  }

  const validateWorkmail = () => {
    if (
      !workmailDetails.organizationId ||
      !workmailDetails.region
    ) {
      setValidationResult({
        valid: false,
        message: 'Organization ID and Region are required',
      })
      return false
    }
    if (!VALID_AWS_REGIONS.includes(workmailDetails.region as any)) {
      setValidationResult({
        valid: false,
        message:
          'Region must be a standard AWS region (e.g. us-east-1)',
      })
      return false
    }
    if (!workmailDetails.organizationId.startsWith('m-')) {
      setValidationResult({
        valid: false,
        message:
          "WorkMail Organization ID should start with 'm-'",
      })
      return false
    }
    return true
  }

  // ─── Connect Handlers ─────────────────────────────────────────────────────────
  const handleConnectCognito = async () => {
    if (!validateCognito()) return
    setIsValidating(true)
    try {
      const res: ValidationResult = await validateConnection(cognitoDetails)
      setValidationResult(res)
      if (!res.valid) return

      await addService(cognitoDetails)
      toast({
        title: 'AWS Cognito Connected',
        description: 'Security team authentication is now managed by Cognito.',
      })

      setIsCognitoDialogOpen(false)
      setCognitoDetails({
        serviceType: 'aws-cognito' as const,
        userPoolId: '',
        clientId: '',
        clientSecret: '',
        region: '',
      })
      setValidationResult(null)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: err.message,
      })
    } finally {
      setIsValidating(false)
    }
  }

  const handleConnectWorkmail = async () => {
    if (!validateWorkmail()) return
    setIsValidating(true)
    try {
      const res: ValidationResult = await validateConnection(workmailDetails)
      setValidationResult(res)
      if (!res.valid) return

      await addService(workmailDetails)
      toast({
        title: 'AWS WorkMail Connected',
        description: 'Employee email monitoring is now enabled via WorkMail.',
      })

      setIsWorkmailDialogOpen(false)
      setWorkmailDetails({
        serviceType: 'aws-workmail' as const,
        organizationId: '',
        region: '',
        alias: '',
      })
      setValidationResult(null)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: err.message,
      })
    } finally {
      setIsValidating(false)
    }
  }

  // ─── Edit / Update / Delete ───────────────────────────────────────────────────
  const handleEdit = (svcId: string) => {
    const svc = services.find(s => s.id === svcId)
    if (!svc) return

    setEditingServiceId(svcId)
    if (svc.serviceType === 'aws-cognito') {
      setEditingServiceType('aws-cognito')
      setCognitoDetails({
        serviceType: 'aws-cognito' as const,
        userPoolId: svc.userPoolId || '',
        clientId: svc.clientId || '',
        clientSecret: '',
        region: svc.region || '',
      })
    } else {
      setEditingServiceType('aws-workmail')
      setWorkmailDetails({
        serviceType: 'aws-workmail' as const,
        organizationId: svc.organizationId || '',
        region: svc.region || '',
        alias: svc.alias || '',
      })
    }
    setIsEditDialogOpen(true)
  }

  const handleUpdate = async () => {
    if (!editingServiceId || !editingServiceType) return
    setIsValidating(true)
    try {
      if (editingServiceType === 'aws-cognito') {
        if (!validateCognito()) return
        const res: ValidationResult = await validateConnection(cognitoDetails)
        setValidationResult(res)
        if (!res.valid) return

        await updateService(editingServiceId, cognitoDetails)
      } else {
        if (!validateWorkmail()) return
        const res: ValidationResult = await validateConnection(workmailDetails)
        setValidationResult(res)
        if (!res.valid) return

        await updateService(editingServiceId, workmailDetails)
      }

      toast({
        title: 'Service Updated',
        description: `${
          editingServiceType === 'aws-cognito' ? 'Cognito' : 'WorkMail'
        } configuration updated.`,
      })

      setIsEditDialogOpen(false)
      setEditingServiceId(null)
      setEditingServiceType(null)
      setValidationResult(null)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Update Error',
        description: err.message,
      })
    } finally {
      setIsValidating(false)
    }
  }

  const handleDelete = (svcId: string) => {
    setEditingServiceId(svcId)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!editingServiceId) return
    try {
      await removeService(editingServiceId)
      toast({
        title: 'Service Removed',
        description: 'Cloud service has been disconnected.',
      })
      setIsDeleteDialogOpen(false)
      setEditingServiceId(null)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Removal Error',
        description: err.message,
      })
    }
  }

  // ─── Validate Handler ─────────────────────────────────────────────────────────
  const handleValidate = async () => {
    setValidationResult(null)
    setIsValidating(true)
    try {
      const details: AddServiceDetails =
        editingServiceType === 'aws-cognito' || isCognitoDialogOpen
          ? cognitoDetails
          : workmailDetails

      const res: ValidationResult = await validateConnection(details)
      setValidationResult(res)
    } catch (err: any) {
      setValidationResult({
        valid: false,
        message: err.message || 'Validation failed',
      })
    } finally {
      setIsValidating(false)
    }
  }

  // Region dropdown + tooltip
  const RegionSelector = ({
    id,
    value,
    onChange,
  }: {
    id: string
    value: string
    onChange: (v: string) => void
  }) => (
    <div className="flex flex-col space-y-1 col-span-3">
      <div className="flex space-x-2">
        <select
          id={id}
          className="flex h-10 w-full rounded-md border border-[#1f1f1f] bg-[#1f1f1f] px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Select a region
          </option>
          {VALID_AWS_REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                AWS region where this service is deployed.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )

  return (
    <AppLayout username="John Doe" notificationsCount={0}>
      <FadeInSection>
        <div className="space-y-8">
          <Alert className="bg-blue-900/20 border-blue-500/20 text-white">
            <AlertTitle className="text-white">Cloud Services</AlertTitle>
            <AlertDescription className="text-gray-300">
              Connect AWS Cognito for security-team logins and AWS
              WorkMail to monitor employee mail for threats.
            </AlertDescription>
          </Alert>

          {/* ── Cognito Section ─────────────────────────────────────────────── */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Users className="h-5 w-5 text-white" />
                    Security Team Identity Provider
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    AWS Cognito → manage your security team's access.
                  </CardDescription>
                </div>
                {cognitoServices.length === 0 ? (
                  <Dialog
                    open={isCognitoDialogOpen}
                    onOpenChange={setIsCognitoDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                        <Plus className="mr-2 h-4 w-4" />
                        Connect Cognito
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">Connect AWS Cognito</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Provide your User Pool ID, Client ID & secret,
                          and Region.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Alert
                          variant="default"
                          className="bg-blue-900/20 border-blue-500/20 text-white"
                        >
                          <Info className="h-4 w-4 text-blue-400" />
                          <AlertTitle className="text-white">
                            Cognito Configuration
                          </AlertTitle>
                          <AlertDescription className="text-sm text-gray-300">
                            You'll find these in the AWS Cognito Console.
                          </AlertDescription>
                        </Alert>

                        {/* form fields */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="userPoolId"
                            className="text-right text-white"
                          >
                            User Pool ID
                          </Label>
                          <div className="col-span-3 space-y-1">
                            <Input
                              id="userPoolId"
                              value={cognitoDetails.userPoolId}
                              onChange={(e) =>
                                setCognitoDetails((p) => ({
                                  ...p,
                                  userPoolId: e.target.value,
                                }))
                              }
                              placeholder="us-east-1_abcdefghi"
                              className="bg-[#2a2a2a] border-[#2a2a2a] text-white placeholder:text-gray-400"
                            />
                            <p className="text-xs text-muted-foreground">
                              format: region_identifier
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="clientId" className="text-right">
                            Client ID
                          </Label>
                          <Input
                            id="clientId"
                            className="col-span-3"
                            value={cognitoDetails.clientId}
                            onChange={(e) =>
                              setCognitoDetails((p) => ({
                                ...p,
                                clientId: e.target.value,
                              }))
                            }
                            placeholder="1a2b3c4d5e6f…"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="clientSecret"
                            className="text-right"
                          >
                            Client Secret
                          </Label>
                          <Input
                            id="clientSecret"
                            type="password"
                            className="col-span-3"
                            value={cognitoDetails.clientSecret}
                            onChange={(e) =>
                              setCognitoDetails((p) => ({
                                ...p,
                                clientSecret: e.target.value,
                              }))
                            }
                            placeholder="App client secret"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="cog-region" className="text-right">
                            Region
                          </Label>
                          <RegionSelector
                            id="cog-region"
                            value={cognitoDetails.region}
                            onChange={(v) =>
                              setCognitoDetails((p) => ({
                                ...p,
                                region: v,
                              }))
                            }
                          />
                        </div>

                        {validationResult && (
                          <Alert
                            variant={
                              validationResult.valid
                                ? 'default'
                                : 'destructive'
                            }
                            className="mt-4"
                          >
                            {validationResult.valid ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                            <AlertTitle>
                              {validationResult.valid
                                ? 'Ready to Connect'
                                : 'Validation Error'}
                            </AlertTitle>
                            <AlertDescription>
                              {validationResult.message}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsCognitoDialogOpen(false)
                            setCognitoDetails({
                              serviceType: 'aws-cognito' as const,
                              userPoolId: '',
                              clientId: '',
                              clientSecret: '',
                              region: '',
                            })
                            setValidationResult(null)
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleValidate}
                          disabled={isValidating || loading}
                        >
                          {isValidating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Validating…
                            </>
                          ) : (
                            'Validate'
                          )}
                        </Button>
                        <Button
                          onClick={handleConnectCognito}
                          disabled={loading || isValidating}
                        >
                          {loading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting…
                            </>
                          ) : (
                            'Connect'
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <div className="space-y-4 p-4">
                    {cognitoServices.map((svc) => (
                      <div
                        key={svc.id}
                        className="border border-[#1f1f1f] rounded-lg p-4 bg-[#1f1f1f]"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-medium">
                              {svc.name}
                            </h3>
                            <Badge className="bg-green-500/10 text-green-500">
                              <Check className="mr-1 h-3 w-3" />
                              Connected
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={refresh}
                              disabled={loading}
                            >
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
                              onClick={() =>
                                router.push(
                                  '/admin/company-settings/user-management'
                                )
                              }
                            >
                              Manage Users
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(svc.id)}
                            >
                              <Edit className="mr-1 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500"
                              onClick={() => handleDelete(svc.id)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          {[
                            ['User Pool ID', svc.userPoolId || '—'],
                            ['Region', svc.region || '—'],
                            ['Client ID', svc.clientId || '—'],
                            ['Users', svc.userCount.toString()],
                          ].map(([label, val]) => (
                            <div
                              key={label}
                              className="border border-[#2a2a2a] rounded p-3 bg-[#0f0f0f]"
                            >
                              <p className="text-sm font-medium mb-1 text-gray-300">
                                {label}
                              </p>
                              <p className="text-sm text-white truncate">
                                {val}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* ── WorkMail Section ─────────────────────────────────────────────── */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Mail className="h-5 w-5 text-white" />
                    Employee Email Service
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    AWS WorkMail → monitor employee emails for threats.
                  </CardDescription>
                </div>
                {workmailServices.length === 0 ? (
                  <Dialog
                    open={isWorkmailDialogOpen}
                    onOpenChange={setIsWorkmailDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                        <Plus className="mr-2 h-4 w-4" />
                        Connect WorkMail
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">Connect AWS WorkMail</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Provide your Organization ID & Region.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Alert
                          variant="default"
                          className="bg-blue-900/20 border-blue-500/20 text-white"
                        >
                          <Info className="h-4 w-4 text-blue-400" />
                          <AlertTitle className="text-white">
                            WorkMail Configuration
                          </AlertTitle>
                          <AlertDescription className="text-sm text-gray-300">
                            Find these in the AWS WorkMail Console.
                          </AlertDescription>
                        </Alert>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="organizationId"
                            className="text-right text-white"
                          >
                            Org ID
                          </Label>
                          <div className="col-span-3 space-y-1">
                            <Input
                              id="organizationId"
                              value={workmailDetails.organizationId}
                              onChange={(e) =>
                                setWorkmailDetails((p) => ({
                                  ...p,
                                  organizationId: e.target.value,
                                }))
                              }
                              placeholder="m-xxxxxxxxxxxxxxxxx"
                              className="bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                            />
                            <p className="text-xs text-gray-400">
                              must start with "m-"
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="alias" className="text-right text-white">
                            Alias (opt.)
                          </Label>
                          <Input
                            id="alias"
                            className="col-span-3 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                            value={workmailDetails.alias}
                            onChange={(e) =>
                              setWorkmailDetails((p) => ({
                                ...p,
                                alias: e.target.value,
                              }))
                            }
                            placeholder="display alias"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="wm-region"
                            className="text-right text-white"
                          >
                            Region
                          </Label>
                          <RegionSelector
                            id="wm-region"
                            value={workmailDetails.region}
                            onChange={(v) =>
                              setWorkmailDetails((p) => ({
                                ...p,
                                region: v,
                              }))
                            }
                          />
                        </div>
                        {validationResult && (
                          <Alert
                            variant={
                              validationResult.valid
                                ? 'default'
                                : 'destructive'
                            }
                            className="mt-4"
                          >
                            {validationResult.valid ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                            <AlertTitle>
                              {validationResult.valid
                                ? 'Ready to Connect'
                                : 'Validation Error'}
                            </AlertTitle>
                            <AlertDescription>
                              {validationResult.message}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsWorkmailDialogOpen(false)
                            setWorkmailDetails({
                              serviceType: 'aws-workmail' as const,
                              organizationId: '',
                              region: '',
                              alias: '',
                            })
                            setValidationResult(null)
                          }}
                          className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleValidate}
                          disabled={isValidating || loading}
                          className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                        >
                          {isValidating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Validating…
                            </>
                          ) : (
                            'Validate'
                          )}
                        </Button>
                        <Button
                          onClick={handleConnectWorkmail}
                          disabled={loading || isValidating}
                          className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting…
                            </>
                          ) : (
                            'Connect'
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <div className="space-y-4 p-4">
                    {workmailServices.map((svc) => (
                      <div
                        key={svc.id}
                        className="border border-[#1f1f1f] rounded-lg p-4 bg-[#1f1f1f]"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-medium">
                              {svc.name}
                            </h3>
                            <Badge className="bg-green-500/10 text-green-500">
                              <Check className="mr-1 h-3 w-3" />
                              Connected
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={refresh}
                              disabled={loading}
                            >
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
                              onClick={() =>
                                router.push(
                                  '/admin/company-settings/user-management'
                                )
                              }
                            >
                              Manage Employees
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(svc.id)}
                            >
                              <Edit className="mr-1 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500"
                              onClick={() => handleDelete(svc.id)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          {[
                            [
                              'Organization ID',
                              svc.organizationId || '—',
                            ],
                            ['Region', svc.region || '—'],
                            ['Alias', svc.alias || '—'],
                            ['Employees', svc.userCount.toString()],
                          ].map(([label, val]) => (
                            <div
                              key={label}
                              className="border border-[#2a2a2a] rounded p-3 bg-[#0f0f0f]"
                            >
                              <p className="text-sm font-medium mb-1 text-gray-300">
                                {label}
                              </p>
                              <p className="text-sm text-white truncate">
                                {val}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* ── Edit Dialog ───────────────────────────────────────────────────── */}
          <Dialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
          >
            <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
              <DialogHeader>
                <DialogTitle className="text-white">
                  Edit{' '}
                  {editingServiceType === 'aws-cognito'
                    ? 'AWS Cognito'
                    : 'AWS WorkMail'}
                  Configuration
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  Update your{' '}
                  {editingServiceType === 'aws-cognito'
                    ? 'identity provider'
                    : 'email service'}{' '}
                  settings.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {editingServiceType === 'aws-cognito' ? (
                  <>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="edit-userPoolId"
                        className="text-right"
                      >
                        User Pool ID
                      </Label>
                      <Input
                        id="edit-userPoolId"
                        className="col-span-3"
                        value={cognitoDetails.userPoolId}
                        onChange={(e) =>
                          setCognitoDetails((p) => ({
                            ...p,
                            userPoolId: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="edit-clientId"
                        className="text-right"
                      >
                        Client ID
                      </Label>
                      <Input
                        id="edit-clientId"
                        className="col-span-3"
                        value={cognitoDetails.clientId}
                        onChange={(e) =>
                          setCognitoDetails((p) => ({
                            ...p,
                            clientId: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="edit-clientSecret"
                        className="text-right"
                      >
                        Client Secret
                      </Label>
                      <Input
                        id="edit-clientSecret"
                        type="password"
                        className="col-span-3"
                        value={cognitoDetails.clientSecret}
                        onChange={(e) =>
                          setCognitoDetails((p) => ({
                            ...p,
                            clientSecret: e.target.value,
                          }))
                        }
                        placeholder="Leave blank to keep current"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="edit-cog-region"
                        className="text-right"
                      >
                        Region
                      </Label>
                      <RegionSelector
                        id="edit-cog-region"
                        value={cognitoDetails.region}
                        onChange={(v) =>
                          setCognitoDetails((p) => ({
                            ...p,
                            region: v,
                          }))
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="edit-orgId"
                        className="text-right"
                      >
                        Org ID
                      </Label>
                      <Input
                        id="edit-orgId"
                        className="col-span-3"
                        value={workmailDetails.organizationId}
                        onChange={(e) =>
                          setWorkmailDetails((p) => ({
                            ...p,
                            organizationId: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="edit-alias" className="text-right">
                        Alias
                      </Label>
                      <Input
                        id="edit-alias"
                        className="col-span-3"
                        value={workmailDetails.alias}
                        onChange={(e) =>
                          setWorkmailDetails((p) => ({
                            ...p,
                            alias: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="edit-wm-region"
                        className="text-right"
                      >
                        Region
                      </Label>
                      <RegionSelector
                        id="edit-wm-region"
                        value={workmailDetails.region}
                        onChange={(v) =>
                          setWorkmailDetails((p) => ({
                            ...p,
                            region: v,
                          }))
                        }
                      />
                    </div>
                  </>
                )}

                {validationResult && (
                  <Alert
                    variant={
                      validationResult.valid
                        ? 'default'
                        : 'destructive'
                    }
                  >
                    {validationResult.valid ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    <AlertTitle>
                      {validationResult.valid
                        ? 'Ready to Update'
                        : 'Validation Error'}
                    </AlertTitle>
                    <AlertDescription>
                      {validationResult.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingServiceId(null)
                    setEditingServiceType(null)
                    setValidationResult(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleValidate}
                  disabled={isValidating || loading}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating…
                    </>
                  ) : (
                    'Validate'
                  )}
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={loading || isValidating}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    'Update'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── Delete Confirmation ─────────────────────────────────────────────── */}
          <AlertDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Remove Cloud Service
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will disconnect the service and you'll lose
                  associated access until you reconnect.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setIsDeleteDialogOpen(false)
                    setEditingServiceId(null)
                  }}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 hover:bg-red-600"
                  onClick={confirmDelete}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}