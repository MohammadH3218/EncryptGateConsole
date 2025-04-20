// Types for investigation state management
export interface InvestigationState {
  id: string
  emailId: string
  emailSubject: string
  sender: string
  timestamp: string
  lastUpdated: string
  notes?: string
  progress: number // 0-100
}

// Get all in-progress investigations
export function getInProgressInvestigations(): InvestigationState[] {
  if (typeof window === "undefined") return []

  const storedInvestigations = localStorage.getItem("inProgressInvestigations")
  if (!storedInvestigations) return []

  try {
    return JSON.parse(storedInvestigations)
  } catch (error) {
    console.error("Failed to parse investigations:", error)
    return []
  }
}

// Save an investigation state
export function saveInvestigationState(investigation: InvestigationState): void {
  if (typeof window === "undefined") return

  const investigations = getInProgressInvestigations()
  const existingIndex = investigations.findIndex((inv) => inv.id === investigation.id)

  if (existingIndex >= 0) {
    investigations[existingIndex] = {
      ...investigation,
      lastUpdated: new Date().toISOString(),
    }
  } else {
    investigations.push({
      ...investigation,
      lastUpdated: new Date().toISOString(),
    })
  }

  localStorage.setItem("inProgressInvestigations", JSON.stringify(investigations))
}

// Remove an investigation (when completed)
export function removeInvestigation(id: string): void {
  if (typeof window === "undefined") return

  const investigations = getInProgressInvestigations()
  const updatedInvestigations = investigations.filter((inv) => inv.id !== id)

  localStorage.setItem("inProgressInvestigations", JSON.stringify(updatedInvestigations))
}

// Get a specific investigation by ID
export function getInvestigation(id: string): InvestigationState | null {
  const investigations = getInProgressInvestigations()
  return investigations.find((inv) => inv.id === id) || null
}
