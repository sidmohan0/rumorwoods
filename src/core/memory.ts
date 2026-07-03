import { MemoryKind, MemoryNode } from "./types";
import { embed, cosineSimilarity } from "../llm/embeddings";

/** Exponential decay per sim hour since last access (paper: 0.995). */
const RECENCY_DECAY = 0.995;
const W_RECENCY = 1;
const W_IMPORTANCE = 1;
const W_RELEVANCE = 1;

let nextId = 1;

export class MemoryStream {
  nodes: MemoryNode[] = [];
  /** Running sum of importance since the last reflection (paper threshold: 150). */
  importanceSinceReflection = 0;

  async add(
    kind: MemoryKind,
    description: string,
    createdAt: number,
    importance: number,
    extra: { evidence?: number[]; subject?: string } = {},
  ): Promise<MemoryNode> {
    const node: MemoryNode = {
      id: nextId++,
      kind,
      description,
      createdAt,
      lastAccessedAt: createdAt,
      importance,
      embedding: await embed(description),
      evidence: extra.evidence,
      subject: extra.subject,
    };
    this.nodes.push(node);
    if (kind === "observation" || kind === "chat") {
      this.importanceSinceReflection += importance;
    }
    return node;
  }

  /** Most recent n memories, newest last (as fed to reflection prompts). */
  recent(n: number): MemoryNode[] {
    return this.nodes.slice(-n);
  }

  latestWithSubject(subject: string): MemoryNode | undefined {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      if (this.nodes[i].subject === subject) return this.nodes[i];
    }
    return undefined;
  }

  /**
   * Retrieval scoring from the paper: normalized weighted sum of
   * recency (exponential decay), importance, and relevance (cosine
   * similarity of embeddings). Retrieved nodes have lastAccessedAt
   * updated.
   */
  async retrieve(
    query: string,
    now: number,
    topK = 15,
  ): Promise<MemoryNode[]> {
    if (this.nodes.length === 0) return [];
    const queryEmbedding = await embed(query);

    const recencyRaw: number[] = [];
    const importanceRaw: number[] = [];
    const relevanceRaw: number[] = [];
    for (const node of this.nodes) {
      const hoursSinceAccess = Math.max(0, (now - node.lastAccessedAt) / 60);
      recencyRaw.push(Math.pow(RECENCY_DECAY, hoursSinceAccess));
      importanceRaw.push(node.importance);
      relevanceRaw.push(
        node.embedding ? cosineSimilarity(queryEmbedding, node.embedding) : 0,
      );
    }

    const norm = (values: number[]): number[] => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      return values.map((v) => (v - min) / range);
    };
    const recency = norm(recencyRaw);
    const importance = norm(importanceRaw);
    const relevance = norm(relevanceRaw);

    const scored = this.nodes.map((node, i) => ({
      node,
      score:
        W_RECENCY * recency[i] +
        W_IMPORTANCE * importance[i] +
        W_RELEVANCE * relevance[i],
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK).map((s) => s.node);
    for (const node of top) node.lastAccessedAt = now;
    return top;
  }
}
