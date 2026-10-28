import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";

// Execute the real server modules with explicit service doubles, without Next.js
// or credentials. Type checking remains a separate `tsc --noEmit` check.
export function loadTypeScript(relativePath, dependencies, globals = {}) {
  const filename = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const loadedModule = { exports: {} };
  const requireDependency = (id) => {
    if (!Object.hasOwn(dependencies, id)) {
      throw new Error(`Unexpected dependency: ${id}`);
    }
    return dependencies[id];
  };
  const execute = compileFunction(outputText,
    ["require", "module", "exports", "process", "console"], { filename });
  execute(requireDependency, loadedModule, loadedModule.exports,
    globals.process ?? { env: {} }, globals.console ?? console);

  return loadedModule.exports;
}
