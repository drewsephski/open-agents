export function AgentBehaviorSection() {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Agent behavior
      </h3>
      <div className="space-y-2 text-sm">
        <p>
          Replies lead with the result, explain key decisions, and report what
          was verified. Ask for more detail whenever you need it.
        </p>
        <p className="text-muted-foreground">
          Start a message with <code>/pstack</code> to enable an engineering
          workflow that investigates before editing and verifies the outcome. It
          stays on in that chat until you send <code>/pstack-off</code>. Works
          with the built-in agent and connected Codex.
        </p>
        <p className="text-xs text-muted-foreground">
          Adapted from{" "}
          <a
            href="https://github.com/backnotprop/pstack"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            pstack
          </a>{" "}
          for Launchstack’s available tools and workflows.
        </p>
      </div>
    </div>
  );
}
