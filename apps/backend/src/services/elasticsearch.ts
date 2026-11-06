import { Client } from '@elastic/elasticsearch';
import { EmailStatus } from '../types';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { EmailSearchQuery, PaginationMeta } from '../types';

export const esClient = new Client({ node: env.ELASTICSEARCH_URL });

const INDEX = env.ELASTICSEARCH_INDEX;

// ─── Index Management ─────────────────────────────────────────────────────────

export async function ensureEmailIndex(): Promise<void> {
  const exists = await esClient.indices.exists({ index: INDEX });
  if (exists) return;

  await esClient.indices.create({
    index: INDEX,
    mappings: {
      properties: {
        id:          { type: 'keyword' },
        userId:      { type: 'keyword' },
        senderId:    { type: 'keyword' },
        senderEmail: { type: 'keyword' },
        senderName:  { type: 'text', fields: { keyword: { type: 'keyword' } } },
        recipient:   { type: 'keyword' },
        subject:     { type: 'text', fields: { keyword: { type: 'keyword' } } },
        body:        { type: 'text' },
        status:      { type: 'keyword' },
        scheduledAt: { type: 'date' },
        sentAt:      { type: 'date' },
        createdAt:   { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0, // Fine for single-node dev; increase for production
    },
  });

  logger.info(`Elasticsearch index '${INDEX}' created`);
}

// ─── Document Shape ───────────────────────────────────────────────────────────

interface EmailDocument {
  id: string;
  userId: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
}

// ─── Index Operations ─────────────────────────────────────────────────────────

// PostgreSQL is the source of truth. Elasticsearch is a secondary read index.
// We index emails asynchronously and never block the main send flow on ES failures.
export async function indexEmail(doc: EmailDocument): Promise<void> {
  try {
    await esClient.index({
      index: INDEX,
      id: doc.id,
      document: doc,
    });
  } catch (err) {
    // Elasticsearch downtime must NOT cause email loss.
    // We log the error and continue — the email record is safe in PostgreSQL.
    logger.error('Failed to index email in Elasticsearch', { emailId: doc.id, err });
  }
}

export async function updateEmailInIndex(
  emailId: string,
  updates: Partial<EmailDocument>
): Promise<void> {
  try {
    await esClient.update({
      index: INDEX,
      id: emailId,
      doc: updates,
      // If the document doesn't exist yet (e.g. ES was down during initial indexing),
      // create it. This prevents update failures on partially indexed data.
      doc_as_upsert: true,
    });
  } catch (err) {
    logger.error('Failed to update email in Elasticsearch', { emailId, err });
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

interface SearchResult {
  emails: EmailDocument[];
  meta: PaginationMeta;
}

export async function searchEmails(
  userId: string,
  query: EmailSearchQuery
): Promise<SearchResult> {
  const { q, status, senderId, page = 1, pageSize = 20 } = query;
  const from = (page - 1) * pageSize;

  const must: object[] = [
    { term: { userId } }, // Always scope to the authenticated user (tenant isolation)
  ];

  // Full-text search across subject, body, recipient, sender name
  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ['subject^2', 'body', 'recipient', 'senderName', 'senderEmail'],
        fuzziness: 'AUTO',
      },
    });
  }

  if (status) must.push({ term: { status } });
  if (senderId) must.push({ term: { senderId } });

  const response = await esClient.search<EmailDocument>({
    index: INDEX,
    from,
    size: pageSize,
    query: { bool: { must } },
    sort: [{ scheduledAt: { order: 'desc' } }],
  });

  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  const emails = response.hits.hits
    .map((hit) => hit._source)
    .filter((s): s is EmailDocument => s !== undefined);

  return {
    emails,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export { EmailDocument };
