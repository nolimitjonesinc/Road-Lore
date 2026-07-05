import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug, renderMarkdown } from "@/lib/blog";
import Scene from "../../scene";

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    return {
      title: "Post Not Found — RoadLore",
    };
  }

  return {
    title: `${post.title} — RoadLore`,
    description: post.description,
  };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    notFound();
  }

  const htmlContent = renderMarkdown(post.content);

  return (
    <>
      <Scene />
      <main className="relative z-10 min-h-[100dvh] px-6 py-12">
        <article className="max-w-3xl mx-auto">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--gold)] transition mb-8 rise"
          >
            ← Back to Blog
          </Link>

          <div className="rise" style={{ animationDelay: "0.1s" }}>
            <p className="kicker text-[11px] text-[var(--gold)]/80 mb-4">
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 font-[family-name:var(--font-display)] leading-tight">
              {post.title}
            </h1>
            <p className="text-lg text-[var(--muted)] mb-2">
              {post.description}
            </p>
            <p className="text-sm text-[var(--muted)] mb-12">
              By {post.author}
            </p>
          </div>

          <div
            className="glass rounded-[28px] p-8 sm:p-10 rise prose-blog"
            style={{ animationDelay: "0.2s" }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />

          <div className="mt-8 rise" style={{ animationDelay: "0.3s" }}>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--gold)] transition"
            >
              ← Back to Blog
            </Link>
          </div>
        </article>
      </main>
    </>
  );
}
