# Isolate User inference credentials

Launchstack resolves a User-owned BYOK credential or a separately limited managed OpenRouter subkey for Workspace AI Activity; it never shares an unrestricted completion key across customers. This adds provisioning and encryption work, but bounds credential exposure and model-spend risk per User while keeping BYOK and Managed Inference accounting distinct.
