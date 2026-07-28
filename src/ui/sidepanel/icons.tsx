import React from 'react'

interface IcProps {
  size?: number
  className?: string
}

function Svg({
  size = 18,
  sw = 1.7,
  fill,
  className,
  children,
}: IcProps & { sw?: number; fill?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export const Stack = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4" /><path d="M3 17l9 4 9-4" /></Svg>
)
export const Send = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M4 12l16-8-6 16-3-6-7-2z" /></Svg>
)
export const Gear = (p: IcProps): React.ReactElement => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9z" /></Svg>
)
export const Play = (p: IcProps): React.ReactElement => (
  <Svg {...p} fill="currentColor" sw={0}><path d="M7 5v14l12-7z" /></Svg>
)
export const Pause = (p: IcProps): React.ReactElement => (
  <Svg {...p} fill="currentColor" sw={0}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Svg>
)
export const Copy = (p: IcProps): React.ReactElement => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Svg>
)
export const Check = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M5 13l4 4L19 7" /></Svg>
)
export const Trash = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></Svg>
)
export const Chevron = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>
)
export const Back = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>
)
export const Search = (p: IcProps): React.ReactElement => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></Svg>
)
export const Clock = (p: IcProps): React.ReactElement => (
  <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Svg>
)
export const X = (p: IcProps): React.ReactElement => (
  <Svg {...p}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Svg>
)
