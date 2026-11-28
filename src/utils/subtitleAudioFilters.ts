export interface SubtitleAudioFilterOptions {
  maxCharacterCount?: number;
  specialCharactersOnly?: boolean;
  nonAlphabetOnly?: boolean;
  similarAdjacent?: boolean;
  similarityThreshold?: number;
  searchText?: string;
  searchCaseSensitive?: boolean;
}

function normalizeForSimilarity(text: string): string[] {
  return Array.from(
    text
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, ""),
  );
}

function containsNonAlphabet(text: string): boolean {
  // Regex kiểm tra các ký tự không thuộc bảng chữ cái Latin cơ bản/mở rộng thông thường,
  // bao gồm các hệ thống chữ tượng hình/âm tiết như Trung, Nhật, Hàn (CJK), v.v.
  // return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(text);
  return /(?!\p{Script=Latin})\p{L}/u.test(text);
}

export function getTextSimilarity(firstText: string, secondText: string): number {
  const first = normalizeForSimilarity(firstText);
  const second = normalizeForSimilarity(secondText);
  const longestLength = Math.max(first.length, second.length);
  if (!longestLength) return 0;
  if (first === second) return 1;
  const lengthDifference = Math.abs(first.length - second.length);
  if (lengthDifference / longestLength >= 0.2) {
    return 1 - lengthDifference / longestLength;
  }

  let previousRow = Array.from(
    { length: second.length + 1 },
    (_, index) => index,
  );
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const currentRow = new Array<number>(second.length + 1);
    currentRow[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost =
        first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      currentRow[secondIndex] = Math.min(
        previousRow[secondIndex] + 1,
        currentRow[secondIndex - 1] + 1,
        previousRow[secondIndex - 1] + substitutionCost,
      );
    }
    previousRow = currentRow;
  }

  return 1 - previousRow[second.length] / longestLength;
}

export function filterSubtitleAudioItems<
  T extends { id: string; text: string },
>(items: readonly T[], options: SubtitleAudioFilterOptions): T[] {
  const hasActiveFilter =
    options.maxCharacterCount !== undefined ||
    options.specialCharactersOnly === true ||
    options.nonAlphabetOnly === true ||
    options.similarAdjacent === true;

  let filtered = [...items];

  if (hasActiveFilter) {
    const similarIds = new Set<string>();
    if (options.similarAdjacent) {
      const threshold = options.similarityThreshold ?? 0.8;
      for (let index = 1; index < items.length; index += 1) {
        if (
          getTextSimilarity(items[index - 1].text, items[index].text) > threshold
        ) {
          similarIds.add(items[index - 1].id);
          similarIds.add(items[index].id);
        }
      }
    }

    filtered = items.filter((item) => {
      if (
        options.maxCharacterCount !== undefined &&
        Array.from(item.text).length <= options.maxCharacterCount
      ) {
        return true;
      }
      if (
        options.specialCharactersOnly &&
        item.text.trim().length > 0 &&
        !/[\p{L}\p{N}]/u.test(item.text)
      ) {
        return true;
      }
      if (options.nonAlphabetOnly && containsNonAlphabet(item.text)) {
        return true;
      }
      return options.similarAdjacent === true && similarIds.has(item.id);
    });
  }

  const query = options.searchText ?? "";
  if (query.length > 0) {
    const sensitive = Boolean(options.searchCaseSensitive);
    const targetQuery = sensitive ? query : query.toLocaleLowerCase();
    filtered = filtered.filter((item) => {
      const text = sensitive ? item.text : item.text.toLocaleLowerCase();
      return text.includes(targetQuery);
    });
  }

  return filtered;
}

export function mergeSimilarAdjacentCues<
  T extends { text: string; startTime: number; endTime: number },
>(cues: readonly T[], threshold = 0.8): T[] {
  if (cues.length <= 1) return [...cues];
  const merged: T[] = [{ ...cues[0] }];
  for (let index = 1; index < cues.length; index += 1) {
    const prev = merged[merged.length - 1];
    const curr = cues[index];
    if (getTextSimilarity(prev.text, curr.text) > threshold) {
      merged[merged.length - 1] = {
        ...prev,
        endTime: Math.max(prev.endTime, curr.endTime),
      };
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}
