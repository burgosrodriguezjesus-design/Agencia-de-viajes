"use client";

import type { ComponentProps } from "react";

/** Imagen externa (Wikipedia, proveedores) que se oculta si no carga. */
export function SafeImg({ alt = "", ...props }: ComponentProps<"img">) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      {...props}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
