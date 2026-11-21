CREATE FUNCTION job_video_key(source_url text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  WITH parts AS (
    SELECT regexp_match(
      btrim(source_url),
      '^https?://([^/:?#]+)(?::[0-9]+)?(/[^?#]*)?(?:[?]([^#]*))?(?:#.*)?$',
      'i'
    ) AS url
  ), youtube_url AS (
    SELECT lower(regexp_replace(url[1], '[.]$', '')) AS host, url[2] AS path, url[3] AS query
    FROM parts
  ), candidate AS (
    SELECT CASE
      WHEN host IN ('youtu.be', 'www.youtu.be') THEN
        (regexp_match(path, '^/([^/]+)/?$'))[1]
      WHEN host IN ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com') THEN
        CASE
          WHEN path IN ('/watch', '/watch/') THEN (regexp_match(query, '(?:^|&)v=([^&]*)'))[1]
          ELSE (regexp_match(path, '^/(?:shorts|embed|live|v)/([^/]+)/?$'))[1]
        END
      WHEN host IN ('youtube-nocookie.com', 'www.youtube-nocookie.com') THEN
        (regexp_match(path, '^/embed/([^/]+)/?$'))[1]
    END AS video_id
    FROM youtube_url
  )
  SELECT CASE
    WHEN video_id ~ '^[A-Za-z0-9_-]{11}$' THEN 'youtube:' || video_id
    ELSE 'url:' || btrim(source_url)
  END
  FROM candidate;
$$;
--> statement-breakpoint
CREATE INDEX "jobs_creator_video_idx" ON "jobs" USING btree ("created_by_user_id", md5(job_video_key("source_url")));
