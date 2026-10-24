'use strict';

// Bound all public AST entry points, including caller-supplied cyclic trees.
module.exports = ast => {
  const pending = [[ast, 1]];
  const seen = new WeakSet();
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > 128 || seen.has(node)) {
      throw new SyntaxError('Brace AST exceeds maximum nesting depth or contains a cycle');
    }
    seen.add(node);
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};
