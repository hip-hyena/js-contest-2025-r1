export default function deleteLastCharacterOutsideSelection(inputId: string) {
  debugger;
  const input = document.getElementById(inputId) as HTMLInputElement;
  let element = input.lastChild!;

  if (element.lastChild) {
    // Selects the last and the deepest child of the element.
    while (element.lastChild) {
      element = element.lastChild;
    }
  }

  // Gets length of the element's content.
  const textLength = element.textContent!.length;
  const range = document.createRange();
  const selection = window.getSelection()!;

  // Sets selection position to the end of the element.
  range.setStart(element, textLength);
  range.setEnd(element, textLength);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand('delete', false);
}
