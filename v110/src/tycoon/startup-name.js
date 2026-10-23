export const NAME_LIMIT = 32;
export const cleanName = value => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
export function nameError(value) {
  const name = cleanName(value);
  if (!name) return 'Give your startup a name.';
  if ([...name].length > NAME_LIMIT) return `Keep it to ${NAME_LIMIT} characters or fewer.`;
  if (/[\p{Cc}\p{Cf}]/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) return 'Use a name with letters or numbers, without hidden characters.';
  return '';
}
export function renameStartup(g, value) {
  if (!g?.company || nameError(value)) return false;
  g.company.name = cleanName(value);
  return true;
}
