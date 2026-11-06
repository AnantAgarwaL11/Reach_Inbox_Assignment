import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getSenders,
  createSender,
  updateSender,
  getSlackStatus,
  disconnectSlack,
  type Sender,
} from '../services/api';
import { Plus, Slack, CheckCircle2, XCircle, Pencil, Check, X } from 'lucide-react';

// ─── Sender Form ──────────────────────────────────────────────────────────────

const senderSchema = z.object({
  email: z.string().email('Must be a valid email'),
  name: z.string().min(1, 'Name is required'),
  hourlyLimit: z.coerce.number().int().min(1).max(10000).default(200),
  minimumSendDelay: z.coerce.number().int().min(0).max(60000).default(2000),
});

type SenderForm = z.infer<typeof senderSchema>;

function SenderRow({ sender }: { sender: Sender }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Partial<SenderForm>>({
    defaultValues: {
      name: sender.name,
      hourlyLimit: sender.hourlyLimit,
      minimumSendDelay: sender.minimumSendDelay,
    },
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: (data: Partial<SenderForm>) => updateSender(sender.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['senders'] });
      setEditing(false);
    },
  });

  if (editing) {
    return (
      <tr className="bg-surface-3/50">
        <td className="px-4 py-3">
          <span className="text-white/50 font-mono text-xs">{sender.email}</span>
        </td>
        <td className="px-4 py-3">
          <input
            {...register('name')}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <input
            {...register('hourlyLimit')}
            type="number"
            className="w-24 rounded border border-border bg-surface px-2 py-1 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <input
            {...register('minimumSendDelay')}
            type="number"
            className="w-28 rounded border border-border bg-surface px-2 py-1 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit((d) => save(d))}
              disabled={isPending}
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-surface-3/50 transition-colors">
      <td className="px-4 py-3 text-white/50 font-mono text-xs">{sender.email}</td>
      <td className="px-4 py-3 text-white/80 text-sm">{sender.name}</td>
      <td className="px-4 py-3 text-white/60 text-sm tabular-nums">{sender.hourlyLimit}/hr</td>
      <td className="px-4 py-3 text-white/60 text-sm tabular-nums">{sender.minimumSendDelay}ms</td>
      <td className="px-4 py-3">
        <button
          onClick={() => setEditing(true)}
          className="text-white/20 hover:text-white/60 transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

// ─── Add Sender Form ──────────────────────────────────────────────────────────

function AddSenderForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<SenderForm>({
    resolver: zodResolver(senderSchema),
    defaultValues: { hourlyLimit: 200, minimumSendDelay: 2000 },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: createSender,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['senders'] });
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Email</label>
          <input
            {...register('email')}
            placeholder="sender@example.com"
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Display Name</label>
          <input
            {...register('name')}
            placeholder="Marketing Team"
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Hourly limit</label>
          <input
            {...register('hourlyLimit')}
            type="number"
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">Min delay (ms)</label>
          <input
            {...register('minimumSendDelay')}
            type="number"
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-40 transition-colors"
        >
          {isPending ? 'Adding...' : 'Add sender'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-border text-white/50 text-sm hover:text-white/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Slack Section ────────────────────────────────────────────────────────────

function SlackSection() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const justConnected = searchParams.get('slack_connected') === 'true';

  const { data: status } = useQuery({
    queryKey: ['slack-status'],
    queryFn: getSlackStatus,
  });

  const { mutate: disconnect, isPending } = useMutation({
    mutationFn: disconnectSlack,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['slack-status'] }),
  });

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-white">Slack Integration</h2>
          <p className="text-white/40 text-sm mt-0.5">
            Get notified when a sender reaches its hourly limit
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A154B]/30">
          <Slack className="h-5 w-5 text-[#E01E5A]" />
        </div>
      </div>

      {justConnected && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Slack connected successfully
        </div>
      )}

      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-3 border border-border">
        <div className="flex items-center gap-3">
          {status?.connected ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <XCircle className="h-4 w-4 text-white/30" />
          )}
          <div>
            <p className="text-sm text-white">
              {status?.connected
                ? `Connected to ${status.teamName ?? 'Slack'}`
                : 'Not connected'}
            </p>
            {status?.connected && (
              <p className="text-xs text-white/40 mt-0.5">
                Notifications will be sent to {'{channel}'}
              </p>
            )}
          </div>
        </div>

        {status?.connected ? (
          <button
            onClick={() => disconnect()}
            disabled={isPending}
            className="text-sm text-white/40 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            Disconnect
          </button>
        ) : (
          <a
            href="/api/slack/connect"
            className="px-3 py-1.5 rounded-lg bg-[#4A154B] text-white text-xs font-medium hover:bg-[#611f69] transition-colors"
          >
            Connect Slack
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [addingsender, setAddingsender] = useState(false);
  const { data: senders = [], isLoading } = useQuery({
    queryKey: ['senders'],
    queryFn: getSenders,
  });

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Manage senders and integrations</p>
      </div>

      {/* Senders */}
      <div className="rounded-xl border border-border bg-surface-2 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-white">Senders</h2>
            <p className="text-white/40 text-sm mt-0.5">
              Email accounts used to send your campaigns
            </p>
          </div>
          {!addingsender && (
            <button
              onClick={() => setAddingsender(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/15 text-brand-300 text-sm hover:bg-brand-500/25 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add sender
            </button>
          )}
        </div>

        {addingsender && (
          <div className="mb-5 p-4 rounded-lg border border-border bg-surface-3">
            <AddSenderForm onClose={() => setAddingsender(false)} />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-surface-3 animate-pulse" />
            ))}
          </div>
        ) : !senders.length ? (
          <div className="text-center py-8 text-white/30 text-sm">
            No senders yet. Add one to start scheduling emails.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-3 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 text-white/40 font-medium text-xs">Email</th>
                  <th className="text-left px-4 py-2.5 text-white/40 font-medium text-xs">Name</th>
                  <th className="text-left px-4 py-2.5 text-white/40 font-medium text-xs">Limit</th>
                  <th className="text-left px-4 py-2.5 text-white/40 font-medium text-xs">Delay</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {senders.map((sender) => (
                  <SenderRow key={sender.id} sender={sender} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slack */}
      <SlackSection />
    </div>
  );
}
