import type { ApiFormattedText, ApiMessageEntity } from '../api/types';
import { ApiMessageEntityTypes } from '../api/types';

import { RE_LINK_TEMPLATE } from '../config';
import { IS_EMOJI_SUPPORTED } from './windowEnvironment';

type Token = {
  type: ApiMessageEntityTypes | 'text';
  text?: string; /* Textual content (formatting tokens can contain non-empty text here) */
  html?: boolean; /* Whether the token resulted from parsing HTML */
  open?: boolean; /* Can this token open the formatting range? */
  close?: boolean; /* Can this token close the formatting range? */
  skip?: boolean; /* Whether this token should not be added to the resulting text */
  offset?: number; /* Offset of the token in the text */
  data?: Record<string, any>; /* Entity-related data */
}

export const ENTITY_CLASS_BY_NODE_NAME: Record<string, ApiMessageEntityTypes> = {
  B: ApiMessageEntityTypes.Bold,
  STRONG: ApiMessageEntityTypes.Bold,
  I: ApiMessageEntityTypes.Italic,
  EM: ApiMessageEntityTypes.Italic,
  INS: ApiMessageEntityTypes.Underline,
  U: ApiMessageEntityTypes.Underline,
  S: ApiMessageEntityTypes.Strike,
  STRIKE: ApiMessageEntityTypes.Strike,
  DEL: ApiMessageEntityTypes.Strike,
  CODE: ApiMessageEntityTypes.Code,
  PRE: ApiMessageEntityTypes.Pre,
  BLOCKQUOTE: ApiMessageEntityTypes.Blockquote,
};

const MARKDOWN_ENTITY_TYPES: Record<string, ApiMessageEntityTypes> = {
  '*': ApiMessageEntityTypes.Bold,
  '_': ApiMessageEntityTypes.Italic,
  '~': ApiMessageEntityTypes.Strike,
  '|': ApiMessageEntityTypes.Spoiler,
  '`': ApiMessageEntityTypes.Code,
  '```': ApiMessageEntityTypes.Pre,
};

const PUNCTUATION_CODES = new Set([
  0x005F, 0x203F, 0x2040, 0x2054, 0xFE33, 0xFE34, 0xFE4D, 0xFE4E, 0xFE4F, 0xFF3F,
  0x002D, 0x058A, 0x05BE, 0x1400, 0x1806, 0x2E17, 0x2E1A, 0x2E3A, 0x2E3B, 0x2E40, 0x301C, 0x3030, 0x30A0,
  0xFE31, 0xFE32, 0xFE58, 0xFE63, 0xFF0D, 0x10EAD,
  0x0029, 0x005D, 0x007D, 0x0F3B, 0x0F3D, 0x169C, 0x2046, 0x207E, 0x208E, 0x2309, 0x230B, 0x232A, 0x2769,
  0x276B, 0x276D, 0x276F, 0x2771, 0x2773, 0x2775, 0x27C6, 0x27E7, 0x27E9, 0x27EB, 0x27ED, 0x27EF, 0x2984,
  0x2986, 0x2988, 0x298A, 0x298C, 0x298E, 0x2990, 0x2992, 0x2994, 0x2996, 0x2998, 0x29D9, 0x29DB, 0x29FD,
  0x2E23, 0x2E25, 0x2E27, 0x2E29, 0x3009, 0x300B, 0x300D, 0x300F, 0x3011, 0x3015, 0x3017, 0x3019, 0x301B,
  0x301E, 0x301F, 0xFD3E, 0xFE18, 0xFE36, 0xFE38, 0xFE3A, 0xFE3C, 0xFE3E, 0xFE40, 0xFE42, 0xFE44, 0xFE48,
  0xFE5A, 0xFE5C, 0xFE5E, 0xFF09, 0xFF3D, 0xFF5D, 0xFF60, 0xFF63,
  0x00BB, 0x2019, 0x201D, 0x203A, 0x2E03, 0x2E05, 0x2E0A, 0x2E0D, 0x2E1D, 0x2E21,
  0x00AB, 0x2018, 0x201B, 0x201C, 0x201F, 0x2039, 0x2E02, 0x2E04, 0x2E09, 0x2E0C, 0x2E1C, 0x2E20,
  0x0021, 0x0022, 0x0023, 0x0025, 0x0026, 0x0027, 0x002A, 0x002C, 0x002E, 0x002F, 0x003A, 0x003B, 0x003F,
  0x0040, 0x005C, 0x00A1, 0x00A7, 0x00B6, 0x00B7, 0x00BF, 0x037E, 0x0387, 0x055A, 0x055B, 0x055C, 0x055D,
  0x055E, 0x055F, 0x0589, 0x05C0, 0x05C3, 0x05C6, 0x05F3, 0x05F4, 0x0609, 0x060A, 0x060C, 0x060D, 0x061B,
  0x061E, 0x061F, 0x06D4, 0x07F7, 0x07F8, 0x07F9, 0x085E, 0x0964, 0x0965, 0x0970, 0x09FD, 0x0A76, 0x0AF0,
  0x0C77, 0x0C84, 0x0DF4, 0x0E4F, 0x0E5A, 0x0E5B, 0x0F14, 0x0F85, 0x0FD9, 0x0FDA, 0x10FB, 0x166E, 0x16EB,
  0x16EC, 0x16ED, 0x1735, 0x1736, 0x17D4, 0x17D5, 0x17D6, 0x17D8, 0x17D9, 0x17DA, 0x1944, 0x1945, 0x1A1E,
  0x1A1F, 0x1C7E, 0x1C7F, 0x1CD3, 0x2016, 0x2017, 0x2041, 0x2042, 0x2043, 0x2053, 
  0x0028, 0x005B, 0x007B, 0x0F3A, 0x0F3C, 0x169B, 0x201A, 0x201E, 0x2045, 0x207D, 0x208D, 0x2308, 0x230A,
  0x2329, 0x2768, 0x276A, 0x276C, 0x276E, 0x2770, 0x2772, 0x2774, 0x27C5, 0x27E6, 0x27E8, 0x27EA, 0x27EC,
  0x27EE, 0x2983, 0x2985, 0x2987, 0x2989, 0x298B, 0x298D, 0x298F, 0x2991, 0x2993, 0x2995, 0x2997, 0x29D8,
  0x29DA, 0x29FC, 0x2E22, 0x2E24, 0x2E26, 0x2E28, 0x2E42, 0x3008, 0x300A, 0x300C, 0x300E, 0x3010, 0x3014,
  0x3016, 0x3018, 0x301A, 0x301D, 0xFD3F, 0xFE17, 0xFE35, 0xFE37, 0xFE39, 0xFE3B, 0xFE3D, 0xFE3F, 0xFE41,
  0xFE43, 0xFE47, 0xFE59, 0xFE5B, 0xFE5D, 0xFF08, 0xFF3B, 0xFF5B, 0xFF5F, 0xFF62
]);

const RE_LINK = new RegExp(`^${RE_LINK_TEMPLATE}$`);
const RE_CUSTOM_EMOJI = /^customEmoji:(\d+)$/;

function isWhitespace(ch: string) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return [0x0009, 0x000A, 0x000C, 0x000D, 0x0020, 0x1680, 0x202F, 0x205F, 0x3000].includes(code) ||
  (code >= 0x2000 && code <= 0x200A);
}

function isPunctuation(ch: string) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (PUNCTUATION_CODES.has(code)) return true;
  return (code >= 0x2010 && code <= 0x2015) || (code >= 0x066A && code <= 0x066D) ||
    (code >= 0x0700 && code <= 0x070D) || (code >= 0x0830 && code <= 0x083E) ||
    (code >= 0x0F04 && code <= 0x0F12) || (code >= 0x0FD0 && code <= 0x0FD4) ||
    (code >= 0x104A && code <= 0x104F) || (code >= 0x1360 && code <= 0x1368) ||
    (code >= 0x1800 && code <= 0x1805) || (code >= 0x1807 && code <= 0x180A) ||
    (code >= 0x1AA0 && code <= 0x1AA6) || (code >= 0x1AA8 && code <= 0x1AAD) ||
    (code >= 0x1B5A && code <= 0x1B60) || (code >= 0x1BFC && code <= 0x1BFF) ||
    (code >= 0x1C3B && code <= 0x1C3F) || (code >= 0x1CC0 && code <= 0x1CC7) ||
    (code >= 0x2020 && code <= 0x2021) || (code >= 0x2030 && code <= 0x2038) ||
    (code >= 0x203B && code <= 0x203E) || (code >= 0x2047 && code <= 0x2051) ||
    (code >= 0x2055 && code <= 0x205E) || (code >= 0x2CF9 && code <= 0x2CFF);
}

export default function parseHtmlAsFormattedText(
  html: string, withMarkdownLinks = false, skipMarkdown = false,
): ApiFormattedText {
  const fragment = document.createElement('div');
  fragment.innerHTML = (skipMarkdown ? html : cleanupHtml(html)).trim().replace(/\u200b+/g, '');
  fixImageContent(fragment);

  let tokens: Token[] = [];
  function pushText(text: string, st: number, en: number) {
    if (en <= st) {
      return;
    }
    if (tokens[tokens.length - 1]?.type === 'text') {
      tokens[tokens.length - 1].text += text.slice(st, en);
    } else {
      tokens.push({ type: 'text', text: text.slice(st, en) });
    }
  }
  function tokenize(node: Node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      return;
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const { token } = elementToToken(element);
      if (token) {
        tokens.push({
          ...token,
          html: true,
          open: true,
        });
      }
      for (const child of element.childNodes) {
        tokenize(child);
      }
      if (token) {
        tokens.push({
          ...token,
          html: true,
          close: true,
        });
      }
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      let state = '';
      let prev = '';
      let st = 0;
      let spaceBefore = false;
      let punctBefore = false;
      for (let i = 0; i <= text.length; i++) {
        const ch = text[i];
        if (state === '') {
          if (['*', '_', '~', '|'].includes(ch)) {
            pushText(text, st, i);
            state = ch;
            spaceBefore = isWhitespace(prev);
            punctBefore = isPunctuation(prev);
            st = i;
          } else
          if (ch === '`') {
            pushText(text, st, i);
            state = '`';
            st = i;
          }
        } else
        if (state === '`') {
          if (i - st === 1 && state !== ch) {
            tokens.push({ type: ApiMessageEntityTypes.Code, text: text.slice(st, i), open: true, close: true });
            state = '';
            st = i;
          } else
          if (i - st === 2 && state !== ch) {
            pushText(text, st, i);
            state = '';
            st = i;
          } else
          if (i - st === 3 && state !== ch) {
            tokens.push({ type: ApiMessageEntityTypes.Pre, text: text.slice(st, i), open: true, close: true });
            state = '';
            st = i;
          }
        } else
        if (['*', '_', '~', '|'].includes(state)) {
          if (i - st === 1 && state !== ch) {
            pushText(text, st, i);
            state = ['*', '_', '~', '|'].includes(ch) ? ch : '';
            st = i;
          } else
          if (i - st === 2) {
            const spaceAfter = isWhitespace(ch);
            const punctAfter = isPunctuation(ch);
            const open = !spaceAfter && (!punctAfter || (punctAfter && (spaceBefore || punctBefore)));
            const close = !spaceBefore && (!punctBefore || (punctBefore && (spaceAfter || punctAfter)));
            if (open || close) {
              tokens.push({ type: MARKDOWN_ENTITY_TYPES[state], text: text.slice(st, i), open, close });
            } else {
              pushText(text, st, i);
            }
            state = ['*', '_', '~', '|'].includes(ch) ? ch : '';
            st = i;
          }
        }
        
        if (withMarkdownLinks) {
          if (ch === '[') {
            pushText(text, st, i);
            tokens.push({ type: ApiMessageEntityTypes.Url, text: '[', open: true, close: false });
            st = i + 1;
          } else
          if (prev === ']' && ch === '(') {
            pushText(text, st, i - 1);
            tokens.push({ type: ApiMessageEntityTypes.Url, text: '](', open: false, close: false });
            st = i + 1;
          } else
          if (ch === ')') {
            pushText(text, st, i);
            tokens.push({ type: ApiMessageEntityTypes.Url, text: ')', open: false, close: true });
            st = i + 1;
          }
        }
        prev = ch;
      }
      pushText(text, st, text.length);
    }
  }

  tokenize(fragment);

  const stack: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let closed = false;
    if (token.close) { // Try to find matching tag
      let mid = -1;
      for (let j = stack.length - 1; j >= 0; j--) {
        const prev = tokens[stack[j]];
        if (token.type === ApiMessageEntityTypes.Url && !token.html) {
          if (prev.type === token.type && !prev.open && !prev.close) {
            mid = j;
          } else
          if (prev.type === token.type && prev.open && mid !== -1) {
            let url = '';
            for (let k = stack[mid] + 1; k < i; k++) {
              url += url + (tokens[k].text || '');
            }
            
            if (RE_CUSTOM_EMOJI.test(url) || RE_LINK.test(url)) {
              if (RE_CUSTOM_EMOJI.test(url)) {
                prev.type = ApiMessageEntityTypes.CustomEmoji;
                prev.data = { documentId: url.slice(12) };
              } else {
                url = url.includes('://') ? url : url.includes('@') ? `mailto:${url}` : `https://${url}`;
                prev.data = { url };
              }

              for (let k = stack[mid]; k < i; k++) {
                tokens[k].skip = true;
              }
              for (let k = mid; k > j; k--) {
                tokens[stack[k]].type = 'text';
              }
              stack.length = j;
              token.open = false;
              prev.close = false;
              closed = true;
              break;
            }
          }
        } else {
          if (prev.type === token.type && prev.html === token.html && prev.open) {
            for (let k = stack.length - 1; k > j; k--) {
              tokens[stack[k]].type = 'text';
            }
            stack.length = j;
            token.open = false;
            prev.close = false;
            closed = true;
            break;
          }
        }
      }
    }
    if (!closed) {
      if (token.open || token.type === ApiMessageEntityTypes.Url) {
        stack.push(i);
      } else {
        token.type = 'text';
      }
    }
  }
  for (let i = 0; i < stack.length; i++) {
    tokens[stack[i]].type = 'text';
  }
  
  const text: string[] = [];
  const entities = [];
  const tstack: Token[] = [];
  let length = 0;
  let ptoken: Token | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'text') {
      if (!token.skip) {
        let t = token.text || '';
        if (ptoken?.type === ApiMessageEntityTypes.Pre) {
          const lang = t.match(/^(\w+)\n.+/)?.[1];
          t = t.replace(/^\w+\n+/, '');
          if (lang) {
            ptoken.data = { language: lang };
          }
        }
        if (ptoken?.type !== 'text') { // Trim leading newlines from the first text chunk
          t = t.replace(/^\n+/, '');
        }
        text.push(t);
        length += t.length;
        ptoken = token;
      }
    } else
    if (token.open) {
      let found = false;
      for (const t of tstack) {
        if (t.type === token.type || (token.type !== ApiMessageEntityTypes.Pre && t.type === ApiMessageEntityTypes.Pre)) {
          found = true;
          break;
        }
      }
      token.skip = found;
      token.offset = length;
      tstack.push(token);
      if (!token.skip) {
        ptoken = token;
      }
    } else {
      const prev = tstack.pop();
      if (prev && !prev.skip) {
        if (text.length > 0) { // Trim trailing newlines from the last text chunk
          let lastLen = text[text.length - 1].length;
          text[text.length - 1] = text[text.length - 1].replace(/\n+$/, '');
          length -= lastLen - text[text.length - 1].length;
        }

        entities.push({
          type: prev.type,
          offset: prev.offset,
          length: length - (prev.offset || 0),
          ...prev.data,
        });
      }
    }
  }

  // console.log(`Parsed: ${text.join('')}`, entities);

  return { text: text.join(''), entities: entities.length ? entities as ApiMessageEntity[] : undefined };
}

export function fixImageContent(fragment: HTMLDivElement) {
  fragment.querySelectorAll('img').forEach((node) => {
    if (node.dataset.documentId) { // Custom Emoji
      node.textContent = (node as HTMLImageElement).alt || '';
    } else { // Regular emoji with image fallback
      node.replaceWith(node.alt || '');
    }
  });
}

function cleanupHtml(html: string) {
  let cleanHtml = html.slice(0);

  // Strip redundant nbsp's
  cleanHtml = cleanHtml.replace(/&nbsp;/g, ' ');

  // Replace <div><br></div> with newline (new line in Safari)
  cleanHtml = cleanHtml.replace(/<div><br([^>]*)?><\/div>/g, '\n');
  // Replace <br> with newline
  cleanHtml = cleanHtml.replace(/<br([^>]*)?>/g, '\n');

  // Strip redundant <div> tags
  cleanHtml = cleanHtml.replace(/<\/div>(\s*)<div>/g, '\n');
  cleanHtml = cleanHtml.replace(/<div>/g, '\n');
  cleanHtml = cleanHtml.replace(/<\/div>/g, '');

  /* Markdown parsing moved to parseHtmlAsFormattedText 

  // Pre
  parsedHtml = parsedHtml.replace(/^`{3}(.*?)[\n\r](.*?[\n\r]?)`{3}/gms, '<pre data-language="$1">$2</pre>');
  parsedHtml = parsedHtml.replace(/^`{3}[\n\r]?(.*?)[\n\r]?`{3}/gms, '<pre>$1</pre>');
  parsedHtml = parsedHtml.replace(/[`]{3}([^`]+)[`]{3}/g, '<pre>$1</pre>');

  // Code
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[`]{1}([^`\n]+)[`]{1}(?![^<]*<\/(code|pre)>)/g,
    '<code>$2</code>',
  );

  // Custom Emoji markdown tag
  if (!IS_EMOJI_SUPPORTED) {
    // Prepare alt text for custom emoji
    parsedHtml = parsedHtml.replace(/\[<img[^>]+alt="([^"]+)"[^>]*>]/gm, '[$1]');
  }
  parsedHtml = parsedHtml.replace(
    /(?!<(?:code|pre)[^<]*|<\/)\[([^\]\n]+)\]\(customEmoji:(\d+)\)(?![^<]*<\/(?:code|pre)>)/g,
    '<img alt="$1" data-document-id="$2">',
  );

  // Other simple markdown
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[*]{2}([^*\n]+)[*]{2}(?![^<]*<\/(code|pre)>)/g,
    '<b>$2</b>',
  );
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[_]{2}([^_\n]+)[_]{2}(?![^<]*<\/(code|pre)>)/g,
    '<i>$2</i>',
  );
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[~]{2}([^~\n]+)[~]{2}(?![^<]*<\/(code|pre)>)/g,
    '<s>$2</s>',
  );
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[|]{2}([^|\n]+)[|]{2}(?![^<]*<\/(code|pre)>)/g,
    `<span data-entity-type="${ApiMessageEntityTypes.Spoiler}">$2</span>`,
  );

  */
  return cleanHtml;
}

function elementToToken(element: HTMLElement): any {
  const type = entityTypeFromNode(element);
  if (!type) {
    return { token: null };
  }
  if (type === ApiMessageEntityTypes.TextUrl) {
    return { token: { type, data: { url: (element as HTMLAnchorElement).href } } };
  }
  if (type === ApiMessageEntityTypes.MentionName) {
    return { token: { type, data: { userId: (element as HTMLAnchorElement).dataset.userId! } } };
  }
  if (type === ApiMessageEntityTypes.Pre) {
    return { token: { type, data: { language: (element as HTMLPreElement).dataset.language } } };
  }
  if (type === ApiMessageEntityTypes.CustomEmoji) {
    return { token: { type, data: { documentId: (element as HTMLImageElement).dataset.documentId! } } };
  }
  return { token: { type } };
}

function entityTypeFromNode(node: ChildNode): ApiMessageEntityTypes | undefined {
  if (node instanceof HTMLElement && node.dataset.entityType) {
    return node.dataset.entityType as ApiMessageEntityTypes;
  }

  if (ENTITY_CLASS_BY_NODE_NAME[node.nodeName]) {
    return ENTITY_CLASS_BY_NODE_NAME[node.nodeName];
  }

  if (node.nodeName === 'A') {
    const anchor = node as HTMLAnchorElement;
    if (anchor.dataset.entityType === ApiMessageEntityTypes.MentionName) {
      return ApiMessageEntityTypes.MentionName;
    }
    if (anchor.dataset.entityType === ApiMessageEntityTypes.Url) {
      return ApiMessageEntityTypes.Url;
    }
    if (anchor.href.startsWith('mailto:')) {
      return ApiMessageEntityTypes.Email;
    }
    if (anchor.href.startsWith('tel:')) {
      return ApiMessageEntityTypes.Phone;
    }
    if (anchor.href !== anchor.textContent) {
      return ApiMessageEntityTypes.TextUrl;
    }

    return ApiMessageEntityTypes.Url;
  }

  if (node.nodeName === 'SPAN') {
    return (node as HTMLElement).dataset.entityType as any;
  }

  if (node.nodeName === 'IMG') {
    if ((node as HTMLImageElement).dataset.documentId) {
      return ApiMessageEntityTypes.CustomEmoji;
    }
  }

  return undefined;
}
