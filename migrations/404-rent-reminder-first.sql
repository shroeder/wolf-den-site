-- Rent is due on the FIRST, not the 25th.
--
-- Luke, on getting the nudge today: "I got a reminder to pay rent today because it's the 25th, but that
-- reminder needs to be changed to be the first of the month, not the 25th."
--
-- The row was seeded by 303-admin-reminders.sql with day_of_month = 25, which was simply wrong about when the
-- lease is actually due. A migration rather than a hand-edit in the admin app for the usual reason: the app
-- can change this row, but nothing in the repo would then say what it is supposed to be, and the next time
-- anybody restores or reseeds a database the 25th comes back. The seed in 303 cannot be corrected in place —
-- it has already run, and a spent migration is spent.
--
-- Matched on the TITLE rather than an id, because ids are per-database and this has to work on any of them.
-- Guarded on kind = 'monthly' so it cannot touch a reminder somebody has since converted to weekly, and it
-- deliberately does not create the row if it is missing: a reminder nobody has is not a reminder set wrong.
UPDATE admin_reminder
   SET day_of_month = 1,
       body = 'Rent is due — send it today.',
       updated_at = NOW()
 WHERE title = 'Pay rent'
   AND kind = 'monthly'
   AND day_of_month IS DISTINCT FROM 1;

-- `last_fired_on` is deliberately left alone. It holds the date this last pushed, which is what stops it
-- firing twice in one day — clearing it would make the reminder fire again the moment the job next runs,
-- which on the 25th is exactly the notification Luke just told me was wrong.
