import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "../../../hooks/src/hook-common.ts";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", ".qe", "docs"]);
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|py|java|go|rs|rb|cs)$/;
const TEST_RE = /(\.(test|spec)\.[a-z]+$|^test_.*\.py$|_test\.(py|go)$|Test\.java$)/;

function countFiles(dir: string, acc = { source: 0, test: 0 }): { source: number; test: number } {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) countFiles(join(dir, e.name), acc);
    } else if (SOURCE_RE.test(e.name)) {
      if (TEST_RE.test(e.name)) acc.test++;
      else acc.source++;
    }
  }
  return acc;
}

export interface ScanResult {
  languages: string[];
  frameworks: string[];
  testRunners: string[];
  manifests: string[];
  sourceFileCount: number;
  testFileCount: number;
  /** brownfield = source or tests exist; greenfield = nothing to scan yet */
  mode: "greenfield" | "brownfield";
}

export function scanRepository(repoPath: string): ScanResult {
  const result: ScanResult = {
    languages: [],
    frameworks: [],
    testRunners: [],
    manifests: [],
    sourceFileCount: 0,
    testFileCount: 0,
    mode: "greenfield"
  };

  if (!existsSync(repoPath)) {
    throw new Error(`Repository path '${repoPath}' does not exist.`);
  }

  const checkPackageJson = (pkgPath: string) => {
    if (existsSync(pkgPath)) {
      result.manifests.push("package.json");
      if (!result.languages.includes("TypeScript")) result.languages.push("TypeScript", "JavaScript");
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps.next && !result.frameworks.includes("Next.js")) result.frameworks.push("Next.js");
        if (allDeps.react && !result.frameworks.includes("React")) result.frameworks.push("React");
        if (allDeps.express && !result.frameworks.includes("Express")) result.frameworks.push("Express");
        if (allDeps.vitest && !result.testRunners.includes("vitest")) result.testRunners.push("vitest");
        if (allDeps.jest && !result.testRunners.includes("jest")) result.testRunners.push("jest");
        if (allDeps["@playwright/test"] && !result.testRunners.includes("playwright")) result.testRunners.push("playwright");
      } catch {}
    }
  };

  // Check root and frontend workspace
  checkPackageJson(join(repoPath, "package.json"));
  checkPackageJson(join(repoPath, "frontend/package.json"));

  const pyprojectPath = join(repoPath, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    result.manifests.push("pyproject.toml");
    if (!result.languages.includes("Python")) result.languages.push("Python");
    if (!result.testRunners.includes("pytest")) result.testRunners.push("pytest");
  }

  const counts = countFiles(repoPath);
  result.sourceFileCount = counts.source;
  result.testFileCount = counts.test;
  if (counts.source + counts.test > 0 || result.manifests.length > 0) result.mode = "brownfield";

  return result;
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scan-repo.ts <repo-dir>");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(scanRepository(dir), null, 2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
