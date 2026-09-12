export function formatAuditLabel(
  value: string,
): string {
  const normalizedValue = value
    .toLowerCase()
    .replaceAll('_', ' ');

  return (
    normalizedValue.charAt(0).toUpperCase() +
    normalizedValue.slice(1)
  );
}