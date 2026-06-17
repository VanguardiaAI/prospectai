// Real brand SVG marks (official logo paths) for provider/connection UI.
// Each accepts a `size` (px) and optional `className`.

type IconProps = { size?: number; className?: string };

/** Anthropic / Claude — official Anthropic logomark. */
export function AnthropicIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.541Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  );
}

/** Google Gemini — 4-point spark with the official blue→violet→pink gradient. */
export function GeminiIcon({ size = 20, className }: IconProps) {
  const id = "gemini-grad";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.45" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12"
      />
    </svg>
  );
}

/** WhatsApp — official glyph in brand green. */
export function WhatsAppIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

/** Google — multicolor "G" mark. */
export function GoogleIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.58-5.17 3.58-8.87z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.76-2.11-6.7-4.94H1.29v3.09A11.997 11.997 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.29a12.01 12.01 0 0 0 0 10.8l4.01-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.6l4.01 3.09C6.24 6.86 8.88 4.75 12 4.75z" />
    </svg>
  );
}

/** Resend — minimal monogram mark (rounded square + R). */
export function ResendIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path
        fill="var(--glass-bg-strong, #fff)"
        d="M8 6.5h4.4c2.2 0 3.7 1.3 3.7 3.3 0 1.5-.85 2.6-2.2 3.05L16.4 17.5h-2.6l-1.95-3.9H10.4v3.9H8V6.5Zm2.4 2.05v3.05h1.85c1 0 1.6-.6 1.6-1.53 0-.93-.6-1.52-1.6-1.52H10.4Z"
      />
    </svg>
  );
}
