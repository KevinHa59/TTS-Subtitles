import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { VideoDubbingProjects } from "../videoDubbingProjects";

test("serializes concurrent video and subtitle project saves", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "video-dubbing-project-test-"));
  try {
    const projects = new VideoDubbingProjects(directory);
    const created = await projects.create("Cảnh thử");
    const jobId = `vd_${"a".repeat(32)}`;
    const sourceSrt = {
      id: "subtitle-source",
      fileName: "Cảnh thử.srt",
      content: "1\n00:00:00,000 --> 00:00:01,000\nXin chào.\n",
      matchByName: true,
    };
    const workspace = { subtitleMarginPx: 64 };

    await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.all([
          projects.update(created.id, { jobIds: [jobId], activeJobId: jobId }),
          projects.update(created.id, { sourceSrts: [sourceSrt] }),
          projects.update(created.id, { workspace }),
        ]),
      ),
    );

    const saved = await projects.get(created.id);
    assert.deepEqual(saved?.jobIds, [jobId]);
    assert.equal(saved?.activeJobId, jobId);
    assert.deepEqual(saved?.sourceSrts, [sourceSrt]);
    assert.deepEqual(saved?.workspace, workspace);

    const projectDirectory = projects.getProjectDirectory(created.id);
    assert.ok(projectDirectory);
    const persisted = JSON.parse(
      await fs.readFile(path.join(projectDirectory, "project.json"), "utf8"),
    );
    assert.deepEqual(persisted.jobIds, [jobId]);
    assert.deepEqual(persisted.sourceSrts, [sourceSrt]);
    assert.deepEqual(persisted.workspace, workspace);
    assert.equal(
      await fs.readFile(
        path.join(projectDirectory, "assets", "subtitles", "subtitle-source.srt"),
        "utf8",
      ),
      sourceSrt.content,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
