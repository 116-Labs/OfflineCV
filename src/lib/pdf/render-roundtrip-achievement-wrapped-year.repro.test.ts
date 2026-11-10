// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The offlinecv Authors

/**
 * Round-trip guard for #1194 — an achievement whose header is long enough that
 * " · YYYY" wraps onto its own line keeps its year across export → import →
 * export. The wrapped year used to open a title-less block that was dropped, so
 * the second export lost the date while shorter siblings kept theirs.
 *
 * The title is sized so the line breaks between the middot and the year,
 * leaving "2019" alone on the last drawn line: the shape main loses. (A line
 * of "· 2019" already round-tripped.) The drawn-lines assertion pins that
 * shape, so a renderer metric change that moves the break fails loudly here
 * instead of turning this into a test that passes without the fix.
 *
 * PII-free: synthetic persona, all fields fabricated.
 */

import { describe, it, expect } from "vitest";
import { runCascade } from "../heuristics/cascade.ts";
import type { AnonymousAtsScore } from "../score/score.ts";
import type { CascadeResult, HeuristicParsedResume } from "../heuristics/types.ts";
import type { SectionedResume } from "../heuristics/sections.ts";
import { buildAtsResumeModel } from "./ats-resume-model.ts";
import { renderAtsResumePdf } from "./render-ats-pdf.ts";
import { extractPdfDrawnLines } from "./render-ats-pdf.test-utils.ts";

const PARSED: HeuristicParsedResume = {
  full_name: "Jane Candidate",
  email: "jane@example.com",
  phone: "(312) 555-0123",
  location: "Chicago, IL",
  summary: "Platform engineer with a decade of distributed-systems experience.",
  skills: ["TypeScript", "Go", "PostgreSQL"],
  experience: [],
  education: [],
  heuristic_achievements: [
    {
      type: "Patent",
      title:
        "Issued Patent US1234567B1 a very long descriptive title for a widget-processing system used across catalogs and many large retail storefronts in several regions with shared inventory pricing and data.",
      year: "2019",
    },
    { type: "Publication", title: "Co-authored a short survey", year: "2009" },
  ],
};

const EMPTY_SECTIONS: SectionedResume = {
  byName: new Map() as SectionedResume["byName"],
  accomplishmentSections: ["experience", "projects", "achievements"],
  source: "regex",
};

function makeResult(fields: HeuristicParsedResume): CascadeResult {
  return {
    canonical: { fields, sections: EMPTY_SECTIONS, fieldConfidence: {} },
    confidence: 1,
    triggers: [],
    linkAnnotations: [],
    rawText: "",
  } as unknown as CascadeResult;
}

const fakeScore = { bullets: [] } as unknown as AnonymousAtsScore;

describe("#1194 — a wrapped achievement year survives export → import → export", () => {
  it("keeps every year in headerLine after a second hop", async () => {
    const first = buildAtsResumeModel(makeResult(PARSED), fakeScore);
    const bytes = (await renderAtsResumePdf(first)).bytes;
    const drawn = (await extractPdfDrawnLines(bytes)).map((l) => l.text);
    expect(drawn[drawn.findIndex((t) => t.endsWith("and data. ·")) + 1]).toBe("2019");

    const reparsed = await runCascade(bytes);
    const achievements = reparsed.canonical.fields.heuristic_achievements ?? [];
    expect(achievements.map((a) => a.year)).toEqual(["2019", "2009"]);

    const second = buildAtsResumeModel(makeResult(reparsed.canonical.fields), fakeScore);
    const headers = second.sections
      .find((s) => s.kind === "achievements")!
      .entries.map((e) => e.headerLine);
    expect(headers[0]).toMatch(/· 2019$/);
    expect(headers[1]).toMatch(/· 2009$/);
  });
});
