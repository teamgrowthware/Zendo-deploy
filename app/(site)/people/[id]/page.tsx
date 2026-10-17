import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { socialProfile } from "@/lib/engine";
import { ZendoError } from "@/lib/errors";
import { BackLink } from "@/components/chrome";
import { ProfileBody } from "@/components/social";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await currentUser();
  let data;
  try {
    data = await socialProfile(decodeURIComponent(id), viewer?.id ?? null);
  } catch (error) {
    if (error instanceof ZendoError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="zendo-mx-auto zendo-max-w-3xl zendo-px-4 zendo-py-10">
      <BackLink href="/search?kind=user" label="Back to search" />
      <ProfileBody initial={data} signedIn={Boolean(viewer)} self={viewer?.id === data.person.id} />
    </div>
  );
}
