import { createContext, useContext } from "react";
import { type PostsBlock, formatDate } from "../blocks";
import { Img } from "./image";
import { LanguageContext } from "./language";

// A published post as the "newest posts" block shows it.
export type PostSummary = { slug: string; href: string; title: string; publishedAt: string; teaser: string; cover?: { src: string; alt: string } };

// The site's published posts, newest first, and the post being shown (left out of its own list).
export const PostsContext = createContext<{ posts: PostSummary[]; current?: string }>({ posts: [] });

type Props = { block: PostsBlock; edit?: unknown };

export function LatestPosts({ block, edit }: Props) {
  const { posts, current } = useContext(PostsContext);
  const language = useContext(LanguageContext);
  const shown = posts.filter((post) => post.slug !== current).slice(0, block.count);
  if (shown.length === 0) {
    return edit ? <div className="t-empty">Hier erscheinen automatisch deine neuesten Blogbeiträge, sobald einer veröffentlicht ist.</div> : null;
  }
  // In the editor the titles are not links, so a click selects the block instead of leaving the page.
  const title = (post: PostSummary) => (edit ? post.title : <a href={post.href}>{post.title}</a>);
  if (block.style === "list") {
    return (
      <ul className="t-latest-list">
        {shown.map((post) => (
          <li key={post.slug}>
            <span className="t-latest-title">{title(post)}</span>
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, language)}</time>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="t-latest-cards">
      {shown.map((post) => (
        <li key={post.slug} className="t-latest-card">
          {post.cover && <Img src={post.cover.src} alt={post.cover.alt} sizes="(min-width: 74rem) 24rem, (min-width: 40rem) 50vw, 100vw" />}
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, language)}</time>
          <h3 className="t-latest-title">{title(post)}</h3>
          {post.teaser && <p>{post.teaser}</p>}
        </li>
      ))}
    </ul>
  );
}
