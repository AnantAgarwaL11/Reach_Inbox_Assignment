import { X, ExternalLink, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Email } from '../types';
import { StatusBadge } from './StatusBadge';

interface EmailDetailModalProps {
  email: Email;
  onClose: () => void;
}

export function EmailDetailModal({ email, onClose }: EmailDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-4 rounded-xl border border-border bg-surface-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-semibold text-white truncate">{email.subject}</h2>
            <p className="text-xs text-white/40 mt-0.5 font-mono">{email.recipient}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <StatusBadge status={email.status} />
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-border text-xs">
          <div>
            <span className="text-white/40">Sender</span>
            <p className="text-white mt-0.5">{email.sender.name}</p>
            <p className="text-white/50 font-mono">{email.sender.email}</p>
          </div>
          <div>
            <span className="text-white/40">
              {email.status === 'SENT' ? 'Sent at' : 'Scheduled for'}
            </span>
            <p className="text-white mt-0.5">
              {format(
                new Date(email.sentAt ?? email.scheduledAt),
                'MMM d, yyyy h:mm a'
              )}
            </p>
          </div>
        </div>

        {/* Error message */}
        {email.errorMessage && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{email.errorMessage}</span>
          </div>
        )}

        {/* Body preview */}
        <div className="p-5">
          <p className="text-xs font-medium text-white/40 mb-2">Body</p>
          <div
            className="rounded-lg border border-border bg-surface-3 p-4 text-xs text-white/70 max-h-48 overflow-y-auto font-mono leading-relaxed"
            dangerouslySetInnerHTML={{ __html: email.body }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-5">
          <p className="text-xs text-white/30">
            Retry count: {email.retryCount}
            {email.idempotencyKey && (
              <> · Key: <span className="font-mono">{email.idempotencyKey.slice(0, 20)}…</span></>
            )}
          </p>
          {email.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              View in Ethereal <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
