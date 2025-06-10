// When Google Translate translate an element, it replaces the TextNode element with a FontElement + TextNode.
// This breaks the DOM structure and React cannot handle it.

// These patches to removeChild and insertBefore add safety checks to prevent errors when nodes are
// accessed with stale parent references.

// https://martijnhols.nl/blog/everything-about-google-translate-crashing-react
// https://github.com/facebook/react/issues/11538#issuecomment-417504600

if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
