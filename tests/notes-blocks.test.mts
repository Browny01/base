import assert from "node:assert/strict";
import test from "node:test";
import { insertIndexAt, dropTargetIndex, moveBlockTo } from "../lib/block-order.ts";
import { extractLinkMeta, absolutizeImage, titleFromUrl, decodeEntities } from "../lib/link-meta.ts";

// ── Drag ordering ─────────────────────────────────────────────────────────
const ids = (...xs: string[]) => xs.map((id) => ({ id, type: "text" as const, text: "" }));
const order = (list: { id: string }[]) => list.map((b) => b.id).join(",");

test("insert index is the first block whose midpoint is below the pointer", () => {
  const mids = [10, 30, 50, 70];
  assert.equal(insertIndexAt(mids, 5), 0, "above the first midpoint");
  assert.equal(insertIndexAt(mids, 25), 1);
  assert.equal(insertIndexAt(mids, 35), 2);
  assert.equal(insertIndexAt(mids, 200), 4, "below every midpoint lands last");
});

test("an unmeasured row (-Infinity) never becomes the drop target", () => {
  assert.equal(insertIndexAt([Number.NEGATIVE_INFINITY, 50], 1000), 2);
  assert.equal(insertIndexAt([Number.NEGATIVE_INFINITY, 50], 30), 1);
  assert.equal(insertIndexAt([Number.NEGATIVE_INFINITY], 1000), 1);
});

test("drop index accounts for the dragged block still being in the list", () => {
  // Dragging block 0 down to the line before block 3 lands it at index 2.
  assert.equal(dropTargetIndex(0, 3, 4), 2);
  // Dragging block 3 up to the line before block 1 lands it at index 1.
  assert.equal(dropTargetIndex(3, 1, 4), 1);
  // Dropping on its own line changes nothing.
  assert.equal(dropTargetIndex(2, 2, 4), 2);
  // Clamped to the ends.
  assert.equal(dropTargetIndex(1, 0, 4), 0);
  assert.equal(dropTargetIndex(1, 99, 4), 3);
});

test("moveBlockTo relocates a block", () => {
  assert.equal(order(moveBlockTo(ids("a", "b", "c"), "a", 2)), "b,c,a");
  assert.equal(order(moveBlockTo(ids("a", "b", "c"), "c", 0)), "c,a,b");
  assert.equal(order(moveBlockTo(ids("a", "b", "c"), "b", 2)), "a,c,b");
});

test("moveBlockTo is a no-op for its own position and unknown ids", () => {
  const list = ids("a", "b", "c");
  assert.equal(moveBlockTo(list, "b", 1), list, "same array back");
  assert.equal(moveBlockTo(list, "zz", 0), list, "unknown id");
  assert.deepEqual(order(moveBlockTo(list, "a", 99)), "b,c,a", "clamps past the end");
});

// ── Link preview metadata ─────────────────────────────────────────────────
test("og tags win over the plain <title>", () => {
  const html = `<html><head>
    <title>Fallback &amp; title</title>
    <meta property="og:title" content="The Real Title">
    <meta property="og:description" content="A description">
    <meta property="og:image" content="https://cdn.example.com/shot.png">
    <meta property="og:site_name" content="Example">
  </head></html>`;
  const m = extractLinkMeta(html);
  assert.equal(m.title, "The Real Title");
  assert.equal(m.description, "A description");
  assert.equal(m.image, "https://cdn.example.com/shot.png");
  assert.equal(m.siteName, "Example");
});

test("meta attributes in either order are matched", () => {
  const html = `<head>
    <meta content="Content First" property="og:title">
    <meta content="Image First" property="og:image">
    <meta name="twitter:title" content="From Twitter">
  </head>`;
  const m = extractLinkMeta(html);
  assert.equal(m.title, "Content First");
  assert.equal(m.image, "Image First");
});

test("falls back through twitter tags and then <title>", () => {
  assert.equal(extractLinkMeta(`<meta name="twitter:title" content="From Twitter">`).title, "From Twitter");
  assert.equal(extractLinkMeta(`<head><title>Plain Title</title></head>`).title, "Plain Title");
  assert.equal(extractLinkMeta(`<meta name="description" content="Meta only">`).description, "Meta only");
});

test("a page with no usable metadata returns nulls", () => {
  const m = extractLinkMeta("<html><body><p>hi</p></body></html>");
  assert.equal(m.title, null);
  assert.equal(m.image, null);
  assert.equal(m.siteName, null);
});

test("relative and protocol-relative image URLs are absolutised", () => {
  assert.equal(absolutizeImage("/img/a.png", "https://ex.com/posts/1"), "https://ex.com/img/a.png");
  assert.equal(absolutizeImage("//cdn.ex.com/a.png", "https://ex.com/"), "https://cdn.ex.com/a.png");
  assert.equal(absolutizeImage("data:image/png;base64,AAA", "https://ex.com/"), null, "not http(s)");
  assert.equal(absolutizeImage(null, "https://ex.com/"), null);
});

test("entities are decoded in titles", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry &lt;3 &#65;&#x42;"), "Tom & Jerry <3 AB");
  assert.equal(extractLinkMeta(`<title>Tom &amp; Jerry</title>`).title, "Tom & Jerry");
});

test("a title is derived from the URL when the page has none", () => {
  assert.equal(titleFromUrl("/blog/some_post-here", "ex.com"), "some post here");
  assert.equal(titleFromUrl("/", "www.ex.com"), "ex.com");
});