import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "piper-file-transfer-"));
const previousLocalAppData = process.env.LOCALAPPDATA;
const previousPort = process.env.FILE_TRANSFER_PORT;

const portProbe = net.createServer();
await new Promise<void>((resolve, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(0, "127.0.0.1", resolve);
});
const address = portProbe.address();
if (!address || typeof address === "string") throw new Error("Could not allocate a test port.");
await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));

process.env.LOCALAPPDATA = temporaryDirectory;
process.env.FILE_TRANSFER_PORT = String(address.port);
const {
  getFileTransferStatus,
  startFileTransferSession,
  stopFileTransferSession,
} = await import("../fileTransferManager");
if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
else process.env.LOCALAPPDATA = previousLocalAppData;
if (previousPort === undefined) delete process.env.FILE_TRANSFER_PORT;
else process.env.FILE_TRANSFER_PORT = previousPort;

after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

test("receives files with a session code and keeps names inside the receive folder", async () => {
  const session = await startFileTransferSession();
  try {
    assert.equal(session.active, true);
    assert.match(session.code || "", /^[A-HJ-NP-Z2-9]{8}$/);

    const content = Buffer.from("LAN transfer test content");
    const response = await fetch(`http://127.0.0.1:${session.port}/upload`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "X-Transfer-Code": session.code!,
        "X-File-Name": encodeURIComponent("../../hello?.txt"),
        "Content-Type": "application/octet-stream",
      },
      body: content,
    });
    assert.equal(response.status, 201);
    const result = await response.json() as { success: boolean; name: string };
    assert.equal(result.success, true);
    assert.equal(result.name, "hello_.txt");
    assert.deepEqual(
      fs.readFileSync(path.join(session.receiveDirectory, result.name)),
      content,
    );

    assert.equal(getFileTransferStatus().receivedFiles[0].name, result.name);
  } finally {
    await stopFileTransferSession();
  }
  assert.equal(getFileTransferStatus().active, false);
});

test("rejects requests without an allowed app origin", async () => {
  const session = await startFileTransferSession();
  try {
    const response = await fetch(`http://127.0.0.1:${session.port}/upload`, {
      method: "POST",
      headers: {
        "X-Transfer-Code": session.code!,
        "X-File-Name": "blocked.txt",
        "Content-Type": "application/octet-stream",
      },
      body: "should not be stored",
    });
    assert.equal(response.status, 403);
  } finally {
    await stopFileTransferSession();
  }
});
