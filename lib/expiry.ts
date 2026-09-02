/** Calendar dates in Chile, independent of the server/browser timezone. */
export function daysUntil(date: string, now = new Date()) {
  if (!date) return Infinity;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value);
  const [year, month, day] = date.split('-').map(Number);
  return (
    Math.round(
      Date.UTC(year, month - 1, day) -
        Date.UTC(part('year'), part('month') - 1, part('day')),
    ) / 86400000
  );
}

export function formatExpiry(date: string) {
  return date
    ? new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${date}T12:00:00`))
    : 'Sin vencimiento';
}
