/**
 * Wire-contract surface report generator.
 *
 * Renders the typed partner-facing surface — the shared endpoint request/response types
 * and the public SDK API — into a canonical, structurally expanded snapshot at
 * docs/api/wire-contract.snapshot.md. Types declared inside this repository are expanded
 * to their structural shape, so a change to a transitively referenced type (an enum
 * value, a union member, a nested field) surfaces in the snapshot even when no endpoint
 * file was edited.
 *
 * Usage:
 *   bun scripts/wire-contract/generate-report.ts --check    # exit 1 if the snapshot is stale (CI)
 *   bun scripts/wire-contract/generate-report.ts --update   # rewrite the snapshot
 *
 * The SDK entry resolves @vortexfi/shared through its built declarations, so run
 * `bun run build:shared` before regenerating if shared changed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import ts from "typescript";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const SNAPSHOT_FILE = resolve(REPO_ROOT, "docs/api/wire-contract.snapshot.md");

const MAX_DEPTH = 9;
const INDENT = "  ";

interface SurfaceEntry {
  heading: string;
  tsconfig: string;
  entry: string;
}

const ENTRIES: SurfaceEntry[] = [
  {
    entry: "packages/shared/src/endpoints/index.ts",
    heading: "packages/shared — partner wire contract (`src/endpoints`)",
    tsconfig: "packages/shared/tsconfig.json"
  },
  {
    entry: "packages/sdk/src/index.ts",
    heading: "packages/sdk — public SDK surface (`src/index.ts`)",
    tsconfig: "packages/sdk/tsconfig.json"
  }
];

interface SerializerContext {
  checker: ts.TypeChecker;
  program: ts.Program;
  stack: Set<ts.Type>;
}

function isExternalDeclaration(ctx: SerializerContext, declaration: ts.Declaration): boolean {
  const file = declaration.getSourceFile();
  if (ctx.program.isSourceFileDefaultLibrary(file)) return true;
  return file.fileName.includes("/node_modules/");
}

function isExternalSymbol(ctx: SerializerContext, symbol: ts.Symbol | undefined): boolean {
  const declarations = symbol?.declarations;
  if (!declarations || declarations.length === 0) return false;
  return declarations.every(declaration => isExternalDeclaration(ctx, declaration));
}

function typeOfSymbol(ctx: SerializerContext, symbol: ts.Symbol): ts.Type {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration) return ctx.checker.getTypeOfSymbolAtLocation(symbol, declaration);
  return ctx.checker.getTypeOfSymbol(symbol);
}

function symbolDisplayName(type: ts.Type): string {
  if (type.aliasSymbol) return type.aliasSymbol.name;
  const name = type.symbol?.name;
  if (name && name !== "__type" && name !== "__object") return name;
  return "…";
}

function indentBlock(text: string): string {
  return text
    .split("\n")
    .map(line => (line.length > 0 ? INDENT + line : line))
    .join("\n");
}

function serializeEnum(ctx: SerializerContext, symbol: ts.Symbol): string {
  const members: string[] = [];
  symbol.exports?.forEach(member => {
    const declaration = member.declarations?.[0];
    if (!declaration || !ts.isEnumMember(declaration)) return;
    const value = ctx.checker.getConstantValue(declaration);
    members.push(`${member.name} = ${typeof value === "string" ? JSON.stringify(value) : String(value)}`);
  });
  members.sort();
  return `enum ${symbol.name} { ${members.join(", ")} }`;
}

function serializeSignature(ctx: SerializerContext, signature: ts.Signature, depth: number): string {
  const parameters = signature.parameters.map(parameter => {
    const declaration = parameter.valueDeclaration;
    const optional =
      declaration &&
      ts.isParameter(declaration) &&
      (declaration.questionToken !== undefined || declaration.initializer !== undefined);
    const rest = declaration && ts.isParameter(declaration) && declaration.dotDotDotToken !== undefined;
    const parameterType = serializeType(ctx, typeOfSymbol(ctx, parameter), depth + 1, { dropUndefined: optional === true });
    return `${rest ? "..." : ""}${parameter.name}${optional ? "?" : ""}: ${parameterType}`;
  });
  const returnType = serializeType(ctx, signature.getReturnType(), depth + 1);
  return `(${parameters.join(", ")}) => ${returnType}`;
}

function serializeObject(ctx: SerializerContext, type: ts.Type, depth: number): string {
  const lines: string[] = [];

  for (const info of ctx.checker.getIndexInfosOfType(type)) {
    const keyType = serializeType(ctx, info.keyType, depth + 1);
    const valueType = serializeType(ctx, info.type, depth + 1);
    lines.push(`[key: ${keyType}]: ${valueType};`);
  }

  const properties = [...ctx.checker.getPropertiesOfType(type)].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  for (const property of properties) {
    const declarations = property.declarations ?? [];
    // Skip members inherited from lib types (e.g. Error.message/stack) and non-public class members.
    if (declarations.length > 0 && declarations.every(declaration => isExternalDeclaration(ctx, declaration))) continue;
    const modifiers = declarations.flatMap(declaration =>
      ts.canHaveModifiers(declaration) ? [...(ts.getModifiers(declaration) ?? [])] : []
    );
    if (
      modifiers.some(
        modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword
      )
    ) {
      continue;
    }
    const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
    const propertyType = serializeType(ctx, typeOfSymbol(ctx, property), depth + 1, { dropUndefined: optional });
    lines.push(`${property.name}${optional ? "?" : ""}: ${propertyType};`);
  }

  if (lines.length === 0) return "{}";
  return `{\n${indentBlock(lines.join("\n"))}\n}`;
}

interface SerializeOptions {
  dropUndefined?: boolean;
}

function serializeType(ctx: SerializerContext, type: ts.Type, depth: number, options: SerializeOptions = {}): string {
  const { checker } = ctx;
  const flags = type.flags;

  if (flags & ts.TypeFlags.EnumLiteral && !(flags & ts.TypeFlags.Union)) {
    return checker.typeToString(type);
  }

  if (type.symbol && type.symbol.flags & ts.SymbolFlags.Enum) {
    if (isExternalSymbol(ctx, type.symbol)) return type.symbol.name;
    return serializeEnum(ctx, type.symbol);
  }

  if (
    flags &
    (ts.TypeFlags.String |
      ts.TypeFlags.Number |
      ts.TypeFlags.Boolean |
      ts.TypeFlags.BigInt |
      ts.TypeFlags.StringLiteral |
      ts.TypeFlags.NumberLiteral |
      ts.TypeFlags.BooleanLiteral |
      ts.TypeFlags.BigIntLiteral |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Null |
      ts.TypeFlags.Void |
      ts.TypeFlags.Never |
      ts.TypeFlags.Unknown |
      ts.TypeFlags.Any |
      ts.TypeFlags.ESSymbol |
      ts.TypeFlags.TypeParameter |
      ts.TypeFlags.Index |
      ts.TypeFlags.TemplateLiteral)
  ) {
    return checker.typeToString(type);
  }

  if (flags & ts.TypeFlags.Union) {
    let parts = (type as ts.UnionType).types;
    if (options.dropUndefined) parts = parts.filter(part => (part.flags & ts.TypeFlags.Undefined) === 0);
    if (parts.length === 1) return serializeType(ctx, parts[0], depth);
    const hasTrue = parts.some(part => checker.typeToString(part) === "true");
    const hasFalse = parts.some(part => checker.typeToString(part) === "false");
    const serialized = parts
      .filter(
        part => !(hasTrue && hasFalse && (checker.typeToString(part) === "true" || checker.typeToString(part) === "false"))
      )
      .map(part => serializeType(ctx, part, depth + 1));
    if (hasTrue && hasFalse) serialized.push("boolean");
    const unique = [...new Set(serialized)].sort();
    return unique.join(" | ");
  }

  if (flags & ts.TypeFlags.Intersection) {
    const serialized = (type as ts.IntersectionType).types.map(part => serializeType(ctx, part, depth + 1));
    return [...new Set(serialized)].sort().join(" & ");
  }

  if (checker.isArrayType(type)) {
    const [element] = checker.getTypeArguments(type as ts.TypeReference);
    return `Array<${element ? serializeType(ctx, element, depth + 1) : "unknown"}>`;
  }

  if (checker.isTupleType(type)) {
    const elements = checker.getTypeArguments(type as ts.TypeReference).map(element => serializeType(ctx, element, depth + 1));
    return `[${elements.join(", ")}]`;
  }

  // Named external types (lib utility types, viem/polkadot types, ...): keep the name, expand in-repo type arguments.
  const referenceSymbol = type.aliasSymbol ?? type.symbol;
  if (isExternalSymbol(ctx, referenceSymbol)) {
    const typeArguments =
      type.aliasSymbol && type.aliasTypeArguments
        ? type.aliasTypeArguments
        : (type as ts.TypeReference).target
          ? checker.getTypeArguments(type as ts.TypeReference)
          : [];
    const name = referenceSymbol?.name ?? checker.typeToString(type);
    if (typeArguments.length === 0) return name;
    return `${name}<${typeArguments.map(argument => serializeType(ctx, argument, depth + 1)).join(", ")}>`;
  }

  if (flags & ts.TypeFlags.Object) {
    if (depth > MAX_DEPTH) return symbolDisplayName(type);
    if (ctx.stack.has(type)) return `<circular ${symbolDisplayName(type)}>`;
    ctx.stack.add(type);
    try {
      const callSignatures = type.getCallSignatures();
      if (callSignatures.length > 0 && ctx.checker.getPropertiesOfType(type).length === 0) {
        return callSignatures.map(signature => serializeSignature(ctx, signature, depth)).join(" & ");
      }
      return serializeObject(ctx, type, depth);
    } finally {
      ctx.stack.delete(type);
    }
  }

  return checker.typeToString(type);
}

function serializeClass(ctx: SerializerContext, symbol: ts.Symbol): string {
  const lines: string[] = [];
  const staticType = typeOfSymbol(ctx, symbol);
  for (const signature of staticType.getConstructSignatures()) {
    const parameters = signature.parameters.map(parameter => {
      const declaration = parameter.valueDeclaration;
      const optional =
        declaration &&
        ts.isParameter(declaration) &&
        (declaration.questionToken !== undefined || declaration.initializer !== undefined);
      return `${parameter.name}${optional ? "?" : ""}: ${serializeType(ctx, typeOfSymbol(ctx, parameter), 1, { dropUndefined: optional === true })}`;
    });
    lines.push(`constructor(${parameters.join(", ")});`);
  }
  const instanceType = ctx.checker.getDeclaredTypeOfSymbol(symbol);
  const body = serializeObject(ctx, instanceType, 0);
  const members =
    body === "{}"
      ? []
      : body
          .slice(2, -2)
          .split("\n")
          .map(line => line.replace(new RegExp(`^${INDENT}`), ""));
  lines.push(...members.filter(line => line.length > 0));
  if (lines.length === 0) return `class ${symbol.name} {}`;
  return `class ${symbol.name} {\n${indentBlock(lines.join("\n"))}\n}`;
}

function serializeExport(ctx: SerializerContext, symbol: ts.Symbol): string {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? ctx.checker.getAliasedSymbol(symbol) : symbol;

  if (resolved.flags & ts.SymbolFlags.Enum) return serializeEnum(ctx, resolved);
  if (resolved.flags & ts.SymbolFlags.Class) return serializeClass(ctx, resolved);
  if (resolved.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) {
    return serializeType(ctx, ctx.checker.getDeclaredTypeOfSymbol(resolved), 0);
  }
  return serializeType(ctx, typeOfSymbol(ctx, resolved), 0);
}

export function buildEntryReport(tsconfigPath: string, entryPath: string): string {
  const absoluteTsconfig = isAbsolute(tsconfigPath) ? tsconfigPath : resolve(REPO_ROOT, tsconfigPath);
  const absoluteEntry = isAbsolute(entryPath) ? entryPath : resolve(REPO_ROOT, entryPath);

  const configFile = ts.readConfigFile(absoluteTsconfig, ts.sys.readFile);
  if (configFile.error)
    throw new Error(`Failed to read ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")}`);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(absoluteTsconfig));
  const program = ts.createProgram([absoluteEntry], { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();

  const sourceFile = program.getSourceFile(absoluteEntry);
  if (!sourceFile) throw new Error(`Entry file not found in program: ${entryPath}`);
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) throw new Error(`Entry file has no module symbol (no exports?): ${entryPath}`);

  const ctx: SerializerContext = { checker, program, stack: new Set() };

  const exports = [...checker.getExportsOfModule(moduleSymbol)].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  const sections = exports.map(exported => `${exported.name}: ${serializeExport(ctx, exported)}`);
  return sections.join("\n\n");
}

export function buildReport(): string {
  const parts: string[] = [
    "# Wire-contract snapshot",
    "",
    "Generated by `bun run wire-contract:update` — do not edit by hand.",
    "",
    "This file is a canonical, structurally expanded rendering of the typed partner-facing",
    "surface: the shared endpoint request/response types and the public SDK API. CI runs",
    "`bun run wire-contract:check` and fails when this snapshot is stale, so every change",
    "to what integrators consume appears as an explicit, reviewable diff in this file.",
    "A diff here means: check backward compatibility for live integrations, and keep",
    "`docs/api/openapi/vortex.openapi.json` and the SDK error mappings in sync.",
    ""
  ];

  for (const entry of ENTRIES) {
    parts.push(`## ${entry.heading}`, "", "```text", buildEntryReport(entry.tsconfig, entry.entry), "```", "");
  }

  return `${parts.join("\n").trimEnd()}\n`;
}

function firstDifference(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index++) {
    if (expectedLines[index] !== actualLines[index]) {
      return [
        `First difference at line ${index + 1}:`,
        `  snapshot:  ${expectedLines[index] ?? "<missing>"}`,
        `  generated: ${actualLines[index] ?? "<missing>"}`
      ].join("\n");
    }
  }
  return "Files differ in trailing whitespace or length.";
}

function main(): void {
  const mode = process.argv[2] ?? "--check";
  const report = buildReport();

  if (mode === "--update") {
    writeFileSync(SNAPSHOT_FILE, report);
    console.log(`Wrote ${SNAPSHOT_FILE}`);
    return;
  }

  if (mode !== "--check") {
    console.error(`Unknown mode ${mode}. Use --check or --update.`);
    process.exit(2);
  }

  let existing = "";
  try {
    existing = readFileSync(SNAPSHOT_FILE, "utf8");
  } catch {
    console.error(`Snapshot missing at ${SNAPSHOT_FILE}. Run: bun run wire-contract:update`);
    process.exit(1);
  }

  if (existing === report) {
    console.log("Wire-contract snapshot is up to date.");
    return;
  }

  console.error("Wire-contract snapshot is STALE. The partner-facing typed surface changed.");
  console.error(firstDifference(existing, report));
  console.error("\nIf the change is intentional, regenerate and commit the snapshot:");
  console.error("  bun run build:shared && bun run wire-contract:update");
  console.error("Then review the snapshot diff for backward compatibility with live integrators.");
  process.exit(1);
}

if (import.meta.main) main();
