/**
 * MOD-016 视图构造工具
 * 提供安全的 DOM 构造三件套：el / text / cloneTemplate。
 * 严禁使用 innerHTML / outerHTML / insertAdjacentHTML / document.write。
 * 字符串子节点一律使用 createTextNode，保证用户文本不被解析为 HTML（REQ-025）。
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | boolean | undefined>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (val === undefined) {
        continue;
      }
      if (key === 'checked') {
        (element as unknown as HTMLInputElement).checked = Boolean(val);
      } else if (key === 'value') {
        (element as unknown as HTMLInputElement).value = String(val);
      } else if (key === 'class' || key.startsWith('data-') || key.startsWith('aria-')) {
        element.setAttribute(key, String(val));
      } else if (typeof val === 'boolean') {
        if (val) {
          element.setAttribute(key, '');
        }
        if (key in element) {
          try {
            (element as unknown as Record<string, unknown>)[key] = val;
          } catch {
            // 忽略只读 property
          }
        }
      } else {
        element.setAttribute(key, String(val));
      }
    }
  }

  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    }
  }

  return element;
}

export function text(s: string): Text {
  return document.createTextNode(s);
}

export function cloneTemplate(id: string): DocumentFragment {
  const elementId = id.startsWith('#') ? id.slice(1) : id;
  const tpl = document.getElementById(elementId);
  if (!tpl || !(tpl instanceof HTMLTemplateElement)) {
    throw new Error(`Template not found or not a <template>: #${elementId}`);
  }
  return tpl.content.cloneNode(true) as DocumentFragment;
}
