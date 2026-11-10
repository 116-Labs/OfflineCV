// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The offlinecv Authors

/**
 * Stream-order extractability of mixed-weight lines (#1193).
 *
 * pypdf and Google Drive read a content stream in order and treat every
 * text-show as its own line, so a bullet drawn one word per `drawText` comes
 * back one word per line. pdfjs `getTextContent` items are one per text-show,
 * which makes joining them with newlines the same view without a Python dep.
 */

import { describe, expect, it } from "vitest";
import { renderAtsResumePdf } from "./render-ats-pdf.ts";
import { EMPHASIS_OPEN, EMPHASIS_CLOSE } from "./auto-bold-metrics.ts";
import type { AtsEntry, AtsResumeModel } from "./ats-resume-model.ts";

async function streamOrderLines(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  const content = await doc.getPage(1).then((pg) => pg.getTextContent());
  return content.items
    .filter((it) => "str" in it)
    .map((it) => (it as { str: string }).str)
    .filter((s) => s.trim());
}

describe("mixed-weight lines in stream order", () => {
  it("keeps each same-weight run of a bullet or header in one text-show", async () => {
    const model = {
      contact: { name: "Jordan Bennett", links: [] },
      sections: [
        {
          heading: "Experience",
          entries: [
            {
              headerLine: "Senior Engineer · Northwind Systems",
              subLine: "Bellevue, WA  Jan. 2020 – Dec. 2023",
              bullets: [
                "Grew the team to 18 engineers and cut p95 latency 6x by rewriting the cache.",
              ],
            } as AtsEntry,
            {
              headerLine: `${EMPHASIS_OPEN}Patent${EMPHASIS_CLOSE} · Issued patent for a cache invalidation scheme · 2019`,
              bullets: [],
            } as AtsEntry,
          ],
        },
      ],
    } as AtsResumeModel;

    const { bytes } = await renderAtsResumePdf(model);
    const lines = await streamOrderLines(bytes);

    // Real spaces are written between words of the same weight, so each run
    // of one weight is one text-show: the prose on both sides of a bold
    // metric, the metric itself, and an achievement header's regular tail
    // after its bold type label (drawHeaderRuns shares drawRunWords).
    expect(lines).toEqual(
      expect.arrayContaining([
        "Grew the team to",
        "18 engineers",
        "and cut p95 latency",
        "6x",
        "by rewriting the cache.",
        "Patent",
        "· Issued patent for a cache invalidation scheme · 2019",
      ]),
    );
    // …and no word of prose stands alone.
    const prose = lines.filter((l) => /^(and|cut|by|the|Grew|team|to|Issued|scheme)$/.test(l.trim()));
    expect(prose).toEqual([]);
  });
});
