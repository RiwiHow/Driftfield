import { describe, expect, it } from "vitest";

import {
  isAgentWorkerCommand,
  isAgentWorkerMessage,
} from "../../../src/shared/contracts/agent-worker";

describe("Agent utility-process protocol", () => {
  it("accepts bounded correlated tool activity events", () => {
    expect(
      isAgentWorkerMessage({
        input: '{"documentId":"chapter-1"}',
        requestId: "request-1",
        toolCallId: "tool-1",
        toolName: "get_document",
        type: "tool-started",
      }),
    ).toBe(true);
    expect(
      isAgentWorkerMessage({
        failed: false,
        output: '{"ok":true}',
        requestId: "request-1",
        toolCallId: "tool-1",
        toolName: "get_document",
        type: "tool-completed",
      }),
    ).toBe(true);
    expect(
      isAgentWorkerMessage({
        input: "x".repeat(8_193),
        requestId: "request-1",
        toolCallId: "tool-1",
        toolName: "get_document",
        type: "tool-started",
      }),
    ).toBe(false);
  });

  it("accepts application-owned worker commands", () => {
    expect(
      isAgentWorkerCommand({
        authPath: "/app-data/auth.json",
        cwd: "/project",
        enabledTools: ["get_current_document"],
        history: [],
        proposalOutcomes: [],
        modelId: "claude-sonnet",
        modelsPath: "/app-data/models.json",
        prompt: "Review this chapter",
        providerId: "anthropic",
        requestId: "request-1",
        role: "curator",
        thinkingLevel: "medium",
        type: "start",
      }),
    ).toBe(true);
    expect(
      isAgentWorkerCommand({
        authPath: "/app-data/auth.json",
        modelsPath: "/app-data/models.json",
        requestId: "models-1",
        type: "list-models",
      }),
    ).toBe(true);
    expect(
      isAgentWorkerCommand({
        requestId: "request-1",
        result: {
          data: {
            format: "driftfield",
            lore: {
              children: [],
              id: "lore-1",
              kind: "lore",
              title: "Lore",
              type: "directory",
            },
            manuscript: {
              children: [],
              id: "manuscript-1",
              kind: "manuscript",
              title: "Manuscript",
              type: "directory",
            },
            project: {
              id: "project-1",
              revision: "revision-1",
              title: "Novel",
            },
          },
          ok: true,
          toolName: "get_novel_structure",
        },
        toolCallId: "tool-structure",
        type: "tool-result",
      }),
    ).toBe(true);
    expect(
      isAgentWorkerCommand({
        requestId: "request-1",
        result: {
          data: {
            baseRevision: "revision",
            contentRevision: "revision",
            documentId: "chapter-1",
            markdown: "Chapter text",
            source: "disk",
            title: "Chapter",
          },
          ok: true,
          toolName: "get_document",
        },
        toolCallId: "tool-1",
        type: "tool-result",
      }),
    ).toBe(true);
  });

  it("rejects malformed worker commands", () => {
    expect(
      isAgentWorkerCommand({ prompt: "missing identity", type: "start" }),
    ).toBe(false);
    expect(
      isAgentWorkerCommand({ requestId: "request-1", type: "tool-result" }),
    ).toBe(false);
    expect(
      isAgentWorkerCommand({
        requestId: "request-1",
        result: {
          data: {
            baseRevision: "revision",
            contentRevision: "revision",
            documentId: "chapter-1",
            markdown: "Chapter text",
            source: "disk",
            title: "Chapter",
          },
          ok: true,
          toolName: "get_novel_structure",
        },
        toolCallId: "tool-1",
        type: "tool-result",
      }),
    ).toBe(false);
    expect(
      isAgentWorkerCommand({
        authPath: "/app-data/auth.json",
        cwd: "/project",
        enabledTools: [],
        modelId: "claude-sonnet",
        modelsPath: "/app-data/models.json",
        prompt: "Review this chapter",
        providerId: "anthropic",
        requestId: "request-1",
        role: "arbitrary-system-prompt",
        thinkingLevel: "medium",
        type: "start",
      }),
    ).toBe(false);
  });

  it("accepts typed stream and tool messages", () => {
    expect(isAgentWorkerMessage({ type: "ready" })).toBe(true);
    expect(
      isAgentWorkerMessage({
        delta: "text",
        requestId: "request-1",
        type: "text-delta",
      }),
    ).toBe(true);
    expect(
      isAgentWorkerMessage({
        models: [
          {
            api: "anthropic-messages",
            contextWindow: 100_000,
            id: "claude-sonnet",
            maxOutputTokens: 8_192,
            name: "Claude Sonnet",
            providerId: "anthropic",
            reasoning: true,
            thinkingLevelMap: {},
          },
        ],
        requestId: "models-1",
        type: "models",
      }),
    ).toBe(true);
    expect(
      isAgentWorkerMessage({
        arguments: { documentId: "chapter-1" },
        requestId: "request-1",
        toolCallId: "tool-1",
        toolName: "get_document",
        type: "tool-request",
      }),
    ).toBe(true);
  });

  it("rejects malformed worker messages but forwards bounded tool arguments for typed errors", () => {
    expect(
      isAgentWorkerMessage({ requestId: "request-1", type: "text-delta" }),
    ).toBe(false);
    expect(
      isAgentWorkerMessage({
        arguments: { markdown: 'x'.repeat(640 * 1024 + 1) },
        requestId: 'request-1',
        toolCallId: 'tool-oversized',
        toolName: 'propose_document_edit',
        type: 'tool-request',
      }),
    ).toBe(false);
    expect(isAgentWorkerMessage({ requestId: 1, type: "completed" })).toBe(
      false,
    );
    expect(
      isAgentWorkerMessage({
        arguments: { documentId: "not-allowed" },
        requestId: "request-1",
        toolCallId: "tool-1",
        toolName: "get_current_document",
        type: "tool-request",
      }),
    ).toBe(true);
  });
});
