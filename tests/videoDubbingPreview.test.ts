import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PreviewMediaElement,
  VideoDubbingPreviewController,
} from "../src/utils/videoDubbingPreview";

class FakeMediaElement implements PreviewMediaElement {
  currentTime = 0;
  paused = true;
  ended = false;

  constructor(public duration: number) {}

  async play(): Promise<void> {
    this.paused = false;
    this.ended = false;
  }

  pause(): void {
    this.paused = true;
  }
}

function createController(
  video: FakeMediaElement,
  tracks: FakeMediaElement[],
  onTimeUpdate = (_time: number) => {},
) {
  return new VideoDubbingPreviewController(
    video,
    tracks,
    video.duration,
    onTimeUpdate,
    (error) => {
      throw error;
    },
  );
}

test("synchronizes play, pause, seek and restart to the video timeline", async () => {
  const video = new FakeMediaElement(10);
  const tracks = [new FakeMediaElement(12), new FakeMediaElement(8)];
  const controller = createController(video, tracks);

  await controller.play();
  assert.equal(video.paused, false);
  assert.deepEqual(tracks.map((track) => track.paused), [false, false]);

  video.currentTime = 3.25;
  controller.sync();
  assert.deepEqual(tracks.map((track) => track.currentTime), [3.25, 3.25]);

  controller.pause();
  assert.equal(video.paused, true);
  assert.deepEqual(tracks.map((track) => track.paused), [true, true]);

  controller.seek(6.5);
  assert.equal(video.currentTime, 6.5);
  assert.deepEqual(tracks.map((track) => track.currentTime), [6.5, 6.5]);
  await controller.restart();
  assert.equal(video.currentTime, 0);
  assert.deepEqual(tracks.map((track) => track.currentTime), [0, 0]);

  controller.dispose();
});

test("pauses short tracks and stops all playback near video end", async () => {
  const video = new FakeMediaElement(10);
  const shortTrack = new FakeMediaElement(4);
  const longTrack = new FakeMediaElement(14);
  let latestTime = 0;
  const controller = createController(video, [shortTrack, longTrack], (time) => {
    latestTime = time;
  });

  await controller.play();
  video.currentTime = 4;
  controller.sync();
  assert.equal(shortTrack.paused, true);
  assert.equal(longTrack.paused, false);

  video.currentTime = 9.98;
  controller.sync();
  assert.equal(video.paused, true);
  assert.equal(longTrack.paused, true);
  assert.equal(latestTime, 10);
  controller.dispose();
});

test("seeking after a track has ended resumes it when its duration permits", async () => {
  const video = new FakeMediaElement(10);
  const track = new FakeMediaElement(3);
  const controller = createController(video, [track]);

  await controller.play();
  video.currentTime = 3.2;
  controller.sync();
  assert.equal(track.paused, true);

  controller.seek(1);
  await controller.play();
  assert.equal(track.currentTime, 1);
  assert.equal(track.paused, false);
  controller.dispose();
});
