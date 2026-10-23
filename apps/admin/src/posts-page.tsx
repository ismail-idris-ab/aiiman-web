import { useEffect, useState } from "react";
import { listPosts, type Post } from "./posts";

export function PostsPage({
  onOpen,
}: {
  /** Opens a post, or a new one when id is undefined. */
  onOpen: (id?: string) => void;
}) {
  const [posts, setPosts] = useState<Post[] | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void listPosts().then((result) => {
      if (active) setPosts(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-labelledby="posts-heading">
      <h2 id="posts-heading">Posts</h2>
      <p>
        <button type="button" onClick={() => onOpen()}>
          New post
        </button>
      </p>
      {posts === undefined ? (
        <p role="status">Loading posts…</p>
      ) : posts === null ? (
        <p role="alert">Couldn't load posts. Reload to try again.</p>
      ) : posts.length === 0 ? (
        <p>No posts yet. Start one with New post.</p>
      ) : (
        <ul>
          {posts.map((post) => (
            <li key={post.id}>
              <button type="button" onClick={() => onOpen(post.id)}>
                {post.title}
              </button>{" "}
              {post.status === "published" ? "Published" : "Draft"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
