import { useQuery } from '@tanstack/react-query';
import { getDashboardStats, getScheduledEmails, getSentEmails } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Mail, Send, AlertTriangle, ArrowRight, PenSquare } from 'lucide-react';

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  to,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  color: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-5 hover:border-white/10 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
      <div>
        <p className="text-3xl font-bold text-white tabular-nums">
          {value ?? <span className="text-white/20">—</span>}
        </p>
        <p className="text-sm text-white/40 mt-0.5">{label}</p>
      </div>
    </Link>
  );
}

export function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: getDashboardStats,
    refetchInterval: 15_000,
  });

  const { data: scheduledResult } = useQuery({
    queryKey: ['scheduled-emails', 1],
    queryFn: () => getScheduledEmails(1),
  });

  const { data: sentResult } = useQuery({
    queryKey: ['sent-emails', 1],
    queryFn: () => getSentEmails(1),
  });

  const recentScheduled = scheduledResult?.data.slice(0, 5) ?? [];
  const recentSent = sentResult?.data.slice(0, 5) ?? [];

  return (
    <div className="p-8">
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-white/40 text-sm mt-1">Overview of your email campaigns</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Scheduled"
          value={stats?.scheduled}
          icon={Mail}
          color="bg-brand-500/15 text-brand-400"
          to="/scheduled"
        />
        <StatCard
          label="Sent"
          value={stats?.sent}
          icon={Send}
          color="bg-emerald-500/15 text-emerald-400"
          to="/sent"
        />
        <StatCard
          label="Failed"
          value={stats?.failed}
          icon={AlertTriangle}
          color="bg-red-500/15 text-red-400"
          to="/sent"
        />
      </div>

      {/* Quick action */}
      <Link
        to="/compose"
        className="flex items-center justify-between rounded-xl border border-brand-500/30 bg-brand-500/10 px-5 py-4 mb-8 hover:bg-brand-500/15 transition-colors"
      >
        <div className="flex items-center gap-3">
          <PenSquare className="h-5 w-5 text-brand-400" />
          <div>
            <p className="text-sm font-medium text-white">Schedule a new campaign</p>
            <p className="text-xs text-white/40 mt-0.5">Upload a CSV and send to multiple recipients</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-brand-400" />
      </Link>

      {/* Recent activity */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recently scheduled */}
        <div className="rounded-xl border border-border bg-surface-2 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-white">Recently Scheduled</h2>
            <Link to="/scheduled" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
              View all
            </Link>
          </div>
          {recentScheduled.length === 0 ? (
            <div className="px-4 py-6 text-center text-white/25 text-xs">None yet</div>
          ) : (
            <div className="divide-y divide-border">
              {recentScheduled.map((email) => (
                <div key={email.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate">{email.subject}</p>
                    <p className="text-xs text-white/35 font-mono truncate mt-0.5">{email.recipient}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <StatusBadge status={email.status} />
                    <span className="text-xs text-white/25">
                      {format(new Date(email.scheduledAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently sent */}
        <div className="rounded-xl border border-border bg-surface-2 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-white">Recently Sent</h2>
            <Link to="/sent" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
              View all
            </Link>
          </div>
          {recentSent.length === 0 ? (
            <div className="px-4 py-6 text-center text-white/25 text-xs">None yet</div>
          ) : (
            <div className="divide-y divide-border">
              {recentSent.map((email) => (
                <div key={email.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate">{email.subject}</p>
                    <p className="text-xs text-white/35 font-mono truncate mt-0.5">{email.recipient}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <StatusBadge status={email.status} />
                    {email.sentAt && (
                      <span className="text-xs text-white/25">
                        {format(new Date(email.sentAt), 'MMM d, h:mm a')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
