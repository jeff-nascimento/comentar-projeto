import { z } from "zod";

const roleName = z.string().trim().toUpperCase().min(1).max(50);
const permissionName = z.string().trim().toLowerCase().min(1).max(100);

export const assignRoleBody = z.object({ role: roleName });
export const assignPermissionBody = z.object({ permission: permissionName });

export const userRoleParams = z.object({ id: z.uuid(), role: roleName });
export const userPermissionParams = z.object({ id: z.uuid(), permission: permissionName });
