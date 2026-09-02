export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const acceptedTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function fileError(file: Pick<File, 'size' | 'type'>): string | null {
  if (!file.size) return 'El archivo está vacío. Selecciona otro archivo.';
  if (file.size > MAX_FILE_SIZE) return 'El archivo supera los 10 MB.';
  if (!acceptedTypes.has(file.type))
    return 'Usa un PDF o imagen JPG, PNG, WEBP o HEIC.';
  return null;
}

export function validExpiration(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function searchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function compareExpiration(a: string, b: string) {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return a.localeCompare(b);
}
