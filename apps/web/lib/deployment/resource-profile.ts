export type OpenAgentsResourceProfile = "standard" | "hobby";

export function getOpenAgentsResourceProfile(): OpenAgentsResourceProfile {
  return process.env.OPEN_AGENTS_RESOURCE_PROFILE === "standard"
    ? "standard"
    : "hobby";
}

export function isHobbyResourceProfile(): boolean {
  return getOpenAgentsResourceProfile() === "hobby";
}
