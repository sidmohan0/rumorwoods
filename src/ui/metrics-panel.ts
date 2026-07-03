import { Engine } from "../sim/engine";
import {
  computeDiffusion,
  computeMetrics,
  computeNetwork,
  CurvePoint,
  DiffusionReport,
  NetworkReport,
  TrackedTopic,
} from "../sim/metrics";
import { formatTime } from "../core/prompts";

/**
 * The Metrics overlay: live behavioral measurements of the running
 * sim — information-diffusion curves per tracked topic (who heard it,
 * when, from where) and the social network (conversations, pairs,
 * density). Everything recomputes from agent state on each open tick;
 * nothing here writes to the sim.
 */

export interface MetricsPanelOptions {
  overlay: HTMLElement;
  engine: Engine;
  scenarioId: string;
  topics: TrackedTopic[];
  log: (entry: string) => void;
}

const CUSTOM_TOPIC_ID = "custom";

export class MetricsPanel {
  private readonly overlay: HTMLElement;
  private readonly engine: Engine;
  private readonly scenarioId: string;
  private readonly topics: TrackedTopic[];
  private readonly log: (entry: string) => void;

  private activeTopicId: string;
  private customKeywords = "";
  private bodyEl!: HTMLElement;
  private customInput!: HTMLInputElement;

  constructor(options: MetricsPanelOptions) {
    this.overlay = options.overlay;
    this.engine = options.engine;
    this.scenarioId = options.scenarioId;
    this.topics = options.topics;
    this.log = options.log;
    this.activeTopicId = this.topics[0]?.id ?? CUSTOM_TOPIC_ID;
    this.buildSkeleton();
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    this.overlay.hidden = false;
    this.render();
  }

  close(): void {
    this.overlay.hidden = true;
  }

  /** Called by the engine's onTick chain; re-renders only while open. */
  onTick(): void {
    if (this.isOpen) this.render();
  }

  private activeTopic(): TrackedTopic | null {
    if (this.activeTopicId === CUSTOM_TOPIC_ID) {
      const keywords = this.customKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length === 0) return null;
      return { id: CUSTOM_TOPIC_ID, label: `"${keywords.join('", "')}"`, keywords };
    }
    return this.topics.find((t) => t.id === this.activeTopicId) ?? null;
  }

  private buildSkeleton(): void {
    const card = document.createElement("div");
    card.id = "metrics-card";

    const close = document.createElement("button");
    close.id = "btn-close-metrics";
    close.title = "Close metrics";
    close.setAttribute("aria-label", "Close metrics");
    close.innerHTML = "&times;";
    close.addEventListener("click", () => this.close());

    const heading = document.createElement("h2");
    heading.textContent = "Metrics";
    const subtitle = document.createElement("p");
    subtitle.className = "metrics-subtitle";
    subtitle.textContent =
      "Live measurements of the paper's §6 results: how seeded information " +
      "diffuses through conversation, and the social network the town forms. " +
      "Computed from agent memory streams — nothing is instrumented into the sim.";

    const chips = document.createElement("div");
    chips.id = "metrics-topics";
    for (const topic of this.topics) {
      chips.appendChild(this.topicChip(topic.id, topic.label));
    }
    chips.appendChild(this.topicChip(CUSTOM_TOPIC_ID, "Custom…"));

    this.customInput = document.createElement("input");
    this.customInput.id = "metrics-custom-keywords";
    this.customInput.type = "text";
    this.customInput.placeholder =
      "Custom topic keywords, comma-separated (e.g. college, divorce)";
    this.customInput.hidden = this.activeTopicId !== CUSTOM_TOPIC_ID;
    this.customInput.addEventListener("input", () => {
      this.customKeywords = this.customInput.value;
      this.renderBody();
    });

    const exportBtn = document.createElement("button");
    exportBtn.id = "btn-export-metrics";
    exportBtn.textContent = "Export JSON";
    exportBtn.addEventListener("click", () => this.exportJson());

    const controls = document.createElement("div");
    controls.id = "metrics-controls";
    controls.append(chips, exportBtn);

    this.bodyEl = document.createElement("div");
    this.bodyEl.id = "metrics-body";

    card.append(close, heading, subtitle, controls, this.customInput, this.bodyEl);
    this.overlay.appendChild(card);
  }

  private topicChip(id: string, label: string): HTMLButtonElement {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "topic-chip";
    chip.dataset.topicId = id;
    chip.textContent = label;
    chip.addEventListener("click", () => {
      this.activeTopicId = id;
      this.customInput.hidden = id !== CUSTOM_TOPIC_ID;
      if (id === CUSTOM_TOPIC_ID) this.customInput.focus();
      this.render();
    });
    return chip;
  }

  private render(): void {
    for (const chip of this.overlay.querySelectorAll<HTMLButtonElement>(
      ".topic-chip",
    )) {
      chip.classList.toggle(
        "active",
        chip.dataset.topicId === this.activeTopicId,
      );
    }
    this.renderBody();
  }

  private renderBody(): void {
    const agents = this.engine.agents;
    this.bodyEl.innerHTML = "";

    const topic = this.activeTopic();
    const diffusionSection = document.createElement("section");
    diffusionSection.className = "metrics-section";
    if (topic) {
      const diffusion = computeDiffusion(agents, topic);
      diffusionSection.append(
        this.sectionTitle(
          `Information diffusion — ${topic.label}`,
          `${diffusion.awareCount}/${diffusion.totalAgents} residents aware`,
        ),
        this.curveChart(
          diffusion.curve,
          diffusion.totalAgents,
          "residents aware",
        ),
        this.awarenessTable(diffusion),
      );
    } else {
      diffusionSection.append(
        this.sectionTitle("Information diffusion", ""),
        this.hint(
          "Enter one or more keywords above to trace how a piece of information spreads.",
        ),
      );
    }

    const network = computeNetwork(agents);
    const networkSection = document.createElement("section");
    networkSection.className = "metrics-section";
    networkSection.append(
      this.sectionTitle(
        "Social network",
        `${network.conversationCount} conversations · ` +
          `${network.uniquePairCount} pairs · ` +
          `density ${(network.density * 100).toFixed(1)}%`,
      ),
      this.curveChart(
        network.curve,
        Math.max(network.conversationCount, 1),
        "conversations",
      ),
      this.networkBars(network),
    );

    this.bodyEl.append(diffusionSection, networkSection);
  }

  private sectionTitle(title: string, stat: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "metrics-section-title";
    const label = document.createElement("span");
    label.textContent = title;
    const statEl = document.createElement("span");
    statEl.className = "metrics-stat";
    statEl.textContent = stat;
    el.append(label, statEl);
    return el;
  }

  private hint(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "hint";
    el.textContent = text;
    return el;
  }

  /** Step chart of a cumulative curve on a fixed-height canvas. */
  private curveChart(
    curve: CurvePoint[],
    yMax: number,
    yLabel: string,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "metrics-chart";
    const canvas = document.createElement("canvas");
    const width = 640;
    const height = 160;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = "100%";
    canvas.style.maxWidth = `${width}px`;
    canvas.style.height = `${height}px`;
    wrap.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return wrap;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const pad = { left: 34, right: 10, top: 10, bottom: 22 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.strokeStyle = "#3a4a2f";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    ctx.fillStyle = "#8fa07e";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(yMax), pad.left - 4, pad.top + 8);
    ctx.fillText("0", pad.left - 4, pad.top + plotH);

    if (curve.length === 0) {
      ctx.textAlign = "center";
      ctx.fillText("no data yet", pad.left + plotW / 2, pad.top + plotH / 2);
      return wrap;
    }

    const t0 = curve[0].t;
    const t1 = Math.max(this.engine.time, curve[curve.length - 1].t);
    const spanT = Math.max(t1 - t0, 1);
    const x = (t: number): number => pad.left + ((t - t0) / spanT) * plotW;
    const y = (count: number): number =>
      pad.top + plotH - (count / Math.max(yMax, 1)) * plotH;

    ctx.strokeStyle = "#ffd97a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(t0), y(0));
    let lastCount = 0;
    for (const point of curve) {
      ctx.lineTo(x(point.t), y(lastCount));
      ctx.lineTo(x(point.t), y(point.count));
      lastCount = point.count;
    }
    ctx.lineTo(x(t1), y(lastCount));
    ctx.stroke();

    ctx.fillStyle = "#8fa07e";
    ctx.textAlign = "left";
    ctx.fillText(formatTime(t0), pad.left, height - 8);
    ctx.textAlign = "right";
    ctx.fillText(formatTime(t1), pad.left + plotW, height - 8);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, pad.left + plotW / 2, height - 8);
    return wrap;
  }

  /** Who heard it, when, and through what kind of memory. */
  private awarenessTable(diffusion: DiffusionReport): HTMLElement {
    const table = document.createElement("table");
    table.className = "metrics-table";
    const head = table.createTHead().insertRow();
    for (const label of ["Resident", "First aware", "Via"]) {
      const th = document.createElement("th");
      th.textContent = label;
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const agent of diffusion.agents) {
      const row = body.insertRow();
      row.insertCell().textContent = agent.name;
      const aware = agent.firstAwareAt !== null;
      row.className = aware ? "aware" : "unaware";
      row.insertCell().textContent = aware
        ? formatTime(agent.firstAwareAt!)
        : "—";
      const via = row.insertCell();
      via.textContent = aware
        ? agent.via === "chat"
          ? "conversation"
          : agent.via === "observation"
            ? "seed / observation"
            : agent.via!
        : "";
      if (agent.evidence) via.title = agent.evidence;
    }
    return table;
  }

  private networkBars(network: NetworkReport): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "metrics-bars";
    const max = Math.max(...network.perAgent.map((a) => a.conversations), 1);
    for (const agent of network.perAgent) {
      const row = document.createElement("div");
      row.className = "metrics-bar-row";
      const name = document.createElement("span");
      name.className = "metrics-bar-name";
      name.textContent = agent.name;
      const track = document.createElement("div");
      track.className = "metrics-bar-track";
      const fill = document.createElement("div");
      fill.className = "metrics-bar-fill";
      fill.style.width = `${(agent.conversations / max) * 100}%`;
      track.appendChild(fill);
      const count = document.createElement("span");
      count.className = "metrics-bar-count";
      count.textContent = `${agent.conversations} conv · ${agent.partners} partners`;
      row.append(name, track, count);
      wrap.appendChild(row);
    }
    return wrap;
  }

  private exportJson(): void {
    const topic = this.activeTopic();
    const topics = [
      ...this.topics,
      ...(topic && topic.id === CUSTOM_TOPIC_ID ? [topic] : []),
    ];
    const report = computeMetrics(
      this.engine.agents,
      topics,
      this.scenarioId,
      this.engine.time,
    );
    const exportable = {
      ...report,
      diffusion: report.diffusion.map((d) => ({
        ...d,
        agents: d.agents.map(({ evidence: _evidence, ...rest }) => rest),
      })),
    };
    const blob = new Blob([JSON.stringify(exportable, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rumorwoods-metrics-${this.scenarioId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.log("[metrics] exported report");
  }
}
