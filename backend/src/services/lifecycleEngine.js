// Asset Lifecycle State Machine
// Defines valid states, transitions, and enforces governance rules

const STATES = {
  DISCOVERED:    { label: 'Discovered',    icon: '📁', color: 'blue' },
  PARSING:       { label: 'Parsing',       icon: '🔬', color: 'cyan' },
  PARSED:        { label: 'Parsed',        icon: '✅', color: 'green' },
  CLASSIFYING:   { label: 'Classifying',   icon: '🏷️', color: 'purple' },
  CLASSIFIED:    { label: 'Classified',    icon: '✅', color: 'green' },
  PENDING_REVIEW:{ label: 'Pending Review',icon: '🟡', color: 'yellow' },
  GATED:         { label: 'Gated',         icon: '🔴', color: 'red' },
  ESCALATED:     { label: 'Escalated',     icon: '🚨', color: 'red' },
  APPROVED:      { label: 'Approved',      icon: '✅', color: 'green' },
  PUBLISHED:     { label: 'Published',     icon: '📢', color: 'green' },
  RECLASSIFICATION_TRIGGERED: { label: 'Reclassification', icon: '🔄', color: 'orange' },
  SOURCE_DELETED:{ label: 'Source Deleted', icon: '🗑️', color: 'gray' },
};

// Valid transitions: from → [allowed to states]
const TRANSITIONS = {
  DISCOVERED:     ['PARSING'],
  PARSING:        ['PARSED', 'DISCOVERED'], // DISCOVERED = retry on failure
  PARSED:         ['CLASSIFYING'],
  CLASSIFYING:    ['CLASSIFIED', 'PENDING_REVIEW', 'GATED'],
  CLASSIFIED:     ['APPROVED', 'RECLASSIFICATION_TRIGGERED'],
  PENDING_REVIEW: ['APPROVED', 'ESCALATED', 'RECLASSIFICATION_TRIGGERED'],
  GATED:          ['APPROVED', 'ESCALATED', 'RECLASSIFICATION_TRIGGERED'],
  ESCALATED:      ['GATED', 'PENDING_REVIEW', 'APPROVED'],
  APPROVED:       ['PUBLISHED', 'RECLASSIFICATION_TRIGGERED'],
  PUBLISHED:      ['RECLASSIFICATION_TRIGGERED', 'SOURCE_DELETED'],
  RECLASSIFICATION_TRIGGERED: ['CLASSIFYING'],
  SOURCE_DELETED: [], // Terminal state
};

function canTransition(fromState, toState) {
  const allowed = TRANSITIONS[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

function validateTransition(fromState, toState) {
  if (!STATES[fromState]) throw new Error(`Invalid current state: ${fromState}`);
  if (!STATES[toState]) throw new Error(`Invalid target state: ${toState}`);
  if (!canTransition(fromState, toState)) {
    throw new Error(`Invalid transition: ${fromState} → ${toState}. Allowed: ${TRANSITIONS[fromState].join(', ')}`);
  }
  return true;
}

// Determine lifecycle state from classification zone (backward compatibility)
function zoneToLifecycleState(zone) {
  switch (zone) {
    case 'AUTONOMOUS': return 'CLASSIFIED';
    case 'SUPERVISED': return 'PENDING_REVIEW';
    case 'GATED': return 'GATED';
    case 'PENDING_REVIEW': return 'PENDING_REVIEW';
    default: return 'CLASSIFIED';
  }
}

function getStateInfo(state) {
  return STATES[state] || { label: state, icon: '❓', color: 'gray' };
}

function getAllStates() {
  return Object.entries(STATES).map(([key, val]) => ({ state: key, ...val }));
}

module.exports = { STATES, TRANSITIONS, canTransition, validateTransition, zoneToLifecycleState, getStateInfo, getAllStates };
