/** Parse cached sales order JSON payload from SQLite. */
export function parseOrderPayload(payloadJson: string): Record<string, unknown> {
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Staff orders are scoped to assignee on server; mirror that in local cache. */
export function isOrderAssignedToUser(payloadJson: string, userId: number): boolean {
  const payload = parseOrderPayload(payloadJson);
  return Number(payload.assigned_to_user_id) === userId;
}
