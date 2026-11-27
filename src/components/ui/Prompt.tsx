/**
 * Classes for text whose line breaks must be kept (a prompt with a list, an explanation, a line of working):
 * `pre-line` honours the breaks and still wraps long lines, `break-words` stops one very long word from pushing the
 * page sideways at 360 px, and tabular figures line the amounts of a list up.
 */
export const KEEP_LINES = 'whitespace-pre-line break-words tabular-nums';

/** A prompt split at its first line break: the question itself, and the lines (a list of figures) that follow it. */
export function splitPrompt(text: string): { head: string; rest: string } {
  const trimmed = text.replace(/^\s+/, '');
  const at = trimmed.indexOf('\n');
  if (at < 0) return { head: trimmed.trimEnd(), rest: '' };
  return { head: trimmed.slice(0, at).trimEnd(), rest: trimmed.slice(at + 1).replace(/^\s*\n/, '').trimEnd() };
}

/**
 * A question's prompt. The first line is the question and stays the prominent heading; every line after it (a dated
 * list of transactions, "Name: ₹amount" per line) is shown below it, one per line, in a box that wraps instead of
 * scrolling sideways. A one-line prompt renders as just the heading.
 */
export function Prompt({
  text,
  size = 'lg',
  headingId,
}: {
  text: string;
  /** `lg` for the player, `md` for lists of questions (the Mistakes screen). */
  size?: 'lg' | 'md';
  headingId?: string;
}) {
  const { head, rest } = splitPrompt(text);
  const heading =
    size === 'lg' ? 'text-2xl font-extrabold tracking-tight sm:text-3xl' : 'text-lg font-extrabold leading-snug';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 id={headingId} data-testid="prompt-head" className={`${heading} ${KEEP_LINES}`}>
        {head}
      </h2>
      {rest ? (
        <p
          data-testid="prompt-lines"
          className={`${KEEP_LINES} rounded-control border-2 border-edge bg-canvas px-3 py-2 text-base leading-relaxed text-ink`}
        >
          {rest}
        </p>
      ) : null}
    </div>
  );
}
