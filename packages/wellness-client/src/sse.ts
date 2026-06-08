// Copyright (c) 2026-Present David Pine. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.
// SPDX-License-Identifier: MIT

/**
 * A single decoded Server-Sent Event. `event` defaults to `"message"` when the
 * stream omits an explicit `event:` field; `data` is the concatenation of every
 * `data:` line in the record joined by `\n`.
 */
export interface SseEvent {
  readonly event: string;
  readonly data: string;
}

/**
 * Incremental, allocation-light parser for a Server-Sent Events byte stream that
 * has already been decoded to text. Feed it arbitrary chunks (which may split an
 * event mid-field or mid-line) with {@link push}; it buffers partial records and
 * returns only the events that have been fully received.
 *
 * It is deliberately transport-agnostic and side-effect free so it can be unit
 * tested without a network. Line terminators may be LF, CRLF, or CR (per the SSE
 * spec); a trailing lone CR is held back so a CRLF split across two chunks is
 * never misread as a blank-line record boundary.
 */
export class SseDecoder {
  private buffer = "";

  /**
   * Appends a decoded text chunk and returns every event that is now complete.
   * Comment lines (those beginning with `:`, used for heartbeats) and records
   * that carry no `data` field are ignored.
   */
  push(chunk: string): SseEvent[] {
    let working = this.buffer + chunk;

    // Hold back a trailing CR: it might be the first half of a CRLF that lands
    // in the next chunk. Normalizing it now could fabricate a record boundary.
    let held = "";
    if (working.endsWith("\r")) {
      held = "\r";
      working = working.slice(0, -1);
    }

    working = working.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const events: SseEvent[] = [];
    let boundary = working.indexOf("\n\n");
    while (boundary !== -1) {
      const record = working.slice(0, boundary);
      working = working.slice(boundary + 2);

      const event = SseDecoder.parseRecord(record);
      if (event !== null) {
        events.push(event);
      }

      boundary = working.indexOf("\n\n");
    }

    this.buffer = working + held;
    return events;
  }

  private static parseRecord(record: string): SseEvent | null {
    let event = "message";
    const data: string[] = [];

    for (const line of record.split("\n")) {
      if (line === "" || line.startsWith(":")) {
        continue;
      }

      const colon = line.indexOf(":");
      let field: string;
      let value: string;
      if (colon === -1) {
        field = line;
        value = "";
      } else {
        field = line.slice(0, colon);
        value = line.slice(colon + 1);
        // A single leading space after the colon is part of the framing, not data.
        if (value.startsWith(" ")) {
          value = value.slice(1);
        }
      }

      if (field === "event") {
        event = value;
      } else if (field === "data") {
        data.push(value);
      }
      // Unknown fields (id, retry, ...) are intentionally ignored.
    }

    if (data.length === 0) {
      return null;
    }

    return { event, data: data.join("\n") };
  }
}
