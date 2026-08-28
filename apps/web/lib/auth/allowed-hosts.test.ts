import { describe, expect, test } from "bun:test";
import { getAllowedAuthHosts } from "./allowed-hosts";

describe("getAllowedAuthHosts", () => {
  test("allows any localhost port used by local Next.js", () => {
    const hosts = getAllowedAuthHosts({});

    expect(hosts).toContain("localhost:*");
    expect(hosts).toContain("127.0.0.1:*");
  });

  test("adds configured production hosts and a subdomain wildcard", () => {
    const hosts = getAllowedAuthHosts({
      VERCEL_PROJECT_PRODUCTION_URL: "open-agents.dev",
    });

    expect(hosts).toContain("open-agents.dev");
    expect(hosts).toContain("*.open-agents.dev");
  });

  test("does not add a wildcard for loopback hosts", () => {
    const hosts = getAllowedAuthHosts({
      BETTER_AUTH_URL: "http://localhost:3001",
    });

    expect(hosts).toContain("localhost:3001");
    expect(hosts).not.toContain("*.localhost:3001");
  });
});
