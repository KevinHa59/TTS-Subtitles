export class TranslationStreamParser {
  private content = "";
  private cursor = -1;
  private finished = false;

  push(chunk: string): unknown[] {
    if (this.finished || !chunk) return [];
    this.content += chunk;
    if (this.cursor < 0) {
      const translationsMatch = /"translations"\s*:\s*\[/g.exec(this.content);
      if (!translationsMatch) return [];
      this.cursor = translationsMatch.index + translationsMatch[0].length;
    }

    const result: unknown[] = [];
    while (this.cursor < this.content.length) {
      while (/\s|,/.test(this.content[this.cursor] || "")) this.cursor += 1;
      if (this.cursor >= this.content.length) break;
      if (this.content[this.cursor] === "]") {
        this.finished = true;
        break;
      }
      if (this.content[this.cursor] !== "{") {
        this.cursor += 1;
        continue;
      }

      const objectStart = this.cursor;
      let depth = 0;
      let inString = false;
      let escaped = false;
      let objectComplete = false;
      for (let index = objectStart; index < this.content.length; index += 1) {
        const character = this.content[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === "\"") inString = false;
          continue;
        }
        if (character === "\"") inString = true;
        else if (character === "{") depth += 1;
        else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            try {
              result.push(JSON.parse(this.content.slice(objectStart, index + 1)));
            } catch (error) {
              throw new Error(`Qwen trả về một mục dịch không hợp lệ: ${error instanceof Error ? error.message : String(error)}`);
            }
            this.cursor = index + 1;
            objectComplete = true;
            break;
          }
        }
      }
      if (!objectComplete) break;
    }
    return result;
  }
}
