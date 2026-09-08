import { expect, mock, test } from "bun:test";
import * as fs from "node:fs";

type Document = Record<string, any>;
const preconditionRef = "#/components/parameters/ExpectedOwnerProfileId";
const scopedOperations = [
  ["/v1/organization/members", "get"],
  ["/v1/organization/members/{memberProfileId}", "patch"],
  ["/v1/organization/members/{memberProfileId}", "delete"],
  ["/v1/organization/member-invitations", "get"],
  ["/v1/organization/member-invitations", "post"],
  ["/v1/organization/member-invitations/{invitationId}", "delete"],
  ["/v1/organization/member-events", "get"]
] as const;
const cases: { name: string; error: string; mutate: (doc: Document) => void }[] = [
  ...scopedOperations.map(([path, method]) => ({
    name: `missing precondition: ${method} ${path}`,
    error: "must require the UUID query precondition",
    mutate: (doc: Document) => {
      doc.paths[path][method].parameters = doc.paths[path][method].parameters.filter(
        (p: Document) => p.$ref !== preconditionRef
      );
    }
  })),
  ...([
    ["/v1/organization", "get"],
    ["/v1/organization-member-invitations/{invitationId}", "get"],
    ["/v1/organization-member-invitations/{invitationId}/accept", "post"]
  ] as const).map(([path, method]) => ({
    name: `exempt route: ${method} ${path}`,
    error: "must remain exempt",
    mutate: (doc: Document) => {
      doc.paths[path][method].parameters.push({ $ref: preconditionRef });
    }
  })),
  ...["optional", "header", "non-uuid", "non-string"].map(kind => ({
    name: `invalid precondition: ${kind}`,
    error: "must require the UUID query precondition",
    mutate: (doc: Document) => {
      const parameter = doc.components.parameters.ExpectedOwnerProfileId;
      if (kind === "optional") parameter.required = false;
      if (kind === "header") parameter.in = "header";
      if (kind === "non-uuid") delete parameter.schema.format;
      if (kind === "non-string") parameter.schema.type = "integer";
    }
  })),
  {
    name: "item mutation loses typed context conflict",
    error: "must require the UUID query precondition",
    mutate: doc => {
      doc.paths["/v1/organization/members/{memberProfileId}"].patch.responses[409].content["application/json"].schema = {
        $ref: "#/components/schemas/ManagedProfileErrorResponse"
      };
    }
  },
  {
    name: "invalid context conflict code",
    error: "must expose typed code, message and status 409",
    mutate: doc => {
      doc.components.schemas.OrganizationContextChangedErrorResponse.properties.error.properties.code.const = "OTHER";
    }
  },
  {
    name: "bootstrap must document lifetime overlap",
    error: "Managed lifecycle must document: membership.createdAt",
    mutate: doc => {
      const operation = doc.paths["/v1/managed-profiles/{profileId}"].get;
      operation.description = operation.description.replace(
        "membership.createdAt <= (child.deletedAt ?? now)",
        "historic org membership"
      );
    }
  },
  {
    name: "policy must not imply multi-org affiliation",
    error: "ManagedProfilePolicy must describe",
    mutate: doc => {
      doc.components.schemas.ManagedProfilePolicy.description = "An actor may have children with different owners";
    }
  }
];

const fixture = process.env.OPENAPI_CHECK_NEGATIVE;
if (fixture) {
  const scenario = cases.find(item => item.name === fixture);
  if (!scenario) throw new Error(`Unknown checker fixture: ${fixture}`);
  const originalRead = fs.readFileSync;
  // Preload in a child process: corrupt only its in-memory OpenAPI, never the shared worktree.
  mock.module("node:fs", () => ({
    ...fs,
    readFileSync(path: string, options: any) {
      const value = originalRead(path, options);
      if (path !== "docs/api/openapi/vortex.openapi.json") return value;
      const doc = JSON.parse(String(value));
      scenario.mutate(doc);
      return JSON.stringify(doc);
    }
  }));
} else {
  for (const scenario of cases) {
    test(scenario.name, () => {
      const result = Bun.spawnSync(["bun", "--preload", import.meta.path, "docs/api/scripts/check-openapi.ts"], {
        env: { ...process.env, OPENAPI_CHECK_NEGATIVE: scenario.name },
        stderr: "pipe",
        stdout: "pipe"
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString() + result.stdout.toString()).toContain(scenario.error);
    });
  }
}
