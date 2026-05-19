// Industry-standard ontology templates
// Each template is grounded in actual industry standards / regulatory frameworks
// and is intended to be a credible starting point — not just colored stickers.
//
// Conventions:
//   domain.parent_code     — class hierarchy (rdfs:subClassOf)
//   domain.is_abstract     — abstract classes that aren't instantiated directly
//   domain.properties[]    — schema attributes seeded into ontology_properties
//   rel.cardinality        — '1:1' | '1:N' | 'N:1' | 'N:M' (OWL functional constraint)
//   rel.source_domain      — rdfs:domain restriction
//   rel.target_domain      — rdfs:range restriction
//   rel.inverse_code       — owl:inverseOf
//
// Color palette stays within the muted enterprise scheme used elsewhere.

const C = {
  steel:  '#5b6b8c', steelDark: '#4c5d8a', indigo: '#5468a3',
  slate:  '#64748b', slateDark: '#475569',
  teal:   '#4d7c7a', sage:    '#5a7f6a', moss: '#6b8e6b',
  ochre:  '#a67c52', amber:   '#856a3d', sand: '#9c7a4d',
  brick:  '#9c6358', terra:   '#a05c4d', rust: '#7d4a44',
  plum:   '#6e5878', mauve:   '#86618c', wine: '#5e4a6b',
};

const TEMPLATES = {

  // ─── SEMICONDUCTOR & EDA ─────────────────────────────────────────────────
  // References: IPC-2581 (design data exchange), IEEE 1685 (IP-XACT),
  // SEMI E10 (equipment), JEDEC reliability standards, IPC-A-610
  semiconductor: {
    name: 'Semiconductor & EDA',
    description: 'IC design, verification, tape-out, fabrication and reliability — IPC / IEEE 1685 / JEDEC aligned',
    standards: ['IPC-2581', 'IEEE 1685 (IP-XACT)', 'JEDEC', 'SEMI E10'],
    domains: [
      // Top-level abstract classes
      { domain_code:'DESIGN_ARTIFACT',    label:'Design Artifact',     description:'Abstract base class for any IC design output', color:C.steel,   initials:'D', icon:'📐', is_abstract:true, parent_code:null },

      // Design / RTL
      { domain_code:'RTL_SOURCE',         label:'RTL Source',          description:'Verilog/VHDL register-transfer-level source code', color:C.indigo,  initials:'R', icon:'⌨️', parent_code:'DESIGN_ARTIFACT' },
      { domain_code:'IP_BLOCK',           label:'IP Block',            description:'Reusable hardware IP block (IP-XACT compliant)',  color:C.steelDark,initials:'I', icon:'🧩', parent_code:'DESIGN_ARTIFACT' },
      { domain_code:'NETLIST',            label:'Gate-Level Netlist',  description:'Post-synthesis gate-level netlist',                color:C.steel,   initials:'N', icon:'🔗', parent_code:'DESIGN_ARTIFACT' },
      { domain_code:'GDSII_LAYOUT',       label:'GDSII Layout',        description:'Stream format mask layout sent to foundry',         color:C.plum,    initials:'G', icon:'🔲', parent_code:'DESIGN_ARTIFACT' },
      { domain_code:'SCHEMATIC',          label:'Schematic',           description:'Analog/digital schematic capture',                  color:C.mauve,   initials:'S', icon:'📊', parent_code:'DESIGN_ARTIFACT' },

      // Verification
      { domain_code:'TESTBENCH',          label:'Verification Testbench', description:'UVM/SV testbench, assertions, coverage models', color:C.teal,    initials:'T', icon:'🧪', parent_code:'DESIGN_ARTIFACT' },
      { domain_code:'DRC_REPORT',         label:'DRC Report',          description:'Design Rule Check verification report',            color:C.sage,    initials:'C', icon:'✅', parent_code:null },
      { domain_code:'LVS_REPORT',         label:'LVS Report',          description:'Layout vs Schematic verification report',          color:C.moss,    initials:'L', icon:'✅', parent_code:null },
      { domain_code:'TIMING_REPORT',      label:'STA Timing Report',   description:'Static Timing Analysis report',                    color:C.amber,   initials:'M', icon:'⏱️', parent_code:null },

      // Manufacturing
      { domain_code:'PDK',                label:'Process Design Kit',  description:'Foundry-provided PDK files, rules, models',         color:C.ochre,   initials:'P', icon:'🏭', parent_code:null },
      { domain_code:'MASK_SET',           label:'Mask Set',            description:'Photomask data sent to fab',                       color:C.terra,   initials:'K', icon:'🎭', parent_code:null },
      { domain_code:'WAFER_LOT',          label:'Wafer Lot',           description:'Manufacturing lot — wafers from a single run',     color:C.brick,   initials:'W', icon:'💿', parent_code:null },
      { domain_code:'YIELD_REPORT',       label:'Yield Report',        description:'Manufacturing yield analysis per lot/wafer',       color:C.rust,    initials:'Y', icon:'📈', parent_code:null },

      // Compliance / Quality
      { domain_code:'ECN',                label:'Engineering Change Notice', description:'Formal change control document',          color:C.wine,    initials:'E', icon:'📋', parent_code:null },
      { domain_code:'FA_REPORT',          label:'Failure Analysis Report',   description:'Post-failure analysis with root cause',   color:C.rust,    initials:'F', icon:'🔍', parent_code:null },
      { domain_code:'DATASHEET',          label:'Product Datasheet',         description:'Customer-facing product datasheet',        color:C.slate,   initials:'D', icon:'📄', parent_code:null },
    ],
    properties: {
      RTL_SOURCE: [
        { property_name:'design_name', property_label:'Design Name', data_type:'text', is_required:true, display_order:10 },
        { property_name:'hdl_language', property_label:'HDL Language', data_type:'enum', enum_values:['Verilog','SystemVerilog','VHDL','Chisel','SpinalHDL'], display_order:20 },
        { property_name:'top_module', property_label:'Top Module', data_type:'text', display_order:30 },
        { property_name:'lines_of_code', property_label:'Lines of Code', data_type:'number', display_order:40 },
      ],
      IP_BLOCK: [
        { property_name:'ip_name', property_label:'IP Name', data_type:'text', is_required:true, display_order:10 },
        { property_name:'ip_version', property_label:'Version', data_type:'text', display_order:20 },
        { property_name:'ipxact_compliant', property_label:'IP-XACT Compliant', data_type:'boolean', display_order:30 },
        { property_name:'license_type', property_label:'License', data_type:'enum', enum_values:['Internal','Licensed','Open-Source','Third-Party'], display_order:40 },
      ],
      GDSII_LAYOUT: [
        { property_name:'process_node', property_label:'Process Node', data_type:'enum', is_required:true, enum_values:['180nm','130nm','90nm','65nm','40nm','28nm','16nm','12nm','7nm','5nm','3nm','2nm'], display_order:10 },
        { property_name:'die_size_mm2', property_label:'Die Size (mm²)', data_type:'number', display_order:20 },
        { property_name:'tapeout_date', property_label:'Tapeout Date', data_type:'date', display_order:30 },
        { property_name:'foundry', property_label:'Foundry', data_type:'enum', enum_values:['TSMC','Samsung','GlobalFoundries','Intel Foundry','SMIC','UMC'], display_order:40 },
      ],
      WAFER_LOT: [
        { property_name:'lot_id', property_label:'Lot ID', data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'wafer_count', property_label:'Wafer Count', data_type:'number', display_order:20 },
        { property_name:'yield_percent', property_label:'Yield %', data_type:'number', display_order:30 },
        { property_name:'start_date', property_label:'Start Date', data_type:'date', display_order:40 },
      ],
      ECN: [
        { property_name:'ecn_number', property_label:'ECN Number', data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'status', property_label:'Status', data_type:'enum', enum_values:['Draft','Under Review','Approved','Implemented','Rejected'], display_order:20 },
        { property_name:'effectivity_date', property_label:'Effectivity Date', data_type:'date', display_order:30 },
      ],
    },
    relationships: [
      { relationship_code:'IMPLEMENTS',         label:'Implements',          description:'Netlist implements an RTL design',           color:C.steel,    abbreviation:'IMP', cardinality:'1:1', source_domain:'NETLIST',       target_domain:'RTL_SOURCE',    inverse_code:'IMPLEMENTED_BY' },
      { relationship_code:'INSTANTIATES',       label:'Instantiates',        description:'Design instantiates an IP block',            color:C.indigo,   abbreviation:'INS', cardinality:'N:M', source_domain:'RTL_SOURCE',    target_domain:'IP_BLOCK' },
      { relationship_code:'TAPED_OUT_AS',       label:'Taped Out As',        description:'RTL/netlist taped out as a GDSII layout',    color:C.plum,     abbreviation:'TAP', cardinality:'1:N', source_domain:'NETLIST',       target_domain:'GDSII_LAYOUT' },
      { relationship_code:'VERIFIES',           label:'Verifies',            description:'Testbench verifies a design artifact',       color:C.teal,     abbreviation:'VER', cardinality:'N:M', source_domain:'TESTBENCH',     target_domain:'DESIGN_ARTIFACT' },
      { relationship_code:'CHECKS_AGAINST',     label:'Checks Against',      description:'DRC checks layout against PDK rules',        color:C.sage,     abbreviation:'CHK', cardinality:'N:1', source_domain:'DRC_REPORT',    target_domain:'PDK' },
      { relationship_code:'MANUFACTURED_AS',    label:'Manufactured As',     description:'Mask set manufactured as wafer lots',        color:C.terra,    abbreviation:'MFG', cardinality:'1:N', source_domain:'MASK_SET',      target_domain:'WAFER_LOT' },
      { relationship_code:'YIELDS',             label:'Yields',              description:'Wafer lot yields functional die',            color:C.rust,     abbreviation:'YLD', cardinality:'1:1', source_domain:'WAFER_LOT',     target_domain:'YIELD_REPORT' },
      { relationship_code:'AFFECTS',            label:'Affects',             description:'ECN affects design artifacts',               color:C.wine,     abbreviation:'AFF', cardinality:'1:N', source_domain:'ECN',           target_domain:'DESIGN_ARTIFACT' },
      { relationship_code:'INVESTIGATES',       label:'Investigates',        description:'FA report investigates a yield/quality issue', color:C.brick,  abbreviation:'INV', cardinality:'N:M', source_domain:'FA_REPORT',     target_domain:'YIELD_REPORT' },
      { relationship_code:'DOCUMENTED_IN',      label:'Documented In',       description:'Design artifact documented in a datasheet',  color:C.slate,    abbreviation:'DOC', cardinality:'1:N', source_domain:'DESIGN_ARTIFACT', target_domain:'DATASHEET' },
      { relationship_code:'SUPERSEDES',         label:'Supersedes',          description:'New revision supersedes the previous one',   color:C.slateDark,abbreviation:'SUP', cardinality:'1:1' },
    ],
    glossary: [
      { term:'Tapeout',           definition:'Final step where layout is sent to the foundry for mask fabrication', category:'Manufacturing', synonyms:['Tape-out','GDS Submission'], related_signals:['tapeout_schedule'] },
      { term:'Process Design Kit',definition:'Foundry-provided files, rules and models for a manufacturing node',   category:'Manufacturing', synonyms:['PDK','Process Kit'], related_signals:['process_node_params'] },
      { term:'IP-XACT',           definition:'IEEE 1685 standard for IP description and integration metadata',     category:'Standards',     synonyms:['IEEE 1685'] },
      { term:'IPC-2581',          definition:'Open-standard format for PCB and IC design data exchange',           category:'Standards',     synonyms:['ODB++ alternative'] },
      { term:'STA',               definition:'Static Timing Analysis — verifies design meets clock timing constraints', category:'Verification', synonyms:['Static Timing','Timing Closure'] },
      { term:'DRC',               definition:'Design Rule Check — verifies layout meets foundry manufacturing rules', category:'Verification', synonyms:['Layout DRC','Physical Verification'] },
      { term:'LVS',               definition:'Layout-vs-Schematic — verifies layout matches the schematic',         category:'Verification', synonyms:['Netlist Comparison'] },
      { term:'UVM',               definition:'Universal Verification Methodology — SystemVerilog test framework',   category:'Verification', synonyms:['Universal Verification','Accellera UVM'] },
      { term:'PPA',               definition:'Power-Performance-Area — the three optimization axes of IC design',   category:'Engineering',   synonyms:['Power Performance Area'] },
      { term:'Yield',             definition:'Percentage of functional die per wafer — primary manufacturing KPI',  category:'Manufacturing', synonyms:['Wafer Yield','Die Yield'], related_signals:['yield_data','die_cost_data'] },
      { term:'ECN',               definition:'Engineering Change Notice — formal change control for production designs', category:'Process',   synonyms:['Engineering Change Order','ECO'] },
      { term:'JEDEC',             definition:'Standards body for memory and semiconductor reliability testing',     category:'Standards',     synonyms:['JEDEC Solid State'] },
      { term:'ITAR',              definition:'International Traffic in Arms Regulations — US defense export control', category:'Compliance',  synonyms:['Export Control'] },
      { term:'EAR',               definition:'Export Administration Regulations — US Dept of Commerce export rules', category:'Compliance',  synonyms:['Commerce Export'] },
    ],
  },

  // ─── PHARMACEUTICAL & LIFE SCIENCES ──────────────────────────────────────
  // References: ICH E6(R2) GCP, CDISC SDTM/ADaM, CFR 21 Part 11,
  // FDA eCTD, EU CTR 536/2014, HL7 FHIR
  pharma: {
    name: 'Pharmaceutical & Life Sciences',
    description: 'Drug development, clinical trials, GMP manufacturing — CDISC / ICH-GCP / 21 CFR Part 11 aligned',
    standards: ['ICH E6(R2) GCP', 'CDISC SDTM/ADaM', '21 CFR Part 11', 'eCTD', 'EU CTR 536/2014'],
    domains: [
      // Abstract
      { domain_code:'REGULATED_DOCUMENT',  label:'Regulated Document',   description:'Abstract base for 21 CFR Part 11 / GxP documents', color:C.steel,  initials:'D', icon:'📜', is_abstract:true },

      // Clinical
      { domain_code:'STUDY_PROTOCOL',      label:'Study Protocol',       description:'ICH-GCP-compliant clinical trial protocol',         color:C.indigo,    initials:'P', icon:'📑', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'INVESTIGATOR_BROCHURE',label:'Investigator Brochure',description:'IB — compiled safety/efficacy data for investigators',color:C.steelDark,initials:'I', icon:'📘', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'CRF',                 label:'Case Report Form',     description:'CDISC-compliant CRF for clinical data capture',     color:C.teal,    initials:'F', icon:'📝', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'ICF',                 label:'Informed Consent Form',description:'Patient informed consent document',                  color:C.sage,    initials:'C', icon:'✍️', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'SDTM_DATASET',        label:'SDTM Dataset',         description:'CDISC SDTM-formatted clinical study data',           color:C.moss,    initials:'S', icon:'📊', parent_code:null },
      { domain_code:'ADAM_DATASET',        label:'ADaM Dataset',         description:'CDISC ADaM analysis-ready dataset',                  color:C.moss,    initials:'A', icon:'📈', parent_code:null },
      { domain_code:'CSR',                 label:'Clinical Study Report',description:'ICH E3 Clinical Study Report',                       color:C.indigo,  initials:'R', icon:'📕', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'ADVERSE_EVENT',       label:'Adverse Event Report', description:'AE / SAE pharmacovigilance record (E2B(R3))',         color:C.brick,   initials:'E', icon:'⚠️', parent_code:null },

      // Manufacturing / CMC
      { domain_code:'BATCH_RECORD',        label:'Batch Manufacturing Record', description:'GMP batch production record',                color:C.ochre,   initials:'B', icon:'🏭', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'CMC_SECTION',         label:'CMC Document',         description:'Chemistry, Manufacturing & Controls documentation',  color:C.amber,   initials:'M', icon:'🧪', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'STABILITY_STUDY',     label:'Stability Study Report',description:'ICH Q1A stability testing report',                 color:C.sand,    initials:'T', icon:'⏳', parent_code:null },

      // Regulatory
      { domain_code:'IND_FILING',          label:'IND Filing',           description:'Investigational New Drug application to FDA',        color:C.terra,   initials:'N', icon:'📋', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'NDA_FILING',          label:'NDA / BLA Filing',     description:'New Drug Application / Biologics License Application',color:C.rust,    initials:'D', icon:'📋', parent_code:'REGULATED_DOCUMENT' },
      { domain_code:'ECTD_SUBMISSION',     label:'eCTD Submission',      description:'Electronic Common Technical Document submission',    color:C.wine,    initials:'X', icon:'📦', parent_code:null },

      // PHI
      { domain_code:'PATIENT_RECORD',      label:'Patient Record (PHI)', description:'HIPAA/HL7 FHIR protected health information',         color:C.brick,   initials:'H', icon:'🏥', parent_code:null },
    ],
    properties: {
      STUDY_PROTOCOL: [
        { property_name:'protocol_id', property_label:'Protocol ID', data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'phase',       property_label:'Trial Phase', data_type:'enum', is_required:true, enum_values:['Preclinical','Phase 0','Phase I','Phase II','Phase III','Phase IV'], display_order:20 },
        { property_name:'indication',  property_label:'Indication',  data_type:'text', display_order:30 },
        { property_name:'sponsor',     property_label:'Sponsor',     data_type:'text', display_order:40 },
        { property_name:'nct_number',  property_label:'NCT Number',  data_type:'text', description:'ClinicalTrials.gov identifier', display_order:50 },
      ],
      ADVERSE_EVENT: [
        { property_name:'meddra_code', property_label:'MedDRA Code',  data_type:'text', is_required:true, display_order:10 },
        { property_name:'severity',    property_label:'Severity',     data_type:'enum', is_required:true, enum_values:['Mild','Moderate','Severe','Life-Threatening','Fatal'], display_order:20 },
        { property_name:'is_serious',  property_label:'Serious (SAE)',data_type:'boolean', display_order:30 },
        { property_name:'event_date',  property_label:'Event Date',   data_type:'date', display_order:40 },
      ],
      BATCH_RECORD: [
        { property_name:'batch_number', property_label:'Batch Number',data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'product_code', property_label:'Product Code',data_type:'text', display_order:20 },
        { property_name:'manufacture_date', property_label:'Manufacture Date', data_type:'date', display_order:30 },
        { property_name:'gmp_disposition', property_label:'GMP Disposition', data_type:'enum', enum_values:['Released','Quarantine','Rejected','Investigation'], display_order:40 },
      ],
      NDA_FILING: [
        { property_name:'application_number', property_label:'Application Number', data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'submission_type', property_label:'Submission Type', data_type:'enum', enum_values:['Original','Supplement','Annual Report'], display_order:20 },
        { property_name:'submission_date', property_label:'Submission Date', data_type:'date', display_order:30 },
      ],
    },
    relationships: [
      { relationship_code:'GOVERNS',           label:'Governs',              description:'Protocol governs case report forms',          color:C.indigo, abbreviation:'GOV', cardinality:'1:N', source_domain:'STUDY_PROTOCOL', target_domain:'CRF' },
      { relationship_code:'ENROLLS_UNDER',     label:'Enrolls Under',        description:'Patient consent enrolls under a protocol',     color:C.sage,   abbreviation:'ENR', cardinality:'N:1', source_domain:'ICF',           target_domain:'STUDY_PROTOCOL' },
      { relationship_code:'CAPTURES_DATA_FOR', label:'Captures Data For',    description:'CRF captures data for a protocol',             color:C.teal,   abbreviation:'CAP', cardinality:'N:1', source_domain:'CRF',           target_domain:'STUDY_PROTOCOL' },
      { relationship_code:'DERIVED_FROM',      label:'Derived From',         description:'ADaM dataset derived from SDTM dataset',       color:C.moss,   abbreviation:'DER', cardinality:'N:M', source_domain:'ADAM_DATASET',  target_domain:'SDTM_DATASET' },
      { relationship_code:'ANALYZED_IN',       label:'Analyzed In',          description:'Dataset analyzed in a clinical study report',  color:C.indigo, abbreviation:'ANL', cardinality:'1:N', source_domain:'ADAM_DATASET',  target_domain:'CSR' },
      { relationship_code:'REPORTS_AE_FOR',    label:'Reports AE For',       description:'Adverse event report linked to a protocol',    color:C.brick,  abbreviation:'AE',  cardinality:'N:1', source_domain:'ADVERSE_EVENT', target_domain:'STUDY_PROTOCOL' },
      { relationship_code:'MANUFACTURED_UNDER',label:'Manufactured Under',   description:'Batch manufactured under a CMC document',      color:C.ochre,  abbreviation:'MFG', cardinality:'N:1', source_domain:'BATCH_RECORD',  target_domain:'CMC_SECTION' },
      { relationship_code:'SUPPORTS_FILING',   label:'Supports Filing',      description:'Data/document supports a regulatory filing',   color:C.terra,  abbreviation:'SUP', cardinality:'N:M', source_domain:'REGULATED_DOCUMENT', target_domain:'NDA_FILING' },
      { relationship_code:'SUBMITTED_AS',      label:'Submitted As',         description:'Filing submitted as part of an eCTD package',  color:C.wine,   abbreviation:'SUB', cardinality:'1:1', source_domain:'NDA_FILING',    target_domain:'ECTD_SUBMISSION' },
      { relationship_code:'COMPLIES_WITH',     label:'Complies With',        description:'Document complies with a regulation/standard', color:C.slate,  abbreviation:'CMP', cardinality:'N:M' },
      { relationship_code:'SUPERSEDES',        label:'Supersedes',           description:'Newer version supersedes the previous one',     color:C.slateDark,abbreviation:'SS',cardinality:'1:1' },
    ],
    glossary: [
      { term:'ICH-GCP',          definition:'International Council for Harmonisation Good Clinical Practice (E6(R2))',   category:'Standards',    synonyms:['Good Clinical Practice','ICH E6'] },
      { term:'CDISC SDTM',       definition:'Study Data Tabulation Model — standard format for submitting clinical data', category:'Standards',    synonyms:['SDTM','Submission Data Standard'] },
      { term:'CDISC ADaM',       definition:'Analysis Data Model — analysis-ready datasets derived from SDTM',           category:'Standards',    synonyms:['ADaM','Analysis Data Model'] },
      { term:'21 CFR Part 11',   definition:'FDA regulation on electronic records and electronic signatures',             category:'Compliance',   synonyms:['Part 11','Electronic Records Rule'] },
      { term:'eCTD',             definition:'Electronic Common Technical Document — standard FDA/EMA submission format',  category:'Standards',    synonyms:['Electronic CTD'] },
      { term:'IND',              definition:'Investigational New Drug application — required to begin human trials',      category:'Regulatory',   synonyms:['IND Application'] },
      { term:'NDA / BLA',        definition:'New Drug Application / Biologics License Application — FDA approval filing', category:'Regulatory',   synonyms:['New Drug Application','Biologics License Application'] },
      { term:'MedDRA',           definition:'Medical Dictionary for Regulatory Activities — standard AE terminology',     category:'Standards',    synonyms:['Medical Dictionary'] },
      { term:'GMP',              definition:'Good Manufacturing Practice — quality system for pharmaceutical production', category:'Standards',    synonyms:['cGMP','Current GMP'] },
      { term:'ICH Q1A',          definition:'Stability testing of new drug substances and products',                       category:'Standards' },
      { term:'PHI',              definition:'Protected Health Information under HIPAA / HL7 FHIR',                         category:'Compliance',   synonyms:['Protected Health Information','HIPAA Data'] },
      { term:'Pharmacovigilance',definition:'Detection, assessment, understanding and prevention of adverse effects',     category:'Safety',       synonyms:['Drug Safety','PV'] },
      { term:'CRO',              definition:'Contract Research Organization — outsourced clinical trial services',         category:'Operations',   synonyms:['Contract Research Org'] },
      { term:'DMC',              definition:'Data Monitoring Committee — independent trial safety oversight',              category:'Governance',   synonyms:['Data Safety Monitoring Board','DSMB'] },
    ],
  },

  // ─── FINANCIAL SERVICES ──────────────────────────────────────────────────
  // References: FIBO (Financial Industry Business Ontology) — W3C/EDM,
  // FpML for derivatives, ISDA Master, Basel III, MiFID II, Dodd-Frank
  finance: {
    name: 'Financial Services & Banking',
    description: 'Trading, risk, regulatory reporting and client services — FIBO / FpML / ISDA / Basel III aligned',
    standards: ['FIBO (W3C)', 'FpML', 'ISDA Master Agreement', 'Basel III', 'MiFID II', 'Dodd-Frank'],
    domains: [
      // FIBO-style hierarchy
      { domain_code:'FINANCIAL_INSTRUMENT', label:'Financial Instrument', description:'FIBO-aligned abstract financial instrument class', color:C.steel,    initials:'F', icon:'💱', is_abstract:true },
      { domain_code:'EQUITY',               label:'Equity',               description:'Common/preferred shares',                         color:C.indigo,   initials:'E', icon:'📈', parent_code:'FINANCIAL_INSTRUMENT' },
      { domain_code:'FIXED_INCOME',         label:'Fixed Income',         description:'Bonds, notes, treasuries',                        color:C.steelDark,initials:'B', icon:'📜', parent_code:'FINANCIAL_INSTRUMENT' },
      { domain_code:'DERIVATIVE',           label:'Derivative',           description:'Swaps, options, futures (FpML-described)',         color:C.plum,     initials:'D', icon:'🔀', parent_code:'FINANCIAL_INSTRUMENT' },

      // Trading
      { domain_code:'TRADE',                label:'Trade',                description:'Executed transaction in a financial instrument',  color:C.teal,     initials:'T', icon:'💹', parent_code:null },
      { domain_code:'ORDER',                label:'Order',                description:'Trading order (pre-execution)',                    color:C.sage,     initials:'O', icon:'📝', parent_code:null },
      { domain_code:'CONFIRMATION',         label:'Trade Confirmation',   description:'Post-trade confirmation document',                 color:C.moss,     initials:'C', icon:'✅', parent_code:null },

      // Counterparties / Clients
      { domain_code:'LEGAL_ENTITY',         label:'Legal Entity',         description:'LEI-identified legal entity',                      color:C.ochre,    initials:'L', icon:'🏢', is_abstract:true },
      { domain_code:'COUNTERPARTY',         label:'Counterparty',         description:'Trading counterparty',                             color:C.amber,    initials:'P', icon:'🤝', parent_code:'LEGAL_ENTITY' },
      { domain_code:'CLIENT',               label:'Client',               description:'Wealth/institutional client',                      color:C.sand,     initials:'K', icon:'👤', parent_code:'LEGAL_ENTITY' },
      { domain_code:'KYC_DOSSIER',          label:'KYC Dossier',          description:'Know-Your-Customer documentation package',         color:C.brick,    initials:'Y', icon:'🔐', parent_code:null },

      // Risk / Regulatory
      { domain_code:'RISK_REPORT',          label:'Risk Report',          description:'VaR, sensitivity, stress test, RWA report',       color:C.terra,    initials:'R', icon:'⚠️', parent_code:null },
      { domain_code:'REGULATORY_FILING',    label:'Regulatory Filing',    description:'SEC, MiFID, EMIR, Dodd-Frank submission',          color:C.rust,     initials:'G', icon:'📋', parent_code:null },
      { domain_code:'ISDA_AGREEMENT',       label:'ISDA Master Agreement',description:'ISDA Master Agreement / CSA',                      color:C.wine,     initials:'I', icon:'📃', parent_code:null },

      // Research / Reference
      { domain_code:'RESEARCH_NOTE',        label:'Research Note',        description:'Equity / credit / macro research report',         color:C.mauve,    initials:'N', icon:'📰', parent_code:null },
      { domain_code:'MARKET_DATA',          label:'Market Data',          description:'Pricing, reference data, market microstructure',  color:C.slate,    initials:'M', icon:'📊', parent_code:null },
    ],
    properties: {
      TRADE: [
        { property_name:'trade_id',       property_label:'Trade ID',      data_type:'text',   is_required:true, is_unique:true, display_order:10 },
        { property_name:'notional',       property_label:'Notional',      data_type:'number',  display_order:20 },
        { property_name:'currency',       property_label:'Currency',      data_type:'enum',    enum_values:['USD','EUR','GBP','JPY','CHF','HKD','SGD','CNH','AUD','CAD'], display_order:30 },
        { property_name:'execution_time', property_label:'Execution Time',data_type:'date',    display_order:40 },
        { property_name:'venue',          property_label:'Venue',         data_type:'enum',    enum_values:['NYSE','NASDAQ','LSE','XETRA','TSE','HKEX','OTC'], display_order:50 },
      ],
      DERIVATIVE: [
        { property_name:'product_type', property_label:'Product Type', data_type:'enum', is_required:true, enum_values:['IR Swap','CDS','FX Forward','FX Option','Equity Option','Future','Total Return Swap'], display_order:10 },
        { property_name:'maturity_date',property_label:'Maturity',    data_type:'date',   display_order:20 },
        { property_name:'fpml_version', property_label:'FpML Version',data_type:'text',   display_order:30 },
      ],
      LEGAL_ENTITY: [
        { property_name:'lei',          property_label:'LEI',          data_type:'text',   is_required:true, is_unique:true, description:'Legal Entity Identifier (ISO 17442)', display_order:10 },
        { property_name:'jurisdiction', property_label:'Jurisdiction', data_type:'text',   display_order:20 },
        { property_name:'entity_type',  property_label:'Entity Type',  data_type:'enum',   enum_values:['Corporation','Fund','Partnership','Trust','SPV','Sovereign'], display_order:30 },
      ],
      KYC_DOSSIER: [
        { property_name:'kyc_status',    property_label:'KYC Status',    data_type:'enum', is_required:true, enum_values:['Pending','Approved','Refresh Required','Rejected','EDD Required'], display_order:10 },
        { property_name:'risk_rating',   property_label:'Risk Rating',   data_type:'enum', enum_values:['Low','Medium','High','Prohibited'], display_order:20 },
        { property_name:'last_review',   property_label:'Last Reviewed', data_type:'date', display_order:30 },
      ],
      RISK_REPORT: [
        { property_name:'report_date',   property_label:'Report Date',  data_type:'date',   is_required:true, display_order:10 },
        { property_name:'var_95',        property_label:'VaR 95% (1d)', data_type:'number', display_order:20 },
        { property_name:'methodology',   property_label:'Methodology',  data_type:'enum',   enum_values:['Historical Simulation','Monte Carlo','Parametric'], display_order:30 },
      ],
    },
    relationships: [
      { relationship_code:'EXECUTES_AGAINST',  label:'Executes Against',   description:'Order executes against a counterparty',           color:C.teal,   abbreviation:'EXE', cardinality:'N:1', source_domain:'ORDER',         target_domain:'COUNTERPARTY' },
      { relationship_code:'BOOKS_AS_TRADE',    label:'Books As Trade',     description:'Order books as one or more trades',               color:C.sage,   abbreviation:'BKT', cardinality:'1:N', source_domain:'ORDER',         target_domain:'TRADE' },
      { relationship_code:'COUNTERPARTY_TO',   label:'Counterparty To',    description:'Trade has a counterparty',                        color:C.amber,  abbreviation:'CPT', cardinality:'N:1', source_domain:'TRADE',         target_domain:'COUNTERPARTY' },
      { relationship_code:'GOVERNED_BY_ISDA',  label:'Governed By ISDA',   description:'Derivative trade governed by ISDA Master',         color:C.wine,   abbreviation:'ISD', cardinality:'N:1', source_domain:'DERIVATIVE',    target_domain:'ISDA_AGREEMENT' },
      { relationship_code:'CONFIRMS',          label:'Confirms',           description:'Confirmation document confirms a trade',           color:C.moss,   abbreviation:'CNF', cardinality:'1:1', source_domain:'CONFIRMATION',  target_domain:'TRADE' },
      { relationship_code:'KYC_OF',            label:'KYC Of',             description:'KYC dossier belongs to a legal entity',           color:C.brick,  abbreviation:'KYC', cardinality:'1:1', source_domain:'KYC_DOSSIER',   target_domain:'LEGAL_ENTITY' },
      { relationship_code:'COVERS_PORTFOLIO',  label:'Covers Portfolio',   description:'Risk report covers a portfolio of trades',        color:C.terra,  abbreviation:'COV', cardinality:'N:M', source_domain:'RISK_REPORT',   target_domain:'TRADE' },
      { relationship_code:'REPORTS_UNDER',     label:'Reports Under',      description:'Filing reports under a regulation (MiFID, EMIR…)', color:C.rust,   abbreviation:'REG', cardinality:'N:1', source_domain:'TRADE',         target_domain:'REGULATORY_FILING' },
      { relationship_code:'RECOMMENDS',        label:'Recommends',         description:'Research note recommends an instrument',          color:C.mauve,  abbreviation:'REC', cardinality:'N:M', source_domain:'RESEARCH_NOTE', target_domain:'FINANCIAL_INSTRUMENT' },
      { relationship_code:'PRICES',            label:'Prices',             description:'Market data prices an instrument',                color:C.slate,  abbreviation:'PRC', cardinality:'1:N', source_domain:'MARKET_DATA',   target_domain:'FINANCIAL_INSTRUMENT' },
      { relationship_code:'SUPERSEDES',        label:'Supersedes',         description:'New version supersedes the prior version',         color:C.slateDark,abbreviation:'SUP',cardinality:'1:1' },
    ],
    glossary: [
      { term:'FIBO',             definition:'Financial Industry Business Ontology — open W3C/EDM Council ontology',     category:'Standards',    synonyms:['Financial Industry Business Ontology'] },
      { term:'FpML',             definition:'Financial Products Markup Language — XML standard for derivative trades',  category:'Standards',    synonyms:['Financial Products ML'] },
      { term:'ISDA Master',      definition:'Standardized master agreement for OTC derivatives transactions',           category:'Legal',        synonyms:['ISDA Master Agreement','ISDA MA'] },
      { term:'LEI',              definition:'Legal Entity Identifier — ISO 17442 20-character entity reference',         category:'Standards',    synonyms:['Legal Entity Identifier','ISO 17442'] },
      { term:'KYC',              definition:'Know Your Customer — regulatory identity / AML verification',               category:'Compliance',   synonyms:['Customer Due Diligence','CDD'] },
      { term:'AML',              definition:'Anti-Money Laundering controls and reporting (BSA / 4th-6th EU AMLD)',      category:'Compliance',   synonyms:['Anti Money Laundering'] },
      { term:'VaR',              definition:'Value at Risk — statistical measure of potential portfolio loss',           category:'Risk',         synonyms:['Value at Risk'] },
      { term:'RWA',              definition:'Risk-Weighted Assets — Basel III capital adequacy calculation input',       category:'Risk',         synonyms:['Risk Weighted Assets'] },
      { term:'MiFID II',         definition:'EU Markets in Financial Instruments Directive (transparency, best ex.)',    category:'Compliance',   synonyms:['MiFID 2'] },
      { term:'EMIR',             definition:'European Market Infrastructure Regulation — OTC derivative reporting',      category:'Compliance' },
      { term:'Dodd-Frank',       definition:'US financial reform act — Title VII covers OTC derivative reporting',       category:'Compliance',   synonyms:['Dodd-Frank Act'] },
      { term:'SEFs / MTFs',      definition:'Swap Execution Facilities / Multilateral Trading Facilities',               category:'Markets',      synonyms:['SEF','MTF'] },
      { term:'CCP',              definition:'Central Counterparty clearing house (e.g., LCH, CME, Eurex)',               category:'Markets',      synonyms:['Central Counterparty Clearing'] },
      { term:'CSA',              definition:'Credit Support Annex — collateral terms supplementing an ISDA',              category:'Legal',        synonyms:['Credit Support Annex'] },
    ],
  },

  // ─── HEALTHCARE PROVIDER ─────────────────────────────────────────────────
  // References: HL7 FHIR R4, ICD-10-CM, SNOMED CT, LOINC, CPT, HIPAA, DICOM
  healthcare: {
    name: 'Healthcare Provider',
    description: 'Hospital / payor clinical operations — HL7 FHIR / ICD-10 / SNOMED CT / DICOM aligned',
    standards: ['HL7 FHIR R4', 'ICD-10-CM', 'SNOMED CT', 'LOINC', 'CPT', 'DICOM', 'HIPAA'],
    domains: [
      { domain_code:'CLINICAL_RESOURCE', label:'Clinical Resource',    description:'Abstract FHIR-aligned clinical resource',           color:C.steel,   initials:'C', icon:'🏥', is_abstract:true },
      { domain_code:'PATIENT',           label:'Patient',              description:'FHIR Patient resource (demographics, identifiers)', color:C.brick,   initials:'P', icon:'👤', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'ENCOUNTER',         label:'Encounter',            description:'Inpatient/outpatient/ED encounter',                  color:C.teal,    initials:'E', icon:'🩺', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'CLINICAL_NOTE',     label:'Clinical Note',        description:'Progress note, H&P, discharge summary',              color:C.sage,    initials:'N', icon:'📝', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'DIAGNOSIS',         label:'Diagnosis (Condition)',description:'ICD-10/SNOMED-coded diagnosis',                      color:C.terra,   initials:'D', icon:'🩹', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'PROCEDURE',         label:'Procedure',            description:'CPT/SNOMED-coded procedure',                         color:C.indigo,  initials:'R', icon:'⚕️', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'MEDICATION_ORDER',  label:'Medication Order',     description:'Prescription / medication order (RxNorm)',           color:C.amber,   initials:'M', icon:'💊', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'LAB_RESULT',        label:'Lab Result',           description:'LOINC-coded laboratory observation',                 color:C.moss,    initials:'L', icon:'🧫', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'IMAGING_STUDY',     label:'Imaging Study',        description:'DICOM imaging study (CT, MRI, X-ray, US)',          color:C.plum,    initials:'I', icon:'🖼️', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'CLAIM',             label:'Insurance Claim',      description:'837/835 EDI claim transaction',                      color:C.ochre,   initials:'C', icon:'📑', parent_code:null },
      { domain_code:'CARE_PLAN',         label:'Care Plan',            description:'Longitudinal patient care plan',                     color:C.mauve,   initials:'A', icon:'📋', parent_code:'CLINICAL_RESOURCE' },
      { domain_code:'CONSENT',           label:'Consent',              description:'HIPAA authorization / patient consent',               color:C.wine,    initials:'O', icon:'✍️', parent_code:'CLINICAL_RESOURCE' },
    ],
    properties: {
      PATIENT: [
        { property_name:'mrn',          property_label:'MRN',          data_type:'text', is_required:true, is_unique:true, description:'Medical Record Number', display_order:10 },
        { property_name:'date_of_birth',property_label:'Date of Birth',data_type:'date', display_order:20 },
        { property_name:'sex',          property_label:'Sex (Admin)',  data_type:'enum', enum_values:['Male','Female','Other','Unknown'], display_order:30 },
      ],
      DIAGNOSIS: [
        { property_name:'icd10_code',   property_label:'ICD-10 Code',  data_type:'text', is_required:true, display_order:10 },
        { property_name:'snomed_code',  property_label:'SNOMED CT',    data_type:'text', display_order:20 },
        { property_name:'onset_date',   property_label:'Onset Date',   data_type:'date', display_order:30 },
      ],
      LAB_RESULT: [
        { property_name:'loinc_code',   property_label:'LOINC Code',   data_type:'text', is_required:true, display_order:10 },
        { property_name:'value',        property_label:'Value',        data_type:'number', display_order:20 },
        { property_name:'units',        property_label:'Units',        data_type:'text', display_order:30 },
        { property_name:'abnormal_flag',property_label:'Abnormal',     data_type:'enum', enum_values:['Normal','Low','High','Critical Low','Critical High'], display_order:40 },
      ],
    },
    relationships: [
      { relationship_code:'TREATED_AT',       label:'Treated At',        description:'Patient treated at an encounter',          color:C.teal,    abbreviation:'TRT', cardinality:'1:N', source_domain:'PATIENT',   target_domain:'ENCOUNTER' },
      { relationship_code:'DOCUMENTS',        label:'Documents',         description:'Clinical note documents an encounter',     color:C.sage,    abbreviation:'DOC', cardinality:'N:1', source_domain:'CLINICAL_NOTE', target_domain:'ENCOUNTER' },
      { relationship_code:'DIAGNOSES',        label:'Diagnoses',         description:'Encounter results in a diagnosis',         color:C.terra,   abbreviation:'DX',  cardinality:'1:N', source_domain:'ENCOUNTER', target_domain:'DIAGNOSIS' },
      { relationship_code:'PERFORMED_IN',     label:'Performed In',      description:'Procedure performed in an encounter',     color:C.indigo,  abbreviation:'PRC', cardinality:'N:1', source_domain:'PROCEDURE', target_domain:'ENCOUNTER' },
      { relationship_code:'PRESCRIBED_IN',    label:'Prescribed In',     description:'Medication ordered in an encounter',      color:C.amber,   abbreviation:'RX',  cardinality:'N:1', source_domain:'MEDICATION_ORDER', target_domain:'ENCOUNTER' },
      { relationship_code:'RESULTED_FROM',    label:'Resulted From',     description:'Lab result resulted from an order',        color:C.moss,    abbreviation:'LAB', cardinality:'N:1', source_domain:'LAB_RESULT',target_domain:'ENCOUNTER' },
      { relationship_code:'IMAGED_AT',        label:'Imaged At',         description:'Imaging study performed at encounter',    color:C.plum,    abbreviation:'IMG', cardinality:'N:1', source_domain:'IMAGING_STUDY', target_domain:'ENCOUNTER' },
      { relationship_code:'BILLED_AS',        label:'Billed As',         description:'Encounter billed as a claim',              color:C.ochre,   abbreviation:'BIL', cardinality:'1:N', source_domain:'ENCOUNTER', target_domain:'CLAIM' },
      { relationship_code:'AUTHORIZED_BY',    label:'Authorized By',     description:'Procedure authorized by patient consent', color:C.wine,    abbreviation:'AUT', cardinality:'N:1', source_domain:'PROCEDURE', target_domain:'CONSENT' },
    ],
    glossary: [
      { term:'HL7 FHIR',  definition:'Fast Healthcare Interoperability Resources — modern HL7 API standard', category:'Standards', synonyms:['FHIR','HL7 FHIR R4'] },
      { term:'ICD-10-CM', definition:'International Classification of Diseases, 10th rev — diagnosis codes',  category:'Standards', synonyms:['ICD-10'] },
      { term:'SNOMED CT', definition:'Systematized Nomenclature of Medicine — clinical terminology',          category:'Standards' },
      { term:'LOINC',     definition:'Logical Observation Identifiers Names and Codes — lab terminology',     category:'Standards' },
      { term:'CPT',       definition:'Current Procedural Terminology — AMA procedure code set',              category:'Standards' },
      { term:'DICOM',     definition:'Digital Imaging and Communications in Medicine — medical imaging std',  category:'Standards' },
      { term:'HIPAA',     definition:'US Health Insurance Portability and Accountability Act — PHI rules',    category:'Compliance' },
      { term:'EHR',       definition:'Electronic Health Record system (e.g. Epic, Cerner)',                   category:'Systems',   synonyms:['EMR'] },
      { term:'837/835',   definition:'X12 EDI transactions for claim submission (837) and remittance (835)',  category:'Standards' },
    ],
  },

  // ─── INSURANCE ───────────────────────────────────────────────────────────
  // References: ACORD Reference Architecture, ACORD AL3/XML, IFRS 17, Solvency II,
  // NAIC Model Audit Rule, MISMO (mortgage), ISO 27799
  insurance: {
    name: 'Insurance & Reinsurance',
    description: 'P&C / Life / Reinsurance underwriting, claims, and regulatory reporting — ACORD / IFRS 17 / Solvency II / NAIC aligned',
    standards: ['ACORD Reference Architecture', 'ACORD AL3 / XML', 'IFRS 17', 'Solvency II', 'NAIC Model Audit Rule', 'MISMO'],
    domains: [
      // ACORD-aligned core abstractions
      { domain_code:'INSURANCE_PARTY',   label:'Party',              description:'Abstract ACORD party — any natural or legal person',     color:C.steel,    initials:'P', icon:'👥', is_abstract:true },
      { domain_code:'POLICYHOLDER',      label:'Policyholder',       description:'Named insured / policy owner',                            color:C.indigo,   initials:'H', icon:'👤', parent_code:'INSURANCE_PARTY' },
      { domain_code:'INSURER',           label:'Insurer',            description:'Underwriting carrier / insurance company',                color:C.steelDark,initials:'C', icon:'🏛️', parent_code:'INSURANCE_PARTY' },
      { domain_code:'BROKER',            label:'Broker / Agent',     description:'Licensed producer / broker (NPN registered)',             color:C.slate,    initials:'B', icon:'🤝', parent_code:'INSURANCE_PARTY' },
      { domain_code:'REINSURER',         label:'Reinsurer',          description:'Reinsurance counterparty (treaty or facultative)',        color:C.slateDark,initials:'R', icon:'🏦', parent_code:'INSURANCE_PARTY' },

      // Application / Underwriting
      { domain_code:'APPLICATION',       label:'Insurance Application', description:'Submission — ACORD 80/125/130 application forms',     color:C.teal,     initials:'A', icon:'📝' },
      { domain_code:'UW_REPORT',         label:'Underwriting Report',description:'Underwriter risk assessment, scoring, decision',           color:C.sage,     initials:'U', icon:'📊' },
      { domain_code:'RISK_INSPECTION',   label:'Risk Inspection',    description:'On-site survey / loss-control inspection report',          color:C.moss,     initials:'I', icon:'🔍' },

      // Policy lifecycle
      { domain_code:'POLICY',            label:'Policy',             description:'Bound insurance policy contract (ACORD policy form)',     color:C.ochre,    initials:'P', icon:'📄' },
      { domain_code:'ENDORSEMENT',       label:'Endorsement',        description:'Mid-term policy amendment / rider',                       color:C.amber,    initials:'E', icon:'✏️' },
      { domain_code:'CERTIFICATE',       label:'Certificate of Insurance', description:'COI evidence-of-coverage document (ACORD 25)',     color:C.sand,     initials:'T', icon:'📜' },

      // Claims
      { domain_code:'CLAIM_FNOL',        label:'Claim (FNOL)',       description:'First Notice of Loss — incident report',                  color:C.brick,    initials:'F', icon:'🚨' },
      { domain_code:'CLAIM_FILE',        label:'Claim File',         description:'Full claim dossier — adjuster notes, payments, reserves', color:C.terra,    initials:'L', icon:'📁' },
      { domain_code:'SETTLEMENT',        label:'Settlement / Release',description:'Final claim settlement and release document',             color:C.rust,     initials:'S', icon:'💰' },
      { domain_code:'SUBROGATION',       label:'Subrogation File',   description:'Recovery action against at-fault third party',            color:C.wine,     initials:'G', icon:'⚖️' },

      // Actuarial / Reinsurance
      { domain_code:'ACTUARIAL_REPORT',  label:'Actuarial Report',   description:'Reserving, pricing, loss-development, IBNR analysis',    color:C.plum,     initials:'Y', icon:'📈' },
      { domain_code:'TREATY',            label:'Reinsurance Treaty', description:'Proportional / non-proportional reinsurance contract',    color:C.mauve,    initials:'Z', icon:'📃' },

      // Regulatory
      { domain_code:'REG_FILING',        label:'Regulatory Filing',  description:'NAIC / state DOI / Solvency II QRT submission',           color:C.steelDark,initials:'X', icon:'📋' },
      { domain_code:'COMPLIANCE_AUDIT',  label:'Compliance Audit',   description:'Market conduct exam, SOX / MAR audit workpaper',          color:C.slate,    initials:'D', icon:'✅' },
    ],
    properties: {
      POLICY: [
        { property_name:'policy_number',  property_label:'Policy Number',  data_type:'text',  is_required:true, is_unique:true, display_order:10 },
        { property_name:'line_of_business',property_label:'Line of Business', data_type:'enum', is_required:true,
          enum_values:['Auto','Homeowners','Commercial Property','Commercial GL','Workers Comp','Cyber','D&O','E&O','Marine','Aviation','Life','Annuity','Health','Disability','Reinsurance'], display_order:20 },
        { property_name:'effective_date', property_label:'Effective Date', data_type:'date', is_required:true, display_order:30 },
        { property_name:'expiration_date',property_label:'Expiration Date',data_type:'date', display_order:40 },
        { property_name:'premium_annual', property_label:'Annual Premium ($)', data_type:'number', display_order:50 },
        { property_name:'limit_per_occurrence', property_label:'Limit Per Occurrence ($)', data_type:'number', display_order:60 },
        { property_name:'deductible',     property_label:'Deductible ($)', data_type:'number', display_order:70 },
        { property_name:'status',         property_label:'Status', data_type:'enum',
          enum_values:['Quoted','Bound','In Force','Cancelled','Expired','Non-Renewed','Lapsed'], display_order:80 },
      ],
      POLICYHOLDER: [
        { property_name:'legal_name',     property_label:'Legal Name',     data_type:'text', is_required:true, display_order:10 },
        { property_name:'tax_id',         property_label:'Tax ID / SSN',   data_type:'text', description:'Encrypted at rest; PII', display_order:20 },
        { property_name:'date_of_birth',  property_label:'Date of Birth',  data_type:'date', display_order:30 },
      ],
      CLAIM_FNOL: [
        { property_name:'claim_number',   property_label:'Claim Number',   data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'date_of_loss',   property_label:'Date of Loss',   data_type:'date', is_required:true, display_order:20 },
        { property_name:'loss_cause',     property_label:'Cause of Loss',  data_type:'enum',
          enum_values:['Collision','Theft','Fire','Water Damage','Wind/Hail','Liability','Cyber Incident','Earthquake','Flood','Other'], display_order:30 },
        { property_name:'severity',       property_label:'Severity',       data_type:'enum',
          enum_values:['Minor','Moderate','Severe','Catastrophic'], display_order:40 },
        { property_name:'reported_to_police', property_label:'Reported to Police', data_type:'boolean', display_order:50 },
      ],
      CLAIM_FILE: [
        { property_name:'adjuster',         property_label:'Assigned Adjuster',data_type:'text',   display_order:10 },
        { property_name:'reserves_set',     property_label:'Reserves Set ($)', data_type:'number', display_order:20 },
        { property_name:'paid_to_date',     property_label:'Paid To Date ($)', data_type:'number', display_order:30 },
        { property_name:'litigation_flag',  property_label:'In Litigation',    data_type:'boolean', display_order:40 },
        { property_name:'fraud_score',      property_label:'Fraud Score (0-100)', data_type:'number', display_order:50 },
        { property_name:'status',           property_label:'Status', data_type:'enum',
          enum_values:['Open','Investigating','Reserved','In Litigation','Settled','Closed','Reopened','Denied'], display_order:60 },
      ],
      TREATY: [
        { property_name:'treaty_id',      property_label:'Treaty ID',      data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'treaty_type',    property_label:'Treaty Type',    data_type:'enum',
          enum_values:['Quota Share','Surplus Share','Excess of Loss','Stop Loss','Catastrophe XoL','Facultative'], display_order:20 },
        { property_name:'cession_percent',property_label:'Cession %',      data_type:'number', display_order:30 },
        { property_name:'effective_date', property_label:'Effective Date', data_type:'date', display_order:40 },
      ],
      UW_REPORT: [
        { property_name:'decision',       property_label:'Decision', data_type:'enum',
          enum_values:['Accept','Accept with Conditions','Decline','Refer to Senior UW','Quote'], display_order:10 },
        { property_name:'risk_score',     property_label:'Risk Score', data_type:'number', display_order:20 },
        { property_name:'underwriter',    property_label:'Underwriter', data_type:'text', display_order:30 },
      ],
      ACTUARIAL_REPORT: [
        { property_name:'reporting_period', property_label:'Reporting Period', data_type:'text', display_order:10 },
        { property_name:'reserve_method',   property_label:'Reserve Method',   data_type:'enum',
          enum_values:['Chain Ladder','Bornhuetter-Ferguson','Cape Cod','Stochastic','Mack'], display_order:20 },
        { property_name:'ifrs17_compliant', property_label:'IFRS 17 Compliant', data_type:'boolean', display_order:30 },
      ],
    },
    relationships: [
      { relationship_code:'SUBMITTED_VIA',    label:'Submitted Via',     description:'Application submitted via a broker',          color:C.slate,    abbreviation:'SUB', cardinality:'N:1', source_domain:'APPLICATION',     target_domain:'BROKER' },
      { relationship_code:'EVALUATED_BY_UW',  label:'Evaluated By UW',   description:'Application evaluated by an underwriting report', color:C.sage, abbreviation:'UW',  cardinality:'1:1', source_domain:'APPLICATION',     target_domain:'UW_REPORT' },
      { relationship_code:'INSPECTED_BY',     label:'Inspected By',      description:'Application supported by a risk inspection',  color:C.moss,     abbreviation:'INS', cardinality:'1:N', source_domain:'APPLICATION',     target_domain:'RISK_INSPECTION' },
      { relationship_code:'BINDS_AS_POLICY',  label:'Binds As Policy',   description:'Approved application binds as a policy',      color:C.ochre,    abbreviation:'BND', cardinality:'1:1', source_domain:'APPLICATION',     target_domain:'POLICY' },
      { relationship_code:'INSURES',          label:'Insures',           description:'Policy insures a policyholder',                color:C.indigo,   abbreviation:'INS', cardinality:'N:1', source_domain:'POLICY',          target_domain:'POLICYHOLDER' },
      { relationship_code:'ISSUED_BY',        label:'Issued By',         description:'Policy issued by an insurer carrier',          color:C.steelDark,abbreviation:'ISS', cardinality:'N:1', source_domain:'POLICY',          target_domain:'INSURER' },
      { relationship_code:'AMENDED_BY',       label:'Amended By',        description:'Policy amended by an endorsement',             color:C.amber,    abbreviation:'AMD', cardinality:'1:N', source_domain:'POLICY',          target_domain:'ENDORSEMENT' },
      { relationship_code:'EVIDENCED_BY',     label:'Evidenced By',      description:'Policy evidenced by a certificate of insurance', color:C.sand, abbreviation:'COI', cardinality:'1:N', source_domain:'POLICY',          target_domain:'CERTIFICATE' },
      { relationship_code:'CLAIM_AGAINST',    label:'Claim Against',     description:'FNOL filed against a policy',                  color:C.brick,    abbreviation:'CLM', cardinality:'N:1', source_domain:'CLAIM_FNOL',      target_domain:'POLICY' },
      { relationship_code:'EXPANDED_TO_FILE', label:'Expanded To File',  description:'FNOL expanded into a full claim file',         color:C.terra,    abbreviation:'EXP', cardinality:'1:1', source_domain:'CLAIM_FNOL',      target_domain:'CLAIM_FILE' },
      { relationship_code:'SETTLED_BY',       label:'Settled By',        description:'Claim file resolved by a settlement',          color:C.rust,     abbreviation:'STL', cardinality:'1:1', source_domain:'CLAIM_FILE',      target_domain:'SETTLEMENT' },
      { relationship_code:'TRIGGERS_SUBROGATION', label:'Triggers Subrogation', description:'Claim file triggers a subrogation action', color:C.wine, abbreviation:'SBR', cardinality:'1:1', source_domain:'CLAIM_FILE',  target_domain:'SUBROGATION' },
      { relationship_code:'CEDED_UNDER',      label:'Ceded Under',       description:'Policy/claim ceded under a reinsurance treaty', color:C.mauve,   abbreviation:'CED', cardinality:'N:M', source_domain:'POLICY',          target_domain:'TREATY' },
      { relationship_code:'COUNTERPARTY_REINSURER', label:'Reinsured By', description:'Treaty counterparty is a reinsurer',          color:C.plum,    abbreviation:'REI', cardinality:'N:1', source_domain:'TREATY',          target_domain:'REINSURER' },
      { relationship_code:'INFORMS',          label:'Informs',           description:'Actuarial report informs reserving / pricing', color:C.plum,    abbreviation:'INF', cardinality:'N:M', source_domain:'ACTUARIAL_REPORT',target_domain:'POLICY' },
      { relationship_code:'FILED_WITH_REGULATOR', label:'Filed With Regulator', description:'Submission filed with a regulator',     color:C.steelDark,abbreviation:'REG', cardinality:'N:M', source_domain:'POLICY',         target_domain:'REG_FILING' },
      { relationship_code:'COVERS_PERIOD',    label:'Covers Period',     description:'Audit covers a reporting period of activity', color:C.slate,    abbreviation:'AUD', cardinality:'N:M' },
    ],
    glossary: [
      { term:'ACORD',           definition:'Association for Cooperative Operations Research and Development — insurance data standards body', category:'Standards', synonyms:['ACORD Standards'] },
      { term:'ACORD AL3 / XML', definition:'ACORD message standards for P&C insurance data exchange',                  category:'Standards' },
      { term:'FNOL',            definition:'First Notice of Loss — initial claim notification',                          category:'Claims',     synonyms:['First Notification of Loss'] },
      { term:'Endorsement',     definition:'Mid-term amendment to a policy contract',                                    category:'Underwriting', synonyms:['Rider','Policy Amendment'] },
      { term:'Subrogation',     definition:"Insurer's right to pursue recovery from an at-fault third party",            category:'Claims' },
      { term:'Cession',         definition:'Transfer of risk from a primary insurer to a reinsurer',                     category:'Reinsurance' },
      { term:'Quota Share',     definition:'Proportional reinsurance where a fixed % of every risk is ceded',            category:'Reinsurance' },
      { term:'Excess of Loss',  definition:'Non-proportional reinsurance covering losses above an attachment point',     category:'Reinsurance', synonyms:['XoL'] },
      { term:'IBNR',            definition:'Incurred But Not Reported — actuarial estimate of unreported claim liability', category:'Actuarial',  synonyms:['Incurred But Not Reported'] },
      { term:'Loss Ratio',      definition:'Incurred losses divided by earned premium — core underwriting KPI',          category:'Actuarial' },
      { term:'Combined Ratio',  definition:'Loss ratio + expense ratio — underwriting profitability indicator',          category:'Actuarial' },
      { term:'IFRS 17',         definition:'International insurance contract accounting standard (effective 2023)',      category:'Compliance', synonyms:['Insurance Contracts Standard'] },
      { term:'Solvency II',     definition:'EU prudential regulatory framework for insurers (Pillars 1/2/3, SCR/MCR)',  category:'Compliance' },
      { term:'NAIC',            definition:'National Association of Insurance Commissioners — US state regulator coordination', category:'Compliance', synonyms:['NAIC Model Laws'] },
      { term:'MAR',             definition:'NAIC Model Audit Rule — Sarbanes-Oxley analogue for insurers',               category:'Compliance' },
      { term:'COI',             definition:'Certificate of Insurance — evidence of active coverage (ACORD 25)',          category:'Underwriting', synonyms:['Certificate of Insurance'] },
      { term:'Producer (NPN)',  definition:'Licensed insurance producer identified by National Producer Number',         category:'Distribution', synonyms:['Agent','Broker NPN'] },
    ],
  },

  // ─── MANUFACTURING / INDUSTRIAL ──────────────────────────────────────────
  // References: ISA-95 (enterprise-control integration), ISO 9001, IEC 62443
  manufacturing: {
    name: 'Manufacturing & Industrial',
    description: 'Discrete / process manufacturing operations — ISA-95 / ISO 9001 / IEC 62443 aligned',
    standards: ['ISA-95', 'ISO 9001', 'IEC 62443', 'IPC-A-610'],
    domains: [
      { domain_code:'PRODUCT_DESIGN',  label:'Product Design',    description:'CAD models, drawings, specifications',              color:C.indigo,  initials:'D', icon:'📐' },
      { domain_code:'BILL_OF_MATERIALS',label:'Bill of Materials',description:'Hierarchical BOM (BoM)',                              color:C.steel,   initials:'B', icon:'📋' },
      { domain_code:'ROUTING',         label:'Routing / Process Plan',description:'Operation sequence on the shop floor',           color:C.teal,    initials:'R', icon:'🛤️' },
      { domain_code:'WORK_ORDER',      label:'Work Order',        description:'ISA-95 production work order',                       color:C.sage,    initials:'W', icon:'📝' },
      { domain_code:'BATCH',           label:'Production Batch',  description:'Manufactured batch / lot with traceability',         color:C.ochre,   initials:'L', icon:'📦' },
      { domain_code:'QUALITY_RECORD',  label:'Quality Record',    description:'Inspection / FAI / NCR / CAPA records',              color:C.brick,   initials:'Q', icon:'✅' },
      { domain_code:'EQUIPMENT',       label:'Equipment',         description:'Machine asset (with OPC-UA telemetry)',              color:C.amber,   initials:'E', icon:'⚙️' },
      { domain_code:'MAINTENANCE_LOG', label:'Maintenance Log',   description:'PM / unplanned maintenance event log',                color:C.terra,   initials:'M', icon:'🔧' },
      { domain_code:'SUPPLIER',        label:'Supplier',          description:'Approved supplier / vendor record',                   color:C.plum,    initials:'S', icon:'🏭' },
      { domain_code:'COA',             label:'Certificate of Analysis',description:'Supplier-issued CoA for material conformance', color:C.mauve,   initials:'C', icon:'📜' },
    ],
    properties: {
      WORK_ORDER: [
        { property_name:'wo_number',    property_label:'WO Number',    data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'priority',     property_label:'Priority',     data_type:'enum', enum_values:['Low','Normal','High','Hot'], display_order:20 },
        { property_name:'planned_start',property_label:'Planned Start',data_type:'date', display_order:30 },
      ],
      BATCH: [
        { property_name:'lot_number',   property_label:'Lot Number',   data_type:'text', is_required:true, is_unique:true, display_order:10 },
        { property_name:'quantity',     property_label:'Quantity',     data_type:'number', display_order:20 },
        { property_name:'genealogy_id', property_label:'Genealogy ID', data_type:'text', description:'Parent batch reference for forward/back traceability', display_order:30 },
      ],
    },
    relationships: [
      { relationship_code:'CONSUMES_BOM',     label:'Consumes BOM',     description:'Work order consumes a BoM',          color:C.steel, abbreviation:'BOM', cardinality:'N:1', source_domain:'WORK_ORDER', target_domain:'BILL_OF_MATERIALS' },
      { relationship_code:'FOLLOWS_ROUTING',  label:'Follows Routing',  description:'Work order follows a process route', color:C.teal,  abbreviation:'RTG', cardinality:'N:1', source_domain:'WORK_ORDER', target_domain:'ROUTING' },
      { relationship_code:'PRODUCES',         label:'Produces',         description:'Work order produces a batch',         color:C.sage,  abbreviation:'PRD', cardinality:'1:N', source_domain:'WORK_ORDER', target_domain:'BATCH' },
      { relationship_code:'INSPECTED_BY',     label:'Inspected By',     description:'Batch inspected per a quality record',color:C.brick, abbreviation:'QC',  cardinality:'1:N', source_domain:'BATCH',      target_domain:'QUALITY_RECORD' },
      { relationship_code:'RUNS_ON',          label:'Runs On',          description:'Work order runs on equipment',        color:C.amber, abbreviation:'EQP', cardinality:'N:M', source_domain:'WORK_ORDER', target_domain:'EQUIPMENT' },
      { relationship_code:'MAINTAINS',        label:'Maintains',        description:'Maintenance log entry maintains equipment', color:C.terra, abbreviation:'PM',cardinality:'N:1', source_domain:'MAINTENANCE_LOG', target_domain:'EQUIPMENT' },
      { relationship_code:'SUPPLIED_BY',      label:'Supplied By',      description:'BoM component supplied by a supplier',color:C.plum,  abbreviation:'SUP', cardinality:'N:M', source_domain:'BILL_OF_MATERIALS', target_domain:'SUPPLIER' },
      { relationship_code:'CERTIFIED_BY_COA', label:'Certified By CoA', description:'Incoming material certified by a CoA',color:C.mauve, abbreviation:'COA', cardinality:'N:1', source_domain:'BATCH',     target_domain:'COA' },
    ],
    glossary: [
      { term:'ISA-95',  definition:'Enterprise-control system integration standard (ANSI/ISA-95)', category:'Standards' },
      { term:'BoM',     definition:'Bill of Materials — hierarchical list of components for a product', category:'Engineering', synonyms:['Bill of Materials'] },
      { term:'MES',     definition:'Manufacturing Execution System — shop-floor execution platform',    category:'Systems' },
      { term:'OPC-UA',  definition:'Open Platform Communications Unified Architecture — industrial IoT', category:'Standards' },
      { term:'CAPA',    definition:'Corrective And Preventive Action — quality investigation outcome',    category:'Quality' },
      { term:'NCR',     definition:'Non-Conformance Report — quality deviation record',                   category:'Quality' },
      { term:'FAI',     definition:'First Article Inspection — verification of the first production unit', category:'Quality' },
      { term:'IEC 62443',definition:'Industrial automation and control systems cybersecurity standard',    category:'Standards' },
    ],
  },
};

module.exports = { TEMPLATES };
