import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingHeader, SiteFooter } from "@/components/site-chrome";
import { LEGAL_DOCS } from "@/lib/content/legal";

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: LEGAL_DOCS[doc]?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const content = LEGAL_DOCS[doc];
  if (!content) notFound();
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">{content.updated}</p>
        <h1 className="mt-3 font-display text-5xl leading-tight font-medium tracking-tight">{content.title}</h1>
        <div className="mt-8 space-y-4">{content.body}</div>
      </main>
      <SiteFooter />
    </>
  );
}
