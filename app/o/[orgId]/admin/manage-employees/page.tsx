"use client"

import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { EmployeesList } from "@/components/employees-list"
import { ITTeamList } from "@/components/it-team-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Info } from "lucide-react"

export default function ManageEmployeesPage() {
  return (
    <AppLayout notificationsCount={0}>
      <FadeInSection>
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Manage Employees</h2>
            <p className="text-gray-400 mt-1">
              Manage your monitored employees and IT team members
            </p>
          </div>

          <Alert className="bg-blue-900/20 border-blue-500/20">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertTitle className="text-white">Two Types of Users</AlertTitle>
            <AlertDescription className="text-gray-300 mt-2">
              <strong className="text-white">Employees:</strong> Monitored users from AWS WorkMail whose emails are analyzed for threats.
              <br />
              <strong className="text-white">IT Team:</strong> SOC analysts from AWS Cognito who use this platform to investigate detections.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="employees" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 bg-[#1f1f1f] border-[#1f1f1f]">
              <TabsTrigger
                value="employees"
                className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white"
              >
                Monitored Employees
              </TabsTrigger>
              <TabsTrigger
                value="it-team"
                className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white"
              >
                IT Team (SOC Analysts)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="employees" className="mt-0">
              <EmployeesList />
            </TabsContent>
            <TabsContent value="it-team" className="mt-0">
              <ITTeamList />
            </TabsContent>
          </Tabs>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}
