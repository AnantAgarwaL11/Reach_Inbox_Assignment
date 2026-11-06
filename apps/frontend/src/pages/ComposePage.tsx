import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSenders, scheduleEmails, uploadRecipients } from '../services/api';
import type { UploadResult } from '../types';
import { Upload, CheckCircle2, AlertCircle, Users } from 'lucide-react';

const composeSchema = z.object({
  senderId: z.string().min(1, 'Select a sender'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  scheduledAt: z.string().min(1, 'Schedule time is required'),
});

type ComposeForm = z.infer<typeof composeSchema>;

export function ComposePage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [scheduled, setScheduled] = useState<{ count: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: senders = [] } = useQuery({ queryKey: ['senders'], queryFn: getSenders });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComposeForm>({ resolver: zodResolver(composeSchema) });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadRecipients(file);
      setUploadResult(result);
    } catch {
      setError('Failed to parse file — ensure it is a valid CSV or plain text file');
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (data: ComposeForm) => {
    if (!uploadResult?.recipients.length) {
      setError('Upload a recipient file first');
      return;
    }
    setError(null);
    try {
      const result = await scheduleEmails({
        ...data,
        recipients: uploadResult.recipients,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
      });
      setScheduled({ count: result.scheduled, skipped: result.skipped });
      reset();
      setUploadResult(null);
      queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (scheduled) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-4" />
        <h2 className="text-xl font-semibold text-white">Emails scheduled!</h2>
        <p className="text-white/50 mt-2">
          {scheduled.count} email(s) queued
          {scheduled.skipped > 0 && `, ${scheduled.skipped} skipped (duplicates)`}
        </p>
        <button
          onClick={() => setScheduled(null)}
          className="mt-6 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          Schedule more
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Compose Email</h1>
        <p className="text-white/40 text-sm mt-1">Schedule a batch email to multiple recipients</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Sender */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1.5">Sender</label>
          <select
            {...register('senderId')}
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="">Select a sender...</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.email}) — {s.hourlyLimit}/hr
              </option>
            ))}
          </select>
          {errors.senderId && (
            <p className="text-xs text-red-400 mt-1">{errors.senderId.message}</p>
          )}
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1.5">Subject</label>
          <input
            {...register('subject')}
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-sm text-white placeholder-white/20 focus:border-brand-500 focus:outline-none"
            placeholder="Your email subject"
          />
          {errors.subject && (
            <p className="text-xs text-red-400 mt-1">{errors.subject.message}</p>
          )}
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1.5">Body</label>
          <textarea
            {...register('body')}
            rows={6}
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-sm text-white placeholder-white/20 focus:border-brand-500 focus:outline-none resize-none font-mono"
            placeholder="<p>Your email body (HTML supported)</p>"
          />
          {errors.body && (
            <p className="text-xs text-red-400 mt-1">{errors.body.message}</p>
          )}
        </div>

        {/* Schedule Time */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1.5">Send at</label>
          <input
            {...register('scheduledAt')}
            type="datetime-local"
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
          />
          {errors.scheduledAt && (
            <p className="text-xs text-red-400 mt-1">{errors.scheduledAt.message}</p>
          )}
        </div>

        {/* Recipients */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1.5">Recipients</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 cursor-pointer hover:border-brand-500/50 transition-colors"
          >
            <Upload className="h-5 w-5 text-white/30" />
            <span className="text-sm text-white/40">
              {isUploading ? 'Parsing...' : 'Upload CSV or plain text file'}
            </span>
            <span className="text-xs text-white/20">One email per line, or comma-separated</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />

          {uploadResult && (
            <div className="mt-3 rounded-lg border border-border bg-surface-3 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-brand-400" />
                <span className="text-white font-medium">{uploadResult.validCount} valid recipients</span>
              </div>
              {uploadResult.invalidCount > 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {uploadResult.invalidCount} invalid address(es) will be skipped
                </p>
              )}
              {uploadResult.duplicateCount > 0 && (
                <p className="text-xs text-white/40">
                  {uploadResult.duplicateCount} duplicate(s) removed
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !uploadResult?.validCount}
          className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? 'Scheduling...'
            : `Schedule ${uploadResult?.validCount ?? 0} email(s)`}
        </button>
      </form>
    </div>
  );
}
