/**
 * File operations for vault management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileEntry } from '../types/core.js';

/**
 * File operations class
 */
export class FileOperations {
  constructor(private vaultPath: string) {}

  /**
   * Validate that a path is within the vault (prevent path traversal)
   */
  private validatePath(relativePath: string): string {
    const absolutePath = path.join(this.vaultPath, relativePath);
    const normalized = path.normalize(absolutePath);

    if (!normalized.startsWith(this.vaultPath)) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }

    return normalized;
  }

  /**
   * Read file contents
   */
  async readFile(relativePath: string): Promise<string> {
    const absolutePath = this.validatePath(relativePath);
    return await fs.readFile(absolutePath, 'utf-8');
  }

  /**
   * Write file contents
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const absolutePath = this.validatePath(relativePath);

    // Ensure parent directory exists
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(absolutePath, content, 'utf-8');
  }

  /**
   * Check if file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    const absolutePath = this.validatePath(relativePath);
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(relativePath: string): Promise<{
    sizeBytes: number;
    created: string;
    modified: string;
  }> {
    const absolutePath = this.validatePath(relativePath);
    const stats = await fs.stat(absolutePath);

    return {
      sizeBytes: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString()
    };
  }

  /**
   * Delete file
   */
  async deleteFile(relativePath: string): Promise<void> {
    const absolutePath = this.validatePath(relativePath);
    await fs.unlink(absolutePath);
  }

  /**
   * Delete directory recursively
   */
  async deleteDirectory(relativePath: string): Promise<void> {
    const absolutePath = this.validatePath(relativePath);
    await fs.rm(absolutePath, { recursive: true, force: true });
  }

  /**
   * List files in directory
   */
  async listFiles(
    relativePath: string = '',
    options: {
      recursive?: boolean;
      notesOnly?: boolean;
      includeMetadata?: boolean;
    } = {}
  ): Promise<FileEntry[]> {
    const absolutePath = this.validatePath(relativePath);
    const entries: FileEntry[] = [];

    const processDirectory = async (dirPath: string, relativeBase: string) => {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemRelativePath = path.join(relativeBase, item.name);
        const itemAbsolutePath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          if (!item.name.startsWith('.')) {
            entries.push({
              name: item.name,
              path: itemRelativePath,
              type: 'directory'
            });

            if (options.recursive) {
              await processDirectory(itemAbsolutePath, itemRelativePath);
            }
          }
        } else if (item.isFile()) {
          const ext = path.extname(item.name);

          // Skip if notesOnly and not a markdown file
          if (options.notesOnly && ext !== '.md') {
            continue;
          }

          const entry: FileEntry = {
            name: item.name,
            path: itemRelativePath,
            type: 'file',
            ext: ext || undefined
          };

          if (options.includeMetadata) {
            try {
              const stats = await fs.stat(itemAbsolutePath);
              entry.sizeBytes = stats.size;
              entry.created = stats.birthtime.toISOString();
              entry.modified = stats.mtime.toISOString();
            } catch {
              // Ignore stat errors
            }
          }

          entries.push(entry);
        }
      }
    };

    await processDirectory(absolutePath, relativePath);
    return entries;
  }

  /**
   * Move/rename file
   */
  async moveFile(oldPath: string, newPath: string): Promise<void> {
    const oldAbsolute = this.validatePath(oldPath);
    const newAbsolute = this.validatePath(newPath);

    // Ensure target directory exists
    const dir = path.dirname(newAbsolute);
    await fs.mkdir(dir, { recursive: true });

    await fs.rename(oldAbsolute, newAbsolute);
  }
}
