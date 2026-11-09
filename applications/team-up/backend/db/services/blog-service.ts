// The blog service: the posts of the public blog.

import { db, sql } from "@pavlus/backend";

export interface PostRow {
  pid: string;
  title: string;
  content: string;
  date: string;
  tags: string[];
}

export class BlogService {
  /** Every post, newest first (the caller sorts the other way round).
   * `ns` namespaces the step: the blog list and the landing block are two
   * flows of their own. */
  static all(ns = "blog.rows") {
    return db.select({
      id: ns,
      errorId: "blog.failed",
      query: sql`SELECT pid, title, content,
                        to_char(date, 'YYYY-MM-DD') AS date, tags
                 FROM posts ORDER BY date DESC, pid`,
    });
  }

  /** One post by its pid (the address of the post page). */
  static byPid(pid: string) {
    return db.select({
      id: "blog.row",
      errorId: "blog.failed",
      query: sql`SELECT pid, title, content,
                        to_char(date, 'YYYY-MM-DD') AS date, tags
                 FROM posts WHERE pid = ${pid}`,
    });
  }
}
