"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Plus, Trash2, CheckSquare, Square, Loader2, AlertTriangle, ExternalLink, UserPlus } from "lucide-react"

interface ITTeamMember {
  username: string
  name: string
  email: string
}

interface CognitoUser {
  username: string
  name: string
  email: string
}

export function ITTeamList() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState("")
  const [itTeamMembers, setITTeamMembers] = useState<ITTeamMember[]>([])
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // Cognito integration
  const [cognitoUsers, setCognitoUsers] = useState<CognitoUser[]>([])
  const [selectedCognitoUsers, setSelectedCognitoUsers] = useState<Set<string>>(new Set())
  const [loadingCognitoUsers, setLoadingCognitoUsers] = useState(false)
  const [cognitoError, setCognitoError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Fetch IT Team members
  const fetchITTeamMembers = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/company-settings/users", {
        headers: { "x-org-id": orgId },
      })

      if (response.ok) {
        const data = await response.json()
        setITTeamMembers(data)
      } else {
        const errorData = await response.json()
        console.error("Failed to fetch IT team members:", errorData)
      }
    } catch (error) {
      console.error("Error fetching IT team members:", error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch available Cognito pool users
  const fetchCognitoUsers = async () => {
    setLoadingCognitoUsers(true)
    setCognitoError(null)
    try {
      const res = await fetch("/api/company-settings/users/pool", {
        headers: { "x-org-id": orgId },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || data.message || "Failed to fetch Cognito users")
      }

      const data: CognitoUser[] = await res.json()

      // Filter out users already in the team
      const existingEmails = new Set(itTeamMembers.map(m => m.email))
      const availableUsers = data.filter(user => !existingEmails.has(user.email))

      setCognitoUsers(availableUsers)
    } catch (err: any) {
      console.error("Error fetching Cognito users:", err)
      setCognitoError(err.message)
    } finally {
      setLoadingCognitoUsers(false)
    }
  }

  useEffect(() => {
    fetchITTeamMembers()
  }, [])

  // Handle opening add dialog
  const handleOpenAddDialog = () => {
    setIsAddDialogOpen(true)
    fetchCognitoUsers()
  }

  // Handle adding selected IT team members
  const handleAddMembers = async () => {
    if (selectedCognitoUsers.size === 0) {
      toast({
        variant: "destructive",
        title: "No users selected",
        description: "Please select at least one user to add to the IT team.",
      })
      return
    }

    setAdding(true)
    try {
      const usersToAdd = cognitoUsers.filter(user => selectedCognitoUsers.has(user.username))

      for (const user of usersToAdd) {
        const res = await fetch("/api/company-settings/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
          },
          body: JSON.stringify({
            username: user.username,
            name: user.name,
            email: user.email,
          }),
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to add user")
        }
      }

      toast({
        title: "IT Team members added",
        description: `Successfully added ${usersToAdd.length} member(s) to the IT team.`,
      })

      setIsAddDialogOpen(false)
      setSelectedCognitoUsers(new Set())
      fetchITTeamMembers()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error adding IT team members",
        description: err.message,
      })
    } finally {
      setAdding(false)
    }
  }

  // Handle deleting selected IT team members
  const handleDeleteMembers = async () => {
    setDeleting(true)
    try {
      for (const username of selectedMembers) {
        const res = await fetch(`/api/company-settings/users/${encodeURIComponent(username)}`, {
          method: "DELETE",
          headers: { "x-org-id": orgId },
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to remove user")
        }
      }

      toast({
        title: "IT Team members removed",
        description: `Successfully removed ${selectedMembers.size} member(s) from the IT team.`,
      })

      setSelectedMembers(new Set())
      setIsDeleteDialogOpen(false)
      fetchITTeamMembers()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error removing IT team members",
        description: err.message,
      })
    } finally {
      setDeleting(false)
    }
  }

  // Filter IT team members based on search query
  const filteredMembers = useMemo(() => {
    return itTeamMembers.filter((member) =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.username.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [itTeamMembers, searchQuery])

  // Select all IT team members
  const handleSelectAll = () => {
    if (selectedMembers.size === filteredMembers.length) {
      setSelectedMembers(new Set())
    } else {
      setSelectedMembers(new Set(filteredMembers.map(m => m.username)))
    }
  }

  // Toggle member selection
  const toggleMemberSelection = (username: string) => {
    const newSelected = new Set(selectedMembers)
    if (newSelected.has(username)) {
      newSelected.delete(username)
    } else {
      newSelected.add(username)
    }
    setSelectedMembers(newSelected)
  }

  // Toggle Cognito user selection
  const toggleCognitoUserSelection = (username: string) => {
    const newSelected = new Set(selectedCognitoUsers)
    if (newSelected.has(username)) {
      newSelected.delete(username)
    } else {
      newSelected.add(username)
    }
    setSelectedCognitoUsers(newSelected)
  }

  // Select all Cognito users
  const handleSelectAllCognitoUsers = () => {
    if (selectedCognitoUsers.size === cognitoUsers.length) {
      setSelectedCognitoUsers(new Set())
    } else {
      setSelectedCognitoUsers(new Set(cognitoUsers.map(u => u.username)))
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter IT team members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[300px] bg-[#1f1f1f] border-[#2a2a2a] text-white"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
          >
            {selectedMembers.size === filteredMembers.length && filteredMembers.length > 0 ? (
              <>
                <CheckSquare className="mr-2 h-4 w-4" />
                Deselect All
              </>
            ) : (
              <>
                <Square className="mr-2 h-4 w-4" />
                Select All
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenAddDialog}
            className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add IT Team Members
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={selectedMembers.size === 0}
            className="bg-[#1f1f1f] border-[#2a2a2a] text-red-500 hover:bg-[#2a2a2a] hover:text-red-400 disabled:opacity-50"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove ({selectedMembers.size})
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="border-none bg-[#0f0f0f] shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="text-white">Name</TableHead>
              <TableHead className="text-white">Username</TableHead>
              <TableHead className="text-white">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-white py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading IT team members...
                </TableCell>
              </TableRow>
            ) : filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-400 py-8">
                  No IT team members found. Click "Add IT Team Members" to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <TableRow
                  key={member.username}
                  className="cursor-pointer hover:bg-[#1f1f1f] border-[#1f1f1f]"
                  onClick={() => toggleMemberSelection(member.username)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedMembers.has(member.username)}
                      onCheckedChange={() => toggleMemberSelection(member.username)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-white">{member.name}</TableCell>
                  <TableCell className="text-white">{member.username}</TableCell>
                  <TableCell className="text-white">{member.email}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add IT Team Members Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Add IT Team Members from Cognito</DialogTitle>
            <DialogDescription className="text-gray-400">
              Select users from your AWS Cognito user pool to add to the IT team.
            </DialogDescription>
          </DialogHeader>

          {cognitoError ? (
            <Alert variant="destructive" className="bg-red-900/20 border-red-500/20">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Cognito Not Connected</AlertTitle>
              <AlertDescription className="mt-2">
                {cognitoError}
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/o/${orgId}/admin/company-settings/cloud-services`)}
                    className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Go to Cloud Services
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : loadingCognitoUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-gray-400">Loading Cognito users...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  {cognitoUsers.length} available users
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllCognitoUsers}
                  className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                >
                  {selectedCognitoUsers.size === cognitoUsers.length && cognitoUsers.length > 0
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>

              <div className="border border-[#2a2a2a] rounded-md max-h-[400px] overflow-y-auto">
                {cognitoUsers.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    No available users found in Cognito user pool.
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {cognitoUsers.map((user) => (
                      <div
                        key={user.username}
                        className="flex items-center space-x-3 p-3 rounded-md hover:bg-[#1f1f1f] cursor-pointer"
                        onClick={() => toggleCognitoUserSelection(user.username)}
                      >
                        <Checkbox
                          checked={selectedCognitoUsers.has(user.username)}
                          onCheckedChange={() => toggleCognitoUserSelection(user.username)}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-white">{user.name}</p>
                          <p className="text-sm text-gray-400">{user.email}</p>
                          <p className="text-xs text-gray-500">@{user.username}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false)
                setSelectedCognitoUsers(new Set())
              }}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMembers}
              disabled={selectedCognitoUsers.size === 0 || adding || !!cognitoError}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              {adding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>Add {selectedCognitoUsers.size} Member(s)</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Remove IT Team Members</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to remove {selectedMembers.size} member(s) from the IT team?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteMembers}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                <>Remove</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
