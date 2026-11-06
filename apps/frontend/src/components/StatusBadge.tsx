type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RESCHEDULED' | 'CANCELLED';

const statusConfig: Record<EmailStatus, { label: string; classes: string }> = {
  SCHEDULED:   { label: 'Scheduled',   classes: 'bg-brand-500/15 text-brand-300' },
  PROCESSING:  { label: 'Processing',  classes: 'bg-amber-500/15 text-amber-300 animate-pulse' },
  SENT:        { label: 'Sent',        classes: 'bg-emerald-500/15 text-emerald-300' },
  FAILED:      { label: 'Failed',      classes: 'bg-red-500/15 text-red-300' },
  RESCHEDULED: { label: 'Rescheduled', classes: 'bg-orange-500/15 text-orange-300' },
  CANCELLED:   { label: 'Cancelled',   classes: 'bg-white/5 text-white/30' },
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  const { label, classes } = statusConfig[status] ?? statusConfig.FAILED;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
