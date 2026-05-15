// Industry-specific ontology templates — pre-configured schemas for rapid deployment

const TEMPLATES = {
  semiconductor: {
    name: 'Semiconductor & EDA',
    description: 'IC design, fabrication, and electronic component manufacturing',
    domains: [
      { domain_code:'ELECTRONIC_CIRCUIT', label:'Electronic Circuit', description:'IC design files, schematics, layout drawings, netlists, GDSII', color:'#8b5cf6', initials:'E', icon:'🔲' },
      { domain_code:'PDF_DOCUMENT', label:'PDF Document', description:'Datasheets, specifications, application notes, test reports', color:'#ef4444', initials:'P', icon:'📄' },
      { domain_code:'OFFICE_DOCUMENT', label:'Office Document', description:'Presentations, spreadsheets, project plans, meeting notes', color:'#3b82f6', initials:'O', icon:'📊' },
      { domain_code:'AUDIO', label:'Audio Recording', description:'Design review recordings, customer calls, training sessions', color:'#10b981', initials:'A', icon:'🎙️' },
      { domain_code:'VIDEO', label:'Video Content', description:'Lab demos, manufacturing walkthroughs, training videos', color:'#14b8a6', initials:'V', icon:'🎬' },
      { domain_code:'CAD_MODEL', label:'CAD / 3D Model', description:'Package designs, thermal models, board layouts', color:'#f97316', initials:'C', icon:'📐' },
    ],
    relationships: [
      { relationship_code:'DOCUMENTS_CIRCUIT', label:'Documents Circuit', description:'Office doc describes a circuit design', color:'#8b5cf6', abbreviation:'DOC' },
      { relationship_code:'DISCUSSES_DESIGN', label:'Discusses Design', description:'Content discusses or references a design artifact', color:'#10b981', abbreviation:'DIS' },
      { relationship_code:'PRESENTS_DESIGN', label:'Presents Design', description:'Presentation covers design information', color:'#3b82f6', abbreviation:'PRS' },
      { relationship_code:'REFERENCES_IP', label:'References IP', description:'References intellectual property or IP blocks', color:'#f59e0b', abbreviation:'REF' },
      { relationship_code:'DERIVED_FROM', label:'Derived From', description:'Asset generated or derived from another', color:'#ec4899', abbreviation:'DER' },
      { relationship_code:'VALIDATES', label:'Validates', description:'Test report validates a design or specification', color:'#06b6d4', abbreviation:'VAL' },
      { relationship_code:'SUPERSEDES', label:'Supersedes', description:'Newer version replaces an older document', color:'#f43f5e', abbreviation:'SUP' },
    ],
    glossary: [
      { term:'Tapeout', definition:'Final step in IC design — layout sent to foundry for manufacturing', category:'Engineering', synonyms:['Tape-out','GDS Submission'], related_signals:['tapeout_schedule'] },
      { term:'Process Design Kit', definition:'Foundry-provided files and rules for a manufacturing process node', category:'Engineering', synonyms:['PDK','Process Kit'], related_signals:['process_node_params'] },
      { term:'IP Core', definition:'Reusable block of logic used as a building block in chip design', category:'Engineering', synonyms:['Silicon IP','Design IP'], related_signals:['unreleased_ip_core'] },
      { term:'Yield Data', definition:'Manufacturing yield statistics — functional chips per wafer', category:'Engineering', synonyms:['Wafer Yield','Die Yield'], related_signals:['yield_data','die_cost_data'] },
      { term:'Die Cost', definition:'Per-unit manufacturing cost of a single IC die', category:'Finance', synonyms:['Chip Cost','Unit Cost'], related_signals:['die_cost_data'] },
      { term:'Design Rule Check', definition:'Automated verification that layout meets manufacturing constraints', category:'Engineering', synonyms:['DRC','Physical Verification'], related_signals:['internal_procedure'] },
      { term:'Design Win', definition:'Customer selects company product for their design', category:'Customer', synonyms:['Socket Win','Customer Award'], related_signals:['customer_design_win'] },
      { term:'ITAR', definition:'International Traffic in Arms Regulations — export control for defense articles', category:'Compliance', synonyms:['Export Control','ITAR Controlled'], related_signals:['tapeout_schedule'] },
    ],
  },

  pharma: {
    name: 'Pharmaceutical & Life Sciences',
    description: 'Drug development, clinical trials, regulatory compliance',
    domains: [
      { domain_code:'CLINICAL_DATA', label:'Clinical Data', description:'Trial results, patient data, study protocols', color:'#8b5cf6', initials:'C', icon:'🧬' },
      { domain_code:'REGULATORY_FILING', label:'Regulatory Filing', description:'FDA submissions, NDA filings, IND applications', color:'#ef4444', initials:'R', icon:'📋' },
      { domain_code:'LAB_REPORT', label:'Lab Report', description:'Analytical reports, stability studies, batch records', color:'#f59e0b', initials:'L', icon:'🔬' },
      { domain_code:'OFFICE_DOCUMENT', label:'Office Document', description:'SOPs, presentations, meeting notes, protocols', color:'#3b82f6', initials:'O', icon:'📊' },
      { domain_code:'RESEARCH_PAPER', label:'Research Paper', description:'Published papers, literature reviews, white papers', color:'#10b981', initials:'P', icon:'📰' },
      { domain_code:'PATIENT_RECORD', label:'Patient Record', description:'PHI, medical records, consent forms', color:'#dc2626', initials:'X', icon:'🏥' },
    ],
    relationships: [
      { relationship_code:'SUPPORTS_CLAIM', label:'Supports Claim', description:'Data supports a regulatory or clinical claim', color:'#8b5cf6', abbreviation:'SUP' },
      { relationship_code:'REFERENCES_TRIAL', label:'References Trial', description:'Document references a clinical trial', color:'#10b981', abbreviation:'TRL' },
      { relationship_code:'DERIVED_FROM', label:'Derived From', description:'Report derived from raw data or prior study', color:'#ec4899', abbreviation:'DER' },
      { relationship_code:'REGULATORY_SUBMISSION', label:'Regulatory Submission', description:'Filing submitted to a regulatory body', color:'#ef4444', abbreviation:'REG' },
      { relationship_code:'VALIDATES', label:'Validates', description:'Study validates a hypothesis or formulation', color:'#06b6d4', abbreviation:'VAL' },
      { relationship_code:'SUPERSEDES', label:'Supersedes', description:'Newer version replaces an older document', color:'#f43f5e', abbreviation:'SUP' },
    ],
    glossary: [
      { term:'Clinical Trial', definition:'Human testing phase of drug/device development', category:'Research', synonyms:['Trial','Study','Phase Study'], related_signals:['product_roadmap'] },
      { term:'FDA Submission', definition:'Filing to the Food and Drug Administration for approval', category:'Compliance', synonyms:['NDA Filing','510(k)','BLA'], related_signals:['tapeout_schedule'] },
      { term:'Drug Formulation', definition:'Proprietary composition and manufacturing process', category:'Engineering', synonyms:['Formulation','Drug Recipe'], related_signals:['unreleased_ip_core'] },
      { term:'GMP', definition:'Good Manufacturing Practice — quality standards for production', category:'Compliance', synonyms:['cGMP','Manufacturing Standards'], related_signals:['internal_procedure'] },
      { term:'Patient Data', definition:'Protected health information from clinical activities', category:'Compliance', synonyms:['PHI','HIPAA Data'], related_signals:['personnel_info'] },
      { term:'Batch Record', definition:'Manufacturing documentation for a single production batch', category:'Operations', synonyms:['Batch Doc','Production Record'], related_signals:['internal_procedure'] },
    ],
  },

  finance: {
    name: 'Financial Services & Banking',
    description: 'Trading, risk management, regulatory compliance, client services',
    domains: [
      { domain_code:'TRADING_DOCUMENT', label:'Trading Document', description:'Trading strategies, algorithm specs, execution reports', color:'#8b5cf6', initials:'T', icon:'📈' },
      { domain_code:'RISK_REPORT', label:'Risk Report', description:'Risk assessments, VaR calculations, stress tests', color:'#ef4444', initials:'R', icon:'⚠️' },
      { domain_code:'CLIENT_RECORD', label:'Client Record', description:'KYC docs, client agreements, account records', color:'#f59e0b', initials:'C', icon:'👤' },
      { domain_code:'REGULATORY_FILING', label:'Regulatory Filing', description:'SEC filings, compliance reports, audit records', color:'#10b981', initials:'F', icon:'📋' },
      { domain_code:'MARKET_DATA', label:'Market Data', description:'Market research, analysis reports, pricing data', color:'#3b82f6', initials:'M', icon:'📊' },
      { domain_code:'OFFICE_DOCUMENT', label:'Office Document', description:'Internal memos, presentations, policies', color:'#14b8a6', initials:'O', icon:'📄' },
    ],
    relationships: [
      { relationship_code:'CALCULATES_FROM', label:'Calculates From', description:'Report calculated from underlying data source', color:'#8b5cf6', abbreviation:'CAL' },
      { relationship_code:'CLIENT_RELATED', label:'Client Related', description:'Document relates to a specific client', color:'#f59e0b', abbreviation:'CLT' },
      { relationship_code:'REGULATORY_FILING', label:'Regulatory Filing', description:'Filed with a regulatory body', color:'#10b981', abbreviation:'REG' },
      { relationship_code:'DERIVED_FROM', label:'Derived From', description:'Analysis derived from source data', color:'#ec4899', abbreviation:'DER' },
      { relationship_code:'VALIDATES', label:'Validates', description:'Validates a risk model or trading strategy', color:'#06b6d4', abbreviation:'VAL' },
      { relationship_code:'SUPERSEDES', label:'Supersedes', description:'Newer version replaces older document', color:'#f43f5e', abbreviation:'SUP' },
    ],
    glossary: [
      { term:'KYC', definition:'Know Your Customer — regulatory identity verification process', category:'Compliance', synonyms:['Customer Due Diligence','AML Check'], related_signals:['customer_nda','personnel_info'] },
      { term:'VaR', definition:'Value at Risk — statistical measure of potential portfolio loss', category:'Risk', synonyms:['Value at Risk','Risk Metric'], related_signals:['financial_projection'] },
      { term:'Trading Algorithm', definition:'Proprietary algorithm for automated trading decisions', category:'Engineering', synonyms:['Algo','Quant Model','Alpha Model'], related_signals:['unreleased_ip_core'] },
      { term:'Portfolio Holdings', definition:'Current investment positions and asset allocations', category:'Finance', synonyms:['Holdings','Position Report'], related_signals:['internal_pricing','financial_projection'] },
      { term:'Stress Test', definition:'Simulation of adverse market conditions on portfolio', category:'Risk', synonyms:['Scenario Analysis','Risk Simulation'], related_signals:['financial_projection'] },
      { term:'SEC Filing', definition:'Mandatory disclosure filed with the Securities and Exchange Commission', category:'Compliance', synonyms:['10-K','10-Q','8-K'], related_signals:['public_datasheet'] },
    ],
  },

  enterprise: {
    name: 'Generic Enterprise',
    description: 'General-purpose ontology for any enterprise data governance',
    domains: [
      { domain_code:'ELECTRONIC_CIRCUIT', label:'Electronic Circuit', description:'Technical design files and schematics', color:'#8b5cf6', initials:'E', icon:'🔲' },
      { domain_code:'PDF_DOCUMENT', label:'PDF Document', description:'Reports, specifications, datasheets', color:'#ef4444', initials:'P', icon:'📄' },
      { domain_code:'OFFICE_DOCUMENT', label:'Office Document', description:'Presentations, spreadsheets, documents', color:'#3b82f6', initials:'O', icon:'📊' },
      { domain_code:'AUDIO', label:'Audio Recording', description:'Meeting recordings, voice memos', color:'#10b981', initials:'A', icon:'🎙️' },
      { domain_code:'VIDEO', label:'Video Content', description:'Video recordings, training materials', color:'#14b8a6', initials:'V', icon:'🎬' },
    ],
    relationships: [
      { relationship_code:'DOCUMENTS_CIRCUIT', label:'Documents Circuit', description:'Document describes a technical design', color:'#8b5cf6', abbreviation:'DOC' },
      { relationship_code:'DISCUSSES_DESIGN', label:'Discusses Design', description:'Content discusses a design artifact', color:'#10b981', abbreviation:'DIS' },
      { relationship_code:'PRESENTS_DESIGN', label:'Presents Design', description:'Presentation covers design information', color:'#3b82f6', abbreviation:'PRS' },
      { relationship_code:'REFERENCES_IP', label:'References IP', description:'References intellectual property', color:'#f59e0b', abbreviation:'REF' },
      { relationship_code:'DERIVED_FROM', label:'Derived From', description:'Asset derived from another asset', color:'#ec4899', abbreviation:'DER' },
    ],
    glossary: [
      { term:'NDA', definition:'Non-Disclosure Agreement restricting information sharing', category:'Legal', synonyms:['Confidentiality Agreement'], related_signals:['customer_nda'] },
      { term:'Product Roadmap', definition:'Strategic document outlining planned releases and timelines', category:'Product', synonyms:['Roadmap','Release Plan'], related_signals:['product_roadmap'] },
      { term:'Competitive Analysis', definition:'Research comparing products against competitors', category:'Research', synonyms:['Competitor Teardown'], related_signals:['competitive_teardown'] },
      { term:'Revenue Forecast', definition:'Financial projection of expected revenue', category:'Finance', synonyms:['Sales Forecast'], related_signals:['financial_projection','internal_pricing'] },
      { term:'SOP', definition:'Standard Operating Procedure for routine operations', category:'Operations', synonyms:['Process Document','Work Instruction'], related_signals:['internal_procedure'] },
    ],
  },
};

module.exports = { TEMPLATES };
