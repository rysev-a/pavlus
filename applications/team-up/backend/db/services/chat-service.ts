// The chat service: threads (dm for two, project for a team), messages, and
// the redis side of the live part — connection identity (ws frames carry no
// cookie of their own), the pub/sub fanout across workers, the set of who is
// online, and the queue of notifications for members that are not.

import { db, redisEffector, sql } from "@pavlus/backend";

export interface ThreadRow {
  id: number;
  type: string;
  projectId: number | null;
  title: string;
  messages: {
    id: number;
    userId: number;
    author: string;
    body: string;
    sentAt: string;
  }[];
}

/** One queued notification (a job for the drain in server.ts). */
export interface NotifyJob {
  userId: number;
  threadId: number;
  messageId: number;
  author: string;
  body: string;
}

export class ChatService {
  static myThreads(userId: number) {
    return db.select({
      id: "chat.threads",
      errorId: "chat.failed",
      query: sql`SELECT t.id, t.type, t.project_id AS "projectId",
                        coalesce(p.name, o.name) AS title,
                        (SELECT count(*) FROM messages m
                          WHERE m.thread_id = t.id
                            AND m.id > coalesce(tp.last_read_message_id, 0)
                            AND m.user_id <> ${userId})::int AS unread
                 FROM thread_participants tp
                 JOIN threads t ON t.id = tp.thread_id
                 LEFT JOIN projects p ON p.id = t.project_id
                 LEFT JOIN users o ON o.id = (
                      SELECT tp2.user_id FROM thread_participants tp2
                      WHERE tp2.thread_id = t.id AND tp2.user_id <> ${userId} LIMIT 1)
                 WHERE tp.user_id = ${userId}
                 ORDER BY t.id`,
    });
  }

  /** How many unread messages the member has (the nav's badge). */
  static unread(userId: number) {
    return db.select({
      id: "chat.unread",
      errorId: "chat.failed",
      query: sql`SELECT coalesce(sum(unread), 0)::int AS count FROM (
                  SELECT (SELECT count(*) FROM messages m
                           WHERE m.thread_id = t.id
                             AND m.id > coalesce(tp.last_read_message_id, 0)
                             AND m.user_id <> ${userId}) AS unread
                  FROM thread_participants tp
                  JOIN threads t ON t.id = tp.thread_id
                  WHERE tp.user_id = ${userId}) s`,
    });
  }

  /** One thread with its messages — the poller's view (the ws client gets
   * pushes; a reload or a catch-up still works without it). */
  static thread(threadId: number, userId: number) {
    return db.select({
      id: "chat.thread",
      errorId: "chat.failed",
      query: sql`SELECT t.id, t.type, t.project_id AS "projectId",
                        (SELECT coalesce(json_agg(json_build_object(
                           'id', m.id, 'userId', m.user_id, 'author', u.name,
                           'body', m.body, 'sentAt', m.sent_at)
                           ORDER BY m.id), '[]')
                         FROM messages m JOIN users u ON u.id = m.user_id
                         WHERE m.thread_id = t.id) AS messages
                 FROM threads t
                 WHERE t.id = ${threadId}
                   AND EXISTS (SELECT 1 FROM thread_participants tp
                               WHERE tp.thread_id = t.id AND tp.user_id = ${userId})`,
    });
  }

  /** The dm with someone: found, both sides participants (found or created). */
  static dm(userId: number, otherId: number) {
    return db.select({
      id: "chat.dmFound",
      errorId: "chat.failed",
      query: sql`SELECT t.id FROM threads t
                 WHERE t.type = 'dm'
                   AND EXISTS (SELECT 1 FROM thread_participants a
                               WHERE a.thread_id = t.id AND a.user_id = ${userId})
                   AND EXISTS (SELECT 1 FROM thread_participants b
                               WHERE b.thread_id = t.id AND b.user_id = ${otherId})`,
    });
  }

  static createDm(userId: number, otherId: number) {
    return db.execute({
      id: "chat.dmCreated",
      errorId: "chat.failed",
      query: sql`WITH t AS (INSERT INTO threads (type) VALUES ('dm') RETURNING id)
                 INSERT INTO thread_participants (thread_id, user_id)
                 SELECT t.id, u.id FROM t, unnest(${[userId, otherId]}::int[]) AS u(id)
                 RETURNING thread_id AS id`,
    });
  }

  static send(threadId: number, userId: number, body: string) {
    return db.execute({
      id: "chat.sent",
      errorId: "chat.failed",
      query: sql`INSERT INTO messages (thread_id, user_id, body)
                 VALUES (${threadId}, ${userId}, ${body}) RETURNING id`,
    });
  }

  static messageRow(messageId: number) {
    return db.select({
      id: "chat.messageRow",
      errorId: "chat.failed",
      query: sql`SELECT m.id, m.thread_id AS "threadId", m.user_id AS "userId",
                        u.name AS author, m.body, m.sent_at AS "sentAt"
                 FROM messages m JOIN users u ON u.id = m.user_id
                 WHERE m.id = ${messageId}`,
    });
  }

  static markRead(threadId: number, userId: number) {
    return db.execute({
      id: "chat.read",
      errorId: "chat.failed",
      query: sql`UPDATE thread_participants tp
                 SET last_read_message_id = (SELECT max(id) FROM messages WHERE thread_id = ${threadId})
                 WHERE tp.thread_id = ${threadId} AND tp.user_id = ${userId}`,
    });
  }

  /** The thread's member ids — one read for both questions the send flow
   * asks: "may I see it?" (am I in the list) and "who else?" (the rest). */
  static members(threadId: number, ns = "chat.members") {
    return db.select({
      id: ns,
      errorId: "chat.failed",
      query: sql`SELECT user_id AS "userId" FROM thread_participants
                 WHERE thread_id = ${threadId}`,
    });
  }
}

/** The redis keys of the live side. */
export const connKey = (connId: string): string => `ws:${connId}`;
export const CHAT_CHANNEL = "team-up:chat";
export const NOTIFY_QUEUE = "team-up:notify";
export const ONLINE_SET = "team-up:online";

export const ChatRedis = {
  /** Park the ws connection's user (the frames that follow carry only
   * connId). The reply (`chat.remembered`) opens the protocol: `welcome`. */
  remember(connId: string, userId: number) {
    return redisEffector.set(connKey(connId), String(userId), {
      ex: 3600,
      replyTo: "chat.remembered",
      onError: "chat.failed",
    });
  },
  forget(connId: string) {
    return redisEffector.del(connKey(connId), { onError: "chat.failed" });
  },
  /** Who is this connection? `ns` names the handler the answer goes to. */
  who(connId: string, ns: string) {
    return redisEffector.get(connKey(connId), {
      replyTo: ns,
      onError: "chat.failed",
    });
  },
  /** One connection signed in: the user counts as online. */
  online(userId: number) {
    return redisEffector.sadd(ONLINE_SET, userId, {
      onError: "chat.failed",
    });
  },
  offline(userId: number) {
    return redisEffector.srem(ONLINE_SET, userId, {
      onError: "chat.failed",
    });
  },
  /** Which of these members are offline? The reply is a 0/1 per id, in order. */
  offlineCheck(userIds: number[], replyTo: string) {
    return redisEffector.cmd(
      ["SMISMEMBER", ONLINE_SET, ...userIds.map(String)],
      { replyTo, onError: "chat.failed" },
    );
  },
  publish(message: unknown) {
    return redisEffector.publish(CHAT_CHANNEL, JSON.stringify(message), {
      onError: "chat.failed",
    });
  },
  subscribe() {
    return redisEffector.subscribe(CHAT_CHANNEL, {
      onMessage: "chat.fromRedis",
      onError: "chat.failed",
    });
  },
  /** The notification queue: one job per offline member. */
  enqueue(job: NotifyJob) {
    return redisEffector.lpush(NOTIFY_QUEUE, JSON.stringify(job), {
      onError: "chat.failed",
    });
  },
  pop() {
    return redisEffector.rpop(NOTIFY_QUEUE, {
      replyTo: "notify.popped",
      onError: "chat.failed",
    });
  },
};
