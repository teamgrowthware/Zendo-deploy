"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/sdk";
import type { AnalyticsView, InboxView, ProfileView, SocialFeed } from "@/lib/types";
import { TimeAgo } from "./chrome";
import { Badge, Button, Field, Input, LoadingPanel, Panel, Textarea } from "./ui";

function roleTone(role: string): "muted" | "lime" | "gold" {
  if (role === "admin") return "gold";
  if (role === "creator" || role === "moderator") return "lime";
  return "muted";
}

export function ProfileBody({ initial, signedIn, self }: { initial: ProfileView; signedIn: boolean; self: boolean }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggleFollow() {
    setBusy(true);
    setError(null);
    try {
      const next = await api<ProfileView>("/api/social", {
        method: "POST",
        body: JSON.stringify({ action: data.youFollow ? "unfollow" : "follow", id: data.person.id }),
      });
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the follow.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zendo-grid zendo-gap-4">
      <Panel>
        <div className="zendo-flex zendo-flex-wrap zendo-items-start zendo-justify-between zendo-gap-3">
          <div>
            <div className="zendo-flex zendo-flex-wrap zendo-items-center zendo-gap-2">
              <h1 className="zendo-font-display zendo-text-3xl zendo-font-bold">{data.person.displayName}</h1>
              <Badge tone={roleTone(data.person.role)}>{data.person.role}</Badge>
              {data.mutual ? <Badge tone="lime">Mutual</Badge> : null}
            </div>
            <p className="zendo-mt-2 zendo-break-all zendo-font-mono zendo-text-xs zendo-text-muted">{data.person.address}</p>
          </div>
          {self ? (
            <Button size="sm" variant="outline" asChild><Link href="/app/social">Open social</Link></Button>
          ) : signedIn ? (
            <Button size="sm" disabled={busy} onClick={toggleFollow}>{data.youFollow ? "Unfollow" : "Follow"}</Button>
          ) : (
            <Button size="sm" variant="outline" asChild><Link href={`/signin?next=${encodeURIComponent(`/people/${data.person.id}`)}`}>Log in to follow</Link></Button>
          )}
        </div>
        {error ? <p className="zendo-mt-3 zendo-text-sm zendo-text-coral">{error}</p> : null}
        <dl className="zendo-mt-4 zendo-grid zendo-grid-cols-2 zendo-gap-3 zendo-text-sm zendo-sm:zendo-grid-cols-3">
          <Stat k="Followers" v={String(data.followers)} />
          <Stat k="Following" v={String(data.following)} />
          <Stat k="Circles" v={String(data.circleCount)} />
        </dl>
        {data.followsYou && !self ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">Follows you.</p> : null}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Mutual friends</h2>
        {data.mutuals.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No mutual follows yet.</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {data.mutuals.map((item) => (
              <Link key={item.id} href={`/people/${item.id}`} className="zendo-flex zendo-items-center zendo-justify-between zendo-gap-2 zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <span className="zendo-text-sm">{item.displayName}</span>
                {item.shared ? <Badge tone="lime">You follow</Badge> : null}
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Stories</h2>
        <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">Stories stay on the ledger for 24 hours.</p>
        {data.stories.length === 0 ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">No live stories.</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {data.stories.map((story) => (
              <div key={story.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <p className="zendo-text-sm">{story.caption}</p>
                <p className="zendo-mt-1 zendo-text-xs zendo-text-muted"><TimeAgo at={story.at} /></p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Posts</h2>
        {data.posts.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No posts yet.</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-3">
            {data.posts.map((post) => (
              <article key={post.id}>
                <p className="zendo-text-sm zendo-leading-6">{post.body}</p>
                <p className="zendo-mt-1 zendo-text-xs zendo-text-muted"><TimeAgo at={post.at} /></p>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Videos</h2>
        <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">Video notes store a title and caption. The ledger does not keep video files.</p>
        {data.videos.length === 0 ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">No video notes.</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {data.videos.map((video) => (
              <div key={video.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <p className="zendo-text-sm zendo-font-medium">{video.title}</p>
                <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">{video.caption}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Circles</h2>
        {data.circles.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">{self || signedIn ? "No circles you can see." : "Sign in to see shared circles."}</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {data.circles.map((circle) => (
              <div key={circle.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <p className="zendo-text-sm zendo-font-medium">{circle.name}</p>
                <p className="zendo-mt-1 zendo-text-xs zendo-text-muted">{circle.members.map((member) => member.displayName).join(", ")}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Coins</h2>
        {data.coins.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">No launchpad coins from this account.</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {data.coins.map((coin) => (
              <Link key={coin.mint} href={`/launchpad/${coin.mint}`} className="zendo-text-sm zendo-text-lime">{coin.symbol} · {coin.name}</Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="zendo-text-xs zendo-uppercase zendo-tracking-wider zendo-text-muted">{k}</dt>
      <dd className="zendo-mt-1 zendo-text-lg zendo-font-semibold">{v}</dd>
    </div>
  );
}

export function SocialDesk() {
  const [feed, setFeed] = useState<SocialFeed | null>(null);
  const [inbox, setInbox] = useState<InboxView | null>(null);
  const [stats, setStats] = useState<AnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState("");
  const [story, setStory] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [circle, setCircle] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [nextFeed, nextInbox, nextStats] = await Promise.all([
      api<SocialFeed>("/api/social?view=feed"),
      api<InboxView>("/api/social?view=inbox"),
      api<AnalyticsView>("/api/social?view=analytics"),
    ]);
    setFeed(nextFeed);
    setInbox(nextInbox);
    setStats(nextStats);
  }

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const [nextFeed, nextInbox, nextStats] = await Promise.all([
          api<SocialFeed>("/api/social?view=feed"),
          api<InboxView>("/api/social?view=inbox"),
          api<AnalyticsView>("/api/social?view=analytics"),
        ]);
        if (stop) return;
        setFeed(nextFeed);
        setInbox(nextInbox);
        setStats(nextStats);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Social could not load.");
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  async function send(action: string, body: Record<string, unknown>, clear: () => void) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/social", { method: "POST", body: JSON.stringify({ action, ...body }) });
      clear();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !feed) return <p className="zendo-text-sm zendo-text-coral">{error}</p>;
  if (!feed || !inbox || !stats) return <LoadingPanel label="Loading social" />;

  return (
    <div className="zendo-grid zendo-gap-4">
      {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Creator analytics</h2>
        <dl className="zendo-mt-3 zendo-grid zendo-grid-cols-2 zendo-gap-3 zendo-text-sm zendo-sm:zendo-grid-cols-3">
          <Stat k="Followers" v={String(stats.followers)} />
          <Stat k="Posts" v={String(stats.posts)} />
          <Stat k="Stories" v={String(stats.stories)} />
          <Stat k="Videos" v={String(stats.videos)} />
          <Stat k="Coins" v={String(stats.coins)} />
          <Stat k="Trades" v={String(stats.trades)} />
          <Stat k="Creator fees" v={`${stats.creatorFees} Z`} />
          <Stat k="Referrals" v={String(stats.referrals)} />
        </dl>
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Post</h2>
        <form className="zendo-mt-3 zendo-grid zendo-gap-3" onSubmit={(event) => { event.preventDefault(); void send("post", { body: post }, () => setPost("")); }}>
          <Textarea aria-label="Post" value={post} maxLength={500} placeholder="What should the timeline show?" onChange={(event) => setPost(event.target.value)} />
          <Button type="submit" disabled={busy || !post.trim()}>Publish post</Button>
        </form>
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Story</h2>
        <form className="zendo-mt-3 zendo-grid zendo-gap-3" onSubmit={(event) => { event.preventDefault(); void send("story", { caption: story }, () => setStory("")); }}>
          <Input aria-label="Story" value={story} maxLength={140} placeholder="A line that expires in 24 hours" onChange={(event) => setStory(event.target.value)} />
          <Button type="submit" disabled={busy || !story.trim()}>Publish story</Button>
        </form>
        {feed.stories.length === 0 ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">No live stories.</p> : (
          <div className="zendo-mt-3 zendo-flex zendo-gap-2 zendo-overflow-x-auto">
            {feed.stories.map((item) => (
              <Link key={item.id} href={`/people/${item.userId}`} className="zendo-w-40 zendo-shrink-0 zendo-rounded-2xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <span className="zendo-block zendo-text-xs zendo-text-lime">{item.displayName}</span>
                <span className="zendo-mt-1 zendo-block zendo-text-sm">{item.caption}</span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Video note</h2>
        <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">Titles and captions only. Video files stay off the ledger.</p>
        <form className="zendo-mt-3 zendo-grid zendo-gap-3" onSubmit={(event) => { event.preventDefault(); void send("video", { title, caption }, () => { setTitle(""); setCaption(""); }); }}>
          <Field label="Title"><Input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Caption"><Textarea value={caption} maxLength={280} onChange={(event) => setCaption(event.target.value)} /></Field>
          <Button type="submit" disabled={busy || !title.trim() || !caption.trim()}>Save video note</Button>
        </form>
        {feed.videos.length === 0 ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">No video notes yet.</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {feed.videos.map((video) => (
              <div key={video.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <Link href={`/people/${video.userId}`} className="zendo-text-sm zendo-font-medium zendo-text-lime">{video.displayName}</Link>
                <p className="zendo-mt-1 zendo-text-sm zendo-font-medium">{video.title}</p>
                <p className="zendo-mt-1 zendo-text-sm zendo-text-muted">{video.caption}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Timeline</h2>
        {feed.posts.length === 0 ? <p className="zendo-mt-2 zendo-text-sm zendo-text-muted">The timeline is empty.</p> : (
          <div className="zendo-desk-scroll zendo-mt-3 zendo-grid zendo-gap-3">
            {feed.posts.map((item) => (
              <article key={item.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <Link href={`/people/${item.userId}`} className="zendo-text-sm zendo-font-medium zendo-text-lime">{item.displayName}</Link>
                <p className="zendo-mt-1 zendo-text-sm zendo-leading-6">{item.body}</p>
                <p className="zendo-mt-1 zendo-text-xs zendo-text-muted"><TimeAgo at={item.at} /></p>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Circle</h2>
        <form className="zendo-mt-3 zendo-grid zendo-gap-3" onSubmit={(event) => { event.preventDefault(); void send("circle", { name: circle, memberIds: members }, () => { setCircle(""); setMembers([]); }); }}>
          <Field label="Name"><Input value={circle} maxLength={40} onChange={(event) => setCircle(event.target.value)} /></Field>
          <div className="zendo-grid zendo-gap-1">
            {feed.people.map((person) => (
              <label key={person.id} className="zendo-flex zendo-items-center zendo-gap-2 zendo-text-sm">
                <input
                  type="checkbox"
                  checked={members.includes(person.id)}
                  onChange={(event) => {
                    setMembers((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id));
                  }}
                />
                {person.displayName}
              </label>
            ))}
          </div>
          <Button type="submit" disabled={busy || circle.trim().length < 2}>Create circle</Button>
        </form>
        {feed.circles.length === 0 ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">You are not in a circle yet.</p> : (
          <div className="zendo-mt-3 zendo-grid zendo-gap-2">
            {feed.circles.map((item) => (
              <div key={item.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <p className="zendo-text-sm zendo-font-medium">{item.name}</p>
                <p className="zendo-mt-1 zendo-text-xs zendo-text-muted">{item.members.map((member) => member.displayName).join(", ")}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">Direct messages</h2>
        <form className="zendo-mt-3 zendo-grid zendo-gap-3" onSubmit={(event) => { event.preventDefault(); void send("message", { id: to, body: message }, () => setMessage("")); }}>
          <Field label="To">
            <select className="zendo-text zendo-h-11 zendo-w-full zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3 zendo-text-sm" value={to} onChange={(event) => setTo(event.target.value)}>
              <option value="">Choose an account</option>
              {feed.people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
            </select>
          </Field>
          <Textarea aria-label="Message" value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} />
          <Button type="submit" disabled={busy || !to || !message.trim()}>Send message</Button>
        </form>
        {inbox.threads.length === 0 ? <p className="zendo-mt-3 zendo-text-sm zendo-text-muted">No messages yet. Replies stay in the app.</p> : (
          <div className="zendo-desk-scroll zendo-mt-3 zendo-grid zendo-gap-3">
            {inbox.threads.map((thread) => (
              <div key={thread.with.id} className="zendo-rounded-xl zendo-border zendo-border-line zendo-px-3 zendo-py-2">
                <Link href={`/people/${thread.with.id}`} className="zendo-text-sm zendo-font-medium zendo-text-lime">{thread.with.displayName}</Link>
                <div className="zendo-mt-2 zendo-grid zendo-gap-2">
                  {thread.messages.slice(-6).map((line) => (
                    <p key={line.id} className="zendo-text-sm"><span className="zendo-text-muted">{line.fromId === thread.with.id ? thread.with.displayName : "You"}:</span> {line.body}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="zendo-font-display zendo-text-xl zendo-font-bold">People</h2>
        <div className="zendo-mt-3 zendo-grid zendo-gap-2">
          {feed.people.map((person) => (
            <div key={person.id} className="zendo-flex zendo-items-center zendo-justify-between zendo-gap-2">
              <Link href={`/people/${person.id}`} className="zendo-text-sm zendo-text-cream">{person.displayName}</Link>
              <Badge tone={roleTone(person.role)}>{person.role}</Badge>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
