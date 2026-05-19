// Shared helper for applying an industry ontology template to the database.
// Used by both:
//   - POST /api/ontology/apply-template (manual application from the Ontology UI)
//   - POST /api/projects with industry_template (auto-apply on project creation)

const { query: dbQuery } = require('../db/pool');
const { TEMPLATES } = require('../data/ontologyTemplates');

async function applyTemplateToOntology(templateKey) {
  const tmpl = TEMPLATES[templateKey];
  if (!tmpl) throw new Error(`Unknown template: ${templateKey}`);

  let domainsAdded = 0, relsAdded = 0, propsAdded = 0, glossaryAdded = 0;

  // 1) Domains (with abstract flag) — first pass
  for (const d of tmpl.domains) {
    try {
      await dbQuery(
        `INSERT INTO ontology_domains (domain_code, label, description, color, initials, icon, is_abstract)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (domain_code) DO UPDATE
           SET label=$2, description=$3, color=$4, initials=$5, icon=$6, is_abstract=$7, updated_at=now()`,
        [d.domain_code, d.label, d.description || '', d.color, d.initials, d.icon || '📄', !!d.is_abstract]
      );
      domainsAdded++;
    } catch (_) {}
  }
  // 2) Domains — second pass to set parent_code (hierarchy)
  for (const d of tmpl.domains) {
    if (!d.parent_code) continue;
    try { await dbQuery('UPDATE ontology_domains SET parent_code=$1 WHERE domain_code=$2', [d.parent_code, d.domain_code]); } catch (_) {}
  }

  // 3) Properties
  if (tmpl.properties) {
    for (const [domainCode, propList] of Object.entries(tmpl.properties)) {
      for (const p of propList) {
        try {
          await dbQuery(
            `INSERT INTO ontology_properties
               (domain_code, property_name, property_label, data_type, is_required, is_unique,
                default_value, enum_values, reference_domain, description, display_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (domain_code, property_name) DO UPDATE
               SET property_label=$3, data_type=$4, is_required=$5, is_unique=$6,
                   default_value=$7, enum_values=$8, reference_domain=$9, description=$10,
                   display_order=$11, updated_at=now()`,
            [
              domainCode, p.property_name, p.property_label,
              p.data_type || 'text',
              !!p.is_required, !!p.is_unique,
              p.default_value || null,
              Array.isArray(p.enum_values) && p.enum_values.length ? p.enum_values : null,
              p.reference_domain || null,
              p.description || '',
              p.display_order ?? 50,
            ]
          );
          propsAdded++;
        } catch (_) {}
      }
    }
  }

  // 4) Relationships (with cardinality + source/target + inverse)
  for (const r of tmpl.relationships) {
    try {
      await dbQuery(
        `INSERT INTO ontology_relationships
           (relationship_code, label, description, color, abbreviation,
            source_domain, target_domain, cardinality, inverse_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (relationship_code) DO UPDATE
           SET label=$2, description=$3, color=$4, abbreviation=$5,
               source_domain=$6, target_domain=$7, cardinality=$8, inverse_code=$9, updated_at=now()`,
        [
          r.relationship_code, r.label, r.description || '', r.color, r.abbreviation,
          r.source_domain || null, r.target_domain || null,
          r.cardinality || 'N:M', r.inverse_code || null,
        ]
      );
      relsAdded++;
    } catch (_) {}
  }

  // 5) Glossary terms
  for (const g of (tmpl.glossary || [])) {
    try {
      await dbQuery(
        `INSERT INTO business_terms (id, term, definition, category, synonyms, related_signals, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT (term) DO NOTHING`,
        [g.term, g.definition || '', g.category || 'General', g.synonyms || [], g.related_signals || []]
      );
      glossaryAdded++;
    } catch (_) {}
  }

  return {
    template: tmpl.name,
    template_key: templateKey,
    standards: tmpl.standards || [],
    counts: { domains: domainsAdded, relationships: relsAdded, properties: propsAdded, glossary: glossaryAdded },
  };
}

module.exports = { applyTemplateToOntology };
