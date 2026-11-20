/** Calculate whole years on a calendar date without relying on the browser timezone. */
export function ageOnDate(birthDate: string, today: string): number | null {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!valid(birthDate) || !valid(today) || birthDate > today) return null;
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return years - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
}
