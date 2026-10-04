// Build-time version consistency check. No dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DECL_RE = /\b(?:const|let|var)\s+\w*VERSION\w*\s*(?::\s*string\s*)?=\s*["'](\d+\.\d+\.\d+)["']/g;

function readJsonVersion(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

function readText(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return null; }
}

export function checkVersions(root = process.cwd()) {
  const errors = [];
  const warnings = [];
  const versions = {};

  const pkg = readJsonVersion(path.join(root, "package.json"));
  const vj = readJsonVersion(path.join(root, "public/version.json"));
  if (pkg) versions["package.json"] = pkg; else errors.push("package.json has no version.");
  if (vj) versions["public/version.json"] = vj; else errors.push("public/version.json has no version.");

  const constants = [];
  for (const file of walk(path.join(root, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(DECL_RE)) {
      constants.push({ file: path.relative(root, file).split(path.sep).join("/"), value: m[1] });
    }
  }
  if (constants.length === 0) errors.push("No version constant found in src/ (expected src/constants/version.ts).");
  if (constants.length > 1) {
    errors.push(
      `More than one hard-coded version constant in src/: ${constants.map((c) => `${c.file}=${c.value}`).join(", ")} → only src/constants/version.ts may declare one.`,
    );
  }
  for (const c of constants) versions[c.file] = c.value;

  const distinct = new Set(Object.values(versions));
  if (distinct.size > 1) {
    errors.push(
      `Version mismatch: ${Object.entries(versions).map(([k, v]) => `${k}=${v}`).join(", ")} → make all equal.`,
    );
  }

  const version = pkg ?? vj ?? constants[0]?.value;
  if (version) {
    const cl = readText(path.join(root, "CHANGELOG.md"))?.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
    if (cl && cl !== version) warnings.push(`CHANGELOG.md latest entry is ${cl}, expected ${version}.`);
    const dc = readText(path.join(root, "src/data/changelog.ts"))?.match(/version:\s*["'](\d+\.\d+\.\d+)["']/)?.[1];
    if (dc && dc !== version) warnings.push(`src/data/changelog.ts latest entry is ${dc}, expected ${version}.`);
    const rd = readText(path.join(root, "README.md"))?.match(/\*\*Current version: (\d+\.\d+\.\d+)\*\*/)?.[1];
    if (rd && rd !== version) warnings.push(`README.md current version is ${rd}, expected ${version}.`);
  }

  return { versions, errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { versions, errors, warnings } = checkVersions();
  console.log("Version check:");
  for (const [k, v] of Object.entries(versions)) console.log(`  ${k}: ${v}`);
  for (const w of warnings) console.warn(`  WARN  ${w}`);
  for (const e of errors) console.error(`  ERROR ${e}`);
  if (errors.length) process.exit(1);
  console.log("  OK");
}
