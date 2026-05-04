import React from "react";

/**
 * Simple word-level diff that returns React nodes.
 * Unchanged words are plain text; changed/added words are wrapped in <mark>.
 */
export function diffWords(
  original: string,
  polished: string
): React.ReactNode[] {
  const origWords = original.split(/\s+/);
  const polWords = polished.split(/\s+/);
  const nodes: React.ReactNode[] = [];

  // Simple LCS-based approach: walk both arrays
  let oi = 0;
  let pi = 0;

  while (oi < origWords.length || pi < polWords.length) {
    if (oi < origWords.length && pi < polWords.length) {
      if (origWords[oi] === polWords[pi]) {
        // Same word
        nodes.push(polWords[pi] + " ");
        oi++;
        pi++;
      } else {
        // Find next matching word in polished
        let foundInPol = -1;
        for (let j = pi + 1; j < Math.min(pi + 5, polWords.length); j++) {
          if (polWords[j] === origWords[oi]) { foundInPol = j; break; }
        }

        if (foundInPol >= 0) {
          // Words were inserted/changed before the match
          for (let j = pi; j < foundInPol; j++) {
            nodes.push(
              React.createElement(
                "mark",
                { key: `add-${j}`, className: "bg-green-200 dark:bg-green-800/50 rounded px-0.5" },
                polWords[j] + " "
              )
            );
          }
          pi = foundInPol;
        } else {
          // Word was changed
          nodes.push(
            React.createElement(
              "mark",
              { key: `chg-${pi}`, className: "bg-green-200 dark:bg-green-800/50 rounded px-0.5" },
              polWords[pi] + " "
            )
          );
          oi++;
          pi++;
        }
      }
    } else if (pi < polWords.length) {
      // Remaining polished words
      nodes.push(
        React.createElement(
          "mark",
          { key: `tail-${pi}`, className: "bg-green-200 dark:bg-green-800/50 rounded px-0.5" },
          polWords[pi] + " "
        )
      );
      pi++;
    } else {
      // Original had more words (removed)
      oi++;
    }
  }

  return nodes;
}
