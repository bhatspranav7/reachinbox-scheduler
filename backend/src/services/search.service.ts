import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import type { Email } from "../db/schema";

/**
 * Elasticsearch indexing for scheduled/sent emails.
 *
 * Postgres is the source of truth; ES is a derived, searchable view. Every
 * status change is re-indexed (upsert by email id), so indexing is idempotent.
 * If ES is unreachable we log and carry on – sending must never depend on search.
 */
export const es = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 5000, maxRetries: 1 });
const INDEX = env.ELASTICSEARCH_INDEX;

let available = false;
export const isSearchAvailable = () => available;

export async function initSearch() {
  try {
    await es.ping();
    const exists = await es.indices.exists({ index: INDEX });
    if (!exists) {
      await es.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            userId: { type: "keyword" },
            campaignId: { type: "keyword" },
            senderId: { type: "keyword" },
            toEmail: {
              type: "text",
              analyzer: "standard",
              fields: { keyword: { type: "keyword" } },
            },
            subject: { type: "text" },
            body: { type: "text" },
            status: { type: "keyword" },
            scheduledAt: { type: "date" },
            sentAt: { type: "date" },
            error: { type: "text" },
          },
        },
      });
      logger.info({ index: INDEX }, "created Elasticsearch index");
    }
    available = true;
    logger.info("Elasticsearch connected");
  } catch (err) {
    available = false;
    logger.warn({ err: (err as Error).message }, "Elasticsearch unavailable – search will fall back to Postgres");
  }
}

const toDoc = (e: Email) => ({
  userId: e.userId,
  campaignId: e.campaignId,
  senderId: e.senderId,
  toEmail: e.toEmail,
  subject: e.subject,
  body: e.body.replace(/<[^>]+>/g, " "),
  status: e.status,
  scheduledAt: e.scheduledAt,
  sentAt: e.sentAt,
  error: e.error,
});

export async function indexEmails(rows: Email[]) {
  if (!available || rows.length === 0) return;
  try {
    const operations = rows.flatMap((e) => [{ index: { _index: INDEX, _id: e.id } }, toDoc(e)]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) logger.warn("some Elasticsearch bulk operations failed");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Elasticsearch bulk index failed");
  }
}

export const indexEmail = (row: Email) => indexEmails([row]);

export interface SearchParams {
  userId: string;
  q: string;
  statuses?: string[];
  limit: number;
  offset: number;
}

/** Returns matching email ids ordered by relevance, or null if ES is unavailable. */
export async function searchEmailIds(p: SearchParams): Promise<{ ids: string[]; total: number } | null> {
  if (!available) return null;
  try {
    const res = await es.search({
      index: INDEX,
      from: p.offset,
      size: p.limit,
      query: {
        bool: {
          filter: [
            { term: { userId: p.userId } },
            ...(p.statuses?.length ? [{ terms: { status: p.statuses } }] : []),
          ],
          must: [
            {
              multi_match: {
                query: p.q,
                fields: ["toEmail^3", "subject^2", "body"],
                fuzziness: "AUTO",
                type: "best_fields",
              },
            },
          ],
          should: [{ wildcard: { "toEmail.keyword": { value: `*${p.q.toLowerCase()}*` } } }],
        },
      },
    });
    const total = typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
    return { ids: res.hits.hits.map((h) => h._id as string), total };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Elasticsearch search failed – falling back");
    return null;
  }
}
