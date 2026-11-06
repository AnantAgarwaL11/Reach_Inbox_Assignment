import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSentEmails, searchEmails } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { EmailDetailModal } from '../components/EmailDetailModal';
import { useDebounce } from '../hooks/useDebounce';
import { Email } from '../types';
import { format } from 'date-fns';
import { ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

export function SentPage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 350);
  const isSearching = debouncedSearch.trim().length > 0;

  const { data: listResult, isLoading: listLoading } = useQuery({
    queryKey: ['sent-emails', page],
    queryFn: () => getSentEmails(page),
    enabled: !isSearching,
  });

  const { data: searchResult, isLoading: searchLoading } = useQuery({
    queryKey: ['email-search-sent', debouncedSearch, page],
    queryFn: () => searchEmails({ q: debouncedSearch, status: 'SENT', page }),
    enabled: isSearching,
  });

  const result = isSearching ? searchResult : listResult;
  const isLoading = isSearching ? searchLoading : listLoading;
  const emails = result?.data ?? [];
  const meta = result?.meta;

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Sent Emails</h1>
          <p className="text-white/40 text-sm mt-1">Successfully delivered emails</p>
        </div>
        <SearchBar
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search sent emails..."
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
          <CheckCircle2 className="h-12 w-12 mb-3" />
          <p className="text-sm">
            {isSearching ? 'No results found' : 'No sent emails yet'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-3 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Recipient</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Subject</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Sender</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Sent</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Preview</th>
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
                    {email.sentAt ? format(new Date(email.sentAt), 'MMM d, h:mm a') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={email.status} />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {email.errorMessage && (
                      <span title={email.errorMessage}>
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      </span>
                    )}
                    {email.previewUrl && (
                      <a
                        href={email.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-brand-400 hover:text-brand-300 text-xs transition-colors"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {!email.previewUrl && !email.errorMessage && (
                      <span className="text-white/20 text-xs">—</span>
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
    </div>
  );
}
