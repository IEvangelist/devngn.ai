// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { SseDecoder } from "./sse.js";

describe("SseDecoder", () => {
  it("parses a single LF-delimited event", () => {
    const decoder = new SseDecoder();
    const events = decoder.push("event: prompt\ndata: hello\n\n");
    expect(events).toEqual([{ event: "prompt", data: "hello" }]);
  });

  it("defaults the event name to 'message' when omitted", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("data: hi\n\n")).toEqual([
      { event: "message", data: "hi" },
    ]);
  });

  it("ignores heartbeat comment records", () => {
    const decoder = new SseDecoder();
    expect(decoder.push(": heartbeat\n\n")).toEqual([]);
  });

  it("concatenates multi-line data fields with newlines", () => {
    const decoder = new SseDecoder();
    const events = decoder.push("data: line1\ndata: line2\n\n");
    expect(events).toEqual([{ event: "message", data: "line1\nline2" }]);
  });

  it("buffers an event split across multiple chunks", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("event: prompt\nda")).toEqual([]);
    expect(decoder.push("ta: payload\n")).toEqual([]);
    expect(decoder.push("\n")).toEqual([{ event: "prompt", data: "payload" }]);
  });

  it("handles CRLF line endings", () => {
    const decoder = new SseDecoder();
    const events = decoder.push("event: prompt\r\ndata: crlf\r\n\r\n");
    expect(events).toEqual([{ event: "prompt", data: "crlf" }]);
  });

  it("does not misread a CRLF split across chunk boundaries", () => {
    const decoder = new SseDecoder();
    // The blank-line terminator's CRLF is split: '...\r' then '\n\r\n'.
    expect(decoder.push("data: split\r")).toEqual([]);
    expect(decoder.push("\n\r\n")).toEqual([
      { event: "message", data: "split" },
    ]);
  });

  it("emits multiple events from one chunk", () => {
    const decoder = new SseDecoder();
    const events = decoder.push(
      "event: prompt\ndata: a\n\nevent: prompt\ndata: b\n\n",
    );
    expect(events).toEqual([
      { event: "prompt", data: "a" },
      { event: "prompt", data: "b" },
    ]);
  });

  it("treats a value with no leading space verbatim", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("data:tight\n\n")).toEqual([
      { event: "message", data: "tight" },
    ]);
  });

  it("round-trips a JSON prompt payload", () => {
    const decoder = new SseDecoder();
    const payload = { id: "1", activityTitle: "Stretch" };
    const events = decoder.push(
      `event: prompt\ndata: ${JSON.stringify(payload)}\n\n`,
    );
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.data)).toEqual(payload);
  });
});
