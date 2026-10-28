---
name: standard-verification
description: Verify WalFlow equipment models against a standard or reference book the user supplies (API, ISO, IEC, ISA, HI, EN, ASME, Crane, Idelchik, papers). Use whenever the user hands over a standard or literature source, asks to verify a claim in section 2 of an equipment .md, adds or changes a citation, or asks about the standards register (docs/STANDARDS_REGISTER.md) or the private reference library (walflow-references).
---

# Standard verification

The section 2 references of the equipment documents were written by an LLM from memory. This skill turns them into verified claims, one source at a time. The register is [docs/STANDARDS_REGISTER.md](../../../docs/STANDARDS_REGISTER.md).

## Where things live

| What | Where | Public? |
| :--- | :--- | :--- |
| Sources, claims, verification log | `docs/STANDARDS_REGISTER.md` | yes |
| Claim table per component | section 2 of `backend/simulation/equipment/<name>.md` | yes |
| Model deviations found | `FINDINGS.md` (next `D-xx`) | yes |
| Source PDFs | `../walflow-references/standards/`, `../walflow-references/literature/` | **no** (private repo) |
| Clause excerpts, working notes | `../walflow-references/notes/<Ref ID>_<edition>.md` | **no** |

Copyright: in the public repo cite the clause, equation, table or figure number and paraphrase. A quote is at most one sentence. Never copy tables, figures or coefficient sets into the public repo; they go in the private notes.

## Workflow

1. **Intake.** The user names the file in `../walflow-references`. Read the title page and foreword to fix the exact designation, edition, year, amendments and corrigenda. If it is not the edition in register Part A, update Part A (keep the old edition in the note). If the file name does not follow `<Ref ID>_<edition>.pdf`, propose the rename.
2. **Scope.** List every Part B claim with this Ref ID. Large PDFs: read the table of contents first, then only the needed pages (Read with `pages`, at most 20 per call).
3. **Check each claim** on three levels:
   - the **source**: find the clause that states it; note clause, equation or table number;
   - the **doc**: does section 3 of the equipment `.md` give the same equation, limits and constants;
   - the **code**: does the implementation in `backend/simulation/equipment/` match (constants, units, gauge or absolute, validity limits, regime boundaries).
   Where the source gives a worked example or test value, compute the model's result for it and compare.
4. **Classify** each claim: ✅ Verified, ⚠️ Deviation, ❌ Not in source, or ➖ Principle (see the register legend). A deliberate simplification already stated in the doc (e.g. the smooth $F_R$ of the linear control valve) is ✅ when the source and the doc agree on what is simplified; quantify the difference in the note.
5. **Second opinion.** For any ⚠️ or ❌, and for every claim that sets a number in the code, brief `walflow-physics-reviewer` with the claim, the clause paraphrase, the PDF path and pages, and the doc and code locations.
6. **Record** (public repo):
   - register Part B: status, "Verified against" (edition), clause, date, note;
   - register Part C: one log row for the session;
   - equipment `.md` section 2: the status cell, e.g. `✅ 10th ed. (2020) §5.8` or `⚠️ Re limit flat 16 000, §5.3.1 gives 16 000·β²` while the deviation is open (a short description, never the `D-xx` ID: `FINDINGS.md` will be deleted, so code, docs, register, skills and tests never carry a finding ID); once it is fixed, the cell becomes ✅ with the clause;
   - the 🚩 flag is removed once the flagged question is answered.
7. **Deviation.** Add a `D-xx` finding to `FINDINGS.md` in the repo root (create it if it does not exist) with the clause and the expected value. Do not change model code in the verification task: a fix is a separate task after the user confirms it, following the bug-fix decision tree of the `walflow-qa` skill.
8. **Not in source.** Propose a replacement source or the removal of the citation; change the doc only after the user agrees.
9. **Private notes.** Write `../walflow-references/notes/<Ref ID>_<edition>.md`: per claim the clause, the relevant excerpt or equation, and the reasoning. Tell the user to commit the private repo; never commit it yourself without being asked.
10. **Report** to the user: per claim the status and one line why, the findings opened, and the files changed.

## Citation rules

- Every source has a Ref ID in register Part A and a type: Standard, Literature or Principle.
- Standards: organisation, number, part, title, edition or year, amendments (`ISO 4126-1:2013 + Amd 1:2016`, `API Std 520 Part I, 10th ed. (2020)`).
- Books: authors, title, edition, publisher, year, ISBN. Papers: authors (year), title, journal, volume(issue), pages, DOI when it exists.
- Page and diagram numbers (Crane A-26, Idelchik diagrams) are only valid with the edition.
- A new equipment document cites with this format and starts every claim as ⚪ Unverified with a new register row.
