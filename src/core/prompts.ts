import { ChatMessage } from "../llm/llm";
import { MemoryNode, Persona } from "./types";

/** Formats sim-time (minutes since sim epoch, day 1 = Feb 13 2023). */
export function formatTime(simMinutes: number): string {
  const day = Math.floor(simMinutes / 1440);
  const minutes = simMinutes % 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const date = new Date(2023, 1, 13 + day);
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  return `${weekday}, ${monthDay}, ${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatDate(simMinutes: number): string {
  const day = Math.floor(simMinutes / 1440);
  const date = new Date(2023, 1, 13 + day);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatClock(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60) % 24;
  const m = Math.round(minutesSinceMidnight % 60);
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function user(content: string): ChatMessage[] {
  return [{ role: "user", content }];
}

/** Broad-strokes daily plan prompt (paper section 4.3). */
export function dailyPlanPrompt(
  summary: string,
  persona: Persona,
  dateText: string,
  yesterdaySummary: string,
): ChatMessage[] {
  return user(
    `${summary}\n\n` +
      `${yesterdaySummary}\n` +
      `Today is ${dateText}. Here is ${persona.name}'s plan today in broad strokes ` +
      `(5 to 8 numbered entries, each with a time, starting with waking up at ${formatClock(persona.wakeHour * 60)} and ending with going to bed):\n1)`,
  );
}

/** Decompose a daily-plan chunk into shorter timed actions. */
export function decomposePrompt(
  summary: string,
  persona: Persona,
  dateText: string,
  chunk: string,
  startClock: string,
  endClock: string,
  granularity: string,
  knownAreas: string,
): ChatMessage[] {
  return user(
    `${summary}\n\n` +
      `Today is ${dateText}. ${persona.name} plans to: "${chunk}" from ${startClock} to ${endClock}.\n` +
      `Known places in Smallville: ${knownAreas}.\n` +
      `Decompose this into a schedule of ${granularity} tasks. Respond with one task per line in exactly this format:\n` +
      `<start time> ~ <end time> | <task description> | <location>\n` +
      `where <location> is one of the known places above, written as "Area" or "Area:sub-area". Cover the whole time range from ${startClock} to ${endClock}. Respond with only the schedule lines.`,
  );
}

/** Reaction decision prompt (paper section 4.3.1). */
export function reactionPrompt(
  summary: string,
  timeText: string,
  persona: Persona,
  status: string,
  observation: string,
  context: string,
): ChatMessage[] {
  return user(
    `${summary}\n\n` +
      `It is ${timeText}.\n` +
      `${persona.name}'s status: ${status}\n` +
      `Observation: ${observation}\n` +
      `Summary of relevant context from ${persona.name}'s memory: ${context}\n` +
      `Should ${persona.name} react to the observation, and if so, what would be an appropriate reaction?\n` +
      `Respond in exactly this format:\n` +
      `React: <yes or no>\n` +
      `Reaction: <if yes, one sentence describing the reaction; if the reaction is starting a conversation with another person, phrase it as "${persona.name} is initiating a conversation with <name> about <topic>">`,
  );
}

/** First utterance of a dialogue (paper section 4.3.2). */
export function dialogueOpenerPrompt(
  summary: string,
  timeText: string,
  persona: Persona,
  status: string,
  observation: string,
  context: string,
  otherName: string,
): ChatMessage[] {
  return user(
    `${summary}\n\n` +
      `It is ${timeText}.\n` +
      `${persona.name}'s status: ${status}\n` +
      `Observation: ${observation}\n` +
      `Summary of relevant context from ${persona.name}'s memory: ${context}\n` +
      `${persona.name} is initiating a conversation with ${otherName}. What would ${persona.name} say to ${otherName}? Respond with only the spoken line, no quotation marks.`,
  );
}

/** Next utterance in an ongoing dialogue (paper section 4.3.2). */
export function dialogueTurnPrompt(
  summary: string,
  timeText: string,
  persona: Persona,
  status: string,
  context: string,
  otherName: string,
  history: string,
): ChatMessage[] {
  return user(
    `${summary}\n\n` +
      `It is ${timeText}.\n` +
      `${persona.name}'s status: ${status}\n` +
      `Summary of relevant context from ${persona.name}'s memory: ${context}\n` +
      `Here is the dialogue history:\n${history}\n` +
      `How would ${persona.name} respond to ${otherName}? If the conversation has naturally concluded, ${persona.name} should say goodbye. Respond in exactly this format:\n` +
      `Say: <the spoken line>\n` +
      `End conversation: <yes or no>`,
  );
}

/** Reflection step 1: generate salient high-level questions (paper 4.2). */
export function reflectionQuestionsPrompt(statements: string): ChatMessage[] {
  return user(
    `${statements}\n\n` +
      `Given only the information above, what are 3 most salient high-level questions we can answer about the subjects in the statements? Respond with one question per line and nothing else.`,
  );
}

/** Reflection step 2: extract insights citing evidence (paper 4.2). */
export function reflectionInsightsPrompt(
  personaName: string,
  numberedStatements: string,
): ChatMessage[] {
  return user(
    `Statements about ${personaName}\n${numberedStatements}\n` +
      `What 5 high-level insights can you infer from the above statements? Respond with one insight per line in exactly this format:\n` +
      `<insight> (because of 1, 5, 3)\n` +
      `citing the statement numbers that serve as evidence.`,
  );
}

/**
 * Agent's summary description (paper appendix A): core characteristics,
 * daily occupation, and recent progress, each summarized from retrieved
 * memories.
 */
export function summaryComponentPrompt(
  personaName: string,
  question: string,
  statements: MemoryNode[],
): ChatMessage[] {
  const list = statements.map((s) => `- ${s.description}`).join("\n");
  return user(
    `How would one describe ${personaName}'s ${question} given the following statements?\n${list}\n` +
      `Respond with a concise one-sentence summary.`,
  );
}

/** Generate the wake-up hour from lifestyle (official implementation). */
export function wakeUpHourPrompt(persona: Persona): ChatMessage[] {
  return user(
    `${persona.lifestyle}\n` +
      `In general, what time does ${persona.name} wake up? Respond with only a time like "7:00 am".`,
  );
}

/**
 * New-day identity revision (official implementation): summarize what to
 * remember and how the agent feels, then rewrite the "currently" status.
 */
export function planNotePrompt(personaName: string, statements: string, dateText: string): ChatMessage[] {
  return user(
    `[Statements]\n${statements}\n\n` +
      `Given the statements above, is there anything that ${personaName} should remember as they plan for ${dateText}? ` +
      `If there is any scheduling information, be as specific as possible (include date, time, and location if stated). ` +
      `Write the response from ${personaName}'s perspective in a few sentences.`,
  );
}

export function thoughtNotePrompt(personaName: string, statements: string): ChatMessage[] {
  return user(
    `[Statements]\n${statements}\n\n` +
      `Given the statements above, how might we summarize ${personaName}'s feelings about their days up to now? ` +
      `Write the response from ${personaName}'s perspective in a few sentences.`,
  );
}

export function newCurrentlyPrompt(
  personaName: string,
  oldCurrently: string,
  notes: string,
  yesterdayText: string,
  todayText: string,
): ChatMessage[] {
  return user(
    `${personaName}'s status from ${yesterdayText}:\n${oldCurrently}\n\n` +
      `${personaName}'s thoughts at the end of ${yesterdayText}:\n${notes}\n\n` +
      `It is now ${todayText}. Given the above, write ${personaName}'s status for ${todayText} that reflects those thoughts. ` +
      `Write this in third-person talking about ${personaName}, in one or two sentences. ` +
      `If there is any scheduling information, be as specific as possible (include date, time, and location if stated).\n` +
      `Follow this format:\nStatus: <new status>`,
  );
}

/** Post-conversation memo (official implementation: memo_on_convo). */
/**
 * Packed post-conversation prompt: poignancy score, memo, and planning
 * thought (official impl runs these as three separate calls) in one
 * JSON reply.
 */
export function conversationOutcomePrompt(
  personaName: string,
  transcript: string,
): ChatMessage[] {
  return user(
    `[Conversation]\n${transcript}\n\n` +
      `From ${personaName}'s perspective, reply with JSON having exactly these fields:\n` +
      `"importance": integer 1-10, where 1 is a purely mundane conversation and 10 an extremely poignant one for ${personaName}\n` +
      `"memo": one full sentence starting with "${personaName}" noting anything ${personaName} found interesting, or "" if nothing\n` +
      `"planning_thought": one full sentence starting with "${personaName}" noting anything ${personaName} needs to remember for their planning, or "" if nothing`,
  );
}

export const CONVERSATION_OUTCOME_SCHEMA = {
  type: "object",
  properties: {
    importance: { type: "integer", minimum: 1, maximum: 10 },
    memo: { type: "string" },
    planning_thought: { type: "string" },
  },
  required: ["importance", "memo", "planning_thought"],
  additionalProperties: false,
};

/** User-to-agent interview (paper section 3: interviewing agents). */
export function interviewPrompt(
  summary: string,
  timeText: string,
  personaName: string,
  status: string,
  context: string,
  history: string,
  question: string,
): ChatMessage[] {
  return user(
    `${summary}\n\n` +
      `It is ${timeText}.\n` +
      `${personaName}'s status: ${status}\n` +
      `Summary of relevant context from ${personaName}'s memory: ${context}\n` +
      `An interviewer is having a conversation with ${personaName}.\n` +
      (history ? `Here is the dialogue history:\n${history}\n` : "") +
      `Interviewer: ${question}\n` +
      `How would ${personaName} respond? Respond with only the spoken line.`,
  );
}

/**
 * Packed action annotation: emoji "pronunciatio" (paper section 3) and
 * poignancy score in one JSON reply, instead of two separate calls.
 */
export function actionNotePrompt(persona: Persona, action: string): ChatMessage[] {
  return user(
    `${persona.name} is currently: ${action}\n` +
      `Reply with JSON having exactly these fields:\n` +
      `"emoji": one or two emoji representing the action\n` +
      `"importance": integer 1-10, where 1 is purely mundane (e.g., brushing teeth) and 10 extremely poignant (e.g., a break up) for ${persona.name}`,
  );
}

export const ACTION_NOTE_SCHEMA = {
  type: "object",
  properties: {
    emoji: { type: "string" },
    importance: { type: "integer", minimum: 1, maximum: 10 },
  },
  required: ["emoji", "importance"],
  additionalProperties: false,
};

/** Batch importance scoring for a set of observations (one call). */
export function importanceBatchPrompt(
  persona: Persona,
  descriptions: string[],
): ChatMessage[] {
  return user(
    `On the scale of 1 to 10, where 1 is purely mundane (e.g., brushing teeth, making bed) and 10 is extremely poignant (e.g., a break up, college acceptance), rate the likely poignancy of each of the following memories for ${persona.name}.\n` +
      descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n") +
      `\nReply with JSON: {"scores": [<one integer per memory, in order>]}`,
  );
}

export function importanceBatchSchema(count: number): object {
  return {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: { type: "integer", minimum: 1, maximum: 10 },
        minItems: count,
        maxItems: count,
      },
    },
    required: ["scores"],
    additionalProperties: false,
  };
}

/** Identify which object the agent is using and its new status. */
export function objectStatusPrompt(
  personaName: string,
  action: string,
  objects: string[],
): ChatMessage[] {
  return user(
    `${personaName} is currently: ${action}\n` +
      `Nearby objects: ${objects.join(", ")}\n` +
      `Which one object, if any, is ${personaName} using, and what is that object's state while being used? Respond in exactly this format:\n` +
      `Object: <object name from the list, or "none">\n` +
      `State: <short description of the object's state, e.g. "being used to brew coffee">`,
  );
}
