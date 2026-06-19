import { describe, it, expect } from "vitest";
import { mergeConversation, formatConversation, getReplySubject, type ConversationTurn } from "@/lib/conversation";

describe("mergeConversation", () => {
  it("orders sent outbound + inbound by timestamp and drops non-sent outbound", () => {
    const turns = mergeConversation({
      emails: [
        { subject: "Hola", bodyText: "primer email", sentAt: "2026-06-01T10:00:00Z", createdAt: "2026-06-01T09:00:00Z", status: "sent" },
        { subject: "Borrador", bodyText: "no enviado", sentAt: null, createdAt: "2026-06-01T08:00:00Z", status: "draft" },
      ],
      waMessages: [
        { body: "wa enviado", sentAt: "2026-06-03T10:00:00Z", createdAt: "2026-06-03T09:00:00Z", status: "sent" },
        { body: "wa held", sentAt: null, createdAt: "2026-06-02T00:00:00Z", status: "held" },
      ],
      replies: [{ channel: "email", body: "respuesta", receivedAt: "2026-06-02T10:00:00Z" }],
    });
    expect(turns.map((t) => t.text)).toEqual(["primer email", "respuesta", "wa enviado"]);
    expect(turns.map((t) => t.direction)).toEqual(["out", "in", "out"]);
  });

  it("falls back to createdAt when sentAt is missing on a sent row", () => {
    const turns = mergeConversation({
      emails: [{ subject: null, bodyText: "x", sentAt: null, createdAt: "2026-06-01T00:00:00Z", status: "sent" }],
      waMessages: [],
      replies: [],
    });
    expect(turns[0].at).toBe("2026-06-01T00:00:00Z");
  });
});

describe("formatConversation", () => {
  const turns: ConversationTurn[] = [
    { direction: "out", channel: "email", text: "hola que tal", at: "2026-06-01T00:00:00Z" },
    { direction: "in", channel: "whatsapp", text: "todo bien", at: "2026-06-02T00:00:00Z" },
  ];
  it("labels who and the channel", () => {
    const s = formatConversation(turns, "Yo", "Cliente");
    expect(s).toContain("[Email] Yo: hola que tal");
    expect(s).toContain("[WhatsApp] Cliente: todo bien");
  });
  it("caps each turn to perTurnChars", () => {
    const s = formatConversation([turns[0]], "Yo", "Cliente", 4);
    expect(s).toBe("[Email] Yo: hola");
  });
});

describe("getReplySubject", () => {
  const out = (subject: string | null): ConversationTurn => ({ direction: "out", channel: "email", text: "x", at: "2026", subject });
  it("prefixes Re: from the latest outbound email subject", () => {
    expect(getReplySubject([out("Tu web")])).toBe("Re: Tu web");
  });
  it("does not double-prefix an existing Re:", () => {
    expect(getReplySubject([out("Re: Tu web")])).toBe("Re: Tu web");
  });
  it("returns a bare Re: when there is no prior email subject", () => {
    expect(getReplySubject([])).toBe("Re:");
  });
});
