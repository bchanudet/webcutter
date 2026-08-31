/** Non-visible bookkeeping tags: skip entirely, don't flag as unsupported. */
export const IGNORED_TAGS = new Set(['defs', 'title', 'desc', 'style', 'metadata']);

/** Definitions only rendered through a reference (clipPath/mask/pattern/symbol): skip their contents. */
export const REFERENCE_ONLY_CONTAINER_TAGS = new Set(['symbol', 'clippath', 'mask', 'pattern']);
