import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M16 7l2 2M14 9l2 2" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="m21 3-7.5 18-3.4-7.1L3 10.5 21 3Z" />
      <path d="m10.1 13.9 4.4-4.4" />
    </svg>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="M14 5h5v5M10 14 19 5" />
      <path d="M19 13v6H5V5h6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...common} {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
