/** The one thing the API needs from the database. */
export type Query = <Row>(sql: string, params?: unknown[]) => Promise<Row[]>;
