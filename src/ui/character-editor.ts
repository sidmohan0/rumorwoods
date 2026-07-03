import { Persona } from "../core/types";
import { Engine } from "../sim/engine";
import { MapDef } from "../world/world";
import {
  clearRoster,
  loadRoster,
  reconcileRoster,
  saveRoster,
} from "../sim/roster";

/**
 * Character editor: list, edit, add, and remove town residents from
 * the settings screen. Field edits apply live (prompts read persona
 * fields at call time); roster changes reconcile against the running
 * engine, and new agents are seeded when the sim is already seeded.
 */

export interface CharacterEditorDeps {
  container: HTMLElement;
  engine: Engine;
  scenarioId: string;
  map: MapDef;
  defaults: Persona[];
  isSeeded: () => boolean;
  now: () => number;
  log: (entry: string) => void;
}

const PALETTE_FALLBACK = "#e6a23c";

export function initCharacterEditor(deps: CharacterEditorDeps): void {
  const { container, engine, map, defaults } = deps;
  let roster: Persona[] = defaults.map((p) => structuredClone(p));
  let editing: Persona | null = null;
  let isNew = false;

  const listEl = document.createElement("div");
  listEl.id = "character-list";
  const formEl = document.createElement("div");
  formEl.id = "character-form";
  formEl.hidden = true;
  container.append(listEl, formEl);

  void loadRoster(deps.scenarioId).then((saved) => {
    if (saved) {
      roster = saved;
      applyToEngine();
    }
    renderList();
  });

  function applyToEngine(): void {
    const { added } = reconcileRoster(engine, roster);
    if (deps.isSeeded()) {
      for (const agent of added) {
        void agent.seedMemories(deps.now());
      }
    }
  }

  async function persistAndApply(): Promise<void> {
    await saveRoster(deps.scenarioId, roster);
    applyToEngine();
    renderList();
  }

  function locationOptions(selected: string): string {
    const options: string[] = [];
    for (const area of map.areas) {
      const areaValue = area.name;
      options.push(
        `<option value="${escapeAttr(areaValue)}"${
          selected === areaValue ? " selected" : ""
        }>${escapeHtml(area.name)}</option>`,
      );
      for (const sub of area.subareas ?? []) {
        const value = `${area.name}:${sub.name}`;
        options.push(
          `<option value="${escapeAttr(value)}"${
            selected === value ? " selected" : ""
          }>&nbsp;&nbsp;${escapeHtml(`${area.name} — ${sub.name}`)}</option>`,
        );
      }
    }
    return options.join("");
  }

  function renderList(): void {
    listEl.innerHTML = "";
    for (const persona of roster) {
      const row = document.createElement("div");
      row.className = "character-row";
      const dot = document.createElement("span");
      dot.className = "character-dot";
      dot.style.background = persona.color || PALETTE_FALLBACK;
      const meta = document.createElement("div");
      meta.className = "character-meta";
      meta.innerHTML = `<span class="character-name">${escapeHtml(persona.name)}</span> <span class="character-sub">${persona.age} · ${escapeHtml(persona.home.split(":")[0])}</span>`;
      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openForm(persona, false));
      const removeBtn = document.createElement("button");
      removeBtn.className = "danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        if (!confirm(`Remove ${persona.name} from the town?`)) return;
        roster = roster.filter((p) => p !== persona);
        void persistAndApply().then(() =>
          deps.log(`[characters] removed ${persona.name}`),
        );
      });
      row.append(dot, meta, editBtn, removeBtn);
      listEl.appendChild(row);
    }

    const actions = document.createElement("div");
    actions.className = "character-actions";
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add character";
    addBtn.addEventListener("click", () => {
      const firstArea = map.areas[0];
      const firstSub = firstArea?.subareas?.[0];
      const blank: Persona = {
        name: "",
        age: 30,
        innateTraits: "",
        learned: "",
        currently: "",
        lifestyle: "",
        home: firstSub ? `${firstArea.name}:${firstSub.name}` : firstArea?.name ?? "",
        workplace: undefined,
        color: randomColor(),
        wakeHour: 7,
      };
      openForm(blank, true);
    });
    const resetBtn = document.createElement("button");
    resetBtn.textContent = `Reset to the original ${defaults.length}`;
    resetBtn.addEventListener("click", () => {
      if (!confirm("Discard all character customizations?")) return;
      roster = defaults.map((p) => structuredClone(p));
      void clearRoster(deps.scenarioId).then(() => {
        applyToEngine();
        renderList();
        deps.log(`[characters] roster reset to the original ${defaults.length}`);
      });
    });
    actions.append(addBtn, resetBtn);
    listEl.appendChild(actions);
  }

  function openForm(persona: Persona, creating: boolean): void {
    editing = persona;
    isNew = creating;
    formEl.hidden = false;
    listEl.hidden = true;
    formEl.innerHTML = `
      <div class="form-grid">
        <label>Name<input id="cf-name" type="text" value="${escapeAttr(persona.name)}" ${creating ? "" : "readonly"} /></label>
        <label>Age<input id="cf-age" type="number" min="1" max="120" value="${persona.age}" /></label>
        <label>Color<input id="cf-color" type="color" value="${escapeAttr(persona.color || PALETTE_FALLBACK)}" /></label>
        <label>Wake hour<input id="cf-wake" type="number" min="0" max="23" step="0.5" value="${persona.wakeHour}" /></label>
        <label class="wide">Innate traits<input id="cf-traits" type="text" value="${escapeAttr(persona.innateTraits)}" placeholder="e.g. curious, blunt, generous" /></label>
        <label class="wide">Life story (semicolons split into seed memories)<textarea id="cf-learned" rows="3">${escapeHtml(persona.learned)}</textarea></label>
        <label class="wide">Currently<textarea id="cf-currently" rows="2">${escapeHtml(persona.currently)}</textarea></label>
        <label class="wide">Lifestyle<textarea id="cf-lifestyle" rows="2">${escapeHtml(persona.lifestyle)}</textarea></label>
        <label>Home<select id="cf-home">${locationOptions(persona.home)}</select></label>
        <label>Workplace<select id="cf-work"><option value="">(none)</option>${locationOptions(persona.workplace ?? "")}</select></label>
      </div>
      <div class="character-actions">
        <button id="cf-save">${creating ? "Add to town" : "Save changes"}</button>
        <button id="cf-cancel" class="danger">Cancel</button>
      </div>
      <div id="cf-error" class="form-error"></div>
    `;
    formEl.querySelector("#cf-cancel")!.addEventListener("click", closeForm);
    formEl.querySelector("#cf-save")!.addEventListener("click", () => {
      void submitForm();
    });
  }

  function closeForm(): void {
    editing = null;
    formEl.hidden = true;
    formEl.innerHTML = "";
    listEl.hidden = false;
  }

  async function submitForm(): Promise<void> {
    if (!editing) return;
    const get = (id: string) =>
      (formEl.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement)
        .value;
    const errorEl = formEl.querySelector("#cf-error") as HTMLElement;
    const name = get("cf-name").trim();
    if (!name) {
      errorEl.textContent = "A name is required.";
      return;
    }
    if (isNew && roster.some((p) => p.name === name)) {
      errorEl.textContent = `"${name}" already lives here — names must be unique.`;
      return;
    }
    const updated: Persona = {
      name,
      age: Math.max(1, Number(get("cf-age")) || 30),
      innateTraits: get("cf-traits").trim(),
      learned: get("cf-learned").trim(),
      currently: get("cf-currently").trim(),
      lifestyle: get("cf-lifestyle").trim(),
      home: get("cf-home"),
      workplace: get("cf-work") || undefined,
      color: get("cf-color"),
      wakeHour: Math.min(23, Math.max(0, Number(get("cf-wake")) || 7)),
    };
    if (isNew) {
      roster.push(updated);
    } else {
      const index = roster.findIndex((p) => p.name === editing!.name);
      if (index >= 0) roster[index] = updated;
    }
    await persistAndApply();
    deps.log(
      `[characters] ${isNew ? "added" : "updated"} ${updated.name}`,
    );
    closeForm();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

const NEW_CHARACTER_COLORS = [
  "#e6a23c", "#5b8dd9", "#c95d5d", "#6cae75", "#9a6dd7",
  "#d98cb3", "#58b5c9", "#c9a758", "#b57f5b", "#7a9e4e",
];

function randomColor(): string {
  // <input type="color"> requires hex values.
  return NEW_CHARACTER_COLORS[
    Math.floor(Math.random() * NEW_CHARACTER_COLORS.length)
  ];
}
