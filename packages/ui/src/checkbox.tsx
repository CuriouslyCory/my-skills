import { Checkbox as RadixCheckbox } from "radix-ui";

import { cn } from "@curiouslycory/ui";

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root
      data-slot="checkbox"
      className={cn(
        "peer border-primary focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground h-4 w-4 shrink-0 rounded-sm border shadow focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="flex items-center justify-center text-current">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
