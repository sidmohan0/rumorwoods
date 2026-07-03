import { Agent } from "../core/agent";
import { formatClock, formatTime } from "../core/prompts";

/** Right-hand panel: agent state, memory stream, plans, conversations. */
export class Inspector {
  private root: HTMLElement;
  agent: Agent | null = null;
  /** Provides the current sim time for interviews. */
  getTime: () => number = () => 0;
  private interviews = new Map<string, Array<{ q: string; a: string }>>();
  private interviewBusy = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  select(agent: Agent | null): void {
    this.agent = agent;
    this.render();
  }

  render(): void {
    // Don't wipe the interview input while the user is typing.
    const active = document.activeElement;
    if (active && active.id === "interview-input" && this.root.contains(active)) {
      return;
    }
    if (!this.agent) {
      this.root.innerHTML = `<div class="hint">Click an agent on the map to inspect their memory stream, plans, and conversations.</div>`;
      return;
    }
    const a = this.agent;
    const memories = a.memory.nodes
      .slice(-40)
      .reverse()
      .map(
        (n) =>
          `<div class="mem mem-${n.kind}"><span class="mem-kind">${n.kind}</span>` +
          `<span class="mem-imp" title="importance">${n.importance}</span>` +
          `<span class="mem-time">${formatTime(n.createdAt)}</span>` +
          `<div class="mem-desc">${escapeHtml(n.description)}</div></div>`,
      )
      .join("");

    const plan = a.dayPlan
      ? a.dayPlan.detailed
          .concat(a.dayPlan.detailed.length ? [] : a.dayPlan.hourly)
          .sort((x, y) => x.start - y.start)
          .map(
            (e) =>
              `<div class="plan-entry">${formatClock(e.start)} – ${formatClock(
                e.start + e.duration,
              )}: ${escapeHtml(e.description)}${
                e.location ? ` <span class="plan-loc">@ ${escapeHtml(e.location)}</span>` : ""
              }</div>`,
          )
          .join("")
      : `<div class="hint">No plan yet.</div>`;

    const broadStrokes = a.dayPlan
      ? a.dayPlan.broadStrokes
          .map((s, i) => `<div class="plan-entry">${i + 1}) ${escapeHtml(s)}</div>`)
          .join("")
      : "";

    const conversations = [...a.conversationLog]
      .concat(a.conversation ? [a.conversation] : [])
      .slice(-5)
      .reverse()
      .map(
        (c) =>
          `<div class="conv"><div class="conv-head">${escapeHtml(
            c.participants.join(" & "),
          )} — ${formatTime(c.startedAt)}${c.endedAt === null ? " (ongoing)" : ""}</div>` +
          c.turns
            .map(
              (t) =>
                `<div class="conv-turn"><b>${escapeHtml(t.speaker.split(" ")[0])}:</b> ${escapeHtml(t.text)}</div>`,
            )
            .join("") +
          `</div>`,
      )
      .join("");

    this.root.innerHTML = `
      <div class="agent-head">
        <span class="agent-dot" style="background:${a.persona.color}"></span>
        <b>${escapeHtml(a.name)}</b> (${a.persona.age}) ${a.emoji}
      </div>
      <div class="agent-traits">${escapeHtml(a.persona.innateTraits)}</div>
      <div class="agent-action"><b>Current action:</b> ${escapeHtml(a.action.description)}${
        a.action.location ? ` @ ${escapeHtml(a.action.location)}` : ""
      }</div>
      <details open><summary>Today's plan (broad strokes)</summary>${broadStrokes || '<div class="hint">Not planned yet.</div>'}</details>
      <details><summary>Detailed schedule</summary>${plan}</details>
      <details open><summary>Interview</summary>
        <div class="hint">Ask ${escapeHtml(a.name.split(" ")[0])} anything, as in the paper's agent interviews.</div>
        <div id="interview-history">${this.interviewHistoryHtml(a)}</div>
        <form id="interview-form">
          <input id="interview-input" type="text" placeholder="e.g. What are you doing today?" ${this.interviewBusy ? "disabled" : ""} />
          <button type="submit" ${this.interviewBusy ? "disabled" : ""}>Ask</button>
        </form>
      </details>
      <details open><summary>Conversations</summary>${conversations || '<div class="hint">None yet.</div>'}</details>
      <details open><summary>Memory stream (latest ${Math.min(40, a.memory.nodes.length)} of ${a.memory.nodes.length})</summary>${memories || '<div class="hint">Empty.</div>'}</details>
    `;

    const form = this.root.querySelector("#interview-form") as HTMLFormElement | null;
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = this.root.querySelector("#interview-input") as HTMLInputElement;
      const question = input.value.trim();
      if (!question || this.interviewBusy) return;
      void this.ask(a, question);
    });
  }

  private interviewHistoryHtml(a: Agent): string {
    const history = this.interviews.get(a.name) ?? [];
    return history
      .map(
        (h) =>
          `<div class="conv-turn"><b>You:</b> ${escapeHtml(h.q)}</div>` +
          `<div class="conv-turn"><b>${escapeHtml(a.name.split(" ")[0])}:</b> ${escapeHtml(h.a)}</div>`,
      )
      .join("");
  }

  private async ask(a: Agent, question: string): Promise<void> {
    this.interviewBusy = true;
    this.render();
    try {
      const history = (this.interviews.get(a.name) ?? [])
        .map((h) => `Interviewer: ${h.q}\n${a.name}: ${h.a}`)
        .join("\n");
      const answer = await a.interview(this.getTime(), question, history);
      const list = this.interviews.get(a.name) ?? [];
      list.push({ q: question, a: answer });
      this.interviews.set(a.name, list);
    } catch (err) {
      const list = this.interviews.get(a.name) ?? [];
      list.push({ q: question, a: `[error: ${String(err)}]` });
      this.interviews.set(a.name, list);
    } finally {
      this.interviewBusy = false;
      this.render();
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
