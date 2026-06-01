import { REQUEST_ID_HEADER } from '../../../middleware/request-id.middleware';
import type { AuditLogEntry } from './monitor.service';
import type { AdminRequest } from './admin-auth.types';

export function resolveRequestId(request: AdminRequest): string {
  const header = request.headers?.[REQUEST_ID_HEADER];
  const requestId = Array.isArray(header) ? header[0] : header;
  return requestId?.trim() || 'unknown-request';
}

export function buildAuditLogEntry(params: {
  adminId: string;
  method: string;
  route: string;
  statusCode: number;
  requestId?: string;
  timestamp?: string;
}): AuditLogEntry {
  const route = params.route;
  const method = params.method;
  const requestId = params.requestId?.trim() || 'unknown-request';

  return {
    adminId: params.adminId,
    action: `${method} ${route}`,
    target: route,
    outcome: params.statusCode >= 400 ? 'failure' : 'success',
    requestId,
    route,
    method,
    statusCode: params.statusCode,
    timestamp: params.timestamp ?? new Date().toISOString(),
  };
}

export function buildAuditLogEntryFromRequest(
  request: AdminRequest,
  params: {
    adminId: string;
    method: string;
    route: string;
    statusCode: number;
  },
): AuditLogEntry {
  return buildAuditLogEntry({
    ...params,
    requestId: resolveRequestId(request),
  });
}
