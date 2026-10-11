import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Use the first existing folder of `candidates`, otherwise the first candidate. */
export function resolveDir(cwd: string, candidates: string[], explicit?: string): string {
  if (explicit) return resolve(cwd, explicit);
  for (const d of candidates) {
    const p = resolve(cwd, d);
    if (existsSync(p)) return p;
  }
  return resolve(cwd, candidates[0]);
}

/** Next free number, based on files named like "0007-some-title.md". */
export function nextNumber(dir: string): number {
  if (!existsSync(dir)) return 1;
  const nums = readdirSync(dir)
    .map((f) => /^(\d+)-.*\.md$/i.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/** Write the file; refuses to overwrite an existing one. */
export function saveDocument(dir: string, fileName: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, fileName);
  writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
  return path;
}
