import { ZendoError } from "./errors";
import { formatZ } from "./format";
import { nid } from "./ids";
import type { Circle, DirectMessage, State, User } from "./state";
import type { AnalyticsView, CircleCard, InboxView, MutualCard, PersonCard, PostCard, ProfileView, SocialFeed, StoryCard, ThreadCard, VideoCard } from "./types";
import { textOf } from "./validate";

const STORY_MS = 24 * 60 * 60 * 1000;

export function ensureSocial(state: State) {
  if (!Array.isArray(state.follows)) state.follows = [];
  if (!Array.isArray(state.posts)) state.posts = [];
  if (!Array.isArray(state.stories)) state.stories = [];
  if (!Array.isArray(state.videos)) state.videos = [];
  if (!Array.isArray(state.circles)) state.circles = [];
  if (!Array.isArray(state.messages)) state.messages = [];
}

function liveUser(state: State, id: string): User {
  const user = state.users.find((item) => item.id === id);
  if (!user) throw new ZendoError("Sign in to continue.", 401);
  if (user.banned) throw new ZendoError("This account is paused.", 403);
  return user;
}

function visibleUser(state: State, id: string): User | null {
  const user = state.users.find((item) => item.id === id);
  if (!user || user.banned) return null;
  return user;
}

function person(user: User): PersonCard {
  return { id: user.id, displayName: user.displayName, role: user.role, address: user.address };
}

function nameOf(state: State, id: string): string {
  return state.users.find((item) => item.id === id)?.displayName || "Account";
}

function notify(state: State, userId: string, title: string, body: string, href: string) {
  state.notices.unshift({ id: nid("ntf"), userId, title, body, href, at: Date.now(), read: false });
  if (state.notices.length > 200) state.notices.length = 200;
}

function followingIds(state: State, userId: string): Set<string> {
  return new Set(state.follows.filter((row) => row.userId === userId).map((row) => row.targetId));
}

function followerIds(state: State, userId: string): string[] {
  return state.follows.filter((row) => row.targetId === userId).map((row) => row.userId);
}

function mutualCards(state: State, userId: string, viewerId: string | null): MutualCard[] {
  const following = followingIds(state, userId);
  const viewerFollows = viewerId ? followingIds(state, viewerId) : new Set<string>();
  const cards: MutualCard[] = [];
  for (const id of followerIds(state, userId)) {
    if (!following.has(id)) continue;
    const user = visibleUser(state, id);
    if (!user) continue;
    cards.push({ ...person(user), shared: viewerFollows.has(id) });
    if (cards.length >= 24) break;
  }
  return cards;
}

function postCard(state: State, row: State["posts"][number]): PostCard | null {
  const user = visibleUser(state, row.userId);
  if (!user) return null;
  return { id: row.id, userId: user.id, displayName: user.displayName, body: row.body, at: row.at };
}

function storyCard(state: State, row: State["stories"][number], now: number): StoryCard | null {
  if (row.expiresAt <= now) return null;
  const user = visibleUser(state, row.userId);
  if (!user) return null;
  return { id: row.id, userId: user.id, displayName: user.displayName, caption: row.caption, at: row.at, expiresAt: row.expiresAt };
}

function videoCard(state: State, row: State["videos"][number]): VideoCard | null {
  const user = visibleUser(state, row.userId);
  if (!user) return null;
  return { id: row.id, userId: user.id, displayName: user.displayName, title: row.title, caption: row.caption, at: row.at };
}

function canSeeCircle(circle: Circle, viewer: User | null, subjectId: string): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  if (viewer.id === subjectId) return true;
  return circle.memberIds.includes(viewer.id);
}

function circleCard(state: State, circle: Circle): CircleCard {
  const members = circle.memberIds
    .map((id) => visibleUser(state, id))
    .filter((user): user is User => Boolean(user))
    .map(person);
  return {
    id: circle.id,
    name: circle.name,
    ownerId: circle.ownerId,
    ownerName: nameOf(state, circle.ownerId),
    members,
    at: circle.at,
  };
}

export function profileOf(state: State, id: string, viewerId: string | null, now = Date.now()): ProfileView {
  ensureSocial(state);
  const user = state.users.find((item) => item.id === id);
  if (!user || user.banned) throw new ZendoError("Account not found.", 404);
  const viewer = viewerId ? state.users.find((item) => item.id === viewerId) || null : null;
  const youFollow = viewer ? state.follows.some((row) => row.userId === viewer.id && row.targetId === user.id) : false;
  const followsYou = viewer ? state.follows.some((row) => row.userId === user.id && row.targetId === viewer.id) : false;
  const posts = state.posts
    .filter((row) => row.userId === user.id)
    .slice()
    .reverse()
    .map((row) => postCard(state, row))
    .filter((row): row is PostCard => Boolean(row))
    .slice(0, 30);
  const stories = state.stories
    .filter((row) => row.userId === user.id)
    .slice()
    .reverse()
    .map((row) => storyCard(state, row, now))
    .filter((row): row is StoryCard => Boolean(row))
    .slice(0, 12);
  const videos = state.videos
    .filter((row) => row.userId === user.id)
    .slice()
    .reverse()
    .map((row) => videoCard(state, row))
    .filter((row): row is VideoCard => Boolean(row))
    .slice(0, 20);
  const owned = state.circles.filter((circle) => circle.ownerId === user.id || circle.memberIds.includes(user.id));
  const circles = owned.filter((circle) => canSeeCircle(circle, viewer, user.id)).map((circle) => circleCard(state, circle));
  const coins = state.coins
    .filter((coin) => coin.creatorUserId === user.id && (!coin.hidden || viewer?.id === user.id || viewer?.role === "admin"))
    .map((coin) => ({ mint: coin.mint, symbol: coin.symbol, name: coin.name }));
  return {
    person: person(user),
    followers: followerIds(state, user.id).length,
    following: followingIds(state, user.id).size,
    youFollow,
    followsYou,
    mutual: youFollow && followsYou,
    mutuals: mutualCards(state, user.id, viewer?.id || null),
    posts,
    stories,
    videos,
    circles,
    circleCount: owned.length,
    coins,
  };
}

export function feedOf(state: State, viewerId: string | null, now = Date.now()): SocialFeed {
  ensureSocial(state);
  const stories = state.stories
    .slice()
    .reverse()
    .map((row) => storyCard(state, row, now))
    .filter((row): row is StoryCard => Boolean(row))
    .slice(0, 20);
  const posts = state.posts
    .slice()
    .reverse()
    .map((row) => postCard(state, row))
    .filter((row): row is PostCard => Boolean(row))
    .slice(0, 40);
  const videos = state.videos
    .slice()
    .reverse()
    .map((row) => videoCard(state, row))
    .filter((row): row is VideoCard => Boolean(row))
    .slice(0, 20);
  const viewer = viewerId ? state.users.find((item) => item.id === viewerId) || null : null;
  const circles = state.circles
    .filter((circle) => (viewer ? canSeeCircle(circle, viewer, viewer.id) : false))
    .slice()
    .reverse()
    .map((circle) => circleCard(state, circle))
    .slice(0, 20);
  const people = state.users
    .filter((user) => !user.banned && user.id !== viewerId)
    .slice(0, 30)
    .map(person);
  return { stories, posts, videos, circles, people };
}

export function inboxOf(state: State, userId: string): InboxView {
  ensureSocial(state);
  liveUser(state, userId);
  const grouped = new Map<string, ThreadCard>();
  for (const message of state.messages) {
    const otherId = message.fromId === userId ? message.toId : message.toId === userId ? message.fromId : "";
    if (!otherId) continue;
    const other = visibleUser(state, otherId);
    if (!other) continue;
    const existing = grouped.get(other.id);
    const line = { id: message.id, fromId: message.fromId, body: message.body, at: message.at };
    if (!existing) {
      grouped.set(other.id, { with: person(other), lastBody: message.body, lastAt: message.at, messages: [line] });
    } else {
      existing.messages.push(line);
      if (message.at >= existing.lastAt) {
        existing.lastBody = message.body;
        existing.lastAt = message.at;
      }
    }
  }
  const threads = [...grouped.values()].sort((left, right) => right.lastAt - left.lastAt);
  return { threads };
}

export function analyticsOf(state: State, userId: string, now = Date.now()): AnalyticsView {
  ensureSocial(state);
  const user = liveUser(state, userId);
  let trades = 0;
  let fees = 0n;
  let coins = 0;
  for (const coin of state.coins) {
    if (coin.creatorUserId !== user.id && coin.creator !== user.address) continue;
    coins += 1;
    trades += coin.trades.length;
    fees += BigInt(coin.creatorFees || "0");
  }
  return {
    followers: followerIds(state, user.id).length,
    following: followingIds(state, user.id).size,
    posts: state.posts.filter((row) => row.userId === user.id).length,
    stories: state.stories.filter((row) => row.userId === user.id && row.expiresAt > now).length,
    videos: state.videos.filter((row) => row.userId === user.id).length,
    coins,
    trades,
    creatorFees: formatZ(fees, 4),
    referrals: state.users.filter((item) => item.referredBy === user.id).length,
  };
}

export function applyFollow(state: State, userId: string, targetId: string) {
  ensureSocial(state);
  const user = liveUser(state, userId);
  const target = visibleUser(state, targetId);
  if (!target) throw new ZendoError("Account not found.", 404);
  if (target.id === user.id) throw new ZendoError("You cannot follow your own account.");
  if (state.follows.some((row) => row.userId === user.id && row.targetId === target.id)) {
    throw new ZendoError("You already follow this account.");
  }
  state.follows.unshift({ userId: user.id, targetId: target.id, at: Date.now() });
  if (state.follows.length > 2000) state.follows.length = 2000;
  notify(state, target.id, `${user.displayName} followed you`, "Open the profile to follow back.", `/people/${user.id}`);
}

export function applyUnfollow(state: State, userId: string, targetId: string) {
  ensureSocial(state);
  const user = liveUser(state, userId);
  const before = state.follows.length;
  state.follows = state.follows.filter((row) => !(row.userId === user.id && row.targetId === targetId));
  if (state.follows.length === before) throw new ZendoError("You are not following this account.");
}

export function applyPost(state: State, userId: string, body: unknown) {
  ensureSocial(state);
  const user = liveUser(state, userId);
  state.posts.unshift({ id: nid("pst"), userId: user.id, body: textOf(body, "A post", 1, 500), at: Date.now() });
  if (state.posts.length > 400) state.posts.length = 400;
}

export function applyStory(state: State, userId: string, caption: unknown, now = Date.now()) {
  ensureSocial(state);
  const user = liveUser(state, userId);
  state.stories = state.stories.filter((row) => row.expiresAt > now);
  state.stories.unshift({
    id: nid("sty"),
    userId: user.id,
    caption: textOf(caption, "A story", 1, 140),
    at: now,
    expiresAt: now + STORY_MS,
  });
  if (state.stories.length > 80) state.stories.length = 80;
}

export function applyVideo(state: State, userId: string, title: unknown, caption: unknown) {
  ensureSocial(state);
  const user = liveUser(state, userId);
  state.videos.unshift({
    id: nid("vid"),
    userId: user.id,
    title: textOf(title, "A title", 1, 80),
    caption: textOf(caption, "A caption", 1, 280),
    at: Date.now(),
  });
  if (state.videos.length > 80) state.videos.length = 80;
}

export function applyCircle(state: State, userId: string, name: unknown, memberIds: unknown) {
  ensureSocial(state);
  const user = liveUser(state, userId);
  const ids = new Set<string>([user.id]);
  const raw = Array.isArray(memberIds) ? memberIds : [];
  for (const id of raw) {
    if (typeof id !== "string") continue;
    const member = visibleUser(state, id);
    if (!member) throw new ZendoError("Pick people who have accounts.");
    ids.add(member.id);
    if (ids.size > 24) throw new ZendoError("A circle holds 24 people.");
  }
  const circle: Circle = {
    id: nid("crc"),
    ownerId: user.id,
    name: textOf(name, "A circle name", 2, 40),
    memberIds: [...ids],
    at: Date.now(),
  };
  state.circles.unshift(circle);
  if (state.circles.length > 40) state.circles.length = 40;
  for (const memberId of circle.memberIds) {
    if (memberId === user.id) continue;
    notify(state, memberId, `${user.displayName} added you to ${circle.name}`, "Open Social to see the circle.", "/app/social");
  }
}

export function applyMessage(state: State, userId: string, targetId: string, body: unknown) {
  ensureSocial(state);
  const user = liveUser(state, userId);
  const target = visibleUser(state, targetId);
  if (!target) throw new ZendoError("Account not found.", 404);
  if (target.id === user.id) throw new ZendoError("Pick someone else for a direct message.");
  const message: DirectMessage = {
    id: nid("dm"),
    fromId: user.id,
    toId: target.id,
    body: textOf(body, "A message", 1, 500),
    at: Date.now(),
  };
  state.messages.push(message);
  if (state.messages.length > 400) state.messages.splice(0, state.messages.length - 400);
  notify(state, target.id, `Message from ${user.displayName}`, message.body, "/app/social");
}
