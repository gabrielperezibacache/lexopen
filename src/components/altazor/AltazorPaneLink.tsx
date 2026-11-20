"use client";
import type { ComponentProps } from "react";
import type { Pane } from "./pane-location";

type Props = Pick<ComponentProps<"a">, "href" | "children" | "className"> & { pane: Pane; openPane?: (pane: Pane) => void };

/** Keep the current conversation mounted on a same-workspace tool change. */
export function AltazorPaneLink({ pane, openPane, ...props }: Props) {
  return <a {...props} onClick={event => {
    if (!openPane || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openPane(pane);
  }} />;
}
