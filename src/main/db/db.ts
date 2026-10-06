import initSqlJs, { type BindParams, type Database, type SqlJsStatic, type SqlValue } from 'sql.js'

// sql.js loads its WebAssembly file from beside its own script, which also works
// inside the packaged app's asar. Load it once per process.
let sqlJs: Promise<SqlJsStatic> | null = null
export function loadSqlJs(): Promise<SqlJsStatic> {
  sqlJs ??= initSqlJs()
  return sqlJs
}

export type Row = Record<string, SqlValue>

/**
 * The in-memory database for one open data file. All reads and writes go through
 * this wrapper so the sql.js traps are handled in one place (CLAUDE.md decision 13):
 * export() switches foreign keys off and invalidates prepared statements, so
 * statements are never kept, and pragmas are re-applied after every export.
 */
export class LockerDb {
  private savepointDepth = 0

  private constructor(private readonly raw: Database) {
    this.applyPragmas()
  }

  static async create(): Promise<LockerDb> {
    const SQL = await loadSqlJs()
    return new LockerDb(new SQL.Database())
  }

  /** Opens bytes read from disk. Throws if they are not a SQLite database. */
  static async fromBytes(bytes: Uint8Array): Promise<LockerDb> {
    const SQL = await loadSqlJs()
    const db = new LockerDb(new SQL.Database(bytes))
    // sql.js opens lazily; touch the schema so a corrupt file fails here, not later.
    db.all('SELECT name FROM sqlite_master LIMIT 1')
    return db
  }

  private applyPragmas(): void {
    this.raw.run('PRAGMA foreign_keys = ON')
    // DELETE, never WAL: WAL side-files sync badly (SPEC.md 6.1).
    this.raw.run('PRAGMA journal_mode = DELETE')
  }

  run(sql: string, params?: BindParams): void {
    this.raw.run(sql, params)
  }

  /** Runs several statements separated by semicolons (migrations). */
  execScript(sql: string): void {
    this.raw.exec(sql)
  }

  all<T extends object = Row>(sql: string, params?: BindParams): T[] {
    const stmt = this.raw.prepare(sql)
    try {
      if (params !== undefined) stmt.bind(params)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  get<T extends object = Row>(sql: string, params?: BindParams): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  /** Runs fn in a transaction (a savepoint when nested). Rolls back on any error. */
  transaction<T>(fn: () => T): T {
    const name = `sp${this.savepointDepth}`
    this.raw.run(`SAVEPOINT ${name}`)
    this.savepointDepth++
    try {
      const result = fn()
      this.savepointDepth--
      this.raw.run(`RELEASE ${name}`)
      return result
    } catch (error) {
      this.savepointDepth--
      this.raw.run(`ROLLBACK TO ${name}`)
      this.raw.run(`RELEASE ${name}`)
      throw error
    }
  }

  get userVersion(): number {
    const row = this.get<{ user_version: number }>('PRAGMA user_version')
    return Number(row?.user_version ?? 0)
  }

  set userVersion(v: number) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`Bad schema version ${v}`)
    this.raw.run(`PRAGMA user_version = ${v}`)
  }

  /** Problems reported by SQLite's integrity check; empty means healthy. */
  integrityProblems(): string[] {
    const rows = this.all<{ integrity_check: string }>('PRAGMA integrity_check')
    const msgs = rows.map((r) => String(r.integrity_check))
    return msgs.length === 1 && msgs[0] === 'ok' ? [] : msgs
  }

  foreignKeyProblems(): number {
    return this.all('PRAGMA foreign_key_check').length
  }

  /** The whole database as bytes, ready to write to disk. */
  export(): Uint8Array {
    if (this.savepointDepth > 0) throw new Error('Cannot export in the middle of a transaction.')
    const bytes = this.raw.export()
    this.applyPragmas()
    return bytes
  }

  close(): void {
    this.raw.close()
  }
}
