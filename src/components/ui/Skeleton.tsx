import { cn } from "@/lib/chile";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("skeleton h-4 w-full", className)}
      style={style}
      aria-hidden="true"
    />
  );
}
