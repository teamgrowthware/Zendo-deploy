import { Footer } from "@/components/chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="zendo-flex-1">{children}</div>
      <Footer />
    </>
  );
}
