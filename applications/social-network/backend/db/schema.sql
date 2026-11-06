-- Orbit: the social network, normalized. Everything lives in the `orbit`
-- schema so the app never collides with other apps in the same database.
-- Ids are explicit integers (the frontend makes them); dates are
-- `timestamp` (no zone, the demo clock). A frontend "0" that means "none"
-- (posts.wallId, songId...) is NULL here. Lists (likes, members, songs of a
-- playlist) are child tables with a `position`, interests/tags are text[].
DROP SCHEMA IF EXISTS orbit CASCADE;
CREATE SCHEMA orbit;
SET search_path TO orbit, public;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm is not available: search uses lower() indexes only';
END $$;

CREATE TABLE users (
  id            integer PRIMARY KEY CHECK (id > 0),
  name          text NOT NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('user', 'moderator', 'admin')),
  status        text NOT NULL CHECK (status IN ('active', 'banned')),
  avatar        text NOT NULL,
  about         text NOT NULL,
  city          text NOT NULL,
  birthday      date,
  website       text NOT NULL,
  phone         text NOT NULL,
  interests     text[] NOT NULL DEFAULT '{}',
  created_at    timestamp NOT NULL,
  last_seen     timestamp NOT NULL
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_name_idx ON users (lower(name));
CREATE INDEX users_created_idx ON users (created_at DESC);

-- scrypt hashes for API sign-in (seeded users are upgraded on first login)
CREATE TABLE credentials (
  user_id    integer PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  hash       text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Bearer tokens: only the sha256 of the token is stored
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions (expires_at);

CREATE TABLE friends (
  id        integer PRIMARY KEY CHECK (id > 0),
  user_id   integer NOT NULL REFERENCES users ON DELETE CASCADE,
  friend_id integer NOT NULL REFERENCES users ON DELETE CASCADE,
  status    text NOT NULL CHECK (status IN ('accepted', 'pending')),
  since     timestamp NOT NULL,
  CHECK (user_id <> friend_id)
);
CREATE UNIQUE INDEX friends_pair_key ON friends (user_id, friend_id);
CREATE INDEX friends_friend_idx ON friends (friend_id);

CREATE TABLE artists (
  id      integer PRIMARY KEY CHECK (id > 0),
  name    text NOT NULL,
  country text NOT NULL
);
CREATE INDEX artists_name_idx ON artists (lower(name));

CREATE TABLE albums (
  id        integer PRIMARY KEY CHECK (id > 0),
  artist_id integer NOT NULL REFERENCES artists ON DELETE RESTRICT,
  title     text NOT NULL,
  year      integer NOT NULL,
  cover     text NOT NULL
);
CREATE INDEX albums_artist_idx ON albums (artist_id);
CREATE INDEX albums_title_idx ON albums (lower(title));

CREATE TABLE songs (
  id       integer PRIMARY KEY CHECK (id > 0),
  album_id integer NOT NULL REFERENCES albums ON DELETE RESTRICT,
  artist_id integer NOT NULL REFERENCES artists ON DELETE RESTRICT,
  title    text NOT NULL,
  genre    text NOT NULL,
  duration integer NOT NULL CHECK (duration >= 0),
  year     integer NOT NULL
);
CREATE INDEX songs_genre_idx ON songs (lower(genre), id);
CREATE INDEX songs_artist_idx ON songs (artist_id);
CREATE INDEX songs_album_idx ON songs (album_id);
CREATE INDEX songs_title_idx ON songs (lower(title));

CREATE TABLE photo_albums (
  id          integer PRIMARY KEY CHECK (id > 0),
  owner_id    integer NOT NULL REFERENCES users ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL,
  created_at  timestamp NOT NULL
);
CREATE INDEX photo_albums_owner_idx ON photo_albums (owner_id);

CREATE TABLE photos (
  id         integer PRIMARY KEY CHECK (id > 0),
  album_id   integer NOT NULL REFERENCES photo_albums ON DELETE CASCADE,
  owner_id   integer NOT NULL REFERENCES users ON DELETE CASCADE,
  src        text NOT NULL,
  caption    text NOT NULL,
  created_at timestamp NOT NULL
);
CREATE INDEX photos_album_idx ON photos (album_id);
CREATE INDEX photos_owner_idx ON photos (owner_id);

CREATE TABLE communities (
  id          integer PRIMARY KEY CHECK (id > 0),
  name        text NOT NULL,
  description text NOT NULL,
  wallpaper   text NOT NULL,
  owner_id    integer NOT NULL REFERENCES users ON DELETE RESTRICT,
  created_at  timestamp NOT NULL
);
CREATE INDEX communities_owner_idx ON communities (owner_id);
CREATE INDEX communities_name_idx ON communities (lower(name));

CREATE TABLE community_moderators (
  community_id integer NOT NULL REFERENCES communities ON DELETE CASCADE,
  position     integer NOT NULL,
  user_id      integer NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (community_id, position)
);
CREATE INDEX community_moderators_user_idx ON community_moderators (user_id);
CREATE TABLE community_members (
  community_id integer NOT NULL REFERENCES communities ON DELETE CASCADE,
  position     integer NOT NULL,
  user_id      integer NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (community_id, position)
);
CREATE INDEX community_members_user_idx ON community_members (user_id);
CREATE TABLE community_contacts (
  community_id integer NOT NULL REFERENCES communities ON DELETE CASCADE,
  position     integer NOT NULL,
  user_id      integer NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (community_id, position)
);
CREATE INDEX community_contacts_user_idx ON community_contacts (user_id);

-- A post is on a user wall (wall_id) or on a community wall (community_id).
CREATE TABLE posts (
  id           integer PRIMARY KEY CHECK (id > 0),
  author_id    integer NOT NULL REFERENCES users ON DELETE CASCADE,
  wall_id      integer REFERENCES users ON DELETE CASCADE,
  community_id integer REFERENCES communities ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('text', 'music', 'photo', 'picture', 'link', 'repost')),
  text         text NOT NULL,
  song_id      integer REFERENCES songs ON DELETE CASCADE,
  photo_id     integer REFERENCES photos ON DELETE CASCADE,
  picture      text NOT NULL,
  url          text NOT NULL,
  link_title   text NOT NULL,
  repost_of    integer REFERENCES posts ON DELETE CASCADE,
  created_at   timestamp NOT NULL,
  CHECK ((wall_id IS NULL) <> (community_id IS NULL))
);
CREATE INDEX posts_wall_idx ON posts (wall_id, created_at DESC, id DESC);
CREATE INDEX posts_community_idx ON posts (community_id, created_at DESC, id DESC);
CREATE INDEX posts_author_idx ON posts (author_id);
CREATE INDEX posts_song_idx ON posts (song_id) WHERE song_id IS NOT NULL;
CREATE INDEX posts_photo_idx ON posts (photo_id) WHERE photo_id IS NOT NULL;
CREATE INDEX posts_repost_idx ON posts (repost_of) WHERE repost_of IS NOT NULL;

CREATE TABLE post_likes (
  post_id  integer NOT NULL REFERENCES posts ON DELETE CASCADE,
  position integer NOT NULL,
  user_id  integer NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (post_id, position)
);
CREATE INDEX post_likes_user_idx ON post_likes (user_id);

CREATE TABLE comments (
  id         integer PRIMARY KEY CHECK (id > 0),
  post_id    integer NOT NULL REFERENCES posts ON DELETE CASCADE,
  author_id  integer NOT NULL REFERENCES users ON DELETE CASCADE,
  text       text NOT NULL,
  created_at timestamp NOT NULL
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at, id);
CREATE INDEX comments_author_idx ON comments (author_id);

CREATE TABLE articles (
  id         integer PRIMARY KEY CHECK (id > 0),
  author_id  integer NOT NULL REFERENCES users ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  tags       text[] NOT NULL DEFAULT '{}',
  cover      text NOT NULL,
  created_at timestamp NOT NULL
);
CREATE INDEX articles_author_idx ON articles (author_id, created_at DESC);
CREATE INDEX articles_created_idx ON articles (created_at DESC, id DESC);

CREATE TABLE article_likes (
  article_id integer NOT NULL REFERENCES articles ON DELETE CASCADE,
  position   integer NOT NULL,
  user_id    integer NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (article_id, position)
);
CREATE INDEX article_likes_user_idx ON article_likes (user_id);

CREATE TABLE conversations (
  id         integer PRIMARY KEY CHECK (id > 0),
  kind       text NOT NULL CHECK (kind IN ('dm', 'chat')),
  title      text NOT NULL,
  created_at timestamp NOT NULL
);
CREATE TABLE conversation_members (
  conversation_id integer NOT NULL REFERENCES conversations ON DELETE CASCADE,
  position        integer NOT NULL,
  user_id         integer NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, position)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id);

CREATE TABLE messages (
  id              integer PRIMARY KEY CHECK (id > 0),
  conversation_id integer NOT NULL REFERENCES conversations ON DELETE CASCADE,
  author_id       integer NOT NULL REFERENCES users ON DELETE CASCADE,
  text            text NOT NULL,
  created_at      timestamp NOT NULL
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at, id);
CREATE INDEX messages_author_idx ON messages (author_id);

CREATE TABLE playlists (
  id         integer PRIMARY KEY CHECK (id > 0),
  owner_id   integer NOT NULL REFERENCES users ON DELETE CASCADE,
  title      text NOT NULL,
  created_at timestamp NOT NULL
);
CREATE INDEX playlists_owner_idx ON playlists (owner_id);
CREATE TABLE playlist_songs (
  playlist_id integer NOT NULL REFERENCES playlists ON DELETE CASCADE,
  position    integer NOT NULL,
  song_id     integer NOT NULL REFERENCES songs ON DELETE CASCADE,
  PRIMARY KEY (playlist_id, position)
);
CREATE INDEX playlist_songs_song_idx ON playlist_songs (song_id);

CREATE TABLE scores (
  id      integer PRIMARY KEY CHECK (id > 0),
  user_id integer NOT NULL REFERENCES users ON DELETE CASCADE,
  game    text NOT NULL CHECK (game IN ('snake', 'pacman', 'tetris')),
  score   integer NOT NULL,
  at      timestamp NOT NULL
);
CREATE INDEX scores_game_idx ON scores (game, score DESC);
CREATE INDEX scores_user_idx ON scores (user_id);

-- the frontend's "who is signed in" row (Db.session)
CREATE TABLE ui_session (
  id      integer PRIMARY KEY CHECK (id > 0),
  user_id integer NOT NULL REFERENCES users ON DELETE CASCADE
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX songs_title_trgm ON songs USING gin (title public.gin_trgm_ops);
    CREATE INDEX artists_name_trgm ON artists USING gin (name public.gin_trgm_ops);
    CREATE INDEX albums_title_trgm ON albums USING gin (title public.gin_trgm_ops);
  END IF;
END $$;
