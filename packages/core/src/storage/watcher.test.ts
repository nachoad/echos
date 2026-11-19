// [coco] El watcher debe indexar los .md que se escriben directamente en knowledge/
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createSqliteStorage, type SqliteStorage } from './sqlite.js';
import { createMarkdownStorage, type MarkdownStorage } from './markdown.js';
import { type VectorStorage } from './vectordb.js';
import { createFileWatcher, type FileWatcher } from './watcher.js';
import { createLogger } from '@echos/shared';

const logger = createLogger('test', 'silent');

const noopVectorDb = {
  upsert: async () => {},
  search: async () => [],
  findByVector: async () => [],
  remove: async () => {},
  close: () => {},
} satisfies VectorStorage;

async function waitFor(fn: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return fn();
}

describe('createFileWatcher', () => {
  let tempDir: string;
  let knowledgeDir: string;
  let sqlite: SqliteStorage;
  let markdown: MarkdownStorage;
  let watcher: FileWatcher;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'echos-watcher-test-'));
    knowledgeDir = join(tempDir, 'knowledge');
    mkdirSync(knowledgeDir, { recursive: true });
    sqlite = createSqliteStorage(join(tempDir, 'test.db'), logger);
    markdown = createMarkdownStorage(knowledgeDir, logger);
    watcher = createFileWatcher({
      baseDir: knowledgeDir,
      sqlite,
      vectorDb: noopVectorDb,
      markdown,
      generateEmbedding: async () => [],
      logger,
    });
    await new Promise((r) => setTimeout(r, 300));
  });

  afterEach(async () => {
    await watcher.stop();
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('indexes a markdown file written into a nested directory', async () => {
    const dir = join(knowledgeDir, 'note', 'inbox');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '2026-11-19-prueba.md'),
      `---\nid: "w-1"\ntype: note\ntitle: "Prueba"\ncreated: "2026-11-19T10:00:00.000Z"\nupdated: "2026-11-19T10:00:00.000Z"\ntags: []\nlinks: []\ncategory: inbox\n---\n\nHola watcher\n`,
    );
    const ok = await waitFor(() => sqlite.getNote('w-1') !== undefined);
    expect(ok).toBe(true);
  });

  it('ignores non-markdown files', async () => {
    writeFileSync(join(knowledgeDir, 'foto.jpg'), 'x');
    writeFileSync(
      join(knowledgeDir, 'a.md'),
      `---\nid: "w-2"\ntype: note\ntitle: "A"\ncreated: "2026-11-19T10:00:00.000Z"\nupdated: "2026-11-19T10:00:00.000Z"\ntags: []\nlinks: []\ncategory: x\n---\n\nA\n`,
    );
    expect(await waitFor(() => sqlite.getNote('w-2') !== undefined)).toBe(true);
  });
});
