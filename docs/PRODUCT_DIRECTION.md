# Mirror: development direction

Decision date: 2026-09-05. Publication preparation approved on 2026-09-07. This is a delivery plan, not a claim that the planned capabilities exist today; current capabilities are listed in the [README](../README.md).

## The product we are building

**Mirror is a comparison lab for investigating how AI describes an organization or service, and checking those descriptions against source material.**

The first user is one person researching a service. Start with concrete questions about features, plans, eligibility, limits, and dates. The same investigation can later help a company understand its own representation, but multi-user brand operations are not the first milestone.

The main interaction is: choose a question → compare answers → inspect the relevant official passage → record what is known and what needs checking. A source update should eventually identify related findings for re-review while preserving the previous evidence.

## Why this direction

| Decision criterion | What we will build and verify |
| --- | --- |
| Interesting demonstration | Explain differences between answers, then open the actual evidence and conditions that matter. |
| Practical utility | Reduce time spent finding the right passage and spotting a plan/date/eligibility mismatch. Compare against ordinary browser-and-chat research. |
| Original contribution | Investigate Japanese conditional statements and versioned evidence. Demonstrate an improvement on held-out examples; do not claim a world-first feature. |
| Portfolio explanation | Show a concrete failure, a design change, a comparative evaluation, and the resulting user workflow. |
| Individual development | Use external APIs selectively, measure cost per investigation, reuse retrieved sources, and keep execution bounded. |

The project will use external APIs. Browser-only operation is a useful fallback and test mode, not a product constraint. API keys belong in a server-side boundary. Configuring an integration and running paid requests are separate steps; the UI must show execution scope and usage.

## Competitive and research boundary

Official documentation reviewed on 2026-09-05 shows that claim extraction, comparison with brand knowledge, citation inspection, feedback, and source synchronization are already offered by existing tools. This research reviewed public descriptions, not product accuracy.

- [Profound FactCheck](https://help.tryprofound.com/articles/5793584301-about-factcheck) is a direct functional reference.
- [Profound Knowledge Bases](https://help.tryprofound.com/articles/5775538586-knowledge-bases-overview) documents source synchronization.
- [Factiverse](https://www.factiverse.ai/about) covers claim verification and evidence discovery.
- [FActScore](https://aclanthology.org/2023.emnlp-main.741/) studies atomic factual evaluation.
- [VitaminC](https://aclanthology.org/2021.naacl-main.52/) studies sensitivity to changes in evidence.

Therefore, “other products only measure visibility” and “fact-level checking is novel” are not defensible claims. The intended contribution is the implementation, usability, and measured quality of a narrowly scoped workflow. Demand and comparative quality remain unverified.

## First complete product milestone

Given one subject, a small set of questions, and selected source pages:

1. Acquire source text with provenance and an explicit capture result.
2. Obtain answers through an API adapter without feeding it the evaluation answer key. Imported answers remain supported.
3. Extract candidate factual statements and find supporting or contradictory passages.
4. Preserve plan, region, quantity, and time conditions when comparing claims.
5. Show original answers and evidence side by side, with an editable review decision.
6. Export the resulting investigation and report its API usage, elapsed time, and unresolved items.

An API answer is an observation under saved API conditions, not an exact representation of the provider's consumer chat product. Likewise, selected questions do not establish population-wide brand perception. Official source text is evidence about what the source states, not proof of every real-world claim.

## Delivery sequence

### Foundation: comparison first

- Make the comparison lab the front door, with one question and up to three chosen answers.
- Use existing saved assessments as saved assessments, never as newly performed verification.
- Surface capture conditions, unavailable historical text, and legacy records.
- Stabilize the interrupted experiment/backup changes without making experiments the main product.

### Acquisition and verification

- Implement a server-side API boundary, one real answer adapter, and bounded source retrieval.
- Implement an end-to-end verification baseline and record its costs before adding more providers.
- Add structured conditions only where concrete failure cases justify them.
- Keep failed retrieval, insufficient evidence, and contradictions distinguishable.

### Evidence-backed improvement

- Begin with ten difficult research examples; measure the simple baseline before optimizing it.
- Grow a human-reviewed set to approximately 100–150 claims as annotation effort permits.
- Split by service/source family so development and held-out cases do not overlap.
- Report real observations and deliberately modified examples separately.
- Measure false support, missed relevant evidence, incorrect warnings, abstention, latency, and cost.
- Pilot with 3–5 people, comparing confirmation time and missed issues against their normal research workflow. Treat this as preliminary evidence.
- Add source-change impact tracking after the basic evidence links are useful and reliable.

## Out of scope until justified

- Autonomous web publishing, SEO recommendations, and promises to influence future AI answers.
- A large provider matrix, always-on crawling, or multi-user enterprise administration.
- A universal truth score or ranking of AI models from a few selected answers.
- Training a new foundation model.
- Cosmetic dashboards unrelated to the user's next research decision.

## Working agreement

The direction above is the default for implementation. Reopen it when actual usage or evaluation contradicts it, not whenever another feature idea appears. Keep technical and product decisions, rejected AI-generated suggestions, and measured failures explainable by the project owner. A portfolio release was requested on 2026-09-07; release status must be verified separately from this plan. Real API integration is not a prerequisite for showing the accurately labeled local-first demo.
