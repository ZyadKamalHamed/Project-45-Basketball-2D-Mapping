interface Props {
  size?: 'sm' | 'md'
  variant?: 'default' | 'overlay'
}

export function LiveBadge({ size = 'sm', variant = 'default' }: Props) {
  const isOverlay = variant === 'overlay'
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const pad = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-widest ${text} ${pad} ${
        isOverlay
          ? 'bg-black/55 text-white backdrop-blur-sm'
          : 'bg-[var(--accent-soft)] text-[var(--miss)]'
      }`}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--live)] opacity-75 live-dot" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--live)]" />
      </span>
      Live
    </span>
  )
}
