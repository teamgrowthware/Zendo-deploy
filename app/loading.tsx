import { MarkLoader } from "@/components/ui";

export default function Loading() {
  return (
    <div className="zendo-grid zendo-flex-1 zendo-place-items-center zendo-px-4 zendo-py-24">
      <MarkLoader label="Opening Zendo L-1 Network" />
    </div>
  );
}
