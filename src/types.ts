export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type IncidentStatus = 'ACTIVE' | 'RESOLVED';
export type StaffStatus = 'RESPONDING' | 'AVAILABLE' | 'ON_BREAK' | 'OFF_FLOOR';
export type LogLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'SYSTEM' | 'LOG' | 'SUCCESS';

export interface AIClassification {
  type: string;
  severityScore: number;
  justification: string;
  responseProtocol: string;
  estimatedStaffNeeded: number;
  urgencyLevel: string;
}

export interface Incident {
  id: string;
  type: string;
  location: string;
  description: string;
  severity: Severity;
  status: IncidentStatus | string;
  assigneeId: string | null;
  timestamp: number;
  classification?: AIClassification;
  isProcessing?: boolean;
  assignedStaff?: any[];
  source?: string;
  roomNumber?: string;
  urgencyLevel?: string;
  severityScore?: number;
  responseProtocol?: string;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  status: StaffStatus;
  location: string | null;
  color: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
}

