import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getScheduledEmails, searchEmails, cancelEmail } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { EmailDetailModal } from '../components/EmailDetailModal';
import { ToastContainer } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useDebounce } from '../hooks/useDebounce';
import { Email } from '../types';
import { format } from 'date-fns';
import { Trash2, Calendar, Inbox } from 'lucide-react';

export function ScheduledPage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const queryClient = useQueryClient();
  const { toasts, addToast, dismiss } = useToast();

  const debouncedSearch = useDebounce(searchQuery, 350);
  const isSearching = debouncedSearch.trim().length > 0;

  const { data: listResult, isLoading: listLoading } = useQuery({
    queryKey: ['scheduled-emails', page],
    queryFn: () => getScheduledEmails(page),
    enabled: !isSearching,
  });

  const { data: searchResult, isLoading: searchLoading } = useQuery({
    queryKey: ['email-search', debouncedSearch, page],
    queryFn: () => searchEmails({ q: debouncedSearch, status: 'SCHEDULED', page }),
    enabled: isSearching,
  });

  const result = isSearching ? searchResult : listResult;
  const isLoading = isSearching ? searchLoading : listLoading;
  const emails = result?.data ?? [];
  const meta = result?.meta;

  const { mutate: cancel } = useMutation({
    mutationFn: cancelEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      addToast('Email cancelled', 'success');
    },
    onError: () => addToast('Failed to cancel email', 'error'),
  });

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Scheduled Emails</h1>
          <p className="text-white/40 text-sm mt-1">Emails waiting to be sent</p>
        </div>
        <SearchBar
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search scheduled..."
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-surface-3 animate-pulse" />
          ))}
        </div>
      ) : !emails.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/30">
          <Inbox className="h-12 w-12 mb-3" />
          <p className="text-sm">
            {isSearching ? 'No results found' : 'No scheduled emails'}
          </p>
          {!isSearching && (
            <p className="text-xs mt-1 text-white/20">Use Compose to schedule your first batch</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-3 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Recipient</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Subject</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Sender</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Scheduled
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {emails.map((email) => (
                <tr
                  key={email.id}
                  className="hover:bg-surface-3/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedEmail(email)}
                >
                  <td className="px-4 py-3 text-white/80 font-mono text-xs">{email.recipient}</td>
                  <td className="px-4 py-3 text-white/80 max-w-[200px] truncate">{email.subject}</td>
                  <td className="px-4 py-3 text-white/50 text-xs">{email.sender.name}</td>
                  <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                    {format(new Date(email.scheduledAt), 'MMM d, h:mm a')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={email.status} />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {(email.status === 'SCHEDULED' || email.status === 'RESCHEDULED') && (
                      <button
                        onClick={() => cancel(email.id)}
                        className="text-white/20 hover:text-red-400 transition-colors"
                        title="Cancel email"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta && <Pagination meta={meta} onPageChange={setPage} />}
        </div>
      )}

      {selectedEmail && (
        <EmailDetailModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
