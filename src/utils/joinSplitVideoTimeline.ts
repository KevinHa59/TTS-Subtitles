export interface SnapTimelineClip {
  start: number;
  end: number;
  frameRate: number;
}

import type { JoinSplitVideoSegment } from "../types/joinSplitVideo";

export interface KeyframeTimelineClip extends SnapTimelineClip {
  frameCount: number;
  keyframeTimes: readonly number[] | null;
}

export function snapCutTimeToKeyframe(
  requestedTime: number,
  clips: readonly KeyframeTimelineClip[],
  edge: "start" | "end",
): number | null {
  const lastClip = clips.at(-1);
  const clip = clips.find((candidate) =>
    requestedTime >= candidate.start && requestedTime < candidate.end,
  ) || (requestedTime === lastClip?.end ? lastClip : undefined);
  if (!clip || !clip.keyframeTimes?.length || clip.frameRate <= 0) return null;

  const localTime = Math.max(0, Math.min(clip.end - clip.start, requestedTime - clip.start));
  const selectedFrame = Math.max(
    1,
    Math.min(clip.frameCount, Math.round(localTime * clip.frameRate) + 1),
  );
  const keyframeFrames = clip.keyframeTimes
    .map((time) => Math.round(time * clip.frameRate) + 1)
    .filter((frame) => frame >= 1 && frame <= clip.frameCount)
    .sort((left, right) => left - right);

  if (edge === "start") {
    const keyframe = keyframeFrames.filter((frame) => frame <= selectedFrame).at(-1);
    if (keyframe === undefined) return null;
    return clip.start + (keyframe - 1) / clip.frameRate;
  }

  const nextKeyframe = keyframeFrames.find((frame) => frame > selectedFrame);
  if (nextKeyframe === undefined) return clip.end;
  return clip.start + (nextKeyframe - 2) / clip.frameRate;
}

export interface JoinSplitTimelineClip {
  sourceId: string;
  start: number;
  end: number;
  frameRate: number;
  frameCount: number;
}

export function getJoinSplitTimelineSegments(
  startTime: number,
  endTime: number,
  clips: JoinSplitTimelineClip[],
): JoinSplitVideoSegment[] {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return [];
  const segments: JoinSplitVideoSegment[] = [];
  for (const clip of clips) {
    if (clip.end <= startTime || clip.start > endTime) continue;
    const startFrame = startTime <= clip.start
      ? 1
      : Math.min(clip.frameCount, Math.floor((startTime - clip.start) * clip.frameRate + 1e-6) + 1);
    const endFrame = endTime >= clip.end
      ? clip.frameCount
      : Math.min(clip.frameCount, Math.floor((endTime - clip.start) * clip.frameRate + 1e-6) + 1);
    if (endFrame >= startFrame) segments.push({ sourceId: clip.sourceId, startFrame, endFrame });
  }
  return segments;
}

export function getJoinSplitRangeSegments(range: {
  sourceId: string;
  startFrame: number;
  endFrame: number;
  segments?: JoinSplitVideoSegment[];
}): JoinSplitVideoSegment[] {
  return range.segments?.length
    ? range.segments
    : [{ sourceId: range.sourceId, startFrame: range.startFrame, endFrame: range.endFrame }];
}

export function getJoinSplitRangeTimelineBounds(
  segments: JoinSplitVideoSegment[],
  clips: JoinSplitTimelineClip[],
): { start: number; end: number } | null {
  const positions = segments.flatMap((segment) => {
    const clip = clips.find((item) => item.sourceId === segment.sourceId);
    if (!clip) return [];
    return [{
      start: clip.start + (segment.startFrame - 1) / clip.frameRate,
      end: clip.start + segment.endFrame / clip.frameRate,
    }];
  });
  if (!positions.length) return null;
  return { start: positions[0].start, end: positions[positions.length - 1].end };
}

export function snapJoinSplitTimelineTime(
  requestedTime: number,
  clips: readonly SnapTimelineClip[],
  zoom: number,
  snapDistancePixels: number,
  snapToClipEdges = true,
): number {
  if (!clips.length) return 0;
  const timelineEnd = clips[clips.length - 1].end;
  const time = Math.max(0, Math.min(timelineEnd, Number.isFinite(requestedTime) ? requestedTime : 0));
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const snapDistanceSeconds =
    (Number.isFinite(snapDistancePixels) ? Math.max(0, snapDistancePixels) : 0) / safeZoom;

  if (snapToClipEdges) {
    let nearestBoundary: { time: number; distance: number } | null = null;
    for (const clip of clips) {
      for (const boundary of [clip.start, clip.end]) {
        const distance = Math.abs(boundary - time);
        if (
          distance <= snapDistanceSeconds &&
          (!nearestBoundary || distance < nearestBoundary.distance)
        ) {
          nearestBoundary = { time: boundary, distance };
        }
      }
    }
    if (nearestBoundary) return nearestBoundary.time;
  }

  const clip = clips.find((candidate) => time >= candidate.start && time < candidate.end)
    || clips[clips.length - 1];
  if (!Number.isFinite(clip.frameRate) || clip.frameRate <= 0) return time;
  const localTime = Math.max(0, Math.min(clip.end - clip.start, time - clip.start));
  const frame = Math.round(localTime * clip.frameRate);
  return Math.max(
    clip.start,
    Math.min(clip.end, clip.start + frame / clip.frameRate),
  );
}

export function snapJoinSplitTimelineTimeToTargets(
  requestedTime: number,
  clips: readonly SnapTimelineClip[],
  zoom: number,
  snapDistancePixels: number,
  targets: readonly number[],
): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const threshold = Math.max(0, snapDistancePixels) / safeZoom;
  const boundaries = clips.flatMap((clip) => [clip.start, clip.end]);
  const nearestSnap = [...boundaries, ...targets]
    .map((time) => ({ time, distance: Math.abs(time - requestedTime) }))
    .filter((candidate) => candidate.distance <= threshold)
    .sort((left, right) => left.distance - right.distance)[0];
  if (nearestSnap) return nearestSnap.time;
  return snapJoinSplitTimelineTime(requestedTime, clips, zoom, 0);
}
