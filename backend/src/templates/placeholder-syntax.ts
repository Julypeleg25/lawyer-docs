export const PLACEHOLDER_DELIMITER = "<>";
export const PLACEHOLDER_PATTERN = /<>((?:(?!<>).)+)<>/gu;

export function formatPlaceholder(content: string): string {
  return `${PLACEHOLDER_DELIMITER}${content}${PLACEHOLDER_DELIMITER}`;
}

export function isPlaceholder(value: string): boolean {
  return /^<>((?:(?!<>).)+)<>$/u.test(value);
}

export function countPlaceholderDelimiters(text: string): number {
  return [...text.matchAll(/<>/gu)].length;
}
