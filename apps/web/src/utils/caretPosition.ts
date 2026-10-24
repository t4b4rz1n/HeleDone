// High-performance caret coordinate calculation for HTMLTextAreaElement
// Features style-caching and layout-thrashing prevention

const MIRROR_PROPERTIES = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "whiteSpace",
  "wordBreak",
  "wordWrap",
] as const;

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

interface CachedStyleData {
  styles: Record<string, string>;
  borderTop: number;
  borderLeft: number;
  fontSize: number;
  lineHeight: number;
  paddingLeft: number;
  paddingRight: number;
  boxSizing: string;
  clientWidth: number;
  cachedAt: number;
}

// Style cache per textarea to avoid expensive getComputedStyle calls
const styleCache = new WeakMap<HTMLTextAreaElement, CachedStyleData>();

// Caret position result cache for identical cursor & scroll positions
interface CachedCaretResult {
  position: number;
  textLength: number;
  clientWidth: number;
  coords: CaretCoordinates;
}
const caretResultCache = new WeakMap<HTMLTextAreaElement, CachedCaretResult>();

/**
 * Calculates pixel offset of the caret (or character at given index) within the textarea.
 * Highly optimized with style caching to eliminate Layout Thrashing.
 */
export function getCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number
): CaretCoordinates {
  if (typeof window === "undefined" || !document) {
    return { top: 0, left: 0, height: 20 };
  }

  // Fast-path: check if we already calculated caret coordinates for this exact state
  const cachedResult = caretResultCache.get(element);
  if (
    cachedResult &&
    cachedResult.position === position &&
    cachedResult.textLength === element.value.length &&
    cachedResult.clientWidth === element.clientWidth
  ) {
    return cachedResult.coords;
  }

  let mirrorDiv = document.getElementById(
    "madaar-textarea-caret-mirror"
  ) as HTMLDivElement | null;

  if (!mirrorDiv) {
    mirrorDiv = document.createElement("div");
    mirrorDiv.id = "madaar-textarea-caret-mirror";
    document.body.appendChild(mirrorDiv);
  }

  const style = mirrorDiv.style;
  const now = Date.now();
  let cached = styleCache.get(element);

  // Only read getComputedStyle if not cached, resized, or older than 5 seconds
  if (
    !cached ||
    cached.clientWidth !== element.clientWidth ||
    now - cached.cachedAt > 5000
  ) {
    const computed = window.getComputedStyle(element);
    const styles: Record<string, string> = {};
    for (const prop of MIRROR_PROPERTIES) {
      styles[prop] = (computed as unknown as Record<string, string>)[prop] || "";
    }
    const borderTop = parseFloat(computed.borderTopWidth || "0");
    const borderLeft = parseFloat(computed.borderLeftWidth || "0");
    const fontSize = parseFloat(computed.fontSize || "14");
    const lineHeight = parseFloat(computed.lineHeight) || fontSize * 1.35;
    const paddingLeft = parseFloat(computed.paddingLeft || "0");
    const paddingRight = parseFloat(computed.paddingRight || "0");
    const boxSizing = computed.boxSizing || "content-box";

    cached = {
      styles,
      borderTop,
      borderLeft,
      fontSize,
      lineHeight,
      paddingLeft,
      paddingRight,
      boxSizing,
      clientWidth: element.clientWidth,
      cachedAt: now,
    };
    styleCache.set(element, cached);

    // Apply baseline styles to mirror
    style.whiteSpace = "pre-wrap";
    style.wordWrap = "break-word";
    style.position = "absolute";
    style.visibility = "hidden";
    style.top = "0";
    style.left = "-9999px";
    style.overflow = "hidden";

    for (const prop of MIRROR_PROPERTIES) {
      (style as unknown as Record<string, string>)[prop] = styles[prop];
    }
  }

  // Adjust width if container changed
  if (cached.boxSizing === "border-box") {
    style.width = `${element.clientWidth}px`;
  } else {
    style.width = `${
      element.clientWidth - cached.paddingLeft - cached.paddingRight
    }px`;
  }

  mirrorDiv.textContent = element.value.substring(0, position);

  const span = document.createElement("span");
  span.textContent = element.value.substring(position) || ".";
  mirrorDiv.appendChild(span);

  const top = span.offsetTop + cached.borderTop;
  const left = span.offsetLeft + cached.borderLeft;

  const result: CaretCoordinates = {
    top,
    left,
    height: cached.lineHeight,
  };

  // Cache the computed result
  caretResultCache.set(element, {
    position,
    textLength: element.value.length,
    clientWidth: element.clientWidth,
    coords: result,
  });

  return result;
}

export interface CaretPopupCoords {
  top?: number;
  bottom?: number;
  left: number;
  placement: "top" | "bottom";
  maxHeight: number;
  isOutOfBounds: boolean;
}

/**
 * Calculates fixed viewport coordinates for the mention dropdown floating
 * directly beneath or above the caret / '@' symbol, avoiding screen overflows.
 */
export function computeMentionPopupPosition(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
  dropdownWidth: number = 300,
  minHeight: number = 180
): CaretPopupCoords {
  if (typeof window === "undefined") {
    return {
      top: 0,
      left: 0,
      placement: "bottom",
      maxHeight: 240,
      isOutOfBounds: false,
    };
  }

  const rect = textarea.getBoundingClientRect();
  const caret = getCaretCoordinates(textarea, caretIndex);

  // Caret position relative to the browser viewport
  const caretViewportTop = rect.top + caret.top - textarea.scrollTop;
  const caretViewportLeft = rect.left + caret.left - textarea.scrollLeft;
  const caretHeight = caret.height || 20;

  // Check if caret is scrolled out of textarea bounds
  const isOutOfBounds =
    caretViewportTop + caretHeight < rect.top ||
    caretViewportTop > rect.bottom ||
    rect.bottom < 0 ||
    rect.top > window.innerHeight;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceBelow = viewportHeight - (caretViewportTop + caretHeight + 8);
  const spaceAbove = caretViewportTop - 8;

  let placement: "top" | "bottom" = "bottom";
  let top: number | undefined;
  let bottom: number | undefined;
  let maxHeight = 240;

  if (spaceBelow < minHeight && spaceAbove > spaceBelow) {
    placement = "top";
    bottom = viewportHeight - caretViewportTop + 6;
    maxHeight = Math.min(260, Math.max(140, spaceAbove - 16));
  } else {
    placement = "bottom";
    top = caretViewportTop + caretHeight + 6;
    maxHeight = Math.min(260, Math.max(140, spaceBelow - 16));
  }

  const isRtl =
    document.documentElement.dir === "rtl" ||
    document.body.dir === "rtl" ||
    window.getComputedStyle(textarea).direction === "rtl";

  let left = caretViewportLeft;

  if (isRtl) {
    // In RTL, align right edge of dropdown near the caret
    left = caretViewportLeft - dropdownWidth + 24;
  }

  // Viewport bounds clamping
  if (left + dropdownWidth > viewportWidth - 16) {
    left = viewportWidth - dropdownWidth - 16;
  }
  if (left < 16) {
    left = 16;
  }

  return {
    top,
    bottom,
    left,
    placement,
    maxHeight,
    isOutOfBounds,
  };
}
