export const STATUS_META = {
  SUCCESS: { tone: 'good', icon: '✓', label: 'Success' },
  OK: { tone: 'good', icon: '✓', label: 'OK' },
  WARNING: { tone: 'warning', icon: '!', label: 'Warning' },
  TIMED_OUT: { tone: 'serious', icon: '◷', label: 'Timed out' },
  FAILED: { tone: 'critical', icon: '✕', label: 'Failed' },
  CRITICAL: { tone: 'critical', icon: '‼', label: 'Critical' },
  UNKNOWN: { tone: 'neutral', icon: '?', label: 'Unknown' },
  ACTIVE: { tone: 'neutral', icon: '●', label: 'Active' },
  ACKNOWLEDGED: { tone: 'neutral', icon: '◐', label: 'Acknowledged' },
  RESOLVED: { tone: 'good', icon: '✓', label: 'Resolved' },
  ORPHANED: { tone: 'serious', icon: '⚠', label: 'Orphaned' },
};

export const statusMeta = (value) => STATUS_META[value] ?? STATUS_META.UNKNOWN;
