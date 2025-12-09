"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import { FadeInSection } from "@/components/fade-in-section";
import { useRouter, useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2 } from "lucide-react";
import { getInProgressInvestigations } from "@/lib/investigation-service";
import { cn } from "@/lib/utils";
import { AssignmentsList } from "@/components/assignments-list";

interface Assignment {
  id: number;
  uniqueId: string;
  severity: string;
  name: string;
  status: string;
  assignedTo: string[];
  sentBy: string;
  timestamp: string;
  description: string;
  indicators: string[];
  recommendations: string[];
}

const mockAssignments: Assignment[] = [];
type Investigation = ReturnType<typeof getInProgressInvestigations>[0];

interface InvestigationWithSeverity extends Investigation {
  severity: string;
}

export default function AssignmentsPage() {
  const params = useParams();
  const [searchQuery] = useState("");
  const [assignments] = useState<Assignment[]>(mockAssignments);
  const [inProgressInvestigations, setInProgressInvestigations] = useState<
    InvestigationWithSeverity[]
  >([]);
  const [activeTab, setActiveTab] = useState("continue");
  const router = useRouter();

  useEffect(() => {
    // Load in-progress investigations from API
    const loadInvestigations = async () => {
      try {
        const response = await fetch('/api/investigations?status=active&limit=100');
        if (response.ok) {
          const investigations = await response.json();
          
          // Transform API response to match component interface
          const investigationsWithSeverity = investigations.map((inv: any) => ({
            id: inv.investigationId || inv.emailMessageId,
            emailId: inv.emailMessageId,
            emailSubject: inv.emailSubject || inv.findings || 'Investigation',
            sender: inv.sender || 'Unknown',
            timestamp: inv.createdAt || new Date().toISOString(),
            lastUpdated: inv.updatedAt || inv.createdAt || new Date().toISOString(),
            severity: inv.priority === 'critical' ? 'Critical' : 
                     inv.priority === 'high' ? 'High' : 
                     inv.priority === 'medium' ? 'Medium' : 'Low',
            progress: inv.progress || 0,
            notes: inv.notes,
          }));

          // Sort by severity (Critical -> High -> Medium -> Low)
          const sortedInvestigations = investigationsWithSeverity.sort((a, b) => {
            const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
            return (
              severityOrder[a.severity as keyof typeof severityOrder] -
              severityOrder[b.severity as keyof typeof severityOrder]
            );
          });

          setInProgressInvestigations(sortedInvestigations);
        } else {
          console.error('Failed to load investigations:', response.status);
          // Fallback to localStorage if API fails
          const investigations = getInProgressInvestigations();
          const investigationsWithSeverity = investigations.map((inv) => ({
            ...inv,
            severity: "Low",
          }));
          setInProgressInvestigations(investigationsWithSeverity);
        }
      } catch (error) {
        console.error('Error loading investigations:', error);
        // Fallback to localStorage if API fails
        const investigations = getInProgressInvestigations();
        const investigationsWithSeverity = investigations.map((inv) => ({
          ...inv,
          severity: "Low",
        }));
        setInProgressInvestigations(investigationsWithSeverity);
      }
    };

    loadInvestigations();
    // Refresh every 30 seconds
    const interval = setInterval(loadInvestigations, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleContinueInvestigation = (id: string) => {
    const encodedId = encodeURIComponent(id);
    window.open(`/investigate/${encodedId}`, "_blank", "noopener,noreferrer");
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "bg-red-600 text-white";
      case "High":
        return "bg-orange-500 text-white";
      case "Medium":
        return "bg-yellow-500 text-white";
      case "Low":
        return "bg-green-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  return (
    <AppLayout notificationsCount={1}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4 text-app-textPrimary">
          Assignments
        </h2>

        <Tabs
          defaultValue={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-app-elevated border-app-border">
            <TabsTrigger
              value="continue"
              className="relative text-app-textPrimary data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary"
            >
              Continue Investigations
              {inProgressInvestigations.length > 0 && (
                <Badge className="ml-2 bg-blue-600 text-white">
                  {inProgressInvestigations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="new"
              className="relative text-app-textPrimary data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary"
            >
              New Assignments
              {assignments.length > 0 && (
                <Badge className="ml-2 bg-blue-600 text-white">
                  {assignments.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="continue">
            <Card className="bg-app-surface border-none text-app-textPrimary hover:bg-app-elevated transition-all duration-300">
              <CardHeader>
                <CardTitle className="text-white">
                  In-Progress Investigations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {inProgressInvestigations.length > 0 ? (
                  <div className="space-y-4">
                    {inProgressInvestigations.map((investigation) => (
                      <div
                        key={investigation.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-app-border bg-app-elevated hover:bg-app-overlay transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          <div className="bg-[#2a2a2a] rounded-full p-2">
                            <Clock className="h-5 w-5 text-gray-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-white">
                                {investigation.emailSubject}
                              </h3>
                              <Badge
                                className={cn(
                                  "text-xs",
                                  getSeverityBadgeClass(investigation.severity),
                                )}
                              >
                                {investigation.severity}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-400">
                              From: {investigation.sender}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Last updated:{" "}
                              {new Date(
                                investigation.lastUpdated,
                              ).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() =>
                            handleContinueInvestigation(investigation.id)
                          }
                          className="ml-4 bg-app-elevated border-app-border text-app-textPrimary hover:bg-app-overlay hover:border-app-border/60"
                        >
                          Continue
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle2 className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-white">
                      No in-progress investigations
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      All your investigations are complete
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <AssignmentsList
              searchQuery={searchQuery}
              assignments={assignments}
            />
          </TabsContent>
        </Tabs>
      </FadeInSection>
    </AppLayout>
  );
}
