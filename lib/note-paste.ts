// Rebuild an inert clipboard fragment; never insert source HTML/attributes directly.
const TAGS = new Set(['B','STRONG','I','EM','U','S','DEL','SPAN','CODE','BR','P','DIV','UL','OL','LI','BLOCKQUOTE','H1','H2','H3','A']);
const DROP = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON','IMG','VIDEO','AUDIO','LINK','META']);
export function noteLink(value: string): string | null {
  const raw=value.trim();
  if (!raw) return '';
  if (raw.startsWith('#wiki:') && raw.length > 6) return raw;
  try { const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(raw)?raw:'https://'+raw); return ['https:','http:','mailto:'].includes(url.protocol)?url.href:null; } catch { return null; }
}
export function safeClipboardHTML(html: string, doc: Document = document): string {
  if (html.length > 2_000_000) throw new Error('This paste is too large. Paste a smaller selection; your existing text is unchanged.');
  const template=doc.createElement('template');template.innerHTML=html;
  const output=doc.createElement('div');
  function copy(node: Node, parent: Node) {
    if (node.nodeType === 3) { parent.appendChild(doc.createTextNode(node.textContent ?? ''));return; }
    if (node.nodeType !== 1) return;
    const source=node as HTMLElement;
    if (DROP.has(source.tagName)) return;
    const target=doc.createElement(TAGS.has(source.tagName)?source.tagName.toLowerCase():'span');
    if (source.tagName === 'A') {const link=noteLink(source.getAttribute('href')??'');if(link)target.setAttribute('href',link);}
    for (const property of ['color','background-color','font-weight','font-style','font-size','text-decoration','text-decoration-line']) {
      const value=source.style.getPropertyValue(property) || (property==='color'&&source.tagName==='FONT'?source.getAttribute('color')??'':'');
      if (!value || /url|var\(|expression|[;\\]/i.test(value)) continue;
      const valid=property.endsWith('color')?/^(#[a-f\d]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.,% /+-]+\))$/i.test(value):property==='font-weight'?/^(bold|normal|[1-9]00)$/.test(value):property==='font-style'?/^(italic|oblique|normal)$/.test(value):property==='font-size'?/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/.test(value):/^(?:none|underline|line-through|overline)(?: (?:underline|line-through|overline))*$/.test(value);
      if(valid)target.style.setProperty(property,value);
    }
    for (const child of source.childNodes) copy(child,target);
    parent.appendChild(target);
  }
  for (const node of template.content.childNodes) copy(node,output);
  return output.innerHTML;
}
export function pasteNote(event: {clipboardData: DataTransfer; currentTarget: HTMLElement; preventDefault: ()=>void}, plain = false) {
  event.preventDefault();
  const html=event.clipboardData.getData('text/html'), text=event.clipboardData.getData('text/plain');
  if (!html && !text) return;
  const doc=event.currentTarget.ownerDocument, fragment=doc.createDocumentFragment();
  if (!plain && html) { const template=doc.createElement('template');template.innerHTML=safeClipboardHTML(html,doc);fragment.append(template.content); }
  else fragment.append(doc.createTextNode(text));
  const selection=doc.getSelection();
  let range=selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  if (!range || !event.currentTarget.contains(range.commonAncestorContainer)) { range=doc.createRange();range.selectNodeContents(event.currentTarget);range.collapse(false); }
  const last=fragment.lastChild;if(!last)return;
  range.deleteContents();range.insertNode(fragment);range.setStartAfter(last);range.collapse(true);
  selection?.removeAllRanges();selection?.addRange(range);
}
