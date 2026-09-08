export type StructuredLogRecord = Record<
  string,
  unknown
>

export function sanitizeLogText(
  value: string,
  maximumLength: number,
): string {
  let sanitizedValue = ''

  for (const character of value) {
    const codePoint = character.codePointAt(0)

    const isControlCharacter =
      codePoint !== undefined &&
      (
        codePoint <= 31 ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029
      )

    sanitizedValue += isControlCharacter
      ? ' '
      : character
  }

  return sanitizedValue
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength)
}

export function serializeStructuredLog(
  record: StructuredLogRecord,
): string {
  return `${JSON.stringify(record)}\n`
}

export function writeStructuredLog(
  destination: 'stdout' | 'stderr',
  record: StructuredLogRecord,
): void {
  const serializedRecord =
    serializeStructuredLog(record)

  if (destination === 'stdout') {
    process.stdout.write(serializedRecord)
    return
  }

  process.stderr.write(serializedRecord)
}