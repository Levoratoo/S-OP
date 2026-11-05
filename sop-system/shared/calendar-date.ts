/** Data de calendário (YYYY-MM-DD ou meia-noite UTC) em dd/mm/aaaa, sem deslocar o fuso. */
export function formatCalendarDate(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "-";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "-";
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${day}/${month}/${year}`;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function calendarToday(now = new Date(), timeZone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Não foi possível ler a data de hoje");
  }
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Data inválida: ${isoDate}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
