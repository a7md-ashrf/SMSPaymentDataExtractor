// src/cli/inputs.ts

import { readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
]);

/**
 * List image files in a directory, sorted by name.
 *
 * A missing directory is treated as empty. This is intentional: local
 * screenshots are optional and may be removed entirely before sharing the
 * project, so the CLI must not crash when `public/` does not exist.
 */
export async function listImages(directory: string): Promise<string[]> {
  const absoluteDirectory = resolve(directory);

  try {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });

    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()),
      )
      .map((entry) => join(absoluteDirectory, entry.name))
      .sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT" || code === "ENOTDIR") {
      return [];
    }

    throw error;
  }
}

/**
 * Resolve CLI arguments to absolute image paths.
 *
 * With no arguments, images are collected from `public/` when it exists.
 */
export async function collectImagePaths(
  args: string[],
  options: { cwd?: string; publicDir?: string } = {},
): Promise<string[]> {
  const cwd = options.cwd ?? process.cwd();

  if (args.length > 0) {
    return args.map((arg) => resolve(cwd, arg));
  }

  return listImages(options.publicDir ?? resolve(cwd, "public"));
}
