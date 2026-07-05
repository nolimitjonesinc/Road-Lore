import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const contentDir = path.join(process.cwd(), "content", "blog");

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  keyword?: string;
  content: string;
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  keyword?: string;
}

export function getAllPosts(): BlogPostMeta[] {
  // Return empty array if content directory doesn't exist
  if (!fs.existsSync(contentDir)) {
    return [];
  }

  const files = fs.readdirSync(contentDir);
  const posts = files
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const fullPath = path.join(contentDir, file);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const { data } = matter(fileContents);

      return {
        slug,
        title: data.title || "Untitled",
        description: data.description || "",
        date: data.date || "",
        author: data.author || "Unknown",
        keyword: data.keyword,
      };
    })
    .sort((a, b) => {
      // Sort by date, newest first
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    });

  return posts;
}

export function getPostBySlug(slug: string): BlogPost | null {
  try {
    const fullPath = path.join(contentDir, `${slug}.md`);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    return {
      slug,
      title: data.title || "Untitled",
      description: data.description || "",
      date: data.date || "",
      author: data.author || "Unknown",
      keyword: data.keyword,
      content,
    };
  } catch {
    return null;
  }
}

export function renderMarkdown(markdown: string): string {
  // Configure marked for safe HTML output
  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  return marked(markdown) as string;
}
