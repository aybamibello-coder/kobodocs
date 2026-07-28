-- Fix: Business Suite trial signup was failing with "Something went wrong
-- creating your business profile" for every new user. Root cause: a
-- leftover BEFORE INSERT trigger on `businesses` (business_requires_active_tier
-- / enforce_business_tier_required) required the owner to already have an
-- active 'business' plan on `profiles` — a legacy, unrelated personal
-- Business/Teams plan — before a business row could be created at all.
-- This silently blocked every trial signup, contradicting the page's own
-- "21-day free trial, no card required" promise.
--
-- Business Suite access is correctly gated by suite_status /
-- suite_trial_ends_at / suite_expires_at / suite_tier on the businesses
-- row itself, so there's no reason business creation should depend on a
-- separate, older product's plan. Applied directly to vwmzulzluaxedkozxjfy
-- and verified (trigger no longer present, only business_owner_auto_membership
-- remains).

drop trigger if exists business_requires_active_tier on businesses;
drop function if exists enforce_business_tier_required();
