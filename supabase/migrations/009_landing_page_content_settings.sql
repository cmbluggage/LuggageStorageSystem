-- ================================================================
-- STOWAWAY — Migration 009
-- Landing page content settings: walkthrough video + Hotel Thilon map
--
-- Client requirement (landing page redesign to match Figma "Frame 20",
-- 2026-09): the landing page's walkthrough-video card and Hotel Thilon
-- location card should be admin-editable rather than hardcoded, so an
-- operator can swap the video or update the hotel partner's name/address
-- without a code change.
-- ================================================================

insert into public.app_settings (key, value, value_type, label, description, category, min_value, max_value) values
  ('walkthrough_video_id',   '""', 'string', 'Walkthrough Video (YouTube ID)', 'YouTube video ID for the "Colombo Airport Drop-Off & Pickup" walkthrough clip on the landing page. Upload as Unlisted on YouTube and paste just the ID (the part after v= in the URL, e.g. dQw4w9WgXcQ). Leave blank to show the placeholder card instead.', 'content', null, null),
  ('hotel_location_label',   '"Hotel Thilon"', 'string', 'Hotel Partner Name', 'Name shown on the landing page''s second location card and its map pin badge.', 'content', null, null),
  ('hotel_location_address', '"Hotel Thilon, Katunayake, Sri Lanka"', 'string', 'Hotel Partner Address', 'Address or place name used to center the embedded map on the landing page''s Hotel Thilon card.', 'content', null, null)
on conflict (key) do nothing;
