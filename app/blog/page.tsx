import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import Scene from "../scene";

export const metadata = {
  title: "Blog — RoadLore",
  description: "Stories, insights, and the history behind the highway.",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <>
      <Scene />
      <main className="relative z-10 min-h-[100dvh] px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--gold)] transition mb-8 rise"
          >
            ← Back to RoadLore
          </Link>

          <div className="rise" style={{ animationDelay: "0.1s" }}>
            <p className="kicker text-[11px] text-[var(--gold)]/80 mb-4">
              Stories from the Road
            </p>
            <h1 className="text-5xl sm:text-6xl font-extrabold mb-4 font-[family-name:var(--font-display)]">
              Blog
            </h1>
            <p className="text-lg text-[var(--muted)] mb-12 max-w-2xl">
              The stories behind the stories. Insights, history, and the occasional tale too strange to fit in three minutes.
            </p>
          </div>

          {posts.length === 0 ? (
            <div className="glass rounded-[28px] p-8 text-center rise" style={{ animationDelay: "0.2s" }}>
              <p className="text-[var(--muted)]">No posts yet. Check back soon.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post, i) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="block glass rounded-[28px] p-8 hover:border-[var(--gold)]/40 transition rise"
                  style={{ animationDelay: `${0.2 + i * 0.1}s` }}
                >
                  <div className="flex items-baseline justify-between gap-4 mb-3">
                    <h2 className="text-2xl font-bold text-[var(--cream)] font-[family-name:var(--font-display)]">
                      {post.title}
                    </h2>
                    <time className="text-sm text-[var(--muted)] whitespace-nowrap">
                      {new Date(post.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                  <p className="text-[var(--muted)] leading-relaxed mb-3">
                    {post.description}
                  </p>
                  <p className="text-sm text-[var(--gold)] font-semibold">
                    Read more →
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
