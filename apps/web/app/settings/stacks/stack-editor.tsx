"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useModelOptions } from "@/hooks/use-model-options";
import { MISSION_DEFINITIONS, missionTypeSchema } from "@/lib/missions";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import { getAllVariants } from "@/lib/model-variants";
import { resolveChatModelSelection } from "@/lib/model-selection";
import {
  createStackSchema,
  stackModelSchema,
  type StackConfiguration,
  type StackSummary,
} from "@/lib/stacks/schema";

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export function StackEditor({
  stack,
  initialConfiguration,
  onSaved,
  onCancel,
}: {
  stack?: StackSummary;
  initialConfiguration: StackConfiguration;
  onSaved: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(stack?.name ?? "");
  const [description, setDescription] = useState(stack?.description ?? "");
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [skills, setSkills] = useState(
    initialConfiguration.globalSkillRefs
      .map((ref) => `${ref.source} ${ref.skillName}`)
      .join("\n"),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { modelOptions, modelVariants } = useModelOptions();
  const native = configuration.executionBackend === "launchstack_native";
  const update = (patch: Partial<StackConfiguration>) =>
    setConfiguration((current) => ({ ...current, ...patch }));
  const primarySelectionId =
    configuration.model?.selectedId ?? configuration.model?.id;
  const subagentSelectionId =
    configuration.subagentModel?.selectedId ?? configuration.subagentModel?.id;
  const chooseModel = (id: string) =>
    stackModelSchema.parse({
      ...resolveChatModelSelection({
        selectedModelId: id,
        modelVariants: getAllVariants(modelVariants),
        missingVariantLabel: "Stack model",
      }),
      ...(id.startsWith("variant:") ? { selectedId: id } : {}),
    });

  async function save() {
    const parsed = createStackSchema.safeParse({
      name,
      description,
      configuration: {
        ...configuration,
        globalSkillRefs: skills
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => {
            const [source, skillName, extra] = line.trim().split(/\s+/);
            return { source, skillName: extra ? "" : skillName };
          }),
      },
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid Stack");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        stack ? `/api/stacks/${stack.id}/versions` : "/api/stacks",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...parsed.data,
            ...(stack ? { expectedVersion: stack.version } : {}),
          }),
        },
      );
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save Stack");
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Stack");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-6 rounded-xl border bg-card p-5"
    >
      <div>
        <h2 className="font-semibold">
          {stack
            ? `Edit ${stack.name} · next version ${stack.version + 1}`
            : "Build a Stack"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a reusable worker. Choose the repository and desired outcome
          when you launch.
        </p>
      </div>
      <fieldset disabled={saving} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              placeholder="Full-Stack Shipping Stack"
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              placeholder="What this worker is for"
            />
          </Field>
          <Field label="Runtime">
            <select
              className={selectClass}
              value={configuration.executionBackend}
              onChange={(event) => {
                const executionBackend =
                  event.target.value === "codex"
                    ? "codex"
                    : "launchstack_native";
                update({
                  executionBackend,
                  model:
                    executionBackend === "codex"
                      ? null
                      : { id: APP_DEFAULT_MODEL_ID },
                  subagentModel: null,
                  autoCommitPush: false,
                  autoCreatePr: false,
                  actions: { ...configuration.actions, capabilities: [] },
                });
              }}
            >
              <option value="launchstack_native">LaunchStack Native</option>
              <option value="codex">Codex</option>
            </select>
          </Field>
          <Field label="Mission">
            <select
              className={selectClass}
              value={configuration.missionType}
              onChange={(event) =>
                update({
                  missionType: missionTypeSchema.parse(event.target.value),
                })
              }
            >
              {MISSION_DEFINITIONS.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {mission.label}
                </option>
              ))}
            </select>
          </Field>
          {native && (
            <>
              <Field label="Primary model">
                <select
                  className={selectClass}
                  value={primarySelectionId ?? ""}
                  onChange={(event) =>
                    update({ model: chooseModel(event.target.value) })
                  }
                >
                  <option value={primarySelectionId}>
                    {modelOptions.find(
                      (option) => option.id === primarySelectionId,
                    )?.label ?? configuration.model?.id}
                  </option>
                  {modelOptions
                    .filter((option) => option.id !== primarySelectionId)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Subagent model">
                <select
                  className={selectClass}
                  value={subagentSelectionId ?? ""}
                  onChange={(event) =>
                    update({
                      subagentModel: event.target.value
                        ? chooseModel(event.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Use primary model</option>
                  {configuration.subagentModel && (
                    <option value={subagentSelectionId}>
                      {modelOptions.find(
                        (option) => option.id === subagentSelectionId,
                      )?.label ?? configuration.subagentModel.id}
                    </option>
                  )}
                  {modelOptions
                    .filter((option) => option.id !== subagentSelectionId)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          )}
        </div>
        {!native && (
          <p className="text-sm text-muted-foreground">
            Codex requires a connected subscription, chooses its own models, and
            currently supports workspace tasks without external actions or
            automatic delivery.
          </p>
        )}
        <Field label="Worker instructions">
          <Textarea
            value={configuration.instructions}
            onChange={(event) => update({ instructions: event.target.value })}
            maxLength={12_000}
            rows={4}
            placeholder="Engineering conventions and how this worker should approach work"
          />
        </Field>
        <Field label="Skills">
          <Textarea
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            rows={3}
            placeholder="vercel/ai ai-sdk"
          />
          <span className="text-xs font-normal text-muted-foreground">
            One source and skill name per line: owner/repo skill-name.
            Repository skills remain available.
          </span>
        </Field>
        {native && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gmail capabilities">
              <select
                className={selectClass}
                value={configuration.actions.capabilities[0]?.access ?? "none"}
                onChange={(event) =>
                  update({
                    actions: {
                      ...configuration.actions,
                      capabilities:
                        event.target.value === "none"
                          ? []
                          : [
                              {
                                toolkit: "gmail",
                                access:
                                  event.target.value === "read"
                                    ? "read"
                                    : "read_write",
                              },
                            ],
                    },
                  })
                }
              >
                <option value="none">Disabled</option>
                <option value="read">Read only</option>
                <option value="read_write">Read, draft, and send</option>
              </select>
              <span className="text-xs font-normal text-muted-foreground">
                Requires your Gmail connection. Every draft and send requires
                approval.
              </span>
            </Field>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={configuration.autoCommitPush}
                  onChange={(event) =>
                    update({
                      autoCommitPush: event.target.checked,
                      autoCreatePr:
                        event.target.checked && configuration.autoCreatePr,
                    })
                  }
                />
                Auto commit and push
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!configuration.autoCommitPush}
                  checked={configuration.autoCreatePr}
                  onChange={(event) =>
                    update({ autoCreatePr: event.target.checked })
                  }
                />
                Create pull request
              </label>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Vercel sandbox · Mission verification guidance · Automatic external
          reads · Approved external writes · Destructive external actions denied
        </p>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : stack ? "Publish new version" : "Create Stack"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Existing Sessions keep their frozen configuration when you publish a new
        version.
      </p>
    </form>
  );
}
