import { celestrakTleBlockSchema } from '@satellite-tracker/shared';

export type ParsedTle = {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
};

/** Parse CelesTrak gp.php TLE text (name + line1 + line2 per satellite). */
export function parseGpTleText(raw: string): ParsedTle[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ParsedTle[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i]!;
    const line1 = lines[i + 1]!;
    const line2 = lines[i + 2]!;
    if (!line1.startsWith('1') || !line2.startsWith('2')) {
      // skip malformed block
      continue;
    }
    const block = celestrakTleBlockSchema.safeParse({ name, line1, line2 });
    if (!block.success) continue;
    const noradRaw = line1.slice(2, 7).trim();
    const noradId = Number(noradRaw);
    if (!Number.isFinite(noradId)) continue;
    out.push({ noradId, name: block.data.name.trim(), line1: block.data.line1, line2: block.data.line2 });
  }
  return out;
}

/** TLE epoch on line1: YYDDD.dddddddd -> Date (UTC). */
export function tleEpochToDate(line1: string): Date {
  const epochStr = line1.slice(18, 32).trim();
  const yy = parseInt(epochStr.slice(0, 2), 10);
  const ddd = parseFloat(epochStr.slice(2));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const dayOfYear = Math.floor(ddd);
  const fraction = ddd - dayOfYear;
  const start = Date.UTC(year, 0, 1);
  const ms = start + (dayOfYear - 1) * 86400000 + fraction * 86400000;
  return new Date(ms);
}
