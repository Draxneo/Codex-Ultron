/**
 * Caret-aware text insertion helpers — used by the universal dictation
 * components so transcribed text drops in at the user's cursor instead of
 * always being appended to the end.
 *
 * For controlled <Input>/<Textarea>: returns the new value + the new caret
 * position so the caller can update React state and restore the selection.
 *
 * For contentEditable rich-text editors: uses the Range API + execCommand
 * to insert at the live caret without losing formatting.
 */

export interface CursorInsertResult {
  value: string;
  caret: number;
}

/** Insert `text` into `current` at the given selection range. */
export function insertAtSelection(
  current: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  text: string,
): CursorInsertResult {
  const start = selectionStart ?? current.length;
  const end = selectionEnd ?? start;
  // Add a leading space if we're inserting mid-text right after a non-space char.
  const prevChar = start > 0 ? current[start - 1] : "";
  const needsLeadingSpace = prevChar && !/\s/.test(prevChar);
  const insertion = (needsLeadingSpace ? " " : "") + text;
  const value = current.slice(0, start) + insertion + current.slice(end);
  return { value, caret: start + insertion.length };
}

/** Insert plain text into a contentEditable element at its current caret. */
export function insertIntoContentEditable(el: HTMLElement, text: string) {
  el.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    // No selection — append to end
    el.append(document.createTextNode(text));
    return;
  }
  // Use execCommand for undo-stack friendliness; fall back to Range API.
  if (document.queryCommandSupported?.("insertText")) {
    document.execCommand("insertText", false, text);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
