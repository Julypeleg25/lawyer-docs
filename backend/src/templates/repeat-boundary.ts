export interface RepeatBoundary {
  parent: Node;
  startNode: ChildNode;
  endNode: ChildNode;
}

function closestTableRow(node: Node): Element | undefined {
  let current: Node | null = node.parentNode;
  while (current) {
    if (current.nodeType === 1 && (current as Element).localName === "tr") {
      return current as Element;
    }
    current = current.parentNode;
  }
  return undefined;
}

export function resolveRepeatBoundary(
  startParagraph: Element,
  endParagraph: Element,
): RepeatBoundary | undefined {
  if (startParagraph.parentNode && startParagraph.parentNode === endParagraph.parentNode) {
    return {
      parent: startParagraph.parentNode,
      startNode: startParagraph,
      endNode: endParagraph,
    };
  }

  const startRow = closestTableRow(startParagraph);
  const endRow = closestTableRow(endParagraph);
  if (!startRow?.parentNode || startRow.parentNode !== endRow?.parentNode) return undefined;
  return { parent: startRow.parentNode, startNode: startRow, endNode: endRow };
}
