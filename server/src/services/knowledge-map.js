import { groupEvidence } from '../../../shared/unit-evidence.js';

/**
 * EXPERIMENTAL knowledge map, read-only: observed evidence per SECTION of the source the questions were drafted from.
 * A question is linked to a section only with SUSTAINED identification: its frozen citation pages (exercise_source_citations) must fall inside
 * exactly ONE section of the source outline (the last outline entry that starts on or before the page; a page where two entries start belongs to
 * two sections, so it is AMBIGUOUS). No citation = UNKNOWN. Unknown and ambiguous questions are counted apart and their attempts are attributed to
 * no section. Provenance is stated (`basis`). Only OBSERVED evidence is reported (independent attempts only; see shared/unit-evidence.js): no level,
 * no mastery. Writes nothing; no screen uses it; no persistent entity exists or is created.
 */
export function knowledgeMap(db, userId) {
  const events = db.prepare(`
    SELECT e.id, e.unit_id AS unitId, e.exercise_version_id AS exerciseVersionId, e.kind, e.corrects_event_id AS correctsEventId,
           e.outcome, e.assistance_used AS assistanceUsed, e.occurred_at AS occurredAt
    FROM learning_events e WHERE e.user_id = ?
  `).all(userId);
  if (events.length === 0) return { units: [] };

  const outlineBySource = new Map();
  for (const row of db.prepare('SELECT source_id AS sourceId, ordinal, level, title, page_index AS pageIndex FROM source_outline WHERE user_id = ? ORDER BY source_id, ordinal').all(userId)) {
    if (!outlineBySource.has(row.sourceId)) outlineBySource.set(row.sourceId, []);
    outlineBySource.get(row.sourceId).push(row);
  }
  /** The outline entries a page belongs to: those starting on the last start-page at or before it. */
  const sectionsOfPage = (sourceId, page) => {
    const entries = (outlineBySource.get(sourceId) ?? []).filter((o) => o.pageIndex <= page);
    if (entries.length === 0) return [];
    const lastStart = Math.max(...entries.map((o) => o.pageIndex));
    return entries.filter((o) => o.pageIndex === lastStart);
  };

  const pagesByVersion = new Map();
  for (const c of db.prepare('SELECT exercise_version_id AS versionId, source_id AS sourceId, page_index AS pageIndex FROM exercise_source_citations WHERE user_id = ?').all(userId)) {
    if (!pagesByVersion.has(c.versionId)) pagesByVersion.set(c.versionId, []);
    pagesByVersion.get(c.versionId).push(c);
  }
  const linkOf = (versionId) => {
    const cites = pagesByVersion.get(versionId) ?? [];
    if (cites.length === 0) return { status: 'UNKNOWN' };
    const found = new Map();
    for (const c of cites) {
      const sections = sectionsOfPage(c.sourceId, c.pageIndex);
      if (sections.length !== 1) return { status: 'AMBIGUOUS' };
      found.set(`${c.sourceId}:${sections[0].ordinal}`, { sourceId: c.sourceId, ...sections[0] });
    }
    return found.size === 1 ? { status: 'LINKED', section: [...found.values()][0] } : { status: 'AMBIGUOUS' };
  };
  const linkByVersion = new Map([...new Set(events.map((e) => e.exerciseVersionId))].map((v) => [v, linkOf(v)]));

  const titles = new Map(db.prepare('SELECT id, title FROM learning_units WHERE user_id = ?').all(userId).map((u) => [u.id, u.title]));
  const unitIds = [...new Set(events.map((e) => e.unitId))].sort((a, b) => a - b);
  return {
    units: unitIds.map((unitId) => {
      const mine = events.filter((e) => e.unitId === unitId);
      const sectionKey = (e) => {
        const link = linkByVersion.get(e.exerciseVersionId);
        return link.status === 'LINKED' ? `${link.section.sourceId}:${link.section.ordinal}` : null;
      };
      const sections = groupEvidence(mine, sectionKey).map(({ key, ...evidence }) => {
        const [sourceId, ordinal] = key.split(':').map(Number);
        const meta = [...linkByVersion.values()].find((l) => l.status === 'LINKED' && l.section.sourceId === sourceId && l.section.ordinal === ordinal).section;
        return { sourceId, ordinal, level: meta.level, title: meta.title, pageFrom: meta.pageIndex, basis: 'CITATION_PAGE_IN_OUTLINE', ...evidence };
      }).sort((a, b) => a.sourceId - b.sourceId || a.ordinal - b.ordinal);
      const versions = [...new Set(mine.map((e) => e.exerciseVersionId))];
      return {
        unitId,
        unitTitle: titles.get(unitId),
        sections,
        notLinked: {
          ambiguousQuestions: versions.filter((v) => linkByVersion.get(v).status === 'AMBIGUOUS').length,
          unknownQuestions: versions.filter((v) => linkByVersion.get(v).status === 'UNKNOWN').length,
        },
      };
    }),
  };
}
