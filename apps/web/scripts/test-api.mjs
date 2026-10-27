import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ configFile: false, root, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom" });
try {
  const { resolveApiUrl, getApiUrl, API_TIMEOUT } = await server.ssrLoadModule("/src/core/api/config.ts");
  for (const [base, version, expected] of [
    ["/api", "v1", "/api/v1"],
    ["/api/", "/v1/", "/api/v1"],
    ["/api/v1", "v1", "/api/v1"],
    ["/api/v1/", "v1", "/api/v1"],
    ["https://example.com/api", "v2", "https://example.com/api/v2"],
    ["https://example.com/api/v1/", "v1", "https://example.com/api/v1"],
    ["/api", "", "/api"],
  ]) assert.equal(resolveApiUrl(base, version), expected);
  const { default: client } = await server.ssrLoadModule("/src/core/config/axiosClient.ts");
  assert.equal(client.defaults.baseURL, getApiUrl());
  assert.equal(client.defaults.baseURL, "/api/v1");
  assert.equal(client.defaults.timeout, API_TIMEOUT);
  for (const endpoint of ["projects/", "/tasks/", "accounts/profile/", "/finance/my-reports/"]) {
    assert.equal(client.getUri({ url: endpoint }), `/api/v1/${endpoint.replace(/^\//, "")}`);
  }
  const { deleteStandup } = await server.ssrLoadModule("/src/features/tasks/api/tasksApi.ts");
  client.defaults.adapter = async (config) => {
    if (config.url === "/auth/csrf/") {
      return { data: { data: { csrfToken: "test-csrf-token" } }, status: 200, statusText: "OK", headers: {}, config };
    }
    assert.equal(client.getUri(config), "/api/v1/tasks/standups/test-id/");
    return { data: "", status: 204, statusText: "No Content", headers: {}, config };
  };
  await deleteStandup("test-id");
  const failure = Object.assign(new Error("Not found"), { response: { status: 404 } });
  client.defaults.adapter = async () => { throw failure; };
  await assert.rejects(deleteStandup("test-id"), (error) => error === failure);
  const { getTodayAttendance } = await server.ssrLoadModule("/src/features/attendance/api/attendanceApi.ts");
  await assert.rejects(getTodayAttendance(), (error) => error === failure);
  const { getErrorMessage } = await server.ssrLoadModule("/src/core/utils/errorHandler.ts");
  assert.equal(getErrorMessage(Object.assign(new Error("Forbidden"), { response: { status: 403, data: { detail: "server-specific detail" } } })), "برای این کار دسترسی لازم رو نداری.");
  assert.equal(getErrorMessage(Object.assign(new Error("Not Found"), { response: { status: 404, data: { detail: "Project not found" } } })), "پروژه پیدا نکردیم");
  client.defaults.adapter = async () => {
    throw Object.assign(new Error("Not checked in today."), {
      response: { status: 404, data: { status: false, message: "Not checked in today.", errors: { detail: "Not checked in today." }, data: null } },
    });
  };
  assert.equal(await getTodayAttendance(), null);
  console.log("API URL, request paths, timeout and deletion error checks passed.");
} finally {
  await server.close();
}
