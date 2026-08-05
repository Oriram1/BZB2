-- Registration has always geocoded the address the user types (or the point
-- they drop on the map) and written latitude/longitude to their profile. The
-- columns were never created, so PostgREST rejected the whole statement and
-- age, address, gender and phone were silently lost at signup along with them.
--
-- Adding the columns rather than dropping the write: the geocoding round-trip
-- already runs, and a stored home location is what the task list can measure
-- distance from when the browser refuses geolocation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
