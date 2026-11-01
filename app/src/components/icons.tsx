/** Line icons drawn to match the prototypes. All are decorative (aria-hidden); the control carries the name. */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, viewBox = '0 0 16 16', strokeWidth = 1.6, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3L2 6l3 3M2 6h8a4 4 0 010 8H7" />
  </Svg>
);
export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 3l3 3-3 3M14 6H6a4 4 0 000 8h3" />
  </Svg>
);
export const KeyboardIcon = (p: IconProps) => (
  <Svg size={18} viewBox="0 0 20 20" strokeWidth={1.4} {...p}>
    <rect x="2" y="5" width="16" height="10" rx="1.5" />
    <path d="M5 8h1M8 8h1M11 8h1M14 8h1M6 12h8" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg size={14} strokeWidth={2} {...p}>
    <path d="M8 2v12M2 8h12" />
  </Svg>
);
export const MinusIcon = (p: IconProps) => (
  <Svg size={12} viewBox="0 0 12 12" strokeWidth={2} {...p}>
    <path d="M2 6h8" />
  </Svg>
);
export const PlusSmallIcon = (p: IconProps) => (
  <Svg size={12} viewBox="0 0 12 12" strokeWidth={2} {...p}>
    <path d="M2 6h8M6 2v8" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg size={12} viewBox="0 0 12 12" strokeWidth={1.8} {...p}>
    <path d="M2.5 4.5L6 8l3.5-3.5" />
  </Svg>
);
export const DuplicateIcon = (p: IconProps) => (
  <Svg size={14} strokeWidth={1.5} {...p}>
    <rect x="5" y="5" width="9" height="9" />
    <path d="M11 5V2H2v9h3" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg size={14} strokeWidth={1.5} {...p}>
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg size={14} strokeWidth={1.6} {...p}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Svg>
);
export const CheckIcon = ({ draw = false, ...p }: IconProps & { draw?: boolean }) => (
  <Svg size={14} strokeWidth={2.2} {...p}>
    <path className={draw ? 'kf-check' : undefined} d="M3 8.5l3 3 7-7" />
  </Svg>
);
export const Spinner = (p: IconProps) => (
  <Svg size={14} strokeWidth={2} {...p}>
    <path className="kf-spin" d="M8 2a6 6 0 016 6" />
  </Svg>
);
export const LogoMark = (p: IconProps) => (
  <Svg size={24} viewBox="0 0 24 24" strokeWidth={1.75} {...p}>
    <rect x="3" y="3" width="18" height="18" />
    <path d="M3 10h7M14 10h7M12 3v18" strokeDasharray="2 2" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Svg>
);
export const ImportIcon = (p: IconProps) => (
  <Svg strokeWidth={1.5} {...p}>
    <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 11v2.5h11V11" />
  </Svg>
);
export const ExportIcon = (p: IconProps) => (
  <Svg strokeWidth={1.5} {...p}>
    <path d="M8 10V2M4.5 5.5L8 2l3.5 3.5M2.5 11v2.5h11V11" />
  </Svg>
);
export const MoreIcon = (p: IconProps) => (
  <Svg fill="currentColor" stroke="none" {...p}>
    <circle cx="3.5" cy="8" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="12.5" cy="8" r="1.4" />
  </Svg>
);
export const CutListIcon = (p: IconProps) => (
  <Svg strokeWidth={1.4} {...p}>
    <rect x="3" y="1.5" width="10" height="13" />
    <path d="M5.5 5h5M5.5 8h5M5.5 11h3" />
  </Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg size={14} strokeWidth={2} {...p}>
    <path d="M10 3L5 8l5 5" />
  </Svg>
);
export const PrintIcon = (p: IconProps) => (
  <Svg strokeWidth={1.5} {...p}>
    <path d="M4 6V1.5h8V6M4 12H2V6h12v6h-2M4 9.5h8v5H4z" />
  </Svg>
);
