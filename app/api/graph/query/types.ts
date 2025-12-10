import { z } from "zod";

export const SenderGraphParams = z.object({
  senderEmail: z.string().email(),
  from: z.string().optional(),
  to: z.string().optional(),
  minSeverity: z.enum(["low", "medium", "high", "critical"]).optional(),
  organizationId: z.string().optional(),
});

export const CampaignForEmailParams = z.object({
  emailId: z.string(),
  organizationId: z.string().optional(),
});

export const UserEgoParams = z.object({
  userEmail: z.string().email(),
  limit: z.number().int().positive().max(200).optional(),
  organizationId: z.string().optional(),
});

export const DeviceActivityParams = z.object({
  deviceId: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  organizationId: z.string().optional(),
});

export const HighRiskDomainParams = z.object({
  limit: z.number().int().positive().max(100).optional(),
  organizationId: z.string().optional(),
});
