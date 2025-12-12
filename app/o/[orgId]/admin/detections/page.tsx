// app/admin/detections/page.tsx - UPDATED VERSION with proper URL encoding
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { FadeInSection } from "@/components/fade-in-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Shield,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Users,
  Activity,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Flag,
  FlagOff,
  Clock,
  UserCheck,
  ArrowUp,
} from "lucide-react";
import { InvestigationAssignmentDialog } from "@/components/investigation-assignment-dialog";
import { PushToAdminDialog } from "@/components/push-to-admin-dialog";

interface Detection {
  id: string;
  detectionId: string;
  emailMessageId: string;
  severity: "low" | "medium" | "high" | "critical";
  name: string;
  status: "new" | "in_progress" | "resolved" | "false_positive";
  assignedTo: string[];
  sentBy: string;
  timestamp: string;
  description: string;
  indicators: string[];
  recommendations: string[];
  threatScore: number;
  confidence: number;
  createdAt: string;
  manualFlag?: boolean;
}

interface DetectionsStats {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
  falsePositives: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  manualFlags: number;
  aiFlags: number;
}

// Helper function to decode JWT and get user info
const getUserInfoFromTokens = () => {
  try {
    const decodeToken = (token: string) =>
      JSON.parse(atob(token.split(".")[1]));

    const idToken = localStorage.getItem("id_token");
    const accessToken = localStorage.getItem("access_token");

    // Prefer ID token for profile information, fallback to access token
    const tokenData = idToken
      ? decodeToken(idToken)
      : accessToken
        ? decodeToken(accessToken)
        : {};

    const email =
      tokenData.email ||
      tokenData["cognito:username"] ||
      tokenData.username ||
      "";
    const name =
      tokenData.preferred_username ||
      tokenData.name ||
      tokenData.given_name ||
      tokenData.nickname ||
      email;
    const id = tokenData.sub || tokenData["cognito:username"] || email;
    const role =
      tokenData["cognito:groups"]?.[0] || tokenData["custom:role"] || "admin";

    return { id, email, name, role };
  } catch (error) {
    console.error("Failed to decode tokens:", error);
    return { id: "", email: "", name: "", role: "" };
  }
};

export default function AdminDetectionsPage() {
  const router = useRouter();
  const params = useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [filteredDetections, setFilteredDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<DetectionsStats>({
    total: 0,
    new: 0,
    inProgress: 0,
    resolved: 0,
    falsePositives: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    manualFlags: 0,
    aiFlags: 0,
  });

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [flagTypeFilter, setFlagTypeFilter] = useState<string>("all"); // NEW: Filter by manual/AI flags

  // Sorting
  const [sortField, setSortField] = useState<"createdAt" | "severity" | "status">("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Pagination
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const itemsPerPage = 25;

  // Unflag functionality - IMPROVED
  const [unflagConfirm, setUnflagConfirm] = useState<{
    show: boolean;
    detection: Detection | null;
  }>({
    show: false,
    detection: null,
  });
  const [unflaggingId, setUnflaggingId] = useState<string | null>(null);

  // Status update functionality - NEW
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [assigningDetection, setAssigningDetection] = useState<string | null>(
    null,
  );

  // Investigation assignment dialog
  const [assignmentDialog, setAssignmentDialog] = useState<{
    isOpen: boolean;
    detection: Detection | null;
    warnings: any[];
    assignedUsers: string[];
  }>({
    isOpen: false,
    detection: null,
    warnings: [],
    assignedUsers: [],
  });

  // Push to admin dialog
  const [pushToAdminDialog, setPushToAdminDialog] = useState<{
    isOpen: boolean;
    detection: Detection | null;
  }>({
    isOpen: false,
    detection: null,
  });

  // Assignment dialog state
  const [assignmentUsers, setAssignmentUsers] = useState<
    Array<{
      id: string;
      name: string;
      email: string;
      preferredUsername: string;
    }>
  >([]);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [detectionToAssign, setDetectionToAssign] = useState<Detection | null>(
    null,
  );
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");

  // User profile state
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: string;
    permissions: string[];
  } | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);

  // Load Security Team Users for assignment
  const loadSecurityTeamUsers = async () => {
    try {
      const response = await fetch("/api/company-settings/users", {
        headers: {
          "x-org-id": params.orgId as string,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const users = (data.users || []).map((user: any) => ({
          id: user.email, // Use email as ID for consistency
          name: user.name || user.email,
          email: user.email,
          preferredUsername: user.name || user.email.split("@")[0], // Fallback to email prefix if no name
        }));
        setAssignmentUsers(users);
        console.log(
          "✅ Loaded security team users for assignment:",
          users.length,
        );
      } else {
        console.warn(
          "Failed to load security team users:",
          response.statusText,
        );
      }
    } catch (error) {
      console.error("Failed to load security team users:", error);
    }
  };

  // Load current user profile - fallback to JWT tokens if API fails
  useEffect(() => {
    const loadUserProfile = async () => {
      setIsUserLoading(true);
      try {
        // First try to load from API
        const response = await fetch("/api/user/profile", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const profile = await response.json();
          setCurrentUser({
            id: profile.id,
            name: profile.preferred_username || profile.name || profile.email,
            email: profile.email,
            role: profile.role || "user",
            permissions: profile.permissions || [],
          });
        } else {
          // Fallback: Extract user info from JWT tokens
          console.log("API profile failed, using token fallback");
          const userInfo = getUserInfoFromTokens();
          if (userInfo.email) {
            setCurrentUser({
              id: userInfo.id || userInfo.email,
              name: userInfo.name || userInfo.email,
              email: userInfo.email,
              role: userInfo.role || "admin",
              permissions: ["investigate", "push_to_admin"], // Default permissions
            });
          } else {
            throw new Error("No valid user data found");
          }
        }
      } catch (error) {
        console.error("Failed to load user profile:", error);
        // Final fallback: Try to extract from tokens
        const userInfo = getUserInfoFromTokens();
        if (userInfo.email) {
          setCurrentUser({
            id: userInfo.id || userInfo.email,
            name: userInfo.name || userInfo.email,
            email: userInfo.email,
            role: "admin",
            permissions: ["investigate", "push_to_admin"],
          });
        }
      } finally {
        setIsUserLoading(false);
      }
    };
    loadUserProfile();
    loadSecurityTeamUsers();
  }, []);

  // Clear messages after some time
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Load detections on component mount
  useEffect(() => {
    loadDetections(true);
  }, []);

  // Apply filters whenever search query or filter values change
  useEffect(() => {
    applyFilters();
    calculateStats();
  }, [
    searchQuery,
    detections,
    severityFilter,
    statusFilter,
    assignmentFilter,
    flagTypeFilter,
  ]);

  const loadDetections = async (reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
      });

      if (!reset && lastKey) {
        params.append("lastKey", lastKey);
      }

      console.log("🚨 Loading detections...");
      // Pass orgId in header so API can filter correctly
      const orgId = params.orgId as string;
      const response = await fetch(`/api/detections?${params}`, {
        headers: {
          'x-org-id': orgId,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.details || errorData.error || "Failed to load detections",
        );
      }

      const data: Detection[] = await response.json();
      console.log(`✅ Loaded ${data.length} detections`);

      if (reset) {
        setDetections(data);
      } else {
        setDetections((prev) => [...prev, ...data]);
      }

      // For mock data, we don't have pagination info
      setHasMore(data.length === itemsPerPage);
    } catch (err) {
      console.error("❌ Error loading detections:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load detections",
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreDetections = useCallback(() => {
    if (hasMore && !loading && !loadingMore) {
      loadDetections(false);
    }
  }, [hasMore, loading, loadingMore]);

  const applyFilters = () => {
    let filtered = detections;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (detection) =>
          detection.name.toLowerCase().includes(query) ||
          detection.sentBy.toLowerCase().includes(query) ||
          detection.description.toLowerCase().includes(query) ||
          detection.indicators.some((indicator) =>
            indicator.toLowerCase().includes(query),
          ),
      );
    }

    // Severity filter
    if (severityFilter !== "all") {
      filtered = filtered.filter(
        (detection) => detection.severity === severityFilter,
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (detection) => detection.status === statusFilter,
      );
    }

    // Assignment filter
    if (assignmentFilter !== "all") {
      if (assignmentFilter === "unassigned") {
        filtered = filtered.filter(
          (detection) => detection.assignedTo.length === 0,
        );
      } else if (assignmentFilter === "assigned") {
        filtered = filtered.filter(
          (detection) => detection.assignedTo.length > 0,
        );
      }
    }

    // NEW: Flag type filter
    if (flagTypeFilter !== "all") {
      if (flagTypeFilter === "manual") {
        filtered = filtered.filter(
          (detection) => detection.manualFlag === true,
        );
      } else if (flagTypeFilter === "ai") {
        filtered = filtered.filter(
          (detection) => detection.manualFlag !== true,
        );
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortField === "createdAt") {
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
      } else if (sortField === "severity") {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        aValue = severityOrder[a.severity as keyof typeof severityOrder] || 0;
        bValue = severityOrder[b.severity as keyof typeof severityOrder] || 0;
      } else if (sortField === "status") {
        const statusOrder = { new: 1, in_progress: 2, resolved: 3, false_positive: 4 };
        aValue = statusOrder[a.status as keyof typeof statusOrder] || 0;
        bValue = statusOrder[b.status as keyof typeof statusOrder] || 0;
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredDetections(filtered);
  };

  const handleSort = (field: "createdAt" | "severity" | "status") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const calculateStats = () => {
    const newStats: DetectionsStats = {
      total: detections.length,
      new: detections.filter((d) => d.status === "new").length,
      inProgress: detections.filter((d) => d.status === "in_progress").length,
      resolved: detections.filter((d) => d.status === "resolved").length,
      falsePositives: detections.filter((d) => d.status === "false_positive")
        .length,
      critical: detections.filter((d) => d.severity === "critical").length,
      high: detections.filter((d) => d.severity === "high").length,
      medium: detections.filter((d) => d.severity === "medium").length,
      low: detections.filter((d) => d.severity === "low").length,
      manualFlags: detections.filter((d) => d.manualFlag === true).length,
      aiFlags: detections.filter((d) => d.manualFlag !== true).length,
    };
    setStats(newStats);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <Badge variant="destructive" className="bg-red-600">
            Critical
          </Badge>
        );
      case "high":
        return (
          <Badge variant="destructive" className="bg-orange-500">
            High
          </Badge>
        );
      case "medium":
        return (
          <Badge variant="destructive" className="bg-amber-600 text-white">
            Medium
          </Badge>
        );
      case "low":
        return (
          <Badge variant="outline" className="border-blue-500 text-blue-400">
            Low
          </Badge>
        );
      default:
        return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="destructive">New</Badge>;
      case "in_progress":
        return <Badge variant="secondary">In Progress</Badge>;
      case "resolved":
        return (
          <Badge variant="outline" className="border-green-500 text-green-500">
            Resolved
          </Badge>
        );
      case "false_positive":
        return <Badge variant="outline">False Positive</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "new":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "in_progress":
        return <Activity className="h-4 w-4 text-yellow-500" />;
      case "resolved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "false_positive":
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getFlagTypeBadge = (detection: Detection) => {
    if (detection.manualFlag === true) {
      return (
        <Badge variant="outline" className="border-orange-500 text-orange-500">
          <Flag className="h-3 w-3 mr-1" />
          Manual
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="border-purple-500 text-purple-500">
          <Shield className="h-3 w-3 mr-1" />
          AI
        </Badge>
      );
    }
  };

  const handleInvestigate = async (detection: Detection) => {
    if (isUserLoading) {
      setError("Please wait while user profile is loading...");
      return;
    }

    if (!currentUser) {
      setError(
        "Unable to load user profile. Please refresh the page and try again.",
      );
      return;
    }

    try {
      console.log("🔍 Starting investigation for detection:", detection.id);

      // Try to check for existing investigation and potential conflicts (optional - fail gracefully)
      let hasConflicts = false;
      try {
        const assignmentResponse = await fetch("/api/user/investigations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            investigationId: detection.id,
            assignToUserId: currentUser?.id || "",
          }),
        });

        if (assignmentResponse.ok) {
          const assignmentResult = await assignmentResponse.json();

          // If there are warnings/conflicts, show dialog
          if (
            assignmentResult.warnings &&
            assignmentResult.warnings.length > 0
          ) {
            setAssignmentDialog({
              isOpen: true,
              detection: detection,
              warnings: assignmentResult.warnings,
              assignedUsers: assignmentResult.assignedUsers || [],
            });
            hasConflicts = true;
          }
        } else if (assignmentResponse.status === 404) {
          console.log(
            "Assignment check API not available, proceeding with investigation",
          );
        } else {
          console.warn(
            "Assignment check failed with status:",
            assignmentResponse.status,
          );
        }
      } catch (assignmentError) {
        console.log(
          "Assignment check API failed (may not exist), proceeding with investigation:",
          assignmentError,
        );
      }

      // If no conflicts detected, proceed directly to investigation
      if (!hasConflicts) {
        await proceedWithInvestigation(detection);
      }
    } catch (error) {
      console.error("❌ Failed to start investigation:", error);
      // Instead of blocking the user, let them proceed to investigation
      console.log("🔄 Proceeding with investigation despite error");
      await proceedWithInvestigation(detection);
    }
  };

  const proceedWithInvestigation = async (detection: Detection) => {
    try {
      console.log("🔍 Proceeding with investigation for detection:", {
        detectionId: detection.id,
        emailMessageId: detection.emailMessageId,
      });

      // Encode the email message ID for URL safety
      const encodedMessageId = encodeURIComponent(detection.emailMessageId);
      console.log("🔗 Encoded messageId for navigation:", encodedMessageId);

      // Try to check if investigation already exists (optional - fail gracefully)
      let shouldCreateNew = true;
      try {
        const existingResponse = await fetch(
          `/api/investigations/${encodedMessageId}`,
        );
        if (existingResponse.ok) {
          console.log("✅ Investigation already exists, updating assignment");
          shouldCreateNew = false;

          // Try to update existing investigation assignment (optional)
          try {
            await fetch(`/api/investigations/${encodedMessageId}/assign`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                investigatorId: currentUser?.id || "",
                investigatorName: currentUser?.name || "",
              }),
            });
          } catch (assignError) {
            console.log(
              "Assignment update failed, proceeding anyway:",
              assignError,
            );
          }
        } else if (existingResponse.status === 404) {
          console.log("Investigation does not exist, will create new one");
        }
      } catch (checkError) {
        console.log(
          "Investigation check API failed (may not exist), proceeding with creation:",
          checkError,
        );
      }

      // Try to create new investigation if needed (optional - fail gracefully)
      if (shouldCreateNew) {
        try {
          console.log(
            "📝 Creating new investigation for detection:",
            detection.id,
          );
          const createResponse = await fetch("/api/investigations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              emailMessageId: detection.emailMessageId,
              detectionId: detection.detectionId,
              investigatorName: currentUser?.name || "",
              investigatorId: currentUser?.id || "",
              priority:
                detection.severity === "critical"
                  ? "critical"
                  : detection.severity === "high"
                    ? "high"
                    : "medium",
              emailSubject: detection.name,
              sender: detection.sentBy,
              severity: detection.severity,
            }),
          });

          if (createResponse.ok) {
            console.log("✅ Investigation created successfully");
            // Try to mark detection as in progress (optional)
            try {
              await updateDetectionStatus(detection.id, "in_progress");
            } catch (statusError) {
              console.log(
                "Status update failed, proceeding anyway:",
                statusError,
              );
            }
          } else {
            console.log(
              "Investigation creation failed, proceeding with navigation anyway",
            );
          }
        } catch (createError) {
          console.log(
            "Investigation creation API failed (may not exist), proceeding with navigation:",
            createError,
          );
        }
      }

      // Navigate to investigation page (this should always work)
      const orgId = params.orgId as string;
      const navigationUrl = `/o/${orgId}/admin/investigate/${encodedMessageId}`;
      console.log("🧭 Opening investigation tab:", navigationUrl);

      window.open(navigationUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("❌ Unexpected error during investigation setup:", error);
      // Always try to navigate to investigation page as last resort
      const orgId = params.orgId as string;
      const fallbackUrl = `/o/${orgId}/admin/investigate/${encodeURIComponent(detection.emailMessageId)}`;
      console.log("🔄 Fallback investigation tab:", fallbackUrl);
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Update detection status helper
  const updateDetectionStatus = async (detectionId: string, status: string) => {
    try {
      setUpdatingStatus(detectionId);
      const response = await fetch(`/api/detections/${encodeURIComponent(detectionId)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Update local state
        setDetections((prev) =>
          prev.map((d) =>
            d.id === detectionId ? { ...d, status: status as any } : d,
          ),
        );
        setSuccessMessage(`Detection status updated to ${status}`);
        console.log(`✅ Detection ${detectionId} status updated to ${status}`);
      } else {
        console.log(
          `⚠️ Status update API returned ${response.status}, updating local state anyway`,
        );
        // Update local state even if API fails
        setDetections((prev) =>
          prev.map((d) =>
            d.id === detectionId ? { ...d, status: status as any } : d,
          ),
        );
        setSuccessMessage(`Detection status updated locally to ${status}`);
      }
    } catch (error) {
      console.log(
        "Status update API failed (may not exist), updating local state:",
        error,
      );
      // Update local state even if API doesn't exist
      setDetections((prev) =>
        prev.map((d) =>
          d.id === detectionId ? { ...d, status: status as any } : d,
        ),
      );
      setSuccessMessage(`Detection status updated locally to ${status}`);
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Assignment dialog handlers
  const handleAssignmentDialogConfirm = async () => {
    if (!assignmentDialog.detection) return;

    await proceedWithInvestigation(assignmentDialog.detection);
    setAssignmentDialog({
      isOpen: false,
      detection: null,
      warnings: [],
      assignedUsers: [],
    });
  };

  const handleAssignmentDialogClose = () => {
    setAssignmentDialog({
      isOpen: false,
      detection: null,
      warnings: [],
      assignedUsers: [],
    });
  };

  // Push to admin functionality
  const handlePushToAdmin = (detection: Detection) => {
    if (!currentUser?.permissions.includes("push_to_admin")) {
      setError("You do not have permission to escalate investigations.");
      return;
    }

    setPushToAdminDialog({ isOpen: true, detection });
  };

  const handlePushToAdminConfirm = async (reason: string, category: string) => {
    if (!pushToAdminDialog.detection || !currentUser) return;

    try {
      const response = await fetch("/api/admin/pushed-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investigationId: pushToAdminDialog.detection.id,
          reason: `${category}: ${reason}`,
        }),
      });

      if (response.ok) {
        // Update detection status to escalated
        await updateDetectionStatus(
          pushToAdminDialog.detection.id,
          "escalated",
        );
        setSuccessMessage(
          "Investigation escalated to administrators successfully.",
        );
        setPushToAdminDialog({ isOpen: false, detection: null });
      } else {
        setError("Failed to escalate investigation to administrators.");
      }
    } catch (error) {
      console.error("Failed to push to admin:", error);
      setError("Failed to escalate investigation.");
    }
  };

  const handlePushToAdminClose = () => {
    setPushToAdminDialog({ isOpen: false, detection: null });
  };

  const refreshDetections = () => {
    console.log("🔄 Refreshing detections...");
    loadDetections(true);
  };

  const handleUnflagClick = (detection: Detection) => {
    setUnflagConfirm({ show: true, detection });
  };

  const handleUnflagConfirm = async () => {
    if (!unflagConfirm.detection) return;

    const detection = unflagConfirm.detection;
    setUnflaggingId(detection.id);
    setError(null);
    setSuccessMessage(null);

    try {
      console.log("🚩 Unflagging detection:", detection.detectionId);

      const response = await fetch(`/api/detections/${encodeURIComponent(detection.detectionId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        let errorMessage = 'Unknown error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorData.details || errorMessage;
        } catch (e) {
          // If response is not JSON, try to get text
          try {
            errorMessage = await response.text() || `HTTP ${response.status}`;
          } catch {
            errorMessage = `HTTP ${response.status}`;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log("✅ Detection unflagged successfully:", result);

      // Immediately remove the detection from local state for instant UI update
      setDetections((prev) => prev.filter((d) => d.id !== detection.id));

      // Show success message
      setSuccessMessage(
        `Detection "${detection.name}" has been successfully unflagged and marked as clean. The email status has been updated.`,
      );

      // Close confirmation dialog immediately
      setUnflagConfirm({ show: false, detection: null });

      // Optional: Refresh data to ensure consistency
      setTimeout(() => {
        loadDetections(true);
      }, 2000);
    } catch (err: any) {
      console.error("❌ Failed to unflag detection:", err);
      setError(`Failed to unflag detection: ${err.message}`);
      // Keep the dialog open on error so user can retry
    } finally {
      setUnflaggingId(null);
    }
  };

  const handleUnflagCancel = () => {
    setUnflagConfirm({ show: false, detection: null });
  };

  // Show assignment dialog
  const showAssignmentDialog = (detection: Detection) => {
    setDetectionToAssign(detection);
    setSelectedAssignee("");
    setAssignmentDialogOpen(true);
  };

  // Assign detection to selected user
  const assignDetection = async () => {
    if (!detectionToAssign || !selectedAssignee) return;

    setAssigningDetection(detectionToAssign.id);
    setError(null);

    try {
      // Find the selected user details
      const assignedUser = assignmentUsers.find(
        (u) => u.preferredUsername === selectedAssignee,
      );
      if (!assignedUser) {
        throw new Error("Selected user not found");
      }

      // Update detection with assignment
      setDetections((prev) =>
        prev.map((d) =>
          d.id === detectionToAssign.id
            ? {
                ...d,
                assignedTo: [assignedUser.preferredUsername],
                status: "in_progress" as any,
              }
            : d,
        ),
      );

      setSuccessMessage(
        `Detection assigned to ${assignedUser.preferredUsername} and marked as in progress.`,
      );

      // Close dialog
      setAssignmentDialogOpen(false);
      setDetectionToAssign(null);
      setSelectedAssignee("");

      // TODO: Implement actual API call to save assignment
      console.log("🎯 Detection assigned:", {
        detectionId: detectionToAssign.id,
        assignedTo: assignedUser.preferredUsername,
        assignedUser: assignedUser,
      });
    } catch (err: any) {
      console.error("❌ Failed to assign detection:", err);
      setError(`Failed to assign detection: ${err.message}`);
    } finally {
      setAssigningDetection(null);
    }
  };

  // Cancel assignment dialog
  const cancelAssignment = () => {
    setAssignmentDialogOpen(false);
    setDetectionToAssign(null);
    setSelectedAssignee("");
  };

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 1000
      ) {
        loadMoreDetections();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMoreDetections]);

  if (error && detections.length === 0) {
    return (
      <AppLayout notificationsCount={3}>
        <FadeInSection>
          <Alert
            variant="destructive"
            className="mb-6 bg-red-900/20 border-red-500/20 text-white"
          >
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-white">
              Error Loading Detections
            </AlertTitle>
            <AlertDescription className="text-gray-300">
              {error}
            </AlertDescription>
          </Alert>
          <Card className="border-red-500/20 bg-[#0f0f0f]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="font-medium text-white">
                    Error loading detections
                  </p>
                  <p className="text-sm mt-1 text-gray-400">{error}</p>
                </div>
              </div>
              <Button
                onClick={refreshDetections}
                className="mt-4 bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </FadeInSection>
      </AppLayout>
    );
  }

  return (
    <AppLayout notificationsCount={stats.new}>
      <FadeInSection>
        <div className="space-y-6">
          {/* Success Message */}
          {successMessage && (
            <Alert className="mb-6 bg-green-900/20 border-green-500/20 text-white">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <AlertTitle className="text-white">Success</AlertTitle>
              <AlertDescription className="text-gray-300">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {error && (
            <Alert
              variant="destructive"
              className="mb-6 bg-red-900/20 border-red-500/20 text-white"
            >
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-white">Error</AlertTitle>
              <AlertDescription className="text-gray-300">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                <AlertTriangle className="h-6 w-6 text-white" />
                Security Detections
              </h2>
              <p className="text-gray-400 mt-1">
                Monitor and investigate security threats •{" "}
                {filteredDetections.length} detections shown
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshDetections}
                disabled={loading}
                className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters - UPDATED */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Filter className="h-5 w-5 text-white" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search detections..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Severity
                  </label>
                  <Select
                    value={severityFilter}
                    onValueChange={setSeverityFilter}
                  >
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem
                        value="all"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        All Severities
                      </SelectItem>
                      <SelectItem
                        value="critical"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        Critical
                      </SelectItem>
                      <SelectItem
                        value="high"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        High
                      </SelectItem>
                      <SelectItem
                        value="medium"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        Medium
                      </SelectItem>
                      <SelectItem
                        value="low"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        Low
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Status
                  </label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem
                        value="all"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        All Status
                      </SelectItem>
                      <SelectItem
                        value="new"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        New
                      </SelectItem>
                      <SelectItem
                        value="in_progress"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        In Progress
                      </SelectItem>
                      <SelectItem
                        value="resolved"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        Resolved
                      </SelectItem>
                      <SelectItem
                        value="false_positive"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        False Positive
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Assignment
                  </label>
                  <Select
                    value={assignmentFilter}
                    onValueChange={setAssignmentFilter}
                  >
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem
                        value="all"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        All
                      </SelectItem>
                      <SelectItem
                        value="assigned"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        Assigned
                      </SelectItem>
                      <SelectItem
                        value="unassigned"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        Unassigned
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Flag Type
                  </label>
                  <Select
                    value={flagTypeFilter}
                    onValueChange={setFlagTypeFilter}
                  >
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem
                        value="all"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        All Types
                      </SelectItem>
                      <SelectItem
                        value="manual"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        Manual Flags
                      </SelectItem>
                      <SelectItem
                        value="ai"
                        className="text-white focus:bg-[#2a2a2a] focus:text-white"
                      >
                        AI Flags
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detections Table - UPDATED */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-white">Detection List</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && detections.length === 0 ? (
                <div className="space-y-3 py-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-12 flex-1" />
                      <Skeleton className="h-12 w-32" />
                      <Skeleton className="h-12 w-24" />
                      <Skeleton className="h-12 w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredDetections.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  {detections.length === 0 ? (
                    <div>
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-lg font-medium text-white">
                        No detections found
                      </p>
                      <p className="text-sm text-gray-400">
                        Start monitoring emails to see security detections here.
                      </p>
                    </div>
                  ) : (
                    <p className="text-white">
                      No detections match your current filters.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                          <TableHead className="text-white w-[200px]">
                            Detection
                          </TableHead>
                          <TableHead className="text-white w-[180px]">
                            Sender
                          </TableHead>
                          <TableHead className="text-white w-[90px]">
                            Type
                          </TableHead>
                          <TableHead className="text-white w-[100px]">
                            <button
                              onClick={() => handleSort("severity")}
                              className="flex items-center gap-1 hover:text-white/80 transition-colors"
                            >
                              Severity
                              {sortField === "severity" && (
                                <span className="text-xs">
                                  {sortDirection === "asc" ? "↑" : "↓"}
                                </span>
                              )}
                            </button>
                          </TableHead>
                          <TableHead className="text-white w-[110px]">
                            <button
                              onClick={() => handleSort("status")}
                              className="flex items-center gap-1 hover:text-white/80 transition-colors"
                            >
                              Status
                              {sortField === "status" && (
                                <span className="text-xs">
                                  {sortDirection === "asc" ? "↑" : "↓"}
                                </span>
                              )}
                            </button>
                          </TableHead>
                          <TableHead className="text-white w-[100px]">
                            <button
                              onClick={() => handleSort("createdAt")}
                              className="flex items-center gap-1 hover:text-white/80 transition-colors"
                            >
                              Created
                              {sortField === "createdAt" && (
                                <span className="text-xs">
                                  {sortDirection === "asc" ? "↑" : "↓"}
                                </span>
                              )}
                            </button>
                          </TableHead>
                          <TableHead className="text-white w-[120px]">
                            Assigned
                          </TableHead>
                          <TableHead className="text-white w-[150px]">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence mode="popLayout">
                          {filteredDetections.map((detection, index) => {
                            const severityColor = {
                              critical: "border-l-red-600",
                              high: "border-l-orange-500",
                              medium: "border-l-amber-600",
                              low: "border-l-blue-500",
                            }[detection.severity] || "border-l-gray-500";

                            return (
                              <motion.tr
                                key={detection.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2, delay: index * 0.02 }}
                                className={`hover:bg-[#1f1f1f] border-[#1f1f1f] border-l-4 ${severityColor} transition-all duration-200 hover:shadow-lg hover:translate-x-1 transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]`}
                              >
                            <TableCell className="font-medium text-white max-w-[200px]">
                              <div className="truncate" title={detection.name}>
                                {detection.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-white max-w-[180px]">
                              <div
                                className="truncate text-sm"
                                title={detection.sentBy}
                              >
                                {detection.sentBy}
                              </div>
                            </TableCell>
                            <TableCell>{getFlagTypeBadge(detection)}</TableCell>
                            <TableCell>
                              {getSeverityBadge(detection.severity)}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(detection.status)}
                            </TableCell>
                            <TableCell className="text-white text-sm">
                              {new Date(
                                detection.createdAt,
                              ).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-white max-w-[120px]">
                              {detection.assignedTo.length > 0 ? (
                                <div
                                  className="truncate text-sm"
                                  title={detection.assignedTo.join(", ")}
                                >
                                  {detection.assignedTo[0]}
                                  {detection.assignedTo.length > 1 &&
                                    ` +${detection.assignedTo.length - 1}`}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleInvestigate(detection)}
                                  disabled={isUserLoading}
                                  title={
                                    isUserLoading
                                      ? "Loading user profile..."
                                      : "Investigate"
                                  }
                                  className="text-white hover:bg-[#2a2a2a] hover:text-white p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>

                                {/* Push to Admin button - shown if user has permission */}
                                {currentUser?.permissions.includes(
                                  "push_to_admin",
                                ) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePushToAdmin(detection)}
                                    title="Escalate to Admin"
                                    className="text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 p-2"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                )}

                                {detection.detectionId.startsWith(
                                  "manual-",
                                ) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUnflagClick(detection)}
                                    disabled={unflaggingId === detection.id}
                                    title="Unflag Email"
                                    className="text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 p-2"
                                  >
                                    {unflaggingId === detection.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <FlagOff className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                {detection.status === "new" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      updateDetectionStatus(
                                        detection.id,
                                        "in_progress",
                                      )
                                    }
                                    disabled={updatingStatus === detection.id}
                                    title="Start Investigation"
                                    className="text-yellow-400 hover:bg-yellow-900/30 hover:text-yellow-300 p-2"
                                  >
                                    {updatingStatus === detection.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Clock className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                {detection.assignedTo.length === 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      showAssignmentDialog(detection)
                                    }
                                    disabled={
                                      assignmentUsers.length === 0 ||
                                      assigningDetection === detection.id
                                    }
                                    title={
                                      assignmentUsers.length === 0
                                        ? "Loading users..."
                                        : "Assign Detection"
                                    }
                                    className="text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 p-2"
                                  >
                                    {assigningDetection === detection.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <UserCheck className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>

                  {/* Loading More Indicator */}
                  {loadingMore && (
                    <div className="flex justify-center mt-4 py-4">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2 text-white" />
                      <span className="text-white">
                        Loading more detections...
                      </span>
                    </div>
                  )}

                  {/* End of results indicator */}
                  {!hasMore && detections.length > 0 && (
                    <div className="text-center mt-4 py-4 text-gray-400">
                      All detections loaded
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Unflag Confirmation Dialog - IMPROVED STYLING */}
          {unflagConfirm.show && unflagConfirm.detection && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg w-full max-w-md">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-orange-900/20 rounded-full">
                      <FlagOff className="h-6 w-6 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Unflag Email
                      </h3>
                      <p className="text-sm text-gray-400">
                        Remove this detection and mark email as clean
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 mb-6">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-400">
                          Detection
                        </label>
                        <p className="text-white mt-1">
                          {unflagConfirm.detection.name}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-400">
                          From
                        </label>
                        <p className="text-white mt-1 break-all">
                          {unflagConfirm.detection.sentBy}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-400">
                          Severity
                        </label>
                        <div className="mt-1">
                          {getSeverityBadge(unflagConfirm.detection.severity)}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-400">
                          Type
                        </label>
                        <div className="mt-1">
                          {getFlagTypeBadge(unflagConfirm.detection)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-yellow-300 font-medium">
                          Are you sure?
                        </p>
                        <p className="text-xs text-yellow-400 mt-1">
                          This will permanently remove the detection and mark
                          the email as clean. This action cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handleUnflagCancel}
                      disabled={unflaggingId === unflagConfirm.detection.id}
                      className="flex-1 bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUnflagConfirm}
                      disabled={unflaggingId === unflagConfirm.detection.id}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {unflaggingId === unflagConfirm.detection.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <FlagOff className="h-4 w-4 mr-2" />
                      )}
                      Unflag Email
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Investigation Assignment Dialog */}
        <InvestigationAssignmentDialog
          isOpen={assignmentDialog.isOpen}
          onClose={handleAssignmentDialogClose}
          onConfirm={handleAssignmentDialogConfirm}
          detection={{
            id: assignmentDialog.detection?.id || "",
            emailSubject: assignmentDialog.detection?.name || "",
            sender: assignmentDialog.detection?.sentBy || "",
            severity: assignmentDialog.detection?.severity || "low",
          }}
          warnings={assignmentDialog.warnings}
          assignedUsers={assignmentDialog.assignedUsers}
          currentUser={{
            name: currentUser?.name || "",
            email: currentUser?.email || "",
          }}
        />

        {/* Push to Admin Dialog */}
        <PushToAdminDialog
          isOpen={pushToAdminDialog.isOpen}
          onClose={handlePushToAdminClose}
          onConfirm={handlePushToAdminConfirm}
          detection={{
            id: pushToAdminDialog.detection?.id || "",
            emailSubject: pushToAdminDialog.detection?.name || "",
            sender: pushToAdminDialog.detection?.sentBy || "",
            severity: pushToAdminDialog.detection?.severity || "low",
          }}
          currentUser={{
            name: currentUser?.name || "",
            email: currentUser?.email || "",
          }}
        />

        {/* Assignment Dialog */}
        <Dialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
        >
          <DialogContent className="max-w-md border-app-border bg-app-panel text-white">
            <DialogHeader>
              <DialogTitle className="text-white">Assign Detection</DialogTitle>
              <DialogDescription className="text-gray-400">
                Select a security team member to assign this detection to
              </DialogDescription>
            </DialogHeader>

            {detectionToAssign && (
              <div className="space-y-4">
                <div className="rounded-lg border border-app-border bg-app-surface p-4">
                  <div className="space-y-2">
                    <div>
                      <label className="text-sm font-medium text-gray-400">
                        Detection
                      </label>
                      <p className="text-white">{detectionToAssign.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-400">
                        From
                      </label>
                      <p className="text-white">{detectionToAssign.sentBy}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-400">
                        Severity
                      </label>
                      <div className="mt-1">
                        {getSeverityBadge(detectionToAssign.severity)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">
                    Assign to
                  </label>
                  <Select
                    value={selectedAssignee}
                    onValueChange={setSelectedAssignee}
                  >
                    <SelectTrigger className="bg-app-surface border-app-border text-white">
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent className="border-app-border bg-app-panel">
                      {assignmentUsers.map((user) => (
                        <SelectItem
                          key={user.id}
                          value={user.preferredUsername}
                          className="text-white hover:bg-white/5"
                        >
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="font-medium">
                                {user.preferredUsername}
                              </div>
                              <div className="text-xs text-gray-400">
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={cancelAssignment}
                className="border-app-border bg-app-surface text-white hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                onClick={assignDetection}
                disabled={!selectedAssignee}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Assign Detection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </FadeInSection>
    </AppLayout>
  );
}
