import { cn } from "@/lib/utils";

export function OryaMark({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 128 128"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M60.8 14C34.4 14 13 35.4 13 61.8c0 14.8 6.7 28 17.2 36.8l14.6-14.7c-6.4-5.4-10.4-13.5-10.4-22.6 0-16.3 13.2-29.5 29.5-29.5H84L104.7 14H60.8Z"
        fill="#F6F7F8"
      />
      <path
        d="M114.9 66.2c0-7.4-1.5-14.4-4.4-20.8L95.9 60.1c0.4 2 0.6 4 0.6 6.1 0 16.3-13.2 29.5-29.5 29.5H46.8L26.1 116H67c26.4 0 47.9-21.4 47.9-47.8Z"
        fill="#F6F7F8"
      />
      <path
        d="M31.6 110 85.2 14h27.2L58.8 110H31.6Z"
        fill="#FF1F34"
      />
    </svg>
  );
}
