// tests/cli/inputs.test.ts

import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { collectImagePaths, listImages } from "../../src/cli/inputs";

describe("listImages", () => {
  test("returns an empty list when the directory does not exist", async () => {
    const missing = join(process.cwd(), ".tmp-does-not-exist");
    expect(await listImages(missing)).toEqual([]);
  });

  test("filters non-images and sorts by filename", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".tmp-images-"));

    try {
      await mkdir(join(directory, "nested.png"));
      await writeFile(join(directory, "b.JPG"), "");
      await writeFile(join(directory, "a.png"), "");
      await writeFile(join(directory, "notes.txt"), "");

      expect(await listImages(directory)).toEqual([
        join(directory, "a.png"),
        join(directory, "b.JPG"),
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("collectImagePaths", () => {
  test("resolves explicit paths against the working directory", async () => {
    const cwd = resolve("example-project");

    expect(
      await collectImagePaths(["a.png", "./nested/b.jpg"], { cwd }),
    ).toEqual([join(cwd, "a.png"), join(cwd, "nested/b.jpg")]);
  });

  test("uses public/ by default but tolerates it being absent", async () => {
    const cwd = resolve("example-project-without-public");

    expect(await collectImagePaths([], { cwd })).toEqual([]);
  });
});
