/** Business calendar date label in UTC+7 for audit screens. */
export function businessDateLabel(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 10);
}
