import { describe, it, expect } from "vitest";
import { isToolAllowed, allowedDepartmentsForRole, type ToolDefinition } from "./types";

const adminTool: ToolDefinition = {
  name: "get_financials",
  description: "x",
  input_schema: { type: "object", properties: {} },
  allowedRoles: ["admin", "owner"],
  execute: async () => "ok",
};

const openTool: ToolDefinition = {
  name: "get_production_data",
  description: "x",
  input_schema: { type: "object", properties: {} },
  allowedRoles: "all",
  execute: async () => "ok",
};

describe("isToolAllowed", () => {
  it("permits a role listed in allowedRoles", () => {
    expect(isToolAllowed(adminTool, "admin")).toBe(true);
    expect(isToolAllowed(adminTool, "owner")).toBe(true);
  });
  it("denies a role not listed", () => {
    expect(isToolAllowed(adminTool, "worker")).toBe(false);
    expect(isToolAllowed(adminTool, "cutting")).toBe(false);
  });
  it("permits any role when allowedRoles is 'all'", () => {
    expect(isToolAllowed(openTool, "worker")).toBe(true);
    expect(isToolAllowed(openTool, "storage")).toBe(true);
  });
});

describe("allowedDepartmentsForRole", () => {
  it("gives admin/owner all departments", () => {
    expect(allowedDepartmentsForRole("admin")).toEqual(["sewing", "cutting", "finishing"]);
    expect(allowedDepartmentsForRole("owner")).toEqual(["sewing", "cutting", "finishing"]);
  });
  it("restricts worker to sewing + finishing", () => {
    expect(allowedDepartmentsForRole("worker")).toEqual(["sewing", "finishing"]);
  });
  it("restricts cutting role to cutting", () => {
    expect(allowedDepartmentsForRole("cutting")).toEqual(["cutting"]);
  });
  it("gives storage role no production departments", () => {
    expect(allowedDepartmentsForRole("storage")).toEqual([]);
  });
});
