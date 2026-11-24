export interface SnapTimelineClip {
  start: number;
  end: number;
  frameRate: number;
}

import type { JoinSplitVideoSegment } from "../types/joinSplitVideo";

export interface KeyframeTimelineClip extends SnapTimelineClip {
  frameCount: number;
  startFrame?: number;
  endFrame?: number;
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

  const clipStartFrame = clip.startFrame ?? 1;
  const clipEndFrame = clip.endFrame ?? clip.frameCount;
  const localTime = Math.max(0, Math.min(clip.end - clip.start, requestedTime - clip.start));
  const selectedFrame = Math.max(
    clipStartFrame,
    Math.min(clipEndFrame, Math.round(localTime * clip.frameRate) + clipStartFrame),
  );
  const keyframeFrames = clip.keyframeTimes
    .map((time) => Math.round(time * clip.frameRate) + 1)
    .filter((frame) => frame >= clipStartFrame && frame <= clipEndFrame)
    .sort((left, right) => left - right);

  if (edge === "start") {
    const keyframe = keyframeFrames.filter((frame) => frame <= selectedFrame).at(-1);
    if (keyframe === undefined) return null;
    return clip.start + (keyframe - clipStartFrame) / clip.frameRate;
  }

  const nextKeyframe = keyframeFrames.find((frame) => frame > selectedFrame);
  if (nextKeyframe === undefined) return clip.end;
  return clip.start + (nextKeyframe - 1 - clipStartFrame) / clip.frameRate;
}

export interface JoinSplitTimelineClip {
  clipId?: string;
  sourceId: string;
  start: number;
  end: number;
  frameRate: number;
  frameCount: number;
  startFrame?: number;
  endFrame?: number;
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
    const clipStartFrame = clip.startFrame ?? 1;
    const clipEndFrame = clip.endFrame ?? clip.frameCount;
    const startFrame = startTime <= clip.start
      ? clipStartFrame
      : Math.min(clipEndFrame, clipStartFrame + Math.floor((startTime - clip.start) * clip.frameRate + 1e-6));
    const endFrame = endTime >= clip.end
      ? clipEndFrame
      : Math.min(clipEndFrame, clipStartFrame + Math.floor((endTime - clip.start) * clip.frameRate + 1e-6));
    if (endFrame >= startFrame) segments.push({ sourceId: clip.sourceId, startFrame, endFrame });
  }
  return segments;
}

export function getJoinSplitTimelinePartitionSegments(
  splitTimes: readonly number[],
  clips: readonly JoinSplitTimelineClip[],
): JoinSplitVideoSegment[][] {
  const timelineEnd = clips.at(-1)?.end || 0;
  if (!Number.isFinite(timelineEnd) || timelineEnd <= 0) return [];

  const boundaries = [
    0,
    ...new Set(
      splitTimes
        .filter((time) => Number.isFinite(time) && time > 0 && time < timelineEnd)
        .sort((left, right) => left - right),
    ),
    timelineEnd,
  ];

  return boundaries.slice(1).map((endTime, index) => {
    const startTime = boundaries[index];
    const segments: JoinSplitVideoSegment[] = [];

    for (const clip of clips) {
      if (clip.end <= startTime || clip.start >= endTime || clip.frameRate <= 0) continue;

      const intersectionStart = Math.max(startTime, clip.start);
      const intersectionEnd = Math.min(endTime, clip.end);
      const clipStartFrame = clip.startFrame ?? 1;
      const clipEndFrame = clip.endFrame ?? clip.frameCount;
      const clipAvailableFrames = clipEndFrame - clipStartFrame + 1;
      const firstFrameOffset = Math.max(
        0,
        Math.ceil((intersectionStart - clip.start) * clip.frameRate - 1e-7),
      );
      const endFrameOffset = Math.min(
        clipAvailableFrames,
        Math.ceil((intersectionEnd - clip.start) * clip.frameRate - 1e-7),
      );
      if (endFrameOffset > firstFrameOffset) {
        segments.push({
          sourceId: clip.sourceId,
          startFrame: clipStartFrame + firstFrameOffset,
          endFrame: clipStartFrame + endFrameOffset - 1,
        });
      }
    }

    return segments;
  });
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
    const matchingClips = clips.filter((item) => item.sourceId === segment.sourceId);
    if (!matchingClips.length) return [];
    return matchingClips.flatMap((clip) => {
      const clipStartFrame = clip.startFrame ?? 1;
      const clipEndFrame = clip.endFrame ?? clip.frameCount;
      const overlapStart = Math.max(segment.startFrame, clipStartFrame);
      const overlapEnd = Math.min(segment.endFrame, clipEndFrame);
      if (overlapEnd < overlapStart) return [];
      return [{
        start: clip.start + (overlapStart - clipStartFrame) / clip.frameRate,
        end: clip.start + (overlapEnd - clipStartFrame + 1) / clip.frameRate,
      }];
    });
  });
  if (!positions.length) return null;
  const start = Math.min(...positions.map((p) => p.start));
  const end = Math.max(...positions.map((p) => p.end));
  return { start, end };
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

  const clip = clips.find((candidate) => time >= candidate.start && time < candidate.end);
  if (!clip) {
    // Thời gian đang nằm trong khoảng trống (gap)
    const baseFps = clips[0]?.frameRate && clips[0].frameRate > 0 ? clips[0].frameRate : 30;
    return Math.round(time * baseFps) / baseFps;
  }
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
