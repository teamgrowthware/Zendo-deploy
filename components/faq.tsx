"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion.Root type="single" collapsible className="zendo-divide-y zendo-divide-line zendo-rounded-3xl zendo-border zendo-border-line">
      {items.map((item) => (
        <Accordion.Item key={item.q} value={item.q} className="zendo-px-5">
          <Accordion.Header>
            <Accordion.Trigger className="zendo-group zendo-flex zendo-w-full zendo-items-center zendo-justify-between zendo-gap-4 zendo-py-4 zendo-text-left zendo-font-medium">
              {item.q}
              <ChevronDown className="zendo-h-4 zendo-w-4 zendo-shrink-0 zendo-transition group-data-[state=open]:zendo-rotate-180" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="zendo-pb-4 zendo-text-sm zendo-leading-6 zendo-text-muted">{item.a}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
